'use client';
import {useLayoutEffect,type RefObject} from 'react';
import {readSidebarState,saveSidebarState,sidebarRestoreTop} from '../sidebar-position';
export function sidebarSessionStorage(){try{return typeof window==='undefined'?undefined:window.sessionStorage}catch{return undefined}}
export function useSidebarPosition(ref:RefObject<HTMLElement|null>,key:string,page:string,expanded:boolean,ready=true){
 useLayoutEffect(()=>{
  const el=ref.current;if(!el||!ready)return;
  const storage=sidebarSessionStorage(),saved=readSidebarState(storage,key),active=el.querySelector<HTMLElement>('[aria-current="page"]'),bounds=el.getBoundingClientRect(),item=active?.getBoundingClientRect();
  // Menu expansion must already be committed; restoring into a collapsed menu
  // clamps the saved offset to zero and loses it on the next scroll event.
  el.scrollTop=sidebarRestoreTop(saved?.top??null,el.scrollTop,Math.max(0,el.scrollHeight-el.clientHeight),item?{top:item.top-bounds.top,bottom:item.bottom-bounds.top,height:el.clientHeight}:undefined);
  const save=()=>saveSidebarState(storage,key,{top:el.scrollTop,expanded});
  save();
  el.addEventListener('scroll',save,{passive:true});
  el.addEventListener('click',save,true);
  window.addEventListener('pagehide',save);
  return()=>{el.removeEventListener('scroll',save);el.removeEventListener('click',save,true);window.removeEventListener('pagehide',save)};
 },[ref,key,page,expanded,ready]);
}
