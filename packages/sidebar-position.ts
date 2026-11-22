export type SidebarState={top:number;expanded:boolean};
export function sidebarPositionKey(scope:string,userId:string,companyId?:string){return `tcw-sidebar-position-v2:${scope}:${companyId||'platform'}:${userId}`}
export function readSidebarState(storage:Pick<Storage,'getItem'>|undefined,key:string):SidebarState|null{
 try{const value=JSON.parse(storage?.getItem(key)??'null');return value&&Number.isFinite(value.top)&&value.top>=0&&typeof value.expanded==='boolean'?{top:value.top,expanded:value.expanded}:null}catch{return null}
}
export function saveSidebarState(storage:Pick<Storage,'setItem'>|undefined,key:string,state:SidebarState){try{storage?.setItem(key,JSON.stringify(state))}catch{}}
/** Restore only the sidebar's scroll, never scroll the document or its ancestors. */
export function sidebarRestoreTop(saved:number|null,current:number,max:number,active?:{top:number;bottom:number;height:number}){
 if(saved!==null)return Math.max(0,Math.min(saved,max));
 if(!active)return current;
 const delta=active.top<0?active.top:active.bottom>active.height?active.bottom-active.height:0;
 return Math.max(0,Math.min(current+delta,max));
}
