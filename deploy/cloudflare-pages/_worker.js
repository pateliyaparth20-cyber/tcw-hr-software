const origins = {
  'hr.techcyberwarrior.in': 'https://tcw-hr-portal-ef18.onrender.com',
  'admin.techcyberwarrior.in': 'https://tcw-super-admin-ef18.onrender.com',
  'employee.techcyberwarrior.in': 'https://tcw-employee-portal-ef18.onrender.com',
};

export default {
  async fetch(request) {
    const publicUrl = new URL(request.url);
    const origin = origins[publicUrl.hostname]
      ?? (publicUrl.hostname.endsWith('.pages.dev') ? origins['hr.techcyberwarrior.in'] : undefined);

    if (!origin) {
      return new Response('Unknown portal hostname.', { status: 404 });
    }

    const upstreamUrl = new URL(publicUrl.pathname + publicUrl.search, origin);
    const upstreamRequest = new Request(upstreamUrl, request);
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.set('x-forwarded-host', publicUrl.host);
    headers.set('x-forwarded-proto', 'https');

    let response;
    try {
      response = await fetch(upstreamRequest, { headers, redirect: 'manual' });
    } catch {
      return Response.json(
        { message: 'The portal is starting. Please try again shortly.' },
        { status: 503, headers: { 'cache-control': 'no-store' } },
      );
    }

    if (response.status === 101) {
      return response;
    }

    const result = new Response(response.body, response);
    const location = result.headers.get('location');
    if (location) {
      const destination = new URL(location, upstreamUrl);
      if (destination.origin === new URL(origin).origin) {
        destination.protocol = publicUrl.protocol;
        destination.host = publicUrl.host;
        result.headers.set('location', destination.toString());
      }
    }

    return result;
  },
};
