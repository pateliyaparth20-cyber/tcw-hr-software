// Each deployment binds PORTAL_ORIGIN to one fixed Render portal.
const allowedOrigins = new Set([
  'https://tcw-hr-portal-ef18.onrender.com',
  'https://tcw-super-admin-ef18.onrender.com',
  'https://tcw-employee-portal-ef18.onrender.com',
]);

const apiOrigin = 'https://tcw-hr-api-ef18.onrender.com';
function wakeScript(portalOrigin) {
  // Only fixed public endpoints; never forward user URLs, cookies or tokens.
  const urls = [apiOrigin + '/api/health'];
  if (portalOrigin) urls.push(portalOrigin + '/login');
  return '<script>' + JSON.stringify(urls) + '.forEach(function(url){fetch(url,{mode:"no-cors",credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer"}).catch(function(){});});</script>';
}

function startupFrames(portalOrigin) {
  return [apiOrigin + '/api/health', portalOrigin + '/login'].map(url =>
    '<iframe hidden credentialless sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer" src="' + url + '" title="Starting workspace service"></iframe>'
  ).join('');
}
const startupCheck = '<script>setInterval(function(){fetch(location.href,{cache:"no-store",headers:{accept:"text/html","x-tcw-startup-check":"1"}}).then(function(response){if(response.ok)location.reload();}).catch(function(){});},8000);</script>';

function unavailable(request, portalOrigin) {
  const path = new URL(request.url).pathname;
  const html = request.method === 'GET' && request.headers.get('x-tcw-startup-check') !== '1'
    && request.headers.get('accept')?.includes('text/html')
    && path !== '/api' && !path.startsWith('/api/')
    && !path.startsWith('/_next/');
  const headers = { 'cache-control': 'no-store', 'retry-after': '8', 'x-tcw-edge': 'cloudflare' };
  if (!html) return Response.json({ message: 'The server is starting or temporarily unavailable. Please try again shortly.' }, { status: 503, headers });
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connecting | TCW HR Software</title>${wakeScript(portalOrigin)}${startupCheck}<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f7fc;color:#163451;font:16px/1.6 system-ui,sans-serif}main{max-width:480px;margin:24px;padding:36px;background:white;border:1px solid #dce5ef;border-radius:18px}h1{font-size:26px;line-height:1.3}small{color:#52677e}button{font:inherit;background:#176ee0;color:white;border:0;border-radius:8px;padding:10px 20px;cursor:pointer}</style></head><body>${startupFrames(portalOrigin)}<main><small>TCW HR SOFTWARE</small><h1>Connecting to your workspace</h1><p>The server is starting or temporarily unavailable. Your connection is checked automatically every eight seconds. The login page will open when the server is ready.</p><p>Please keep this tab open. Starting the server can take a minute.</p><button type="button" onclick="location.reload()">Try again now</button></main></body></html>`, {
    status: 503, headers: { ...headers, 'content-type': 'text/html; charset=utf-8' },
  });
}

const gateway = {
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
    headers.delete('x-tcw-startup-check');
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
      return unavailable(request, upstreamUrl.origin);
    }
    if (response.status === 101) return response;
    if ([502, 503, 504].includes(response.status)) {
      await response.body?.cancel();
      return unavailable(request, upstreamUrl.origin);
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
    if (request.method === 'GET' && result.status === 200 && result.headers.get('content-type')?.includes('text/html')) {
      // A warm portal can still have a sleeping API. Warm its public health
      // endpoint once per HTML navigation, independently of user credentials.
      for (const name of ['content-length', 'etag', 'content-md5', 'digest']) result.headers.delete(name);
      return new HTMLRewriter().on('head', {
        element(element) { element.append(wakeScript(), { html: true }); },
      }).transform(result);
    }
    return result;
  },
};

const origins = {
  'hr.techcyberwarrior.in': 'https://tcw-hr-portal-ef18.onrender.com',
  'admin.techcyberwarrior.in': 'https://tcw-super-admin-ef18.onrender.com',
  'employee.techcyberwarrior.in': 'https://tcw-employee-portal-ef18.onrender.com',
};
export default {
  async fetch(request) {
    const host = new URL(request.url).hostname;
    const origin = origins[host] ?? ((host === 'tcw-portals.pages.dev' || host.endsWith('.tcw-portals.pages.dev')) ? origins['hr.techcyberwarrior.in'] : undefined);
    if (!origin) return new Response('Unknown portal hostname.', { status: 404 });
    return gateway.fetch(request, { PORTAL_ORIGIN: origin });
  },
};
