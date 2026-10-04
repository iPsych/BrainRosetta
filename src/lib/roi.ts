import { applyAffine, inverse } from './coordinates';
import { applyField } from './transforms';
import type { TransformField } from './transforms';
import type { Atlas, Vec3 } from './types';
import type { MaskKind, RoiGrid } from './nifti';

export interface RoiProgress {stage:string;percent:number}
export interface RoiResult {buffer:ArrayBuffer;filename:string;metadata:Record<string,unknown>}
type Hooks={progress?:(progress:RoiProgress)=>void;cancelled?:()=>boolean};
const map=(fields:TransformField[],point:Vec3):Vec3|null=>{
  let p:Vec3|null=point;for(const f of fields){p=applyField(f,p);if(!p)return null;}return p;
};
const indexAt=(p:Vec3,dims:Vec3)=>{
  const x=Math.round(p[0]),y=Math.round(p[1]),z=Math.round(p[2]);
  return x<0||y<0||z<0||x>=dims[0]||y>=dims[1]||z>=dims[2]?-1:x+dims[0]*(y+dims[1]*z);
};

export async function createRoiMask(atlas:Atlas,source:Uint16Array,selected:number[],target:RoiGrid,kind:MaskKind,forward:TransformField[],backward:TransformField[],hooks:Hooks={}){
  const ids=[...new Set(selected)].sort((a,b)=>a-b),known=new Set(atlas.regions.map(r=>r.id));
  if(!ids.length||ids.some(id=>!known.has(id)))throw new Error('Select at least one valid atlas region.');
  if(source.length!==atlas.dims.reduce((a,b)=>a*b,1))throw new Error('Source label grid size mismatch.');
  const crossSpace=atlas.space!==target.space;
  if(crossSpace&&(!forward.length||!backward.length))throw new Error('No verified bidirectional transform is available for this ROI export. Use the native atlas space.');
  if(crossSpace){
    for(const [path,from,to] of [[forward,atlas.space,target.space],[backward,target.space,atlas.space]] as const){
      if(path[0].spec.from!==from||path.at(-1)!.spec.to!==to||path.some((f,i)=>i>0&&path[i-1].spec.to!==f.spec.from))throw new Error('ROI transform direction mismatch.');
    }
  }
  const wanted=new Uint8Array(65536);ids.forEach(id=>wanted[id]=1);
  const sourceCounts:Record<number,number>=Object.fromEntries(ids.map(id=>[id,0]));
  const outputCounts:Record<number,number>=Object.fromEntries(ids.map(id=>[id,0]));
  const native=atlas.space===target.space&&JSON.stringify(atlas.dims)===JSON.stringify(target.dims)&&JSON.stringify(atlas.affine)===JSON.stringify(target.affine);
  const n=target.dims.reduce((a,b)=>a*b,1),output=kind==='binary'?new Uint8Array(n):new Uint16Array(n);
  const invalid=native?null:new Uint8Array(n),targetInverse=inverse(target.affine);
  const checkpoint=async(stage:string,percent:number)=>{
    if(hooks.cancelled?.())throw new Error('ROI export canceled.');
    hooks.progress?.({stage,percent});await new Promise(resolve=>setTimeout(resolve,0));
    if(hooks.cancelled?.())throw new Error('ROI export canceled.');
  };
  let unsupported=0,clipped=0;
  for(let i=0;i<source.length;i++){
    if(i%65536===0)await checkpoint('Checking selected regions',Math.round(i/source.length*25));
    const id=source[i];if(!wanted[id])continue;sourceCounts[id]++;
    if(native){output[i]=kind==='binary'?1:id;outputCounts[id]++;continue;}
    const p:Vec3=[i%atlas.dims[0],Math.floor(i/atlas.dims[0])%atlas.dims[1],Math.floor(i/(atlas.dims[0]*atlas.dims[1]))];
    const mm=map(forward,applyAffine(atlas.affine,p));
    if(!mm||!map(backward,mm)){unsupported++;continue;}
    if(indexAt(applyAffine(targetInverse,mm),target.dims)<0)clipped++;
  }
  if(unsupported)throw new Error(`${unsupported.toLocaleString()} selected source voxels fall outside supported transform coverage or inside an excluded area. No mask was saved. Use the native atlas space.`);
  if(clipped)throw new Error(`${clipped.toLocaleString()} selected source voxels fall outside the target grid. No mask was saved. Use the native atlas space.`);
  let invalidTargetVoxels=0;
  if(!native){
    // Pull each output voxel through the target-to-source POINT mapping.
    // Labels are always sampled nearest-neighbor, never linearly interpolated.
    for(let i=0;i<n;i++){
      if(i%32768===0)await checkpoint('Resampling mask',25+Math.round(i/n*65));
      const p:Vec3=[i%target.dims[0],Math.floor(i/target.dims[0])%target.dims[1],Math.floor(i/(target.dims[0]*target.dims[1]))];
      const mm=map(backward,applyAffine(target.affine,p));
      if(!mm){invalid![i]=1;invalidTargetVoxels++;continue;}
      const j=indexAt(applyAffine(atlas.inverseAffine,mm),atlas.dims),id=j<0?0:source[j];
      if(wanted[id]){output[i]=kind==='binary'?1:id;outputCounts[id]++;}
    }
    // Do not silently cut a mask at a missing/quality-excluded field boundary.
    const [nx,ny,nz]=target.dims;
    for(let i=0;i<n;i++){
      if(i%65536===0)await checkpoint('Checking output coverage',90+Math.round(i/n*8));
      if(!output[i])continue;
      const x=i%nx,y=Math.floor(i/nx)%ny,z=Math.floor(i/(nx*ny));
      const near=[x>0?i-1:i,x<nx-1?i+1:i,y>0?i-nx:i,y<ny-1?i+nx:i,z>0?i-nx*ny:i,z<nz-1?i+nx*ny:i];
      if(near.some(j=>invalid![j]))throw new Error('The selected ROI touches an unsupported transform boundary. No mask was saved. Use the native atlas space.');
    }
  }
  const missing=ids.filter(id=>!outputCounts[id]);
  if(missing.length)throw new Error(`Regions ${missing.join(', ')} have no voxels on the output grid. No mask was saved. Use the native atlas space.`);
  await checkpoint('Preparing NIfTI file',99);
  return {data:output,sourceCounts,outputCounts,invalidTargetVoxels,native};
}
