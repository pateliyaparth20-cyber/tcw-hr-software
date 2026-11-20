// Each deployment binds PORTAL_ORIGIN to one fixed Render portal.
const allowedOrigins = new Set([
  'https://tcw-hr-portal-ef18.onrender.com',
  'https://tcw-super-admin-ef18.onrender.com',
  'https://tcw-employee-portal-ef18.onrender.com',
]);

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
    headers.set('x-forwarded-host', publicUrl.host);
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
      return Response.json({ message: 'The portal is starting. Please try again shortly.' }, {
        status: 503, headers: { 'cache-control': 'no-store' },
      });
    }
    if (response.status === 101) return response;
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
