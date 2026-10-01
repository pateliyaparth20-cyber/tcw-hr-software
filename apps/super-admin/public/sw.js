const BUILD=new URL(self.location.href).searchParams.get('tcw_build')||'baseline';
const CACHE='tcw-shell-'+BUILD;
const FACE_CACHE='tcw-face-assets-v1.7.15';
const STATIC=['/offline.html','/tcw-logo.png','/favicon.svg','/icons/icon-192.png','/icons/icon-512.png'];
const APP_ROUTES=['/login','/dashboard','/employees','/organization','/calendar','/attendance','/devices','/workforce','/leave','/payroll','/recruitment','/goals','/courses','/assets','/expenses','/travel','/documents','/exit','/reports','/support','/profile','/settings','/subscription','/software-update','/users','/audit','/security','/notifications','/companies','/trials','/plans','/leads','/invoices','/payments','/system'];
const SNAPSHOT_MARKER='/__tcw_cached_build__';

self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(STATIC))
));
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k.startsWith('tcw-shell-')&&k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim())
));

async function cachedAppResponse(req){
  const cache=await caches.open(CACHE);
  const cached=await cache.match(req);
  if(cached)return cached;
  const response=await fetch(req);
  if(response.ok&&!response.redirected)cache.put(req,response.clone()).catch(()=>{});
  return response;
}

self.addEventListener('fetch',event=>{
  const req=event.request;
  const url=new URL(req.url);
  if(req.method!=='GET')return;

  const faceAsset=url.hostname==='cdn.jsdelivr.net'&&url.pathname.includes('/@vladmandic/face-api@1.7.15/');
  if(faceAsset){
    event.respondWith(caches.open(FACE_CACHE).then(async cache=>{
      const cached=await cache.match(req);
      if(cached)return cached;
      const response=await fetch(req);
      if(response.ok||response.type==='opaque')cache.put(req,response.clone()).catch(()=>{});
      return response;
    }));
    return;
  }

  if(url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/socket.io')||url.pathname==='/sw.js')return;
  const appResource=req.mode==='navigate'||url.pathname.startsWith('/_next/static/')||url.searchParams.has('_rsc')||req.headers.get('rsc')==='1';
  if(appResource){
    event.respondWith(cachedAppResponse(req).catch(()=>req.mode==='navigate'?caches.match('/offline.html'):Promise.reject(new Error('Offline'))));
    return;
  }
  if(url.pathname.startsWith('/icons/')||['/tcw-logo.png','/favicon.svg'].includes(url.pathname)){
    event.respondWith(caches.open(CACHE).then(async cache=>{
      const cached=await cache.match(req);if(cached)return cached;
      const response=await fetch(req);if(response.ok)cache.put(req,response.clone()).catch(()=>{});return response;
    }).catch(()=>caches.match(req)));
  }
});

async function warmAppSnapshot(){
  const cache=await caches.open(CACHE);
  if(await cache.match(SNAPSHOT_MARKER))return;
  const assets=new Set();
  for(const route of APP_ROUTES){
    try{
      const response=await fetch(route,{credentials:'include',cache:'no-store'});
      if(!response.ok||response.redirected)continue;
      const clone=response.clone();
      await cache.put(route,clone);
      const type=response.headers.get('content-type')||'';
      if(type.includes('text/html')){
        const html=await response.text();
        const rx=/["'](\/_next\/static\/[^"'\s]+)["']/g;let match;
        while((match=rx.exec(html)))assets.add(match[1]);
      }
    }catch{}
  }
  for(const asset of assets){
    try{
      const response=await fetch(asset,{cache:'no-store'});
      if(response.ok)await cache.put(asset,response.clone());
    }catch{}
  }
  await cache.put(SNAPSHOT_MARKER,new Response(BUILD,{headers:{'content-type':'text/plain'}}));
}


self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch{data={body:event.data?.text?.()??''}}
  const title=String(data.title??'TCW HR Software');
  const options={
    body:String(data.body??data.message??'You have a new notification.'),
    icon:'/icons/icon-192.png',
    badge:'/icons/icon-192.png',
    tag:String(data.tag??'tcw-notification'),
    data:{url:String(data.url??'/notifications')},
    renotify:true
  };
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=String(event.notification.data?.url??'/notifications');
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{
    for(const client of clients){
      if('focus' in client){client.navigate(target).catch(()=>{});return client.focus();}
    }
    return self.clients.openWindow(target);
  }));
});
self.addEventListener('message',event=>{
  if(event.data?.type==='TCW_ACTIVATE_UPDATE'){
    event.waitUntil(self.skipWaiting());
    return;
  }
  if(event.data?.type==='TCW_WARM_APP_CACHE'){
    event.waitUntil(warmAppSnapshot());
    return;
  }
  if(event.data?.type!=='TCW_SHOW_NOTIFICATION')return;
  const data=event.data;
  event.waitUntil(self.registration.showNotification(String(data.title??'TCW HR Software'),{
    body:String(data.body??''),
    icon:'/icons/icon-192.png',
    badge:'/icons/icon-192.png',
    tag:String(data.tag??'tcw-notification'),
    data:{url:String(data.url??'/notifications')}
  }));
});
