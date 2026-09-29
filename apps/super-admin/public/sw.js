const CACHE='tcw-shell-v1.4.0-auto-refresh';
const STATIC=['/offline.html','/tcw-logo.png','/favicon.svg','/icons/icon-192.png','/icons/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(STATIC)).then(()=>self.skipWaiting())
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
