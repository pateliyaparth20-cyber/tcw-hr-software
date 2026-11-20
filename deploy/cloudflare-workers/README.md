# TCW Cloudflare portal gateway

The three Workers proxy the existing Next.js portals. The Node.js API, portals,
and Supabase database have **not** been migrated to the Workers runtime.
Render free-instance startup delays can therefore still affect these URLs.

| Worker | Public URL | Fixed PORTAL_ORIGIN binding | Custom domain |
| --- | --- | --- | --- |
| tcw-hr | https://tcw-hr.techcyberwarrior.workers.dev | https://tcw-hr-portal-ef18.onrender.com | hr.techcyberwarrior.in |
| tcw-admin | https://tcw-admin.techcyberwarrior.workers.dev | https://tcw-super-admin-ef18.onrender.com | admin.techcyberwarrior.in |
| tcw-employee | https://tcw-employee.techcyberwarrior.workers.dev | https://tcw-employee-portal-ef18.onrender.com | employee.techcyberwarrior.in |

Each deployment uploads `worker.js` through the Cloudflare Workers API as an
ES module, with `main_module: worker.js`, compatibility date `2026-11-20`,
and its single plain-text `PORTAL_ORIGIN` binding. No API token belongs in source.
Workers logs and traces are enabled at 1% sampling with query strings redacted.

The gateway preserves streaming, request bodies, session cookies, and CSRF
headers. Same-origin browser Origin headers are translated to the fixed portal
origin; foreign Origin headers remain unchanged so backend origin validation
continues rejecting them. Upstream redirects to the same portal are rewritten
to the public hostname. Dynamic responses and API responses are not cached.

## Domain activation

Cloudflare account: `b871aeba431ed78539a001d4484b0b1f`.
Zone: `45c0ff9080cc237110e503710b067e1f` (Free plan).
The custom domains are attached to their corresponding Workers.

The zone remains pending until GoDaddy's authoritative nameservers are changed
from `ns67.domaincontrol.com` and `ns68.domaincontrol.com` to:

- `dom.ns.cloudflare.com`
- `robin.ns.cloudflare.com`

Scanned apex, www, mail, verification, SPF, DMARC, DKIM and autodiscovery DNS
records were imported without proxying. Before a nameserver change, compare
the full GoDaddy DNS zone against Cloudflare: automated scans may miss uncommon
record names. Do not delete existing mail or website records.

No paid Cloudflare plan was enabled. Provider free limits still apply.
