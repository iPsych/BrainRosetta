import citation from '../../citation.json';
import pkg from '../../package.json';
import type { Atlas,Lookup,Point } from './types';
export { citation };
export const softwareProvenance={
  name:'BrainRosetta',version:pkg.version,commit:import.meta.env.VITE_GIT_REVISION||'unknown',
  citationDoi:citation.doi,citedRelease:citation.version,repository:citation['repository-code'],
};
const year=citation['date-released'].slice(0,4);
const initials=(name:string)=>name.split(/\s+/).map(n=>`${n[0]}.`).join(' ');
export const softwareCitation=`${citation.authors.map(a=>`${a['family-names']}, ${initials(a['given-names'])}`).join(', ')} (${year}). ${citation.title} (Version ${citation.version}) [Computer software]. Zenodo. https://doi.org/${citation.doi}`;
export const softwareBibtex=`@software{BrainRosetta_${year},
  author = {${citation.authors.map(a=>`${a['family-names']}, ${a['given-names']}`).join(' and ')}},
  title = {{${citation.title}}},
  year = {${year}},
  version = {${citation.version}},
  publisher = {Zenodo},
  doi = {${citation.doi}},
  url = {https://doi.org/${citation.doi}}
}\n`;
export const softwareRis=[
  'TY  - COMP',...citation.authors.map(a=>`AU  - ${a['family-names']}, ${a['given-names']}`),
  `TI  - ${citation.title}`,`PY  - ${year}`,`DA  - ${citation['date-released'].replaceAll('-','/')}`,
  `ET  - ${citation.version}`,'PB  - Zenodo',`DO  - ${citation.doi}`,`UR  - https://doi.org/${citation.doi}`,'ER  - ','',
].join('\n');
export type CitationRow={atlas:Atlas;lookup?:Lookup;error?:string};
const buildDescription=()=>`BrainRosetta ${softwareProvenance.version} (build ${softwareProvenance.commit}; software citation DOI: ${citation.doi}, archived release v${citation.version})`;
export function coordinateMethods(point:Point,rows:CitationRow[],selected:number[]){
  const paragraphs=[`Brain parcellation lookup was performed in the browser using ${buildDescription()}. The input coordinate was (${point.mm.join(', ')}) mm in ${point.space}; input provenance: ${point.method}.`];
  for(const {atlas,lookup,error} of rows){
    const mapping=lookup?.mapping;
    let mappingText='No completed coordinate mapping was available; no anatomical correspondence is claimed.';
    if(mapping?.status==='native')mappingText='The coordinate was sampled directly in the native atlas reference space without template registration.';
    if(mapping?.status==='registered')mappingText=`The coordinate was mapped from ${mapping.sourceSpace} to ${mapping.targetSpace} using nonlinear template transforms (${mapping.transformIds.join(' → ')}). Registration is an anatomical estimate with residual uncertainty.${mapping.message?' '+mapping.message:''}`;
    if(mapping?.status==='approximate')mappingText='The same numerical coordinate was used across different templates without registration. This comparison is approximate and does not establish anatomical correspondence.';
    if(mapping?.status==='unsupported'||mapping?.status==='outside-domain')mappingText=`No coordinate mapping was available (${mapping.status}); no anatomical correspondence is claimed.`;
    const region=atlas.regions.find(r=>r.id===lookup?.id);
    const outcome=error?`Lookup failed: ${error}`:lookup?.status==='label'?`The native label volume returned ${region?.original||lookup.id} (label ${lookup.id}).`:lookup?`Lookup status: ${lookup.status}; no region label was returned.`:'Lookup was not completed.';
    paragraphs.push(`${atlas.name} (${atlas.variant}; atlas ID ${atlas.id}) was used in ${atlas.space} at ${atlas.resolution.join(' × ')} mm resolution. ${mappingText} ${outcome} Atlas label SHA-256: ${atlas.sha256}.${mapping?.transformHashes.length?' Transform SHA-256: '+mapping.transformHashes.join(', ')+'.':''}`);
  }
  if(selected.length)paragraphs.push(`Checked labels in the active atlas (${rows[0]?.atlas.id}): ${selected.join(', ')}. A checked selection alone does not document an exported ROI mask.`);
  paragraphs.push('Region meshes and navigation hierarchies are display aids; coordinate labels are sampled from the native atlas volume. Review this session description for the analysis actually reported.');
  return paragraphs.join('\n\n');
}
export function roiMethods(metadata:Record<string,unknown>){
  const regions=metadata.regions as {id:number;name:string;outputValue:number;outputVoxels:number}[];
  const grid=metadata.targetGrid as {dims:number[];affine:number[][]};
  const transforms=metadata.transforms as {id:string;sha256:string}[];
  return `An ROI mask was exported as NIfTI-1 using ${buildDescription()}, from ${metadata.atlasName} (${metadata.atlasVariant}; atlas ID ${metadata.atlas}; source space ${metadata.sourceSpace}). Selected regions: ${regions.map(r=>`${r.name} (ID ${r.id}, output value ${r.outputValue}, ${r.outputVoxels} voxels)`).join('; ')}. The output used ${metadata.targetSpace}, grid dimensions ${grid.dims.join(' × ')}, with ${metadata.maskKind==='binary'?'a binary union of selected regions':'original atlas label IDs'} and interpolation: ${metadata.interpolation}. ${transforms.length?`Nonlinear pull resampling mapped output voxel centers into the source atlas with nearest-neighbor label sampling. Transform IDs: ${transforms.map(t=>t.id).join(' → ')}. Template registration is an anatomical estimate, not registration of an individual MRI.`:'No cross-template registration was applied.'} Atlas label SHA-256: ${metadata.atlasLabelSha256}. The accompanying JSON metadata and NIfTI extension record the spatial affine, voxel counts, and transform hashes.\n\nAtlas citation: ${metadata.atlasCitation}\n\nSoftware citation: ${softwareCitation}`;
}
