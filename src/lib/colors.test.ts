import { describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { regionColor } from './colors';
import type { Atlas,AtlasSummary } from './types';

const atlas=(id:string)=>JSON.parse(readFileSync(`public/data/${id}/manifest.json`,'utf8')) as Atlas;
describe('prepared parcel colors',()=>{
  it('covers every atlas and preserves the original color separately',()=>{
    const catalog=JSON.parse(readFileSync('public/data/catalog.json','utf8')) as AtlasSummary[];
    for(const a of catalog)for(const r of atlas(a.id).regions){
      expect(r.enhancedColor).toMatch(/^#[0-9a-f]{6}$/);
      expect(regionColor(r,'original')).toBe(r.color);
      expect(regionColor(r,'enhanced')).toBe(r.enhancedColor);
    }
    const source=atlas('schaefer-1000-7Networks-2mm');
    expect(source.regions.find(r=>r.id===695)?.color).toBe('#047609');
    expect(source.regions.find(r=>r.id===696)?.color).toBe('#04760a');
  });
  it('keeps Schaefer display identity consistent across resolutions',()=>{
    for(const network of ['7Networks','17Networks','Kong2022_17Networks']){
      const low=atlas(`schaefer-1000-${network}-2mm`),high=atlas(`schaefer-1000-${network}-1mm`);
      expect(low.regions.map(r=>[r.id,r.enhancedColor])).toEqual(high.regions.map(r=>[r.id,r.enhancedColor]));
    }
  });
  it('assigns different colors to every touching Schaefer 1000 pair in the actual grid',()=>{
    for(const network of ['7Networks','17Networks','Kong2022_17Networks']){
      const a=atlas(`schaefer-1000-${network}-2mm`),bytes=gunzipSync(readFileSync('public/data/'+a.labels));
      const values=new Uint16Array(Uint8Array.from(bytes).buffer),[nx,ny,nz]=a.dims;
      const colors=new Map(a.regions.map(r=>[r.id,regionColor(r,'enhanced')]));
      let touching=0,identical=0;
      for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
        const i=x+nx*(y+ny*z),id=values[i];if(!id)continue;
        for(const offset of [x<nx-1?1:0,y<ny-1?nx:0,z<nz-1?nx*ny:0]){
          const other=values[i+offset];if(!offset||!other||other===id)continue;
          touching++;if(colors.get(id)===colors.get(other))identical++;
        }
      }
      expect(touching).toBeGreaterThan(1000);expect(identical).toBe(0);
    }
  });
});
