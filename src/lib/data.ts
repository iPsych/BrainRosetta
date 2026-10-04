import type { Atlas, AtlasSummary, Lookup, MeshData, Vec3 } from './types';
import type { MaskKind,RoiGrid } from './nifti';
import type { RoiProgress,RoiResult } from './roi';
import type { TransformCatalog } from './transforms';
export const dataUrl=(path:string)=>new URL(`${import.meta.env.BASE_URL}data/${path}`,document.baseURI).href;
const metadataUrl=(path:string)=>dataUrl(path)+'?v='+import.meta.env.VITE_ATLAS_REVISION;
const worker=new Worker(new URL('./data.worker.ts',import.meta.url),{type:'module'});
let next=0;
const requests=new Map<number,{resolve:(r:any)=>void,reject:(e:Error)=>void,progress?:(p:RoiProgress)=>void}>();
worker.onmessage=e=>{const p=requests.get(e.data.requestId);if(!p)return;if(e.data.progress){p.progress?.(e.data.progress);return;}requests.delete(e.data.requestId);if(e.data.error)p.reject(new Error(e.data.error));else p.resolve(e.data.result);};
worker.onerror=()=>{for(const p of requests.values())p.reject(new Error('Atlas worker stopped. Reload to recover.'));requests.clear();};
function request<T>(message:object):Promise<T>{return new Promise((resolve,reject)=>{const requestId=++next;requests.set(requestId,{resolve,reject});worker.postMessage({...message,requestId});});}
const manifests=new Map<string,Promise<Atlas>>();
export async function getCatalog():Promise<AtlasSummary[]>{const r=await fetch(metadataUrl('catalog.json'));if(!r.ok)throw new Error('Atlas catalogue could not be loaded.');return r.json();}
export function getAtlas(summary:AtlasSummary):Promise<Atlas>{
  if(!manifests.has(summary.id))manifests.set(summary.id,fetch(metadataUrl(summary.manifest)).then(r=>{if(!r.ok)throw new Error('Atlas metadata could not be loaded.');return r.json();}).catch(e=>{manifests.delete(summary.id);throw e;}));
  return manifests.get(summary.id)!;
}
export const query=(atlas:Atlas,points:Vec3[],sourceSpace=atlas.space,allowApproximate=false)=>request<Lookup[]>({type:'query',atlas,points,sourceSpace,allowApproximate,base:dataUrl('')});
export const loadMeshes=(path:string)=>request<MeshData[]>({type:'meshes',url:dataUrl(path)});
export async function getRoiOptions():Promise<{grids:RoiGrid[];transforms:TransformCatalog}>{
  const read=async(path:string)=>{const r=await fetch(dataUrl(path));if(!r.ok)throw new Error('Could not load template export options. Native-space export remains available.');return r.json();};
  const [grids,transforms]=await Promise.all([read('roi-grids.json'),read('transforms/catalog.json')]);return {grids,transforms};
}
export function exportRoi(atlas:Atlas,selected:number[],target:RoiGrid,kind:MaskKind,signal:AbortSignal,progress:(p:RoiProgress)=>void):Promise<RoiResult>{
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(new Error('ROI export canceled.'));return;}
    const requestId=++next;
    const abort=()=>{requests.delete(requestId);worker.postMessage({type:'cancel-roi',cancelId:requestId});reject(new Error('ROI export canceled.'));};
    const cleanup=()=>signal.removeEventListener('abort',abort);
    requests.set(requestId,{resolve:r=>{cleanup();resolve(r);},reject:e=>{cleanup();reject(e);},progress});
    signal.addEventListener('abort',abort,{once:true});
    worker.postMessage({requestId,type:'roi',atlas,selected,target,kind,base:dataUrl('')});
  });
}

export function download(name:string,text:string|ArrayBuffer,type='text/plain'){
  const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export const csvCell=(x:unknown)=>'"'+String(x??'').replaceAll('"','""')+'"';
