import type { Atlas, AtlasSummary, Lookup, MeshData, Vec3 } from './types';
export const dataUrl=(path:string)=>new URL(`${import.meta.env.BASE_URL}data/${path}`,document.baseURI).href;
const worker=new Worker(new URL('./data.worker.ts',import.meta.url),{type:'module'});
let next=0;
const requests=new Map<number,{resolve:(r:any)=>void,reject:(e:Error)=>void}>();
worker.onmessage=e=>{const p=requests.get(e.data.requestId);if(!p)return;requests.delete(e.data.requestId);if(e.data.error)p.reject(new Error(e.data.error));else p.resolve(e.data.result);};
worker.onerror=()=>{for(const p of requests.values())p.reject(new Error('Atlas worker stopped. Reload to recover.'));requests.clear();};
function request<T>(message:object):Promise<T>{return new Promise((resolve,reject)=>{const requestId=++next;requests.set(requestId,{resolve,reject});worker.postMessage({...message,requestId});});}
const manifests=new Map<string,Promise<Atlas>>();
export async function getCatalog():Promise<AtlasSummary[]>{const r=await fetch(dataUrl('catalog.json'));if(!r.ok)throw new Error('Atlas catalogue could not be loaded.');return r.json();}
export function getAtlas(summary:AtlasSummary):Promise<Atlas>{
  if(!manifests.has(summary.id))manifests.set(summary.id,fetch(dataUrl(summary.manifest)).then(r=>{if(!r.ok)throw new Error('Atlas metadata could not be loaded.');return r.json();}).catch(e=>{manifests.delete(summary.id);throw e;}));
  return manifests.get(summary.id)!;
}
export const query=(atlas:Atlas,points:Vec3[])=>request<Lookup[]>({type:'query',atlas,points,base:dataUrl('')});
export const loadMeshes=(path:string)=>request<MeshData[]>({type:'meshes',url:dataUrl(path)});

export function download(name:string,text:string,type='text/plain'){
  const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export const csvCell=(x:unknown)=>'"'+String(x??'').replaceAll('"','""')+'"';
