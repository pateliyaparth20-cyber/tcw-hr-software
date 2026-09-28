# TCW HR Software launch update

This source package contains the launch-focused fixes requested for the HR and Super Admin portals.

## Completed in this update

- Visible product branding changed to **TCW HR Software**.
- HR (`:3000`) and Super Admin (`:3001`) use separate session cookies, so signing in/out of one portal no longer overwrites the other portal session.
- Company logo can be uploaded or removed in Company Settings and is used in the tenant workspace brand area.
- Sidebar scroll position is retained during navigation/refresh in the current browser tab.
- Organization, Recruitment, and Leave sub-tabs are stored in the URL (`?tab=...`) and survive refresh/bookmarks.
- Super Admin company list shows outstanding balance, overdue invoice count, and suspension reason.
- Super Admin can manually set company subscription status or archive a company. Archiving immediately revokes tenant sessions but retains historical records.
- Expired subscriptions revoke active tenant sessions.
- Invoices move to `OVERDUE` after their due date. With `AUTO_SUSPEND_OVERDUE=true`, an unpaid overdue invoice suspends the company after `OVERDUE_GRACE_DAYS` (default 3).
- Billing-based suspension is automatically removed after overdue invoices are cleared. Manual suspension is never automatically removed by payment.
- The embedded `npm run demo` server also performs expiry/overdue access checks, so this behavior can be demonstrated without Redis.

## New environment settings

```env
AUTO_SUSPEND_OVERDUE=true
OVERDUE_GRACE_DAYS=3
```

If an existing `.env` is preserved by `npm run setup`, add these two lines manually. If omitted, auto-suspension is enabled and the grace period defaults to 3 days.

## Important launch boundaries

This update strengthens the working product, but external integrations still require real provider/customer setup and verification before production use. In particular: payment-gateway processing, automatic recurring invoice generation, attendance-device vendor SDKs, statutory payroll compliance, production email/storage credentials, 2FA/SSO, load/security testing, monitoring, backup restore drills, and legal/privacy review are not made real merely by UI code. See `docs/IMPLEMENTATION_STATUS.md` for the detailed status.

## Upgrade / run

On Windows PowerShell, from the project root:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
npm ci
npm run demo
```

If Prisma reports a Windows `EPERM` lock, close all terminals/editors that are running Node for this project, open PowerShell as Administrator, remove `node_modules`, and run `npm ci` again.
