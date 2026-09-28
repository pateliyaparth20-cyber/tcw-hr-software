# Architecture

## Request path

The company and platform portals are independent Next.js applications. Each server-rendered protected route validates the HTTP-only session through the API before rendering the application. The browser then calls same-origin `/api` routes, proxied to NestJS. The API derives tenant identity from its stored session and user record; it never trusts a browser-supplied tenant header.

NestJS routes requests to authentication, company/record services, workflow services, and file services. All input fields are checked with allowlisted Zod schemas. Shared UI components render individual module forms and tables; the specialized dashboard, calendar, payroll, workforce, and recruitment screens use their own workflows and layouts.

PostgreSQL is the production data target. The optional embedded PGlite mode is solely for local demos and deterministic tests. Prisma 6.19.3 and its test adapter utilities are pinned together in the lockfile.

## Tenant boundary

- Every tenant-owned model has `tenant_id`. Platform-owned plans and sales leads are deliberately global operator data.
- Tenant APIs require a tenant-scoped role and derive `tenant_id` from the authenticated account.
- Every list, lookup, mutation, and report applies tenant scope. Guessed record UUIDs do not grant access.
- Composite foreign keys prevent cross-tenant employee, department, manager, branch, job, payroll, leave, device, and invoice references at the database level.
- Platform administration has separate routes and permissions. It manages company lifecycle and commercial records, not unrestricted employee impersonation.
- Employee roles see their own scoped records. Managers/team leaders see themselves and direct reports for employee-scoped resources. No recursive reporting-tree traversal is implemented.
- Current tenant isolation is application filtering plus database foreign keys. PostgreSQL RLS policies are **not** enabled; use a restricted database role and assess RLS as a defense-in-depth step before a public launch.

## Authentication

Passwords use salted Node.js scrypt hashes. Session values are 256-bit random opaque tokens; only SHA-256 token hashes are stored in the session table. Cookies are HTTP-only, SameSite=Lax, and host-only. Production startup requires secure cookies. Session lifetimes are one day or thirty days when Remember Me is selected. This design uses revocable opaque sessions, not JWT access/refresh token pairs.

Mutating requests require an allowlisted browser Origin and a per-session CSRF token. Login failures are counted in PostgreSQL, with temporary locking. A process-local request cap and an example Nginx edge rate limit are included. Public endpoint rate limiting must be sized for deployment and load balancing.

Password resets use hashed, expiring, single-use tokens and a transactional email outbox. Password changes/reset and administrative account updates revoke stored sessions. Failed login responses do not identify whether an account exists. Seed credentials come from environment variables; setup generates random local values.

## RBAC

Roles contain explicit `resource:ACTION` grants. The permission module defines the requested platform and company role families. Roles are fixed, reviewable definitions in this release; the UI assigns roles and displays their grants. Editing arbitrary custom roles, per-module feature entitlements, 2FA enrollment, and invite acceptance remain future work.

## Audit and financial integrity

Create/update/archive/review actions are recorded with actor, entity, timestamp, tenant, before/after values where appropriate, and request IP. Password hashes, reset tokens, personal payloads, and logo data are excluded from general audits. Audit rows and raw punch evidence are immutable under database triggers.

Payroll follows DRAFT → REVIEW → APPROVED → LOCKED. Review can return to draft. Database triggers block changes to locked runs and their items, including direct Prisma writes. Adjustments are separate records targeting a later month. Amounts are integer minor units. Payments are serialized by invoice row locks and cannot exceed the outstanding balance.

## Attendance and workforce

Manual input retains raw punch evidence before deriving daily records. Shift timezone conversion is explicit. The engine pairs IN/OUT intervals, flags missing/unpaired input, and sums recorded breaks correctly. Night-shift assignment uses the configured overnight window. Rotating rosters, automatically deducted break policies, holidays/weekends classifications, manual correction approvals, and vendor sync are not complete.

Workforce status is an explicit user action with a 45-second browser heartbeat. The page polls every 30 seconds; absent heartbeats expire after two minutes. No keystrokes, messages, passwords, personal files, application titles, or browsing contents are collected. The desktop contract requires user consent and an encrypted buffer supplied by a future platform-specific implementation.

## Files and AI

Documents use S3-compatible object storage. Uploads have size limits and PDF/PNG/JPEG signature validation; authorization precedes downloads, which are attachments. Keys start with a tenant UUID and use random object identifiers. Add malware scanning, retention, backup, KMS-managed encryption, and audited deletion policies for production.

AI sees an explicit aggregate fact bundle produced by permission-checked API functions. It has no SQL access, credentials, or unrestricted record tools. The provider URL and credentials come from server configuration. External text is treated as untrusted. Provider replies are advisory; there are no autonomous hiring or discipline actions.

## Jobs and realtime

A BullMQ worker processes the transactional email outbox with retry/backoff and checks subscription expiry. Delivery is at-least-once; an SMTP send accepted immediately before a worker failure can result in a duplicate email. Socket.IO rooms are derived from authenticated sessions and carry only data-invalidated events. Clients re-fetch authorized data. Multi-instance Socket.IO adapters and the larger queue catalog in the original brief remain to be implemented.
