import type { Point } from './types';
export interface Session {atlas:string;point:Point;selected:number[];pins:string[];opacity:number;mode:'glass'|'solid';hemisphere:string;approx:boolean;clip:number}
export function readSession():Partial<Session>{
  try{
    const params=new URLSearchParams(location.hash.slice(1));
    const s=JSON.parse(params.get('view')||'{}');
    const out:Partial<Session>={};
    if(typeof s.atlas==='string')out.atlas=s.atlas;
    if(Array.isArray(s.point?.mm)&&s.point.mm.length===3&&s.point.mm.every((v:unknown)=>typeof v==='number'&&Number.isFinite(v))&&typeof s.point.space==='string')out.point={...s.point,method:typeof s.point.method==='string'?s.point.method:'Shared coordinate'};
    if(Array.isArray(s.selected))out.selected=s.selected.filter((x:unknown)=>Number.isInteger(x)&&Number(x)>0).slice(0,2000);
    if(Array.isArray(s.pins))out.pins=s.pins.filter((x:unknown)=>typeof x==='string').slice(0,8);
    if(typeof s.opacity==='number'&&s.opacity>=0&&s.opacity<=.6)out.opacity=s.opacity;
    if(typeof s.approx==='boolean')out.approx=s.approx;
    if(typeof s.clip==='number'&&s.clip>=0&&s.clip<=100)out.clip=s.clip;
    if(s.mode==='glass'||s.mode==='solid')out.mode=s.mode;
    if(['all','L','R','M'].includes(s.hemisphere))out.hemisphere=s.hemisphere;
    return out;
  }catch{return {};}
}
export function shareUrl(s:Session){const url=new URL(location.href);url.hash=new URLSearchParams({view:JSON.stringify(s)}).toString();return url.href;}
