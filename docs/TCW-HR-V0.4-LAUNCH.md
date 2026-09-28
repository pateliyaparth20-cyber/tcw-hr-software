# TCW HR Software v0.4.0 launch build

## Included
- TCW logos supplied by the owner are integrated into both portals.
- Super Admin company creation generates a company code, login ID, and one-time temporary password.
- New company owners must change the temporary password on first login.
- Default trial is 3 days (`TRIAL_DAYS=3`).
- Trial expiry and billing suspension lock HR modules while preserving data. Billing status remains visible after login.
- Recording a fully paid invoice in Super Admin reactivates an expired company for 30 days.
- Complete employee master captures HR, statutory, emergency, bank and employment data in the employee `personal` record.
- Company settings include monthly salary processing day and automatic payroll preparation. The scheduler prepares payroll in REVIEW state for human approval.
- Existing attendance, leave, payroll, recruitment, assets, documents, expenses, travel, offboarding, audit and reporting modules remain available according to role permissions.

## External integrations required before real-money / biometric production use
- Online subscription payment requires a payment gateway merchant account and webhook integration. The build exposes billing lock/status and Super Admin verified payment recording but does not fake payment success.
- Salary calculation and scheduled payroll preparation are implemented. Actual bank payout requires a licensed payout/banking provider, KYC, credentials, approval controls, reconciliation and webhooks. No unattended money transfer is simulated.
- Attendance supports manual/import/device connector architecture. Production face recognition/biometric identity matching is not bundled; use a compliant attendance-device/provider integration after legal/privacy review.

## Upgrade
1. Copy your existing `.env` and `.local-data` into the v0.4 project directory.
2. Run `npm ci`.
3. Run `npm run db:migrate` for PostgreSQL deployments. Embedded demo applies migrations on startup.
4. Run `npm run typecheck`.
5. Run `npm run demo`.

The first login after a newly generated company uses the generated company code + User ID (or email) + temporary password.
