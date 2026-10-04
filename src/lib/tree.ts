import type { Region, TreeNode } from './types';
export function buildTree(regions:Region[]):TreeNode[] {
  const root:TreeNode={key:'root',label:'root',children:[],ids:[]};
  for(const region of regions){
    let node=root; node.ids.push(region.id);
    for(const label of region.path){
      const key=node.key+'/'+label;
      let child=node.children.find(c=>c.key===key);
      if(!child){child={key,label,children:[],ids:[]};node.children.push(child);}
      child.ids.push(region.id);node=child;
    }
    node.children.push({key:`region-${region.id}`,label:region.name,children:[],ids:[region.id],region});
  }
  return root.children;
}
export function matchRegion(r:Region,q:string,hemisphere:string):boolean {
  const words=q.toLocaleLowerCase().trim().split(/\s+/);
  const hay=[r.name,r.original,r.abbreviation,r.id,...r.path].join(' ').toLocaleLowerCase();
  return (hemisphere==='all'||r.hemisphere===hemisphere||r.hemisphere==='B')&&words.every(w=>hay.includes(w));
}
