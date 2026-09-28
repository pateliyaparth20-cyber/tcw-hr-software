'use client';
import {useEffect} from 'react';

declare global {
  interface Window {
    __tcwInstallPrompt?: any;
  }
}

const TCW_CACHE_PREFIX='tcw-shell-';

async function clearLegacyTcwCaches(){
  if(typeof caches==='undefined') return;
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith(TCW_CACHE_PREFIX)).map(key=>caches.delete(key)));
}

export function PwaClient(){
  useEffect(()=>{
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
          const announce=()=>window.dispatchEvent(new Event('tcw-update-available'));
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
      window.removeEventListener('beforeinstallprompt',onPrompt as EventListener);
      window.removeEventListener('appinstalled',onInstalled);
    };
  },[]);
  return null;
}
