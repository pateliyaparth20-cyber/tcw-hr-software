# TCW HR Software v1.3.0 — release validation

## Software-side completion
- Short `TCW####` user IDs with collision checks per company.
- One-time 8-character temporary passwords that meet the enforced complexity rule.
- Trial/admin-created credentials queued by SMS/email and first-login password change enforced.
- Mobile/desktop session and login stability work retained from v1.2.9 fixes.
- Normal-font login/UI typography and responsive touch sizes retained.
- Digital HR dashboard and separate Super Admin dashboard retained.
- Cookie consent plus Privacy / Cookies / Terms pages.
- Attendance reconciliation, paid/unpaid leave, missing-punch checks, attendance month lock and payroll link.
- Payroll review/approval/lock workflow, deduction rules, adjustments, payslips and bank CSV.
- Guarded RazorpayX salary payout records with provider idempotency, status refresh and UTR tracking.
- BioMax/ZKTeco native PUSH/ADMS receiver plus vendor-neutral secure middleware webhook.
- AI provider configuration using encrypted database storage or deployment environment variables.
- Railway gateway, production environment template, PostgreSQL/Redis references and migration/bootstrap start command.

## Local static validation performed in this package workspace
- TypeScript/TSX syntax parse across source tree.
- JavaScript/MJS syntax checks for deployment scripts.
- JSON validity checks.
- Railway TOML parse check.
- Docker Compose YAML parse check.
- CSS brace-balance check.
- ZIP integrity check will be run on the final archive.

## Build limitation in the packaging environment
The packaging sandbox cannot currently complete `npm ci` because an npm dependency is not available in its local cache and external registry access times out. Therefore the final full Next.js/TypeScript/Prisma production build must be run once in an environment with npm registry access (your Windows PC successfully installed dependencies in earlier testing):

```text
npm ci
npm run release:verify
```

Do not enable live salary payouts until provider sandbox/live verification has been completed with a small controlled payroll and authorized business payout account.
## 2026-09-28 TypeScript compiler fixes

Fixed two strict type errors reported by `npm run release:verify` on Windows:

- `apps/api/src/data.ts`: support-ticket tenant ID collection is now explicitly `string[]` before passing to Prisma `in`.
- `apps/api/src/data.ts`: sanitized tenant profile is typed as `Prisma.InputJsonObject` before Prisma update.

The edited file passes TypeScript syntax parsing in the packaging environment. Full typecheck/build still requires installed project dependencies; run `npm ci && npm run release:verify` on the deployment machine.

## 2026-09-28 payout TypeScript follow-up
- Fixed strict TypeScript narrowing in `packages/ui/workflows.tsx` for optional payout items.
- Payout table now uses `(payoutQ.data?.items?.length ?? 0) > 0` and `payoutQ.data?.items ?? []`, so undefined query data is handled safely.
- Scanned TSX sources for the same optional-length/direct-access pattern; no additional matches remained.
- TS/TSX source syntax parse check passed after this change.
- Package-install based `release:verify` could not be completed in this packaging environment because npm registry access timed out; run `npm ci` and `npm run release:verify` on the deployment PC.
