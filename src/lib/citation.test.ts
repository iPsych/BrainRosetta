import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { citation,softwareBibtex,softwareRis,coordinateMethods,roiMethods } from './citation';
import type { Atlas,Lookup,Point } from './types';

const atlas:Atlas=JSON.parse(readFileSync('public/data/aal3-1mm/manifest.json','utf8'));
const point:Point={mm:[-38,-8,50],space:'MNIColin27',method:'Manual MNI coordinate'};
const lookup=(status:'native'|'registered'|'approximate'|'unsupported'):Lookup=>({id:status==='unsupported'?0:1,status:status==='unsupported'?'transform-unavailable':'label',mapping:{sourceSpace:point.space,targetSpace:atlas.space,input:point.mm,mm:status==='unsupported'?null:point.mm,status,transformIds:status==='registered'?['test-registration']:[],transformHashes:status==='registered'?['test-hash']:[]}});

describe('research citation and methods',()=>{
  it('keeps repository, Zenodo, README and download metadata aligned',()=>{
    execFileSync('node',['scripts/prepare_citation.mjs','--check']);
    expect(softwareBibtex).toContain('Kang, June Christoph');
    expect(softwareBibtex).toContain(citation.doi);
    expect(softwareRis).toContain('TY  - COMP');
    expect(softwareRis).toContain(`DO  - ${citation.doi}`);
    const readme=readFileSync('README.md','utf8');
    expect(readme).toContain(citation.url);expect(readme).toContain(citation.doi);
    const zenodo=JSON.parse(readFileSync('.zenodo.json','utf8'));
    expect(zenodo.license.toUpperCase()).toBe(citation.license);
    expect(zenodo).not.toHaveProperty('doi'); // A future release gets its own DOI.
  });
  it('distinguishes native, registered, approximate and unavailable lookups',()=>{
    const render=(status:Parameters<typeof lookup>[0])=>coordinateMethods(point,[{atlas,lookup:lookup(status)}],[1,2]);
    expect(render('native')).toContain('without template registration');
    expect(render('registered')).toContain('test-registration');
    expect(render('registered')).toContain('test-hash');
    expect(render('approximate')).toContain('without registration');
    expect(render('approximate')).not.toContain('using nonlinear template transforms');
    expect(render('unsupported')).toContain('no anatomical correspondence is claimed');
    expect(render('unsupported')).not.toContain('returned Precentral_L');
    expect(render('native')).toContain('selection alone does not document an exported ROI');
  });
  it('describes saved ROI values, grid and resampling from the export metadata',()=>{
    const metadata={atlasName:atlas.name,atlasVariant:atlas.variant,atlas:atlas.id,sourceSpace:atlas.space,targetSpace:'MNI152NLin2009cAsym',maskKind:'labels',interpolation:'nearest-neighbor',atlasLabelSha256:atlas.sha256,atlasCitation:atlas.citation,targetGrid:{dims:[193,229,193],affine:atlas.affine},regions:[{id:1,name:'Precentral_L',outputValue:1,outputVoxels:123}],transforms:[{id:'test-pull',sha256:'test-hash'}]};
    const text=roiMethods(metadata);
    expect(text).toContain('original atlas label IDs');expect(text).toContain('123 voxels');
    expect(text).toContain('193 × 229 × 193');expect(text).toContain('test-pull');
    expect(text).toContain('not registration of an individual MRI');
    expect(text).toContain(citation.doi);
  });
});
