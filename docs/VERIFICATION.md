# Verification for release 0.1.0

Prepared on 26 September 2026. This records observed checks and limitations; it is not a production certification.

| Check | Observed result |
| --- | --- |
| Dependency installation and Prisma client generation | Passed; package-lock.json included |
| Prisma schema format/validation and migration generation | Passed |
| TypeScript checks for API, packages, tests, HR app, and admin app | Passed |
| Unit tests | 9 passed |
| API integration tests | 10 behavior scenarios passed, plus the enclosing test (11 reported by Node) |
| API/worker TypeScript compilation | Passed |
| HR Next.js optimized build | Passed |
| SaaS admin Next.js optimized build | Passed |
| HTTP/server-rendering smoke checks for both apps | Passed: protected route redirects, same-origin login proxy, Set-Cookie forwarding, authenticated server rendering |
| Playwright browser tests | Provided, but not executed successfully: Chromium failed to launch before the first test action in this environment |
| Visual and responsive browser inspection | Not completed because the browser runner could not launch |
| Docker Compose execution | Not run; Docker was unavailable in the build environment |
| External PostgreSQL server | Not run; integration tests used PGlite's embedded PostgreSQL engine with Prisma and the actual SQL migrations |
| Redis worker / SMTP delivery / S3 upload-download | Source included; end-to-end service integration not run here |
| Attendance hardware and desktop application | Not implemented or validated; explicit connector contracts and unsupported errors included |
| External AI provider | Not called; requires configured provider credentials |

## Unit coverage

Attendance interval pairing, recorded breaks, missing/duplicate punches, grace periods, half days, overtime, timezone conversion, integer payroll arithmetic, deduction caps, payroll transitions, salted password verification, CSV formula neutralization, and honest unconfigured-device errors.

## API coverage

The actual NestJS server, Prisma client, and migrated PostgreSQL-compatible engine were used. Scenarios exercised:

1. Anonymous access rejection and missing-CSRF rejection.
2. Atomic company-owner provisioning and platform-only administration.
3. Tenant-scoped lists, guessed-ID read/update rejection, and composite reference rejection.
4. Employee role permissions and personal data scope.
5. Payroll workflow transitions, database-enforced locking, and own finalized payslips.
6. Leave overlap prevention, authorized reviews, rejection of repeated reviews, and self-review restrictions.
7. Attendance idempotency and raw evidence immutability.
8. Invoice payment recording and overpayment rejection.
9. Immediate denial of suspended-company sessions.
10. Single-use password reset and revocation of existing sessions.

The suite does not constitute exhaustive concurrency, fuzz, penetration, scale, statutory payroll, hardware, or disaster-recovery testing.

## Reproduce

```bash
npm ci
npm run setup
npm run typecheck
npm test
npm run test:integration
npm run build
npm run test:ssr
```

`test:ssr` starts temporary API and Next.js servers on ports 4000, 3000, and 3001. Stop other TCW HR instances first. It uses an isolated in-memory database and the development credentials in `.env`.

On a machine that supports Chromium, start `npm run demo` in another terminal, then run:

```bash
npx playwright install chromium
npm run test:e2e
```

The four browser test sources cover protected navigation, employee create/edit/search/archive, command search/mobile navigation, and platform company/sales screens. They remain unverified until run successfully on that machine.
