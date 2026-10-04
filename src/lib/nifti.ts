import type { Matrix, Vec3 } from './types';

export interface RoiGrid {id:string;space:string;label:string;dims:Vec3;affine:Matrix;referenceSha256?:string}
export type MaskKind='binary'|'labels';

// NIfTI-1 single-file, little-endian, x-fastest. Exact RAS affine in sform.
// A COMMENT extension carries UTF-8 JSON provenance without extra downloads.
export function writeNifti(data:Uint8Array|Uint16Array,grid:RoiGrid,metadata:object):ArrayBuffer {
  if(data.length!==grid.dims.reduce((a,b)=>a*b,1))throw new Error('ROI grid/data size mismatch.');
  const json=new TextEncoder().encode(JSON.stringify(metadata));
  const extensionSize=Math.ceil((8+json.length+1)/16)*16,offset=352+extensionSize;
  const buffer=new ArrayBuffer(offset+data.byteLength),view=new DataView(buffer),bytes=new Uint8Array(buffer);
  const text=(offset:number,size:number,value:string)=>bytes.set(new TextEncoder().encode(value).subarray(0,size-1),offset);
  view.setInt32(0,348,true);view.setInt16(40,3,true);
  for(let i=0;i<7;i++)view.setInt16(42+i*2,i<3?grid.dims[i]:1,true);
  const labels=data instanceof Uint16Array;
  view.setInt16(68,1002,true);view.setInt16(70,labels?512:2,true);view.setInt16(72,labels?16:8,true);
  view.setFloat32(76,1,true);
  for(let i=0;i<3;i++)view.setFloat32(80+i*4,Math.hypot(grid.affine[0][i],grid.affine[1][i],grid.affine[2][i]),true);
  view.setFloat32(108,offset,true);view.setFloat32(112,1,true);bytes[123]=2; // millimeters
  view.setFloat32(124,labels?data.reduce((a,b)=>Math.max(a,b),0):1,true);
  text(148,80,`BrainRosetta ROI | ${grid.space}`);
  view.setInt16(252,0,true);view.setInt16(254,4,true); // MNI sform; do not invent a qform
  for(let row=0;row<3;row++)for(let col=0;col<4;col++)view.setFloat32(280+row*16+col*4,grid.affine[row][col],true);
  text(328,16,'ROI mask');bytes.set([110,43,49,0],344); // n+1\0
  bytes[348]=1;view.setInt32(352,extensionSize,true);view.setInt32(356,6,true);bytes.set(json,360);
  if(labels)for(let i=0;i<data.length;i++)view.setUint16(offset+i*2,data[i],true);
  else bytes.set(data,offset);
  return buffer;
}
