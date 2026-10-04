import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { applyField,findTransformPath,mapPoints } from './transforms';
import type { TransformCatalog,TransformField,TransformSpec } from './transforms';
import type { Vec3 } from './types';

const spec:TransformSpec={id:'a-b',from:'A',to:'B',dims:[2,2,2],affine:[[2,0,0,-1],[0,2,0,-1],[0,0,2,-1],[0,0,0,1]],inverseAffine:[[.5,0,0,.5],[0,.5,0,.5],[0,0,.5,.5],[0,0,0,1]],file:'test',sha256:'',scale:.001,method:'test',source:'test',validation:{landmarkMeanMm:0,landmarkMaxMm:0,interpolationP95Mm:0,interpolationMaxMm:0}};
const constant=(s=spec):TransformField=>({spec:s,displacements:new Int16Array(Array.from({length:8},()=>[1000,-2000,3000]).flat()),valid:new Uint8Array(8).fill(1)});

describe('nonlinear point transformations',()=>{
 it('interpolates RAS-mm displacement and includes exact grid boundaries',()=>{
  expect(applyField(constant(),[0,0,0])).toEqual([1,-2,3]);
  expect(applyField(constant(),[1,1,1])).toEqual([2,-1,4]);
  const f=constant();f.displacements[0]=9000;
  expect(applyField(f,[0,0,0])?.[0]).toBe(2);
 });
 it('rejects out-of-domain and invalid interpolation corners without extrapolation',()=>{
  expect(applyField(constant(),[1.001,0,0])).toBeNull();
  const f=constant();f.valid[0]=0;expect(applyField(f,[0,0,0])).toBeNull();
  expect(applyField(f,[1,1,1])).not.toBeNull();
 });
 it('finds a directed multi-step route and does not infer an inverse',()=>{
  const edge={...spec,id:'b-c',from:'B',to:'C'};
  expect(findTransformPath([spec,edge],'A','C')?.map(e=>e.id)).toEqual(['a-b','b-c']);
  expect(findTransformPath([spec,edge],'C','A')).toBeNull();
  expect(findTransformPath([spec],'A','A')).toEqual([]);
 });
 it('keeps the original point immutable and uses registration even when fallback is enabled',async()=>{
  const p:Vec3=[0,0,0];const cat={version:1,transforms:[spec],unsupported:{}};
  const [m]=await mapPoints(cat,'A','B',[p],true,async()=>constant());
  expect(m.status).toBe('registered');expect(m.mm).toEqual([1,-2,3]);expect(p).toEqual([0,0,0]);
 });
 it('permits explicit numeric fallback only for absent routes, never failed assets or invalid domains',async()=>{
  const cat={version:1,transforms:[spec],unsupported:{C:'Unverified template'}};
  const [none]=await mapPoints(cat,'A','C',[[0,0,0]],false,async()=>constant());expect(none.status).toBe('unsupported');expect(none.mm).toBeNull();
  const [fallback]=await mapPoints(cat,'A','C',[[0,0,0]],true,async()=>constant());expect(fallback.status).toBe('approximate');
  const [outside]=await mapPoints(cat,'A','B',[[99,0,0]],true,async()=>constant());expect(outside.status).toBe('outside-domain');expect(outside.mm).toBeNull();
  await expect(mapPoints(cat,'A','B',[[0,0,0]],true,async()=>{throw new Error('checksum');})).rejects.toThrow('checksum');
 });
});

describe('packaged registration fields',()=>{
 const cat=JSON.parse(readFileSync('public/data/transforms/catalog.json','utf8')) as TransformCatalog;
 const cache=new Map<string,TransformField>();
 const load=async(s:TransformSpec)=>{
  if(!cache.has(s.id)){
   const bytes=gunzipSync(readFileSync('public/data/'+s.file)),n=s.dims.reduce((a,b)=>a*b,1);
   expect(bytes.length).toBe(n*7);
   cache.set(s.id,{spec:s,displacements:new Int16Array(Uint8Array.from(bytes.subarray(0,n*6)).buffer),valid:Uint8Array.from(bytes.subarray(n*6))});
  }
  return cache.get(s.id)!;
 };
 it('matches independently generated ITK reference points in every shipped direction',async()=>{
  const fixtures=JSON.parse(readFileSync('public/data/transforms/fixtures.json','utf8')) as {transform:string;input:Vec3;expected:Vec3}[];
  for(const fixture of fixtures){
   const s=cat.transforms.find(s=>s.id===fixture.transform)!;
   const actual=applyField(await load(s),fixture.input)!;
   expect(actual).not.toBeNull();
   expect(Math.hypot(...actual.map((x,i)=>x-fixture.expected[i]))).toBeLessThan(.251);
  }
 });
 it('connects all three supported spaces and leaves HCP40 explicit',()=>{
  for(const from of ['MNIColin27','MNI152NLin6Asym','MNI152NLin2009cAsym'])
   for(const to of ['MNIColin27','MNI152NLin6Asym','MNI152NLin2009cAsym'])expect(findTransformPath(cat.transforms,from,to)).not.toBeNull();
  expect(findTransformPath(cat.transforms,'MNIColin27','MNI152-HCP40')).toBeNull();
 });
 it('chains Colin27 → MNI2009c → FSL and returns within the numerical tolerance',async()=>{
  const original:Vec3=[-38,-8,50];
  const [a]=await mapPoints(cat,'MNIColin27','MNI152NLin6Asym',[original],false,load);
  expect(a.status).toBe('registered');expect(a.transformIds.length).toBe(2);
  const [b]=await mapPoints(cat,'MNI152NLin6Asym','MNIColin27',[a.mm!],false,load);
  expect(Math.hypot(...b.mm!.map((x,i)=>x-original[i]))).toBeLessThan(.5);
 });
});
