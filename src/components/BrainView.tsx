import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RotateCcw, Camera, Maximize2 } from 'lucide-react';
import { loadMeshes } from '../lib/data';
import type { Atlas, MeshData, Vec3 } from '../lib/types';
import { regionColor, type ColorMode } from '../lib/colors';

interface Props { atlas:Atlas; colorMode:ColorMode; outlines:boolean; selected:Set<number>; focused:number|null; hemisphere:string; opacity:number; mode:'glass'|'solid'; clip:number; point:Vec3|null; onPick:(id:number,point:Vec3)=>void; onReady:()=>void }
type SceneState={scene:THREE.Scene;camera:THREE.PerspectiveCamera;renderer:THREE.WebGLRenderer;controls:OrbitControls;meshes:THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>[];shell:THREE.Mesh|null;marker:THREE.Group;render:()=>void};
function geometry(m:MeshData){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(m.positions,3));g.setIndex(new THREE.BufferAttribute(m.indices,1));g.computeVertexNormals();return g;}
function dispose(obj:THREE.Object3D){const geometries=new Set<THREE.BufferGeometry>();obj.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);const m=Array.isArray(o.material)?o.material:[o.material];m.forEach(x=>x.dispose());}});geometries.forEach(g=>g.dispose());}
function parcelOutline(g:THREE.BufferGeometry){
  const material=new THREE.MeshBasicMaterial({color:0x263e43,side:THREE.BackSide});
  material.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed += normal * 0.35;');};
  material.customProgramCacheKey=()=> 'parcel-outline-v1';
  return new THREE.Mesh(g,material);
}
export default function BrainView(props:Props){
  const host=useRef<HTMLDivElement>(null),state=useRef<SceneState|null>(null),latest=useRef(props);latest.current=props;
  const [error,setError]=useState(''),[loading,setLoading]=useState(true),[hover,setHover]=useState<{name:string,x:number,y:number}|null>(null);
  const refresh=()=>{
    const s=state.current;if(!s)return;const p=latest.current;
    const planes=p.clip<100?[new THREE.Plane(new THREE.Vector3(-1,0,0),-90+p.clip*1.8)]:[];
    for(const mesh of s.meshes){
      const region=p.atlas.regions.find(r=>r.id===mesh.userData.id);if(!region)continue;
      const inHemi=p.hemisphere==='all'||region.hemisphere===p.hemisphere||region.hemisphere==='B';
      const chosen=p.selected.has(region.id);mesh.visible=inHemi&&chosen;
      const color=regionColor(region,p.colorMode);
      mesh.material.color.set(color);mesh.material.roughness=.75;
      mesh.material.emissive.set(region.id===p.focused?color:'#000000');mesh.material.emissiveIntensity=.08;
      mesh.material.opacity=1;mesh.material.transparent=false;mesh.material.depthWrite=true;mesh.material.clippingPlanes=planes;
      const outline=mesh.children[0] as THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>;
      outline.visible=p.outlines;outline.material.clippingPlanes=planes;
    }
    if(s.shell){
      const mat=s.shell.material as THREE.MeshStandardMaterial;
      mat.opacity=p.mode==='solid'?.88:p.opacity;mat.transparent=true;mat.depthWrite=p.mode==='solid';
      mat.clippingPlanes=planes;
      if(p.hemisphere==='L')mat.clippingPlanes=[...planes,new THREE.Plane(new THREE.Vector3(-1,0,0),0)];
      if(p.hemisphere==='R')mat.clippingPlanes=[...planes,new THREE.Plane(new THREE.Vector3(1,0,0),0)];
    }
    s.marker.visible=!!p.point;if(p.point)s.marker.position.set(...p.point);s.render();
  };
  useEffect(()=>{
    if(!host.current)return;let s:SceneState;let frame=0;
    try{
      const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0xffffff);renderer.localClippingEnabled=true;
      renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
      renderer.domElement.setAttribute('aria-label','Interactive three-dimensional brain. Drag to rotate; scroll to zoom.');renderer.domElement.tabIndex=0;host.current.appendChild(renderer.domElement);
      const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(32,1,.1,2000);camera.up.set(0,0,1);camera.position.set(290,-370,210);
      const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,-18,15);controls.minDistance=180;controls.maxDistance=850;controls.enableDamping=false;
      scene.add(new THREE.HemisphereLight(0xffffff,0xb6c4c8,1.5));
      const light=new THREE.DirectionalLight(0xffffff,2.2);light.position.set(-180,-200,400);scene.add(light);
      const fill=new THREE.DirectionalLight(0xe4f2f5,1.8);fill.position.set(250,150,80);scene.add(fill);
      const marker=new THREE.Group();
      const dot=new THREE.Mesh(new THREE.SphereGeometry(1.5,16,12),new THREE.MeshBasicMaterial({color:0xe39340,depthTest:false}));dot.renderOrder=100;marker.add(dot);
      for(let i=0;i<3;i++){const a=[0,0,0],b=[0,0,0];a[i]=-5;b[i]=5;const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a),new THREE.Vector3(...b)]);const l=new THREE.Line(g,new THREE.LineBasicMaterial({color:0xb2702e,transparent:true,opacity:.7,depthTest:false}));l.renderOrder=100;marker.add(l);}
      scene.add(marker);
      const render=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>renderer.render(scene,camera));};
      s={scene,camera,renderer,controls,meshes:[],shell:null,marker,render};state.current=s;
      controls.addEventListener('change',render);
      const resize=new ResizeObserver(()=>{if(!host.current)return;const {width,height}=host.current.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();render();});resize.observe(host.current);
      const ray=new THREE.Raycaster();let down=[0,0];
      const pick=(e:PointerEvent)=>{
        const rect=renderer.domElement.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
        const p=latest.current;
        return ray.intersectObjects(s.meshes,false).find(hit=>{
          const r=p.atlas.regions.find(r=>r.id===hit.object.userData.id);
          return r&&(p.hemisphere==='all'||r.hemisphere===p.hemisphere||r.hemisphere==='B')&&(p.clip===100||hit.point.x<=-90+p.clip*1.8);
        });
      };
      const onDown=(e:PointerEvent)=>{down=[e.clientX,e.clientY];setHover(null);};
      const onUp=(e:PointerEvent)=>{if(Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const hit=pick(e);if(hit)latest.current.onPick(hit.object.userData.id,hit.point.toArray() as Vec3);};
      let lastHover=0;
      const onMove=(e:PointerEvent)=>{if(e.buttons||performance.now()-lastHover<65)return;lastHover=performance.now();const hit=pick(e),r=hit&&latest.current.atlas.regions.find(r=>r.id===hit.object.userData.id);const rect=renderer.domElement.getBoundingClientRect();setHover(r?{name:r.name+(r.hemisphere==='L'?' · Left':r.hemisphere==='R'?' · Right':''),x:e.clientX-rect.left,y:e.clientY-rect.top}:null);renderer.domElement.style.cursor=hit?'pointer':'grab';};
      const leave=()=>setHover(null);
      renderer.domElement.addEventListener('pointerdown',onDown);renderer.domElement.addEventListener('pointerup',onUp);renderer.domElement.addEventListener('pointermove',onMove);renderer.domElement.addEventListener('pointerleave',leave);
      render();
      return()=>{resize.disconnect();controls.dispose();cancelAnimationFrame(frame);dispose(scene);marker.traverse(o=>{if(o instanceof THREE.Line){o.geometry.dispose();(o.material as THREE.Material).dispose();}});renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();state.current=null;};
    }catch(e){setError('3D rendering needs WebGL2. Try a current browser with hardware acceleration. The atlas tree and coordinate lookup remain available.');}
  },[]);
  useEffect(()=>{
    let canceled=false;const s=state.current;if(!s)return;setLoading(true);setError('');setHover(null);
    s.meshes.forEach(m=>{s.scene.remove(m);dispose(m);});s.meshes=[];
    if(s.shell){s.scene.remove(s.shell);dispose(s.shell);s.shell=null;}
    (async()=>{
      try{
        const [parts,brain]=await Promise.all([loadMeshes(props.atlas.meshes),loadMeshes(props.atlas.space==='MNI152NLin2009cAsym'?'brain2009.bin.gz':props.atlas.space==='MNIColin27'?'braincolin.bin.gz':'brain.bin.gz')]);
        if(canceled)return;
        for(const p of parts){const mesh=new THREE.Mesh(geometry(p),new THREE.MeshStandardMaterial({color:0x6a9fa6,roughness:.75,side:THREE.DoubleSide}));mesh.userData.id=p.id;mesh.add(parcelOutline(mesh.geometry));s.scene.add(mesh);s.meshes.push(mesh);}
        const mat=new THREE.MeshStandardMaterial({color:0xabb7bb,roughness:.8,transparent:true,opacity:.15,depthWrite:false,side:THREE.DoubleSide});
        const shell=new THREE.Mesh(geometry(brain[0]),mat);shell.renderOrder=2;s.scene.add(shell);s.shell=shell;
        refresh();setLoading(false);latest.current.onReady();
      }catch(e){if(!canceled){setError(e instanceof Error?e.message:'Could not load brain geometry');setLoading(false);}}
    })();return()=>{canceled=true;};
  },[props.atlas.id]);
  useEffect(refresh,[props.selected,props.focused,props.hemisphere,props.opacity,props.mode,props.clip,props.point,props.colorMode,props.outlines]);
  const view=(name:string)=>{const s=state.current;if(!s)return;s.camera.up.set(0,0,1);s.controls.target.set(0,-18,15);const positions:Record<string,Vec3>={reset:[290,-370,210],left:[-440,-18,30],right:[440,-18,30],front:[0,440,30],top:[0,-18,460]};if(name==='top')s.camera.up.set(0,1,0);s.camera.position.set(...positions[name]);s.controls.update();s.render();};
  const screenshot=()=>{const s=state.current;if(!s)return;s.renderer.render(s.scene,s.camera);const a=document.createElement('a');a.download=`BrainRosetta-${props.atlas.id}.png`;a.href=s.renderer.domElement.toDataURL('image/png');a.click();};
  return <div className="brain-view">
    <div className="canvas-host" ref={host}/>
    <div className="view-label"><span className="live-dot"/>3D ATLAS<span className="view-caption">{props.atlas.space}</span></div>
    <div className="view-actions"><button title="Reset camera" aria-label="Reset camera" onClick={()=>view('reset')}><RotateCcw size={16}/></button><button title="Export brain PNG" aria-label="Export brain PNG" onClick={screenshot}><Camera size={16}/></button><button title="Fullscreen brain" aria-label="Fullscreen brain" onClick={()=>host.current?.parentElement?.requestFullscreen().catch(()=>{})}><Maximize2 size={16}/></button></div>
    <div className="view-presets">{[['left','Left'],['right','Right'],['front','Anterior'],['top','Superior']].map(([id,label])=><button key={id} onClick={()=>view(id)}>{label}</button>)}</div>
    <div className="orbit-hint">Drag to rotate <span>·</span> Scroll to zoom <span>·</span> Click to inspect</div>
    {hover&&<div className="brain-tooltip" style={{left:Math.min(hover.x+12,(host.current?.clientWidth||600)-220),top:hover.y+15}}>{hover.name}</div>}
    {loading&&!error&&<div className="canvas-loading"><span className="spinner"/>Preparing brain surfaces…</div>}
    {error&&<div className="canvas-error" role="alert">{error}<button onClick={()=>location.reload()}>Reload</button></div>}
  </div>;
}
