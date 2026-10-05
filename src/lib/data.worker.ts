/// <reference lib="webworker" />
import { gunzipSync } from 'fflate';
import { sample } from './coordinates';
import type { Atlas, MeshData, Vec3 } from './types';
import { findTransformPath, mapPoints } from './transforms';
import { sha256Hex } from './checksum';
import { createRoiMask } from './roi';
import { writeNifti } from './nifti';
import { softwareProvenance } from './citation';
import type { TransformCatalog, TransformField, TransformSpec } from './transforms';
declare const self: DedicatedWorkerGlobalScope;
const volumes=new Map<string,{data:Uint16Array,prob?:Uint16Array}>();
const pending=new Map<string,Promise<{data:Uint16Array,prob?:Uint16Array}>>();
let transformCatalog:Promise<TransformCatalog>|undefined;
const fields=new Map<string,Promise<TransformField>>();
const roiJobs=new Map<number,boolean>();
function catalog(base:string){
  if(!transformCatalog)transformCatalog=fetch(base+'transforms/catalog.json').then(r=>{if(!r.ok)throw new Error('Transform catalogue could not be loaded.');return r.json();}).catch(e=>{transformCatalog=undefined;throw e;});
  return transformCatalog;
}
function field(spec:TransformSpec,base:string):Promise<TransformField>{
  if(!fields.has(spec.id))fields.set(spec.id,(async()=>{
    const b=await bytes(base+spec.file+'?v='+spec.sha256),n=spec.dims.reduce((a,b)=>a*b,1);
    if(b.length!==n*7)throw new Error('Transform field size does not match its manifest.');
    const hex=await sha256Hex(b);
    if(hex!==spec.sha256)throw new Error('Transform checksum mismatch. Reload to fetch a consistent version.');
    return {spec,displacements:new Int16Array(b.slice(0,n*6).buffer),valid:b.slice(n*6)};
  })().catch(e=>{fields.delete(spec.id);throw e;}));
  return fields.get(spec.id)!;
}
async function bytes(url:string){
  const r=await fetch(url);if(!r.ok)throw new Error(`Could not load atlas asset (${r.status}). Try again.`);
  const b=new Uint8Array(await r.arrayBuffer());
  // Some static servers set Content-Encoding:gzip, so fetch has already decoded it.
  return b[0]===0x1f&&b[1]===0x8b?gunzipSync(b):b;
}
async function volume(atlas:Atlas,base:string){
  if(volumes.has(atlas.id)){const v=volumes.get(atlas.id)!;volumes.delete(atlas.id);volumes.set(atlas.id,v);return v;}
  if(pending.has(atlas.id))return pending.get(atlas.id)!;
  const task=(async()=>{
    const b=await bytes(base+atlas.labels);const data=new Uint16Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
    if(data.length!==atlas.dims.reduce((a,b)=>a*b,1))throw new Error('Atlas volume size does not match its manifest');
    let prob:Uint16Array|undefined;
    if(atlas.probabilities){const p=await bytes(base+atlas.probabilities);prob=new Uint16Array(p.buffer.slice(p.byteOffset,p.byteOffset+p.byteLength));}
    const v={data,prob};volumes.set(atlas.id,v);
    while(volumes.size>5)volumes.delete(volumes.keys().next().value!);
    return v;
  })();pending.set(atlas.id,task);
  try{return await task;}finally{pending.delete(atlas.id);}
}
self.onmessage=async(event)=>{
  const {requestId,type,atlas,base,points,url,sourceSpace,allowApproximate}=event.data;
  if(type==='cancel-roi'){if(roiJobs.has(event.data.cancelId))roiJobs.set(event.data.cancelId,true);return;}
  try{
    if(type==='roi'){
      roiJobs.set(requestId,false);
      const {selected,target,kind}=event.data;
      self.postMessage({requestId,progress:{stage:'Loading atlas and transforms',percent:0}});
      let forward:TransformField[]=[],backward:TransformField[]=[];
      if(target.space!==atlas.space){
        const c=await catalog(base),f=findTransformPath(c.transforms,atlas.space,target.space),b=findTransformPath(c.transforms,target.space,atlas.space);
        if(!f||!b)throw new Error('No verified transform is available for this ROI export. Use the native atlas space.');
        [forward,backward]=await Promise.all([Promise.all(f.map(s=>field(s,base))),Promise.all(b.map(s=>field(s,base)))]);
      }
      const {data}=await volume(atlas,base);
      if(await sha256Hex(new Uint8Array(data.buffer,data.byteOffset,data.byteLength))!==atlas.sha256)throw new Error('Atlas checksum mismatch. Reload before exporting an ROI.');
      const result=await createRoiMask(atlas,data,selected,target,kind,forward,backward,{
        cancelled:()=>!!roiJobs.get(requestId),progress:progress=>self.postMessage({requestId,progress}),
      });
      const metadata={application:'BrainRosetta',software:softwareProvenance,format:'NIfTI-1',maskKind:kind,
        atlas:atlas.id,atlasName:atlas.name,atlasVariant:atlas.variant,atlasSource:atlas.source,atlasCitation:atlas.citation,atlasLabelSha256:atlas.sha256,sourceSpace:atlas.space,targetSpace:target.space,
        sourceGrid:{dims:atlas.dims,affine:atlas.affine},
        targetGrid:target,interpolation:result.native?'none (native grid)':'nearest-neighbor',
        pointTransformDirection:'output template → source atlas (pull resampling)',
        transforms:backward.map(f=>({id:f.spec.id,sha256:f.spec.sha256})),
        coverageTransforms:forward.map(f=>({id:f.spec.id,sha256:f.spec.sha256})),
        regions:atlas.regions.filter((r:{id:number})=>selected.includes(r.id)).map((r:{id:number;original:string})=>({id:r.id,name:r.original,outputValue:kind==='binary'?1:r.id,sourceVoxels:result.sourceCounts[r.id],outputVoxels:result.outputCounts[r.id]})),
        invalidTargetVoxels:result.invalidTargetVoxels,
        coverage:'Selected source voxel centers and output mask boundaries checked. Unsupported target locations outside the ROI are background.',
        note:'Template registration is an anatomical estimate. This is not registration of an individual MRI.',
      };
      const buffer=writeNifti(result.data,target,metadata);
      if(roiJobs.get(requestId))throw new Error('ROI export canceled.');
      const filename=`BrainRosetta_${atlas.id}_space-${target.space}_${kind==='binary'?'mask':'labels'}.nii`;
      self.postMessage({requestId,result:{buffer,filename,metadata}},[buffer]);
    }else if(type==='query'){
      const mappings=sourceSpace===atlas.space
        ?(points as Vec3[]).map(input=>({sourceSpace,targetSpace:atlas.space,input,mm:input,status:'native' as const,transformIds:[],transformHashes:[]}))
        :await mapPoints(await catalog(base),sourceSpace,atlas.space,points,!!allowApproximate,spec=>field(spec,base));
      if(mappings.every(m=>!m.mm)){
        self.postMessage({requestId,result:mappings.map(mapping=>({id:0,status:mapping.status==='outside-domain'?'outside-transform':'transform-unavailable',mapping}))});return;
      }
      const {data,prob}=await volume(atlas,base);
      const results=mappings.map(mapping=>{
        if(!mapping.mm)return {id:0,status:mapping.status==='outside-domain'?'outside-transform':'transform-unavailable',mapping};
        const r=sample(data,atlas.dims,atlas.inverseAffine,mapping.mm);r.mapping=mapping;
        if(prob&&r.voxel&&r.status!=='outside'){
          const [x,y,z]=r.voxel, offset=((x*atlas.dims[1]+y)*atlas.dims[2]+z)*6;
          r.probabilities=[0,1,2].map(i=>({id:prob[offset+i*2],value:prob[offset+i*2+1]})).filter(p=>p.value>0);
        }
        return r;
      });self.postMessage({requestId,result:results});
    }else if(type==='meshes'){
      const b=await bytes(url),view=new DataView(b.buffer,b.byteOffset,b.byteLength);let offset=4;
      const count=view.getUint32(0,true);const result:MeshData[]=[];const transfer:ArrayBuffer[]=[];
      for(let i=0;i<count;i++){
        const id=view.getUint32(offset,true),nv=view.getUint32(offset+4,true),ni=view.getUint32(offset+8,true);offset+=12;
        const positions=new Float32Array(b.slice(offset,offset+nv*12).buffer);offset+=nv*12;
        const indices=new Uint32Array(b.slice(offset,offset+ni*4).buffer);offset+=ni*4;
        if(positions.length!==nv*3||indices.length!==ni||indices.some(v=>v>=nv))throw new Error('Invalid mesh asset');
        result.push({id,positions,indices});transfer.push(positions.buffer,indices.buffer);
      }
      if(offset!==b.length)throw new Error('Unexpected mesh data length');
      self.postMessage({requestId,result},transfer);
    }
  }catch(error){self.postMessage({requestId,error:error instanceof Error?error.message:String(error)});}
  finally{if(type==='roi')roiJobs.delete(requestId);}
};
