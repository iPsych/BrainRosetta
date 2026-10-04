import { describe,it,expect } from 'vitest';
import * as nifti from 'nifti-reader-js';
import { createRoiMask } from './roi';
import { writeNifti,type RoiGrid } from './nifti';
import { inverse } from './coordinates';
import type { Atlas,Vec3 } from './types';
import type { TransformField } from './transforms';

const affine=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
const atlas={id:'test',space:'A',dims:[4,2,2],affine,inverseAffine:affine,regions:[{id:9},{id:10}]} as Atlas;
const source=new Uint16Array(16);source[1]=9;source[2]=10;
const native:RoiGrid={id:'native',label:'Native',space:'A',dims:atlas.dims,affine};
const target:RoiGrid={id:'B',label:'B',space:'B',dims:[6,2,2],affine};
function field(from:string,to:string,shift:number):TransformField{
  const a=[[1,0,0,-2],[0,1,0,-2],[0,0,1,-2],[0,0,0,1]],dims:Vec3=[12,6,6],n=dims.reduce((a,b)=>a*b,1);
  return {spec:{id:`${from}-${to}`,from,to,dims,affine:a,inverseAffine:inverse(a),file:'',sha256:'',scale:.001,method:'test',source:'test',validation:{landmarkMeanMm:0,landmarkMaxMm:0,interpolationP95Mm:0,interpolationMaxMm:0}},valid:new Uint8Array(n).fill(1),displacements:Int16Array.from({length:n*3},(_,i)=>i%3===0?shift*1000:0)};
}

describe('ROI mask export',()=>{
  it('preserves native voxels exactly, as a binary union or original labels',async()=>{
    const binary=await createRoiMask(atlas,source,[9,10],native,'binary',[],[]);
    const labeled=await createRoiMask(atlas,source,[9,10],native,'labels',[],[]);
    expect([...binary.data]).toEqual([...source].map(x=>x?1:0));expect(labeled.data).toEqual(source);
    expect([...source].filter(Boolean)).toEqual([9,10]);expect(binary.sourceCounts).toEqual({9:1,10:1});
  });
  it('pulls output voxels through the inverse point direction without interpolating labels',async()=>{
    const r=await createRoiMask(atlas,source,[9,10],target,'labels',[field('A','B',1)],[field('B','A',-1)]);
    expect(r.data[1]).toBe(0);expect(r.data[2]).toBe(9);expect(r.data[3]).toBe(10);
    expect(new Set(r.data)).toEqual(new Set([0,9,10]));
  });
  it('rejects absent transforms, quality exclusions and target-grid clipping',async()=>{
    await expect(createRoiMask(atlas,source,[9],target,'binary',[],[])).rejects.toThrow('No verified');
    const f=field('A','B',1);f.spec.qualityExclusions=[{center:[1,0,0],radiusMm:.4,landmark:'test',errorMm:10}];
    await expect(createRoiMask(atlas,source,[9],target,'binary',[f],[field('B','A',-1)])).rejects.toThrow('excluded area');
    await expect(createRoiMask(atlas,source,[9],{...target,dims:[1,2,2]},'binary',[field('A','B',1)],[field('B','A',-1)])).rejects.toThrow('outside the target grid');
  });
  it('rejects empty selections and supports cancellation before writing data',async()=>{
    await expect(createRoiMask(atlas,source,[],native,'binary',[],[])).rejects.toThrow('Select at least');
    await expect(createRoiMask(atlas,source,[9],native,'binary',[],[],{cancelled:()=>true})).rejects.toThrow('canceled');
  });
  it('refuses to save an ROI against an inverse-transform coverage boundary',async()=>{
    const b=field('B','A',-1);
    // Target x=3 is invalid, directly beside the output ROI at x=2.
    b.spec.qualityExclusions=[{center:[3,0,0],radiusMm:.1,landmark:'boundary',errorMm:10}];
    await expect(createRoiMask(atlas,source,[9],target,'binary',[field('A','B',1)],[b])).rejects.toThrow('unsupported transform boundary');
  });
  it('writes readable NIfTI-1 with exact sform, discrete values and JSON provenance',()=>{
    const grid={...native,space:'MNI152NLin2009cAsym',affine:[[-2,0,0,90],[0,2,0,-126],[0,0,2,-72],[0,0,0,1]]};
    const buffer=writeNifti(source,grid,{selected:[9,10],targetSpace:grid.space});
    expect(nifti.isNIFTI(buffer)).toBe(true);
    const h=nifti.readHeader(buffer)!;expect(h.dims.slice(1,4)).toEqual([4,2,2]);expect(h.affine).toEqual(grid.affine);
    expect(h.datatypeCode).toBe(512);expect(h.numBitsPerVoxel).toBe(16);expect(h.sform_code).toBe(4);expect(h.qform_code).toBe(0);expect(h.xyzt_units).toBe(2);
    expect(new Uint16Array(nifti.readImage(h,buffer))).toEqual(source);
    const text=new TextDecoder().decode(nifti.readExtensionData(h,buffer)).replace(/\0+$/,'');
    expect(JSON.parse(text)).toEqual({selected:[9,10],targetSpace:grid.space});
    const binary=writeNifti(Uint8Array.from(source,x=>x?1:0),grid,{}),b=nifti.readHeader(binary)!;
    expect(b.datatypeCode).toBe(2);expect(b.numBitsPerVoxel).toBe(8);expect(new Uint8Array(nifti.readImage(b,binary))).toEqual(Uint8Array.from(source,x=>x?1:0));
  });
});
