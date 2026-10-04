import { describe, expect, it } from 'vitest';
import { applyAffine, inverse, mniToTal, parseCoordinates, sample, talToMni } from './coordinates';
import { buildTree, matchRegion } from './tree';
import type { Region, Vec3 } from './types';

describe('spatial coordinate handling',()=>{
  it('maps a left-right flipped, anisotropic volume by its affine',()=>{
    const affine=[[-2,0,0,90],[0,3,0,-126],[0,0,4,-72],[0,0,0,1]];
    const data=new Uint16Array(3*4*5);data[2+3*(1+4*3)]=170;
    const mm=applyAffine(affine,[2,1,3]);expect(mm).toEqual([86,-123,-60]);
    expect(sample(data,[3,4,5],inverse(affine),mm)).toEqual({id:170,voxel:[2,1,3],status:'label'});
  });
  it('distinguishes unlabeled voxels from points outside the grid',()=>{
    const inv=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
    expect(sample(new Uint16Array(8),[2,2,2],inv,[0,0,0]).status).toBe('unlabeled');
    expect(sample(new Uint16Array(8),[2,2,2],inv,[-1,0,0]).status).toBe('outside');
    expect(sample(new Uint16Array(8),[2,2,2],inv,[2,0,0]).status).toBe('outside');
    expect(()=>sample(new Uint16Array(8),[2,2,2],inv,[NaN,0,0])).toThrow();
  });
  it('uses the published Lancaster coefficients, with an invertible numerical implementation',()=>{
    expect(mniToTal([0,0,0])).toEqual([-1.0423,-1.394,3.6475]);
    const p:Vec3=[-40,20,30];const actual=mniToTal(p);
    const reference=[-.9357*40+.0029*20-.0072*30-1.0423,.0065*40+.9396*20-.0726*30-1.394,-.0103*40+.0752*20+.8967*30+3.6475];
    actual.forEach((v,i)=>expect(v).toBeCloseTo(reference[i],9));
    talToMni(actual).forEach((v,i)=>expect(v).toBeCloseTo(p[i],9));
  });
  it('rejects malformed batch rows instead of interpreting blanks as zero',()=>{
    expect(parseCoordinates('x,y,z\n-38,-8,50\n0,0,0')).toEqual([[-38,-8,50],[0,0,0]]);
    expect(parseCoordinates('name,mni_z,mni_x,mni_y\npeak,50,-38,-8')).toEqual([[-38,-8,50]]);
    expect(()=>parseCoordinates('x,y,z\n-38,,50')).toThrow();
    expect(()=>parseCoordinates('x,y,z\nInfinity,0,0')).toThrow();
    expect(()=>parseCoordinates('x,y,z')).toThrow();
  });
});
describe('atlas hierarchy',()=>{
  const region=(id:number,hemisphere:'L'|'R'):Region=>({id,hemisphere,name:'Precentral gyrus',original:`Precentral_${hemisphere}`,path:['Cerebral cortex','Frontal lobe','Precentral gyrus'],color:'#438c9e',centroid:[0,0,0],focus:[0,0,0],voxelCount:1,volume:1});
  it('retains sparse source IDs and aggregates descendants without duplicate leaves',()=>{
    const tree=buildTree([region(1,'L'),region(170,'R')]);
    expect(tree[0].ids).toEqual([1,170]);
    expect(tree[0].children[0].children[0].children.map(n=>n.region?.id)).toEqual([1,170]);
  });
  it('searches ancestor names and respects hemisphere filters',()=>{
    expect(matchRegion(region(1,'L'),'frontal precentral','L')).toBe(true);
    expect(matchRegion(region(1,'L'),'1','R')).toBe(false);
  });
});
