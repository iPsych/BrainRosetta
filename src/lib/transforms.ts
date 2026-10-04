import type { Matrix, Vec3 } from './types';
import { applyAffine } from './coordinates';

export interface TransformSpec {
  id:string;from:string;to:string;dims:Vec3;affine:Matrix;inverseAffine:Matrix;
  file:string;sha256:string;scale:number;method:string;source:string;
  validation:{landmarkMeanMm:number;landmarkMaxMm:number;interpolationP95Mm:number;interpolationMaxMm:number};
  qualityExclusions?:{center:Vec3;radiusMm:number;landmark:string;errorMm:number}[];
}
export interface TransformCatalog {version:number;transforms:TransformSpec[];unsupported:Record<string,string>}
export interface TransformField {spec:TransformSpec;displacements:Int16Array;valid:Uint8Array}
export interface Mapping {
  sourceSpace:string;targetSpace:string;input:Vec3;mm:Vec3|null;
  status:'native'|'registered'|'approximate'|'unsupported'|'outside-domain';
  transformIds:string[];transformHashes:string[];message?:string;
}

export function findTransformPath(edges:TransformSpec[],from:string,to:string):TransformSpec[]|null {
  if(from===to)return [];
  const queue:{space:string;path:TransformSpec[]}[]=[{space:from,path:[]}],seen=new Set([from]);
  for(let i=0;i<queue.length;i++){
    const {space,path}=queue[i];
    for(const edge of edges.filter(e=>e.from===space)){
      if(seen.has(edge.to))continue;
      const next=[...path,edge];if(edge.to===to)return next;
      seen.add(edge.to);queue.push({space:edge.to,path:next});
    }
  }
  return null;
}

// Trilinear interpolation of RAS-mm displacement, never interpolation of atlas IDs.
export function applyField(field:TransformField,point:Vec3):Vec3|null {
  const {spec,displacements,valid}=field;
  if(spec.qualityExclusions?.some(e=>Math.hypot(...point.map((x,i)=>x-e.center[i]))<=e.radiusMm))return null;
  const v=applyAffine(spec.inverseAffine,point);
  if(v.some((x,i)=>!Number.isFinite(x)||x<0||x>spec.dims[i]-1))return null;
  const low=v.map(Math.floor),fraction=v.map((x,i)=>x-low[i]);
  const result=[...point] as Vec3;
  for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++){
    const weight=(x?fraction[0]:1-fraction[0])*(y?fraction[1]:1-fraction[1])*(z?fraction[2]:1-fraction[2]);
    if(weight===0)continue;
    const ix=Math.min(low[0]+x,spec.dims[0]-1),iy=Math.min(low[1]+y,spec.dims[1]-1),iz=Math.min(low[2]+z,spec.dims[2]-1);
    const i=ix+spec.dims[0]*(iy+spec.dims[1]*iz);
    if(!valid[i])return null;
    for(let c=0;c<3;c++)result[c]+=weight*displacements[3*i+c]*spec.scale;
  }
  return result;
}

export async function mapPoints(
  catalog:TransformCatalog,from:string,to:string,points:Vec3[],allowApproximate:boolean,
  load:(spec:TransformSpec)=>Promise<TransformField>,
):Promise<Mapping[]> {
  const path=findTransformPath(catalog.transforms,from,to);
  const fields=path?await Promise.all(path.map(load)):[];
  return points.map(input=>{
    if(input.some(x=>!Number.isFinite(x)))throw new Error('Coordinates must be finite numbers');
    const base={sourceSpace:from,targetSpace:to,input,transformIds:path?.map(e=>e.id)||[],transformHashes:path?.map(e=>e.sha256)||[]};
    if(!path)return {...base,mm:allowApproximate?input:null,status:allowApproximate?'approximate':'unsupported',message:catalog.unsupported[from]||catalog.unsupported[to]||'No verified transform connects these templates.'};
    let mm:Vec3|null=input;
    for(const field of fields){mm=applyField(field,mm);if(!mm)return {...base,mm:null,status:'outside-domain',message:'No mapping: outside the transform domain or inside an excluded area with poor landmark agreement.'};}
    return {...base,mm,status:path.length?'registered':'native',...(fields.some(f=>f.spec.qualityExclusions?.length)?{message:'Colin27 registration has restricted coverage: neighborhoods of two poorly aligned ventricular landmarks are excluded. See the validation report.'}:{})};
  });
}
