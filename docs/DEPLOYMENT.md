# Deployment and configuration

The included source builds independent Next.js web/admin servers and a NestJS API. It is designed for a Node.js deployment with PostgreSQL, Redis, an S3-compatible object store, and SMTP. The archive does not contain a deployed instance or production credentials.

## Build

```bash
npm ci
npm run typecheck
npm test
npm run test:integration
npm run build
```

The API and worker compile to `dist/`. Each Next.js application builds into its own `.next/` directory. The Dockerfile includes the compiled apps and dependencies. The Compose `full` profile runs migrations and bootstrapping before starting the services.

## Environment

Start from `.env.example` or generate a private local file with `npm run setup`. Never commit `.env`. Use a managed secret store for deployed values. Minimum configuration:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection for API/worker/migrations |
| `REDIS_URL` | BullMQ Redis connection |
| `APP_ORIGINS` | Exact comma-separated HR/admin origins allowed to mutate data |
| `WEB_URL`, `ADMIN_URL` | Trusted URLs used to build password-reset links |
| `COOKIE_SECURE` | Must be `true` for production; serve over HTTPS |
| `NODE_ENV` | Use `production` for production API |
| `API_INTERNAL_URL` | API URL reachable by Next.js servers |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | One-time seed/bootstrap admin; existing password is never overwritten |
| `OWNER_EMAIL`, `OWNER_PASSWORD` | Optional development-company owner seed |
| `SEED_DEMO` | Keep `false` for real environments |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` | Object store configuration |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Server-only object store credentials |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` | Mail transport |
| `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | Optional TLS/auth SMTP configuration |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | Optional HTTPS OpenAI-compatible chat provider |

For example, a compatible AI base URL ends in `/v1/`; the implementation appends `chat/completions`. The provider is not invoked until configured. Review the data-sharing arrangement with your chosen provider.

## Public hosting preparation

- Provision separate HR and admin hostnames, TLS certificates, database backups, object-store backups, and secrets.
- Set exact public origins/URLs and secure cookies. Set `NODE_ENV=production` for the API and remove development seed owner credentials after provisioning real accounts.
- Create the S3 bucket before accepting uploads. Prefer scoped object-store keys and restricted network paths.
- Use a non-superuser runtime database account; run migrations through a separate migration identity.
- Place Nginx or another authenticated edge in front of the services. `infrastructure/nginx/peopleos.conf` is an example and needs real hostnames and certificates. The supplied Compose file does not itself start Nginx.
- Configure the exact trusted proxy topology before using forwarded client IPs. The API deliberately does not blindly trust spoofable X-Forwarded-For headers.
- Add a shared rate-limiter, account-abuse monitoring, log redaction/retention, health probes, alerting, and a multi-instance Socket.IO adapter if horizontally scaling.
- Finish the incomplete scope in the status matrix and run threat-model/security and payroll policy reviews before accepting real HR or payroll data.

## Backups

`sh infrastructure/deployment/backup.sh` creates a compressed PostgreSQL dump from the Compose service. The helper is a starting point: add encrypted off-site retention, object-store backup, scheduled execution, and restoration drills. Do not run an unreviewed restore against live customer data.

## Vendor attendance integration

Supply the exact vendor, model, firmware, SDK/API, credentials flow, and a connector host reachable from the device network. Implement the corresponding `DeviceAdapter`, preserve vendor raw payloads, maintain device-user-to-employee mappings, and validate incremental cursors and timezone behavior. The current adapters throw clear unconfigured errors; none pretend to connect to real hardware.
