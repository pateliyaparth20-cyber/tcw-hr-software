'use client';
import {useEffect} from 'react';

declare global {
  interface Window {
    __tcwInstallPrompt?: any;
    __tcwSystemNotify?: (title:string,body?:string,url?:string,tag?:string)=>Promise<void>;
    __tcwEnableNotifications?: ()=>Promise<boolean>;
    TCWNative?: {showNotification:(title:string,body:string,url:string,tag:string)=>void};
  }
}

const TCW_CACHE_PREFIX='tcw-shell-';

async function clearLegacyTcwCaches(){
  if(typeof caches==='undefined') return;
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith(TCW_CACHE_PREFIX)).map(key=>caches.delete(key)));
}

async function tcwSystemNotify(title:string,body='',url='/notifications',tag='tcw-notification'){
  if(typeof window==='undefined')return;
  try{
    if(window.TCWNative?.showNotification){window.TCWNative.showNotification(title,body,url,tag);return;}
    if(!('Notification' in window)||Notification.permission!=='granted'||!('serviceWorker' in navigator))return;
    const registration=await navigator.serviceWorker.ready;
    await registration.showNotification(title,{body,icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag,data:{url}});
  }catch{}
}
async function enableNotifications(){
  if(typeof window==='undefined')return false;
  if(window.TCWNative)return true;
  if(!('Notification' in window))return false;
  if(Notification.permission==='granted')return true;
  if(Notification.permission==='denied')return false;
  try{return (await Notification.requestPermission())==='granted'}catch{return false}
}
export function PwaClient(){
  useEffect(()=>{
    window.__tcwSystemNotify=tcwSystemNotify;
    window.__tcwEnableNotifications=enableNotifications;
    let cancelled=false;
    const syncVersion=async()=>{
      try{
        const response=await fetch('/api/version?ts='+Date.now(),{cache:'no-store',credentials:'include',headers:{'Cache-Control':'no-cache'}});
        if(!response.ok||cancelled)return;
        const data=await response.json(),next=String(data.version??'');
        if(!next)return;
        const key='tcw_loaded_deployment_version';
        const previous=window.localStorage.getItem(key);
        if(!previous){window.localStorage.setItem(key,next);return;}
        if(previous!==next){
          window.localStorage.setItem(key,next);
          await clearLegacyTcwCaches().catch(()=>{});
          const url=new URL(window.location.href);
          url.searchParams.set('tcw_refresh',String(Date.now()));
          window.location.replace(url.toString());
        }
      }catch{}
    };
    syncVersion();
    const isiOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
    const standalone=window.matchMedia('(display-mode: standalone)').matches||(navigator as any).standalone===true;
    let iosGuide:HTMLButtonElement|null=null;
    if(isiOS&&(!standalone||('Notification' in window&&Notification.permission!=='granted'))){
      iosGuide=document.createElement('button');iosGuide.type='button';iosGuide.className='tcw-ios-notice';
      iosGuide.textContent=!standalone?'Enable iPhone notifications · Add to Home Screen':'Enable iPhone notifications';
      iosGuide.onclick=async()=>{if(!standalone){window.alert('On iPhone: tap Share in Safari, choose Add to Home Screen, then open TCW HR from the Home Screen and allow notifications.');return;}const ok=await enableNotifications();iosGuide!.textContent=ok?'iPhone notifications enabled':'Notification permission is off';if(ok)setTimeout(()=>iosGuide?.remove(),1600)};
      document.body.appendChild(iosGuide);
    }
    const askOnFirstInteraction=()=>{if(!isiOS||standalone)enableNotifications().catch(()=>{});document.removeEventListener('pointerdown',askOnFirstInteraction,true)};
    if(!window.TCWNative&&'Notification' in window&&Notification.permission==='default')document.addEventListener('pointerdown',askOnFirstInteraction,true);
    // Never let a development service worker cache Next.js bundles. Old cached
    // chunks can produce React hydration mismatches after a UI update.
    if('serviceWorker' in navigator){
      if(process.env.NODE_ENV!=='production'){
        navigator.serviceWorker.getRegistrations()
          .then(registrations=>Promise.all(registrations.map(registration=>registration.unregister())))
          .then(()=>clearLegacyTcwCaches())
          .catch(()=>{});
      }else{
        navigator.serviceWorker.register('/sw.js').then(registration=>{
          registration.update().catch(()=>{});
          const announce=()=>{window.dispatchEvent(new Event('tcw-update-available'));tcwSystemNotify('TCW HR Software update available','A new software version is ready. Open the app to update.','/dashboard','tcw-software-update').catch(()=>{})};
          if(registration.waiting)announce();
          registration.addEventListener('updatefound',()=>{const worker=registration.installing;if(!worker)return;worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)announce()})});
        }).catch(()=>{});
      }
    }
    const onPrompt=(event:any)=>{
      event.preventDefault();
      window.__tcwInstallPrompt=event;
      window.dispatchEvent(new Event('tcw-install-available'));
    };
    const onInstalled=()=>{
      window.__tcwInstallPrompt=undefined;
      window.dispatchEvent(new Event('tcw-app-installed'));
    };
    window.addEventListener('beforeinstallprompt',onPrompt as EventListener);
    window.addEventListener('appinstalled',onInstalled);
    return()=>{
      cancelled=true;
      document.removeEventListener('pointerdown',askOnFirstInteraction,true);
      delete window.__tcwSystemNotify;
      delete window.__tcwEnableNotifications;
      window.removeEventListener('beforeinstallprompt',onPrompt as EventListener);
      window.removeEventListener('appinstalled',onInstalled);
    };
  },[]);
  return null;
}
