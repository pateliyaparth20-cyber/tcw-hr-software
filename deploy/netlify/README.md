# Netlify migration staging

This is a new deployment target; adding these files does not switch any live domain.
Keep the existing Supabase `tcw_hr` schema and user records. Do not run demo bootstrap,
seed, reset passwords, delete the Render services or change the nameservers.

## Current cost constraints

Checked 22 November 2026: Netlify Server is Early Access and is free during Early
Access. This is not a promise of a permanent free backend. The Free credit plan
has 300 credits/month and a hard limit; web projects pause if credits run out.
Use the Free plan, without paid add-ons. Verify account eligibility and the current
Server pricing before creating the projects and again before cutover.

## Projects

Create the API project first with the repository root as base and `netlify.toml`.
The build generates `netlify/server/index.mjs` pointing to the existing compiled
Nest/Express API. Netlify Server runs this native Node server, including Socket.IO.
Do not deploy the Next.js adapter in this API project.

Create HR, Admin and Employee projects using their respective configuration files
in this directory. The base remains the repository root. These projects use the
Netlify Next.js adapter and the staged API origin in `API_INTERNAL_URL`.

## Runtime configuration

Copy only required configuration using the hosting dashboards' secure environment
fields. Never put credentials in Git, chat, build output or deployment URLs.

API: retain DATABASE_URL (same database and schema), CONFIG_ENCRYPTION_KEY (required
to decrypt the saved Razorpay and payout configurations), COOKIE_SECURE=true,
NODE_ENV=production, WEB_URL, ADMIN_URL and the exact allowed APP_ORIGINS. Retain
configured mail, storage and push settings. Do not copy demo/bootstrap flags or
OWNER_PASSWORD. Do not enable a new financial scheduler as part of this migration.

Portals: set API_INTERNAL_URL to the staged Netlify API HTTPS origin. The HR and
Employee projects use the HR app; the Admin project uses the separate Admin app.
Retain existing public push and user-facing configuration when applicable.

## Cutover gate

1. Verify `/api/health`, correct and incorrect company/user/password responses,
   cookie/CSRF behavior, tenant separation and logout on a staged hostname.
2. Verify HR and Employee roles, employee records, attendance, leave policy and
   payroll calculations using synthetic records, without sending bank payments.
3. Verify document upload/download if storage is configured; verify reset/invitation
   mail with the designated test mailbox and explicit sending authorization.
4. Verify Socket.IO, device/ADMS endpoints, report export and signed Razorpay
   webhooks. Keep existing encrypted billing configurations and live receipts.
   No real charges or new mandates should be created just to test migration.
5. Inventory and move existing scheduled work explicitly. A server that scales
   to zero does not replace a continuous queue worker or guarantee minute-based
   scheduled tasks. Do not claim background automation migrated until verified.
6. Only then change the three subdomain records at the authoritative DNS provider.
   Add custom hostnames and exact APP_ORIGINS before switching traffic. Keep the
   old services available until smoke checks pass and a rollback is possible.

Relevant official references:
- https://docs.netlify.com/build/server/
- https://docs.netlify.com/build/server/get-started/
- https://docs.netlify.com/build/server/configuration/
- https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/
- https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/
