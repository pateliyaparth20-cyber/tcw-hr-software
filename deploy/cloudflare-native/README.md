# Cloudflare native migration readiness

Status, 22 November 2026: **not deployed and not ready for domain cutover**.
The existing Workers and Pages gateways still depend on Render; another proxy
would not complete the requested migration. No nameserver change is authorized.

## Verified locally

The existing scrypt password code executes in the local Workers runtime and
accepts the correct synthetic password while rejecting wrong and malformed values.
The checks do not use a user credential or access the production database.
Run `npm ci && npm test` in this directory. The pinned emulator uses compatibility
date 2026-07-30. This does not verify a newer deployed runtime or enforce the
Workers Free 10 ms/request CPU limit. The elapsed duration of hashing and several
comparisons is wall time, not a production CPU measurement.

## Cutover blockers

- `apps/api/src/face-engine.ts` imports native `sharp`, decodes images and runs
  TensorFlow face verification. Native Node addons cannot run in Workers. Keep
  server-verified face matching and liveness; browser descriptors alone are not
  trusted identity evidence. A replacement must be tested before migrating this
  feature. Never silently disable it or record attendance without verification.
- The existing Prisma client uses its native engine. Generate a separate engine-less
  Prisma 6.19.3 client and validate the `@prisma/adapter-pg` connection with the
  same Supabase schema. Do not run seeds, change password hashes or migrate data
  to an empty database merely to get a successful deployment.
- Node HTTP adapters do not support the upgrade event used by Socket.IO. Realtime
  delivery and authorization need a Workers-compatible implementation and tests.
- The two Next.js portals need native Workers builds or a client-rendered build.
  Copying `.next` files into Pages is not a working migration.
- Continuous worker schedules must become explicit scheduled handlers/queues.
  Preserve job deduplication, approvals and the encrypted outbox. Do not start
  new financial jobs or charge cards as migration tests.

Preserve the exact origin allowlist, secure cookies, CSRF validation, tenant and
role isolation, raw signed-webhook bodies, CONFIG_ENCRYPTION_KEY and existing
billing receipts. Do not fix origin errors by accepting arbitrary origins.

## Deployment gate

Only switch HR/Admin/Employee hostnames after native staging passes correct and
wrong login, logout, tenant isolation, attendance/face, payroll, documents,
reset email, realtime and signed webhook checks. No new paid plan, hostname
cutover or security weakening is approved by this readiness work.

A Container can retain the Node/native stack, but it is **not a free fallback**:
Cloudflare requires the Workers Paid plan (minimum $5/month), plus any billable
usage. A Worker subscription fee is not a fixed quote for the whole application.
Keep the user's free-only constraint unless they explicitly change it.

Official references:
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/
- https://developers.cloudflare.com/workers/static-assets/migration-guides/vercel-to-workers/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/containers/platform/pricing/
- https://www.prisma.io/docs/orm/v6/prisma-client/deployment/edge/deploy-to-cloudflare
