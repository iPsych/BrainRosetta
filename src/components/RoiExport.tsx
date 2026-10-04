import { useEffect,useRef,useState } from 'react';
import { Download } from 'lucide-react';
import { download,exportRoi,getRoiOptions } from '../lib/data';
import { findTransformPath } from '../lib/transforms';
import type { Atlas } from '../lib/types';
import type { MaskKind,RoiGrid } from '../lib/nifti';
import type { RoiProgress,RoiResult } from '../lib/roi';

export default function RoiExport({atlas,selected}:{atlas:Atlas;selected:Set<number>}){
  const [options,setOptions]=useState<Awaited<ReturnType<typeof getRoiOptions>>|null>(null),[optionError,setOptionError]=useState('');
  const [gridId,setGridId]=useState('native'),[kind,setKind]=useState<MaskKind>('binary');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<RoiResult|null>(null),[progress,setProgress]=useState<RoiProgress|null>(null);
  const controller=useRef<AbortController|null>(null);
  const native:RoiGrid={id:'native',space:atlas.space,label:`Native atlas grid · ${atlas.space} · ${atlas.resolution.join(' × ')} mm`,dims:atlas.dims,affine:atlas.affine};
  const target=options?.grids.find(g=>g.id===gridId)||native;
  const ids=atlas.regions.filter(r=>selected.has(r.id)).map(r=>r.id);
  useEffect(()=>{let canceled=false;getRoiOptions().then(o=>{if(!canceled)setOptions(o);}).catch(e=>{if(!canceled)setOptionError(e.message);});return()=>{canceled=true;controller.current?.abort();};},[]);
  const canExport=(grid:RoiGrid)=>grid.space===atlas.space||!!(options&&findTransformPath(options.transforms.transforms,atlas.space,grid.space)&&findTransformPath(options.transforms.transforms,grid.space,atlas.space));
  const save=async()=>{
    const abort=new AbortController();controller.current=abort;setBusy(true);setError('');setResult(null);
    try{
      const r=await exportRoi(atlas,ids,target,kind,abort.signal,setProgress);
      if(abort.signal.aborted)return;setResult(r);download(r.filename,r.buffer,'application/x-nifti');
    }catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'ROI export failed.');}
    finally{if(controller.current===abort){controller.current=null;setBusy(false);setProgress(null);}}
  };
  return <section className="roi-export" aria-label="ROI mask export">
    <h3>Selected regions → ROI mask</h3>
    <p>{ids.length} checked {ids.length===1?'region':'regions'}, including any hidden by the hemisphere filter.</p>
    <label className="field-label">Output template<select aria-label="ROI output template" disabled={busy} value={gridId} onChange={e=>{setGridId(e.target.value);setResult(null);setError('');}}>
      <option value="native">{native.label}</option>
      {options?.grids.map(g=><option key={g.id} value={g.id} disabled={!canExport(g)}>{g.label}{!canExport(g)?' · transform unavailable':''}</option>)}
    </select></label>
    <label className="field-label">Mask values<select aria-label="ROI mask values" disabled={busy} value={kind} onChange={e=>{setKind(e.target.value as MaskKind);setResult(null);setError('');}}>
      <option value="binary">Binary union · selected = 1, background = 0</option>
      <option value="labels">Separate labels · preserve atlas region IDs</option>
    </select></label>
    <p className="small-muted">{target.id==='native'?'Preserves the exact atlas voxel grid.':`${target.dims.join(' × ')} voxels · 1 mm · nearest-neighbor resampling.`} The file includes its spatial affine and ROI provenance.</p>
    {atlas.space!==target.space&&<p className="small-muted">Uses nonlinear template registration. Selections crossing unsupported transform coverage cannot be exported to this space.</p>}
    {optionError&&<p className="inline-error">{optionError}</p>}
    <button className="wide-button" disabled={busy||!ids.length||!canExport(target)} onClick={()=>void save()}><Download size={17}/>{busy?'Preparing ROI mask…':'Save ROI mask · .nii'}</button>
    {!ids.length&&<p className="small-muted">Check one or more regions in the region tree first.</p>}
    {busy&&<div className="roi-progress" role="status"><progress max="100" value={progress?.percent||0}/><span>{progress?.stage||'Preparing export'} · {progress?.percent||0}%</span><button className="subtle-button" onClick={()=>controller.current?.abort()}>Cancel ROI export</button></div>}
    {error&&<p className="inline-error" role="alert">{error}</p>}
    {result&&<div className="roi-saved" role="status"><p>Saved {result.filename}</p><button className="subtle-button" onClick={()=>download(result.filename.replace(/\.nii$/,'.json'),JSON.stringify(result.metadata,null,2),'application/json')}>Save ROI metadata · JSON</button></div>}
  </section>;
}
