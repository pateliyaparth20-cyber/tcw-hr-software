# External-DNS Cloudflare Pages gateway

Production project: `tcw-portals`, account `b871aeba431ed78539a001d4484b0b1f`.
Project ID: `842cf958-5e9e-46a1-9b7f-427f281c8c79`.
Deployment: `124482e6-7b7e-437c-8a71-0eaa241b904f`.
URL: https://tcw-portals.pages.dev (HR portal).

The `_worker.js` advanced-mode gateway selects a fixed upstream by hostname:

| Public hostname | Upstream |
| --- | --- |
| hr.techcyberwarrior.in | https://tcw-hr-portal-ef18.onrender.com |
| admin.techcyberwarrior.in | https://tcw-super-admin-ef18.onrender.com |
| employee.techcyberwarrior.in | https://tcw-employee-portal-ef18.onrender.com |

All three custom domains are associated with the Pages project. Their activation
requires changing the existing CNAME targets at GoDaddy to:

| Type | Name | Target | TTL |
| --- | --- | --- | --- |
| CNAME | hr | tcw-portals.pages.dev | 1 hour |
| CNAME | admin | tcw-portals.pages.dev | 1 hour |
| CNAME | employee | tcw-portals.pages.dev | 1 hour |

Keep the existing GoDaddy nameservers and unrelated website/mail DNS records.
Previous CNAME targets pointed directly at Render. Do not leave conflicting
A/AAAA records for these same three names. Pages manages TLS validation after
the CNAMEs resolve to the project; domain status must become active before
updating email invitation/reset URLs to the custom hostnames.

Deployment uses Cloudflare's Pages API with multipart form fields `manifest`
set to `{}`, `branch` set to `main`, and `_worker.js` as a JavaScript module.
Compatibility date: `2026-11-20`; `fail_open: false`. No token is stored here.

This is a Cloudflare gateway to the existing Render apps and API, with Supabase
still providing the database. It is not a migration of Node.js to Workers.
Render free-service startup delays can still affect portal and API availability.
Temporary 502/503/504 responses and fetch failures now return a noncached 503
startup screen for browser GET navigations. It refreshes the same URL every
eight seconds. API and POST requests return a retryable JSON error instead and
are never replayed, so a login or form submission is not duplicated. Render's
virtual-host routing receives the fixed upstream hostname. Verify this behavior
with `node --test deploy/cloudflare-pages/gateway.test.mjs`.
All dynamic responses are no-store. Same-origin Origin headers are translated
only to the matching fixed upstream; foreign origins remain unchanged for the
backend to reject, and cookies and CSRF headers are preserved.

The old Workers' custom-domain bindings were detached to avoid overlap. Their
three `workers.dev` URLs remain available as fallback portals.
