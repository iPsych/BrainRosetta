/// <reference lib="webworker" />
import { gunzipSync } from 'fflate';
import { sample } from './coordinates';
import type { Atlas, MeshData, Vec3 } from './types';
declare const self: DedicatedWorkerGlobalScope;
const volumes=new Map<string,{data:Uint16Array,prob?:Uint16Array}>();
const pending=new Map<string,Promise<{data:Uint16Array,prob?:Uint16Array}>>();
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
  const {requestId,type,atlas,base,points,url}=event.data;
  try{
    if(type==='query'){
      const {data,prob}=await volume(atlas,base);
      const results=(points as Vec3[]).map(mm=>{
        const r=sample(data,atlas.dims,atlas.inverseAffine,mm);
        if(prob&&r.status!=='outside'){
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
};
