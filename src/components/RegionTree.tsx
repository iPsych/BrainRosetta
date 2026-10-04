import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Search, ChevronsDownUp, ListFilter } from 'lucide-react';
import { buildTree, matchRegion } from '../lib/tree';
import type { Atlas, Region, TreeNode } from '../lib/types';
interface Props {atlas:Atlas;selected:Set<number>;focused:number|null;hemisphere:string;onHemisphere:(h:string)=>void;onSelect:(ids:number[],on:boolean)=>void;onFocus:(r:Region)=>void;}
function Check({checked,partial,onChange,label}:{checked:boolean;partial:boolean;onChange:()=>void;label:string}){const ref=useRef<HTMLInputElement>(null);useEffect(()=>{if(ref.current)ref.current.indeterminate=partial;},[partial]);return <input ref={ref} type="checkbox" checked={checked} aria-label={label} onChange={onChange}/>;}
export default function RegionTree(p:Props){
  const [search,setSearch]=useState(''),[open,setOpen]=useState<Set<string>>(new Set());
  const regions=useMemo(()=>p.atlas.regions.filter(r=>matchRegion(r,search,p.hemisphere)),[p.atlas,search,p.hemisphere]);
  const tree=useMemo(()=>buildTree(regions),[regions]);
  useEffect(()=>{setSearch('');setOpen(new Set());},[p.atlas.id]);
  useEffect(()=>{
    const r=p.atlas.regions.find(r=>r.id===p.focused);if(!r)return;
    const keys:string[]=[];let key='root';for(const part of r.path){key+='/'+part;keys.push(key);}
    setOpen(prev=>new Set([...prev,...keys]));
    const timer=setTimeout(()=>document.querySelector(`[data-region="${r.id}"]`)?.scrollIntoView({block:'nearest',behavior:'smooth'}),80);return()=>clearTimeout(timer);
  },[p.focused,p.atlas.id]);
  const toggle=(key:string)=>setOpen(prev=>{const n=new Set(prev);n.has(key)?n.delete(key):n.add(key);return n;});
  const render=(node:TreeNode,depth:number)=>{
    const count=node.ids.filter(id=>p.selected.has(id)).length;
    if(node.region){const r=node.region;return <div key={node.key} className={`tree-row leaf ${p.focused===r.id?'focused':''}`} data-region={r.id} style={{paddingLeft:12+depth*13}}>
      <Check checked={count>0} partial={false} label={`Show ${r.original}`} onChange={()=>p.onSelect([r.id],!count)}/>
      <button className="region-name" onClick={()=>p.onFocus(r)} title={r.original}><span className="region-color" style={{background:r.color}}/>{r.path.at(-1)===r.name?(r.hemisphere==='L'?'Left':r.hemisphere==='R'?'Right':r.hemisphere==='M'?'Midline':r.name):r.name}<span className="region-id">{r.id}</span></button>
    </div>;}
    const expanded=open.has(node.key)||!!search;
    return <div key={node.key} className="tree-branch"><div className={`tree-row branch depth-${depth}`} style={{paddingLeft:8+depth*13}}>
      <button className="tree-toggle" onClick={()=>toggle(node.key)} aria-expanded={expanded} aria-label={`${expanded?'Collapse':'Expand'} ${node.label}`}>{expanded?<ChevronDown size={14}/>:<ChevronRight size={14}/>}</button>
      <Check checked={count===node.ids.length} partial={count>0&&count<node.ids.length} label={`Show all ${node.label}`} onChange={()=>p.onSelect(node.ids,count!==node.ids.length)}/>
      <button className="branch-name" onClick={()=>toggle(node.key)} aria-expanded={expanded}>{node.label}<span>{node.ids.length}</span></button>
    </div>{expanded&&<div>{node.children.map(n=>render(n,depth+1))}</div>}</div>;
  };
  return <aside className="region-panel">
    <div className="panel-heading"><div><span className="eyebrow">EXPLORE</span><h2>Region browser</h2></div><button className="icon-button" title="Collapse all branches" aria-label="Collapse all branches" onClick={()=>setOpen(new Set())}><ChevronsDownUp size={17}/></button></div>
    <label className="search-field"><Search size={16}/><input placeholder="Find a region, label, or ID…" aria-label="Search regions" value={search} onChange={e=>setSearch(e.target.value)}/><kbd>/</kbd></label>
    <div className="segmented hemispheres" aria-label="Hemisphere filter">{[['all','Both'],['L','Left'],['R','Right'],['M','Midline']].map(([id,label])=><button key={id} className={p.hemisphere===id?'active':''} onClick={()=>p.onHemisphere(id)}>{label}</button>)}</div>
    <div className="tree-summary"><span><ListFilter size={13}/> {regions.length} regions</span><div><button onClick={()=>p.onSelect(regions.map(r=>r.id),true)}>Show all</button><span> / </span><button onClick={()=>p.onSelect(p.atlas.regions.map(r=>r.id),false)}>Clear</button></div></div>
    <div className="tree-scroll" aria-label="Anatomical region hierarchy">{tree.map(n=>render(n,0))}{!regions.length&&<div className="empty">No matching regions.<br/>Try another name or hemisphere.</div>}</div>
    <div className="tree-footer"><span className="selection-dot"/>{p.selected.size} selected <span>of {p.atlas.regionCount}</span></div>
  </aside>;
}
