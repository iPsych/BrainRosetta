import { useEffect, useRef, useState } from 'react';
import type { Niivue } from '@niivue/niivue';
import { dataUrl } from '../lib/data';
import type { Atlas, Vec3 } from '../lib/types';
import { regionColor, type ColorMode } from '../lib/colors';
interface Props{atlas:Atlas;colorMode:ColorMode;point:Vec3|null;onPoint:(p:Vec3)=>void;localFile?:File|null;}
function setPalette(viewer:Niivue,atlas:Atlas,colorMode:ColorMode){
  const overlay=viewer.volumes[1];if(!overlay)return;
  if(overlay.hdr)overlay.hdr.intent_code=1002;
  const lut={I:[0,...atlas.regions.map(r=>r.id)],R:[0],G:[0],B:[0],A:[0],labels:['Background',...atlas.regions.map(r=>r.original)]};
  for(const r of atlas.regions){const color=regionColor(r,colorMode);lut.R.push(parseInt(color.slice(1,3),16));lut.G.push(parseInt(color.slice(3,5),16));lut.B.push(parseInt(color.slice(5,7),16));lut.A.push(255);}
  overlay.setColormapLabel(lut);viewer.updateGLVolume();
}
export default function Slices({atlas,colorMode,point,onPoint,localFile}:Props){
  const canvas=useRef<HTMLCanvasElement>(null),nv=useRef<Niivue|null>(null),callback=useRef(onPoint),currentPoint=useRef(point);callback.current=onPoint;currentPoint.current=point;
  const [error,setError]=useState(''),[ready,setReady]=useState(false);const ignore=useRef(false);
  const currentColorMode=useRef(colorMode);currentColorMode.current=colorMode;
  useEffect(()=>{
    let canceled=false;setReady(false);setError('');let instance:Niivue|undefined;
    (async()=>{try{
      const {Niivue,NVImage}=await import('@niivue/niivue');if(canceled||!canvas.current)return;
      const viewer=new Niivue({backColor:[1,1,1,1],fontColor:[.28,.33,.35,1],crosshairColor:[.15,.49,.52,.8],crosshairWidth:1,textHeight:.045,isColorbar:false,isOrientCube:false,isRuler:false,isRadiologicalConvention:false,multiplanarLayout:3,multiplanarShowRender:0,show3Dcrosshair:false});
      instance=viewer;nv.current=viewer;await viewer.attachToCanvas(canvas.current);
      const template=atlas.space==='MNI152NLin2009cAsym'?'mni2009.nii.gz':atlas.space==='MNIColin27'?'colin27.nii.gz':'mni152.nii.gz';
      await viewer.loadVolumes([{url:dataUrl(template),colormap:'gray'},{url:dataUrl(atlas.nifti),opacity:.38}]);
      if(canceled)return;
      if(localFile){const image=await NVImage.loadFromFile({file:localFile});if(canceled)return;viewer.removeVolume(viewer.volumes[0]);viewer.addVolume(image);viewer.setVolume(image,0);}
      // Discrete atlas shader avoids interpolating label IDs as continuous intensities.
      setPalette(viewer,atlas,currentColorMode.current);viewer.setInterpolation(true);viewer.setSliceType(3);viewer.updateGLVolume();
      viewer.onLocationChange=(loc:unknown)=>{if(ignore.current||canceled)return;const mm=(loc as {mm?:number[]}).mm;if(mm&&mm.slice(0,3).every(Number.isFinite)){const p=mm.slice(0,3) as Vec3;if(currentPoint.current&&p.every((v,i)=>Math.abs(v-currentPoint.current![i])<.001))return;callback.current(p);}};
      ignore.current=true;viewer.opts.crosshairWidth=currentPoint.current?1:0;if(currentPoint.current)viewer.scene.crosshairPos=viewer.mm2frac(currentPoint.current);viewer.drawScene();ignore.current=false;setReady(true);
    }catch(e){if(!canceled)setError(e instanceof Error?e.message:'MRI slices unavailable');}})();
    return()=>{canceled=true;instance?.cleanup();if(nv.current===instance)nv.current=null;};
  },[atlas.id,localFile]);
  useEffect(()=>{const viewer=nv.current;if(!ready||!viewer)return;ignore.current=true;setPalette(viewer,atlas,colorMode);viewer.drawScene();ignore.current=false;},[colorMode,ready]);
  useEffect(()=>{const viewer=nv.current;if(!ready||!viewer)return;ignore.current=true;viewer.opts.crosshairWidth=point?1:0;if(point)viewer.scene.crosshairPos=viewer.mm2frac(point);viewer.drawScene();ignore.current=false;},[point,ready]);
  return <div className="slices"><div className="slice-heading"><span className="eyebrow">VOXEL NAVIGATOR</span><span>{!localFile&&atlas.space==='MNI152-HCP40'?'Approximate MNI152 background':'Click to locate · Scroll through slices'}</span></div><div className="slice-canvas"><canvas ref={canvas} aria-label="Axial, coronal, and sagittal MRI slices"/>{!ready&&!error&&<div className="slice-status">Loading anatomical slices…</div>}{error&&<div className="slice-status" role="alert">{error}</div>}</div><div className="slice-labels"><span>Axial <b>Z {point?.[2].toFixed(1)??'—'}</b></span><span>Coronal <b>Y {point?.[1].toFixed(1)??'—'}</b></span><span>Sagittal <b>X {point?.[0].toFixed(1)??'—'}</b></span></div></div>;
}
