import type { Matrix, Vec3, Lookup } from './types';

export function applyAffine(m: Matrix, p: Vec3): Vec3 {
  return [0, 1, 2].map(i => m[i][0]*p[0]+m[i][1]*p[1]+m[i][2]*p[2]+m[i][3]) as Vec3;
}
export function inverse(m: Matrix): Matrix {
  const a=m.map((row,i)=>[...row,...[0,1,2,3].map(j=>i===j?1:0)]);
  for(let i=0;i<4;i++) {
    let pivot=i; for(let j=i+1;j<4;j++) if(Math.abs(a[j][i])>Math.abs(a[pivot][i])) pivot=j;
    if(Math.abs(a[pivot][i])<1e-12) throw new Error('Singular image affine');
    [a[i],a[pivot]]=[a[pivot],a[i]];
    const factor=a[i][i]; a[i]=a[i].map(x=>x/factor);
    for(let j=0;j<4;j++) if(j!==i){const v=a[j][i];a[j]=a[j].map((x,k)=>x-v*a[i][k]);}
  }
  return a.map(r=>r.slice(4));
}
// Lancaster et al. (2007), BrainMap icbm_other2tal.m (pooled transform).
// This is an approximate stereotaxic conversion, not a nonlinear template registration.
export const MNI_TO_TAL: Matrix = [
  [0.9357,0.0029,-0.0072,-1.0423],[-0.0065,0.9396,-0.0726,-1.394],
  [0.0103,0.0752,0.8967,3.6475],[0,0,0,1],
];
const TAL_TO_MNI=inverse(MNI_TO_TAL);
export const mniToTal=(p:Vec3)=>applyAffine(MNI_TO_TAL,p);
export const talToMni=(p:Vec3)=>applyAffine(TAL_TO_MNI,p);

export function sample(data: Uint16Array, dims: Vec3, inv: Matrix, mm: Vec3): Lookup {
  if(mm.some(v=>!Number.isFinite(v))) throw new Error('Coordinates must be finite numbers');
  const v=applyAffine(inv,mm).map(Math.round) as Vec3;
  if(v.some((x,i)=>x<0||x>=dims[i])) return {id:0,voxel:v,status:'outside'};
  const id=data[v[0]+dims[0]*(v[1]+dims[1]*v[2])];
  return {id,voxel:v,status:id?'label':'unlabeled'};
}

export function parseCoordinates(text:string):Vec3[] {
  const lines=text.trim().split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#'));
  if(!lines.length)throw new Error('The file is empty. Expected columns x,y,z.');
  const delimiter=lines[0].includes(',')?',':lines[0].includes('\t')?'\t':lines[0].includes(';')?';':null;
  const split=(s:string)=>{
    if(!delimiter)return s.trim().split(/\s+/);
    const cells:string[]=[];let cell='',quoted=false;
    for(let i=0;i<s.length;i++){
      if(s[i]==='"'){if(quoted&&s[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
      else if(s[i]===delimiter&&!quoted){cells.push(cell.trim());cell='';}
      else cell+=s[i];
    }
    if(quoted)throw new Error('Unclosed quote in coordinate file.');
    cells.push(cell.trim());return cells;
  };
  const head=split(lines[0]);
  let columns=[0,1,2];
  if(head.some(v=>!Number.isFinite(Number(v)))) {
    columns=['x','y','z'].map(axis=>head.findIndex(h=>[axis,`mni_${axis}`,`mni_${axis}_mm`].includes(h.toLowerCase())));
    if(columns.includes(-1))throw new Error('CSV header must include x, y, and z (or mni_x, mni_y, mni_z).');
    lines.shift();
  }
  if(!lines.length||lines.length>10000)throw new Error('Import between 1 and 10,000 coordinate rows.');
  return lines.map((l,i)=>{
    const cells=split(l); const p=columns.map(c=>cells[c]===undefined||cells[c]===''?NaN:Number(cells[c])) as Vec3;
    if(p.some(v=>!Number.isFinite(v)))throw new Error(`Invalid coordinate on data row ${i+1}.`);
    return p;
  });
}
