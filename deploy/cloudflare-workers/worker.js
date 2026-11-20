// Each deployment binds PORTAL_ORIGIN to one fixed Render portal.
const allowedOrigins = new Set([
  'https://tcw-hr-portal-ef18.onrender.com',
  'https://tcw-super-admin-ef18.onrender.com',
  'https://tcw-employee-portal-ef18.onrender.com',
]);

function unavailable(request) {
  const path = new URL(request.url).pathname;
  const html = request.method === 'GET'
    && request.headers.get('accept')?.includes('text/html')
    && path !== '/api' && !path.startsWith('/api/')
    && !path.startsWith('/_next/');
  const headers = { 'cache-control': 'no-store', 'retry-after': '8', 'x-tcw-edge': 'cloudflare' };
  if (!html) return Response.json({ message: 'The server is starting or temporarily unavailable. Please try again shortly.' }, { status: 503, headers });
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="8"><title>Connecting | TCW HR Software</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f7fc;color:#163451;font:16px/1.6 system-ui,sans-serif}main{max-width:480px;margin:24px;padding:36px;background:white;border:1px solid #dce5ef;border-radius:18px}h1{font-size:26px;line-height:1.3}small{color:#52677e}button{font:inherit;background:#176ee0;color:white;border:0;border-radius:8px;padding:10px 20px;cursor:pointer}</style></head><body><main><small>TCW HR SOFTWARE</small><h1>Connecting to your workspace</h1><p>The server is starting or temporarily unavailable. This page will retry automatically every eight seconds.</p><p>Please keep this tab open. Starting the server can take a minute.</p><button type="button" onclick="location.reload()">Try again now</button></main></body></html>`, {
    status: 503, headers: { ...headers, 'content-type': 'text/html; charset=utf-8' },
  });
}

export default {
  async fetch(request, env) {
    const publicUrl = new URL(request.url);
    if (!allowedOrigins.has(env.PORTAL_ORIGIN)) {
      return new Response('Portal configuration is unavailable.', { status: 503 });
    }
    const upstreamUrl = new URL(env.PORTAL_ORIGIN);
    upstreamUrl.pathname = publicUrl.pathname;
    upstreamUrl.search = publicUrl.search;
    const headers = new Headers(request.headers);
    headers.delete('host');
    // Render's virtual-host router must receive its own upstream hostname.
    headers.set('x-forwarded-host', upstreamUrl.host);
    headers.set('x-forwarded-proto', 'https');
    // Translate only same-origin browser requests. Foreign origins remain foreign
    // and are rejected by the API's existing origin and CSRF verification.
    if (headers.get('origin') === publicUrl.origin) {
      headers.set('origin', upstreamUrl.origin);
    }
    let response;
    try {
      response = await fetch(new Request(upstreamUrl, request), {
        headers, redirect: 'manual', cache: 'no-store',
      });
    } catch {
      console.error(JSON.stringify({ event: 'portal_upstream_unavailable' }));
      return unavailable(request);
    }
    if (response.status === 101) return response;
    if ([502, 503, 504].includes(response.status)) {
      await response.body?.cancel();
      return unavailable(request);
    }
    const result = new Response(response.body, response);
    const location = result.headers.get('location');
    if (location) {
      const destination = new URL(location, upstreamUrl);
      if (destination.origin === upstreamUrl.origin) {
        destination.protocol = publicUrl.protocol;
        destination.host = publicUrl.host;
        result.headers.set('location', destination.toString());
      }
    }
    if (!publicUrl.pathname.startsWith('/_next/static/')) {
      result.headers.set('cache-control', 'no-store');
    }
    result.headers.set('x-tcw-edge', 'cloudflare');
    return result;
  },
};
