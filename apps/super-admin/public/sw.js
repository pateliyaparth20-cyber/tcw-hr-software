const CACHE='tcw-shell-v1.12.3-notifications';
const STATIC=['/offline.html','/tcw-logo.png','/favicon.svg','/icons/icon-192.png','/icons/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(STATIC))
));
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k.startsWith('tcw-shell-')&&k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim())
));
self.addEventListener('fetch',event=>{
  const req=event.request;
  const url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/socket.io')) return;
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).catch(()=>caches.match('/offline.html')));
    return;
  }
  // Next.js build assets are content-addressed and should stay under the browser's
  // normal HTTP cache. Intercepting /_next/ here can keep an old JS bundle alive
  // while the server renders newer HTML, causing a hydration mismatch.
  if(url.pathname.startsWith('/_next/')) return;
  if(url.pathname.startsWith('/icons/')||['/tcw-logo.png','/favicon.svg'].includes(url.pathname)){
    event.respondWith(fetch(req).then(res=>{
      const clone=res.clone();
      caches.open(CACHE).then(c=>c.put(req,clone));
      return res;
    }).catch(()=>caches.match(req)));
  }
});


// Serializes delivery across push and foreground fallback, and persists event IDs.
let notificationQueue=Promise.resolve();
function showOnce(data){
 const deliver=async()=>{
  const tag=String(data.tag??'tcw-notification');
  const eventKey=tag==='tcw-notification'?null:new Request(self.location.origin+'/__tcw_notice/'+encodeURIComponent(tag));
  const cache=await caches.open('tcw-notification-events-v1');
  if(eventKey&&await cache.match(eventKey))return;
  await self.registration.showNotification(String(data.title??'TCW HR Software'),{body:String(data.body??data.message??'You have a new notification.'),icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag,data:{url:String(data.url??'/notifications')},renotify:false});
  if(eventKey){await cache.put(eventKey,new Response('delivered'));const keys=await cache.keys();if(keys.length>200)await Promise.all(keys.slice(0,keys.length-200).map(key=>cache.delete(key)));}
 };
 notificationQueue=notificationQueue.then(deliver,deliver);return notificationQueue;
}
self.addEventListener('push',event=>{
 let data={};try{data=event.data?event.data.json():{}}catch{data={body:event.data?.text?.()??''}}
 event.waitUntil(showOnce(data));
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
 if(event.data?.type==='TCW_ACTIVATE_APPROVED_WORKER'){event.waitUntil(self.skipWaiting());return;}
 if(event.data?.type==='TCW_SHOW_NOTIFICATION')event.waitUntil(showOnce(event.data));
});
