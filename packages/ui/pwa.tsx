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
function urlBase64ToUint8Array(value:string){
  const padding='='.repeat((4-value.length%4)%4);
  const base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);
  return Uint8Array.from([...raw].map(ch=>ch.charCodeAt(0)));
}
async function syncPushSubscription(){
  if(typeof window==='undefined'||!('serviceWorker'in navigator)||!('PushManager'in window))return false;
  try{
    const configResponse=await fetch('/api/push/config',{credentials:'include',cache:'no-store'});
    if(!configResponse.ok)return false;
    const config=await configResponse.json();
    if(!config?.enabled||!config?.publicKey)return false;
    const registration=await navigator.serviceWorker.ready;
    let subscription=await registration.pushManager.getSubscription();
    if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(String(config.publicKey))});
    const meResponse=await fetch('/api/auth/me',{credentials:'include',cache:'no-store'});
    if(!meResponse.ok)return false;
    const me=await meResponse.json();
    const body=subscription.toJSON();
    if(!body.endpoint||!body.keys?.p256dh||!body.keys?.auth)return false;
    const save=await fetch('/api/push/subscription',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','x-csrf-token':String(me.csrf??'')},body:JSON.stringify({endpoint:body.endpoint,keys:{p256dh:body.keys.p256dh,auth:body.keys.auth}})});
    return save.ok;
  }catch{return false}
}
async function enableNotifications(){
  if(typeof window==='undefined')return false;
  if(window.TCWNative)return true;
  if(!('Notification' in window))return false;
  if(Notification.permission==='granted'){syncPushSubscription().catch(()=>{});return true;}
  if(Notification.permission==='denied')return false;
  try{const granted=(await Notification.requestPermission())==='granted';if(granted)syncPushSubscription().catch(()=>{});return granted}catch{return false}
}
export function PwaClient(){
  useEffect(()=>{
    window.__tcwSystemNotify=tcwSystemNotify;
    window.__tcwEnableNotifications=enableNotifications;
    let pullStart=0,pullDistance=0,pullActive=false,longPress:any=null;
    const refreshBadge=document.createElement('div');refreshBadge.className='tcw-pull-refresh';refreshBadge.innerHTML='<span aria-hidden="true"></span>';refreshBadge.setAttribute('aria-label','Refresh');document.body.appendChild(refreshBadge);
    const blocksPullRefresh=(target:EventTarget|null)=>{
      const start=target instanceof Element?target:null;
      if(!start)return false;
      if(start.closest('input,textarea,select,button,a,[role="button"],dialog,.modal,.tcw-agent-panel,.sidebar,.table-scroll,.chat-messages,.meghna-history-list'))return true;
      let node:HTMLElement|null=start instanceof HTMLElement?start:start.parentElement as HTMLElement|null;
      while(node&&node!==document.body){
        const style=getComputedStyle(node);
        if(/auto|scroll/.test(style.overflowY)&&node.scrollHeight>node.clientHeight+2)return true;
        node=node.parentElement;
      }
      return false;
    };
    const onTouchStart=(e:TouchEvent)=>{if(window.scrollY<=0&&e.touches.length===1&&!blocksPullRefresh(e.target)){pullStart=e.touches[0].clientY;pullDistance=0;pullActive=true}else pullActive=false};
    const onTouchMove=(e:TouchEvent)=>{if(!pullActive)return;pullDistance=Math.max(0,e.touches[0].clientY-pullStart);if(pullDistance>18){refreshBadge.classList.add('show');refreshBadge.classList.toggle('ready',pullDistance>86)}};
    const onTouchEnd=()=>{if(pullActive&&pullDistance>86)window.location.reload();pullActive=false;pullDistance=0;refreshBadge.classList.remove('show','ready')};
    const photoSelector='.my-profile-photo img,.avatar.has-photo img,.image-field img,.person-cell img';
    const openPhoto=(img:HTMLImageElement)=>{const overlay=document.createElement('div');overlay.className='tcw-photo-viewer';overlay.innerHTML='<button aria-label="Close photo">×</button><img alt="Photo preview"/>';const target=overlay.querySelector('img') as HTMLImageElement;target.src=img.src;overlay.addEventListener('click',ev=>{if(ev.target===overlay||ev.target===overlay.querySelector('button'))overlay.remove()});document.body.appendChild(overlay)};
    const onPhotoClick=(e:MouseEvent)=>{const img=(e.target as Element)?.closest?.(photoSelector) as HTMLImageElement|null;if(img&&window.matchMedia('(hover:hover) and (pointer:fine)').matches){e.preventDefault();openPhoto(img)}};
    const onPhotoTouchStart=(e:TouchEvent)=>{const img=(e.target as Element)?.closest?.(photoSelector) as HTMLImageElement|null;if(!img)return;longPress=setTimeout(()=>openPhoto(img),650)};
    const clearLong=()=>{if(longPress){clearTimeout(longPress);longPress=null}};
    document.addEventListener('touchstart',onTouchStart,{passive:true});document.addEventListener('touchmove',onTouchMove,{passive:true});document.addEventListener('touchend',onTouchEnd,{passive:true});document.addEventListener('click',onPhotoClick);document.addEventListener('touchstart',onPhotoTouchStart,{passive:true});document.addEventListener('touchend',clearLong,{passive:true});document.addEventListener('touchmove',clearLong,{passive:true});
    let cancelled=false;
    let versionTimer:ReturnType<typeof setInterval>|undefined;
    const isiOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
    const standalone=window.matchMedia('(display-mode: standalone)').matches||(navigator as any).standalone===true;
    let iosGuide:HTMLButtonElement|null=null,iosGuideTimer:ReturnType<typeof setTimeout>|undefined;
    const iosGuideKey='tcw_ios_notice_seen_at';
    let iosGuideSeen=false;try{const seen=Number(localStorage.getItem(iosGuideKey)??0);iosGuideSeen=seen>0&&Date.now()-seen<7*24*3600000}catch{}
    const dismissIosGuide=()=>{try{localStorage.setItem(iosGuideKey,String(Date.now()))}catch{};if(iosGuide){iosGuide.classList.add('leaving');const el=iosGuide;setTimeout(()=>el.remove(),180)}};
    if(isiOS&&!iosGuideSeen&&(!standalone||('Notification' in window&&Notification.permission!=='granted'))){
      iosGuide=document.createElement('button');iosGuide.type='button';iosGuide.className='tcw-ios-notice';
      iosGuide.textContent=!standalone?'iPhone setup · Add to Home Screen':'Enable iPhone notifications';
      iosGuide.onclick=async()=>{if(!standalone){window.alert('On iPhone: tap Share in Safari, choose Add to Home Screen, then open TCW HR from the Home Screen and allow notifications.');dismissIosGuide();return;}const ok=await enableNotifications();iosGuide!.textContent=ok?'Notifications enabled':'Notification permission is off';setTimeout(dismissIosGuide,900)};
      document.body.appendChild(iosGuide);
      iosGuideTimer=setTimeout(dismissIosGuide,6000);
    }
    const askOnFirstInteraction=()=>{if(!isiOS||standalone)enableNotifications().catch(()=>{});document.removeEventListener('pointerdown',askOnFirstInteraction,true)};
    if(!window.TCWNative&&'Notification' in window&&Notification.permission==='default')document.addEventListener('pointerdown',askOnFirstInteraction,true);
    const checkForSoftwareUpdate=async()=>{
      if(process.env.NODE_ENV!=='production')return;
      let installed='';
      try{installed=window.localStorage.getItem('tcw_loaded_deployment_version')??window.localStorage.getItem('tcw_last_deployment_version')??''}catch{}
      if(!installed)return;
      try{
        const response=await fetch('/api/version?tcw_update_check='+Date.now(),{cache:'no-store',credentials:'include',headers:{'Cache-Control':'no-cache'}});
        if(!response.ok)return;
        const version=await response.json(),latest=String(version?.version??'');
        if(!latest||latest===installed)return;
        const noticeKey='tcw_update_notice_version';let seen='';
        try{seen=window.localStorage.getItem(noticeKey)??''}catch{}
        if(seen===latest)return;
        try{window.localStorage.setItem(noticeKey,latest)}catch{}
        const release=String(version?.release??'');
        window.dispatchEvent(new CustomEvent('tcw-software-update-available',{detail:{version:latest,release}}));
        await tcwSystemNotify('Software update available',release?`TCW HR Software v${release} is ready. Install it from Software Update when you are ready.`:'A newer TCW HR Software build is ready. Install it from Software Update when you are ready.','/software-update','tcw-software-update');
      }catch{}
    };
    // Never let a development service worker cache Next.js bundles. Old cached
    // chunks can produce React hydration mismatches after a UI update.
    if('serviceWorker' in navigator){
      if(process.env.NODE_ENV!=='production'){
        navigator.serviceWorker.getRegistrations()
          .then(registrations=>Promise.all(registrations.map(registration=>registration.unregister())))
          .then(()=>clearLegacyTcwCaches())
          .catch(()=>{});
      }else{
        (async()=>{
          let installed='';
          try{installed=window.localStorage.getItem('tcw_loaded_deployment_version')??window.localStorage.getItem('tcw_last_deployment_version')??''}catch{}
          if(!installed){
            try{
              const response=await fetch('/api/version',{cache:'no-store',credentials:'include',headers:{'Cache-Control':'no-cache'}});
              const version=response.ok?await response.json():null;
              if(version?.version){
                installed=String(version.version);
                try{
                  window.localStorage.setItem('tcw_loaded_deployment_version',installed);
                  window.localStorage.setItem('tcw_last_deployment_version',installed);
                  window.localStorage.setItem('tcw_loaded_release_version',String(version.release??''));
                }catch{}
              }
            }catch{}
          }
          const script='/sw.js?tcw_build='+encodeURIComponent(installed||'baseline');
          const registration=await navigator.serviceWorker.register(script,{updateViaCache:'none'});
          if(Notification.permission==='granted')syncPushSubscription().catch(()=>{});
          // Do not call registration.update() here. A newer software build is fetched
          // only from Software update -> Install update.
          fetch('/api/auth/me',{credentials:'include',cache:'no-store'}).then(r=>{if(r.ok)registration.active?.postMessage({type:'TCW_WARM_APP_CACHE'})}).catch(()=>{});
          if(cancelled)return;
          window.setTimeout(()=>checkForSoftwareUpdate().catch(()=>{}),5000);
          versionTimer=window.setInterval(()=>checkForSoftwareUpdate().catch(()=>{}),10*60*1000);
        })().catch(()=>{});
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
      delete window.__tcwEnableNotifications;document.removeEventListener('touchstart',onTouchStart);document.removeEventListener('touchmove',onTouchMove);document.removeEventListener('touchend',onTouchEnd);document.removeEventListener('click',onPhotoClick);document.removeEventListener('touchstart',onPhotoTouchStart);document.removeEventListener('touchend',clearLong);document.removeEventListener('touchmove',clearLong);refreshBadge.remove();clearLong();
      window.removeEventListener('beforeinstallprompt',onPrompt as EventListener);
      window.removeEventListener('appinstalled',onInstalled);
      if(iosGuideTimer)clearTimeout(iosGuideTimer);if(versionTimer)window.clearInterval(versionTimer);iosGuide?.remove();
    };
  },[]);
  return null;
}
