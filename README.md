# TCW HR Software

A production-oriented, multi-tenant HR and SaaS administration source release with a light premium interface, self-service trial onboarding, attendance/payroll automation and dedicated company / platform portals.

Two Next.js applications share a NestJS REST API, Prisma data model, PostgreSQL database, and permission definitions. The source includes working record management and workflow implementations, rather than static dashboard data. This is release **1.3.0**. It includes a production launch path and broad working module coverage, while external money movement, statutory payroll certification and signed native distribution still require provider/compliance configuration and launch testing. See [the v1.1 production blueprint](docs/V1.1-PRODUCTION-BLUEPRINT.md) before public deployment.

## Production launch first

For public launch, use `.env.production.example`, `docker-compose.production.yml`, `npm run production:check`, real PostgreSQL/Redis/SMTP/S3 services and HTTPS. **Do not expose `npm run demo` or embedded `.local-data` to the internet.** See `START-V1.1-PRODUCTION.txt` for the exact production sequence.

Production seeding creates the TCW Super Admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. With `SEED_DEMO=false`, it does not create a demo company. New customers can create their own tenant at `/signup`; the platform generates a company code, starts the configured trial and shows that tenant automatically in the Super Admin portal.

## Quickest local start

Install **Node.js 22.12 or later** and npm. From this directory:

```bash
npm ci
npm run demo
```

The setup step creates a private `.env` file and prints **randomly generated** development passwords once. It preserves an existing `.env`. The local demo uses an embedded PostgreSQL engine (PGlite) and persists fictional sample data in `.local-data/preview-db`. It does not require Docker, Redis, or a remote database. Do not use embedded demo mode in production.

Open:

| Application | URL | Account |
| --- | --- | --- |
| Company HR portal | http://localhost:3000 | Company `TCW-DEMO`, `owner@peopleos.local` |
| TCW SaaS admin | http://localhost:3001 | `admin@techcyberwarrior.local` |

Use the corresponding password printed by setup, or read `OWNER_PASSWORD` / `ADMIN_PASSWORD` in your local `.env`. No password is embedded in the application. The HR and Super Admin applications use separate session cookies, so both accounts can remain signed in at the same time even on `localhost` with different ports.

Demo limitations: document storage, email delivery, the background worker, hardware SDKs, and AI need the services described below. Their interfaces report configuration failures honestly. The demo contains explicitly fictional employees, candidates, leads, attendance records, and sample plan prices. These are not real company records or commercial pricing recommendations.

## Full development stack with PostgreSQL

Install Docker with Compose and Node.js, then:

```bash
npm ci
npm run setup
docker compose up -d postgres redis minio minio-init mailpit
npm run db:migrate
npm run db:seed
npm run dev
```

`npm run db:seed` always creates/updates platform roles and plans and bootstraps the Super Admin when needed. A company-owner development workspace is created only when `OWNER_EMAIL` and `OWNER_PASSWORD` are supplied. Set `SEED_DEMO=true` only for explicit local demonstration data. Production should use `SEED_DEMO=false`. Existing account passwords are preserved on subsequent seed runs.

Additional local services:

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- MinIO S3 endpoint: `http://localhost:9000`; console: `http://localhost:9001`
- Mailpit email inbox: `http://localhost:8025`; SMTP: `localhost:1025`
- API health: `http://localhost:4000/api/health`

The worker sends password-reset emails, expires subscriptions, and enforces configured overdue-billing access rules. Embedded demo mode also runs subscription/overdue access checks, but it does not run the email/Redis worker; use the full development stack to test reset delivery.

### Run everything in containers

```bash
npm run setup
docker compose --profile full up --build
```

The migration service runs before the API. Web applications and the worker start after it. Host ports bind to loopback by default. This Compose file is a **development deployment**, not a hardened public hosting configuration. Pin exact infrastructure image digests, use managed secrets, and review the [deployment guide](docs/DEPLOYMENT.md) before public deployment.

## What you can do

- Sign in, sign out, reset/change passwords, view/revoke sessions, and use fixed permission-based roles.
- Provision a company from the SaaS admin, create its owner, set its subscription state, and enforce its employee limit.
- Manage company details and a replaceable PNG/JPEG logo.
- Manage branches, departments, designations, teams, locations, and cost centers.
- Create, edit, search, filter, paginate, and archive employees. Link users to employees and set reporting managers.
- Configure shifts; record manual punches; preserve raw input; calculate daily attendance, recorded work, lateness, half days, overtime, and missing-punch flags.
- Register attendance devices. BioMax SpeedFace direct PUSH attendance is implemented; other vendor-native connectors remain adapter boundaries until configured.
- Submit leave requests, check annual allowances and overlaps, and approve or reject requests with a history.
- Use a month/week/day event calendar.
- Share voluntary workforce status from the portal. Stale status becomes offline after two minutes.
- Calculate monthly payroll, review employee items, approve and lock runs, print payroll records, and create later-month adjustments.
- Manage job positions and candidate pipeline stages, goals, training schedules, assets, expenses, travel requests, and offboarding clearances.
- Upload/download PDF, PNG, and JPEG documents with tenant authorization and configured S3 storage.
- Manage sales leads, plans, invoices, manually recorded payments, and support tickets.
- Export implemented report categories to CSV and inspect audit events.
- Ask a configured AI provider to summarize a bounded set of authorized aggregate facts. The provider never receives a database connection or SQL tool.

The UI includes light-mode navigation, command search (`Ctrl/Cmd + K`), responsive layouts, forms, native accessible dialogs, loading/error/empty states, confirmation dialogs for destructive operations, and feedback messages.

## Project layout

```text
apps/
  web/                  Company HR portal, port 3000
  super-admin/          TCW platform portal, port 3001
  api/                  NestJS API, port 4000
  worker/               Redis/BullMQ email worker and expiry jobs
  desktop-agent/        Voluntary agent integration contracts only
packages/
  auth/                 Scrypt password hashing and opaque token helpers
  permissions/          Role and action definitions
  validation/           Zod request schemas and resource allowlist
  database/             Prisma client
  ui/                   Shared React product screens and light theme
  attendance-engine/    Punch pairing and time calculations
  payroll-engine/       Integer money arithmetic and payroll transitions
  reporting-engine/     CSV escaping and formula neutralization
  device-connectors/    Vendor interfaces and explicit unconfigured adapters
  ai/                   Replaceable bounded-context provider interface
prisma/                 Schema, migrations, and optional fictional seed data
tests/                  Unit, API integration, and browser tests
infrastructure/         Docker, Nginx examples, and backup helper
docs/                   Architecture, status, API, deployment, original brief
```

## Validation commands

```bash
npm run typecheck
npm test
npm run test:integration
npm run build
npm run test:ssr
```

API integration tests run the actual NestJS HTTP server and Prisma against an isolated embedded PostgreSQL database with both migrations applied. They do not use mocked repositories. Docker services are not required for those tests.

For browser tests, start `npm run demo` in another terminal, install Playwright Chromium when needed, then run:

```bash
npx playwright install chromium
npm run test:e2e
```

Browser tests use the locally generated credentials from `.env`. See [verification results](docs/VERIFICATION.md) for the checks run while preparing this archive and their limitations.

## Important implementation boundaries

Payroll rates are configurable example rules; they do not implement or certify current Indian PF, ESIC, PT, TDS, or gratuity law. The current payroll calculation prorates monthly salary by calendar days, subtracts approved unpaid leave, and applies configured deductions and adjustments. Review policy and amounts before approval.

The device packages intentionally reject unconfigured hardware operations. Actual vendor SDK protocols, on-site connectivity, enrollment/face templates, incremental sync, and hardware certification are still integration work. The desktop-agent directory is a contract library, not an installable monitoring application.

The original brief includes richer workflows such as multi-level approvals, employee bank/tax vaults, complete compliance payroll, resume parsing, document templates, quotations, Excel imports, detailed training enrollments, and custom role editing. These are not represented as finished features. See the status matrix.

## Documentation

- [Architecture and security boundaries](docs/ARCHITECTURE.md)
- [API map](docs/API.md)
- [Implementation status and next work](docs/IMPLEMENTATION_STATUS.md)
- [Deployment and configuration](docs/DEPLOYMENT.md)
- [Verification results](docs/VERIFICATION.md)
- [v1.1 verification notes](docs/V1.1-VERIFICATION.md)
- [v1.1 page/role/launch blueprint](docs/V1.1-PRODUCTION-BLUEPRINT.md)
- [Original supplied specification](docs/original-specification.txt)

© TCW HR Software


## Release 1.3.0 production-completion additions
- Railway-ready production gateway, SMS onboarding, guarded salary payouts, cookie/legal pages, AI environment support, and a vendor-neutral attendance webhook are included in v1.3.0.

- Short company user IDs such as `TCW2104`, plus one-time 8-character temporary passwords with forced first-login password change.
- SMS/email credential delivery through MSG91, Twilio or a generic webhook outbox worker.
- Payroll payout tracking and guarded RazorpayX live salary payout flow after attendance reconciliation, payroll approval and payroll lock.
- Cookie consent plus Privacy, Cookie and Terms pages; optional analytics remain off by default.
- Railway single-app gateway configuration for `hr.techcyberwarrior.in` and `admin.techcyberwarrior.in`, preserving the existing apex company website.
- Existing AI assistant remains OpenAI-compatible and can be enabled from Super Admin or environment variables once a provider API key is configured.
- BioMax/ZKTeco direct PUSH remains the native attendance path; other vendors can use their middleware/API/SDK to send normalized punches to the authenticated TCW generic attendance webhook.

## Release 1.2.9 stability notes

- Mobile and tablet layouts include safer wrapping, larger touch targets, safe-area spacing, responsive dialogs/forms, and narrow-screen card fallbacks.
- Local/LAN session storage now uses a stable key and automatically migrates recent legacy session keys instead of tying the session to a patch version.
- Web/API proxy failures return a clear JSON `503` instead of a generic broken response when the API server is unavailable.
- PWA shell cache version is synchronized to 1.2.9 so old static shell assets are evicted after update.
- Android wrapper preserves WebView state across rotation/recreation, supports HTML file pickers, restricts in-app navigation to the configured portal origin, and disables cleartext traffic in release builds.
- Windows wrapper keeps external navigation in the system browser, supports responsive small windows, and reports invalid/unreachable portal configuration cleanly.
- Browser/SSR smoke tests were aligned with the current TCW HR login/session-gate UI instead of legacy PeopleOS text.

Historical one-off login/CSS fix notes were removed from the clean archive. Long-term architecture, deployment, BioMax and production documentation remain under `docs/`.
