# TCW HR Software v1.3.0 — Production completion pass

## Implemented in software

- Company self-service trial signup generates a short User ID such as `TCW2104` and a secure 8-character temporary password. Company Code, User ID and temporary password are shown once and queued for SMS/email. First sign-in forces the user to choose a private password.
- HR-created user accounts can also auto-generate short User IDs and one-time temporary passwords. If linked to an employee with a mobile number, SMS delivery is queued automatically.
- SMS worker supports MSG91, Twilio and a generic webhook provider. Provider credentials remain server-side environment variables.
- Attendance supports BioMax/ZKTeco PUSH/ADMS direct receiving plus a vendor-neutral authenticated middleware webhook for other attendance devices, along with device registration/status, employee mapping, live punches, sync logs, month reconciliation, exceptions and payroll lock.
- Payroll calculation uses configured salary, reconciled attendance payable units, paid/unpaid leave, deduction rules and adjustments. Workflow is Draft → Calculate/Review → Approve → Lock.
- Locked payroll exposes `Pay salaries`. RazorpayX live payout is guarded by explicit server enablement, company-code binding, employee bank detail validation and per-employee idempotent payout records. Bank payout CSV remains available as a fallback.
- AI assistant supports an OpenAI-compatible provider. The API key can be stored encrypted from Super Admin System Health or supplied by deployment environment variables. AI only receives bounded authorized HR facts.
- Cookie consent UI and Privacy / Cookies / Terms pages are included. Core authentication cookies are essential; optional analytics are not enabled by this release.
- HR and Super Admin remain isolated portals. Recommended production hostnames are `hr.techcyberwarrior.in` and `admin.techcyberwarrior.in`; the existing `techcyberwarrior.in` website does not need to be replaced.
- Railway configuration supports one public app service running HR, Super Admin, API and Worker behind a host-routing gateway, plus Railway PostgreSQL and Redis services.

## External activation still required

Software cannot create or bypass third-party accounts, KYC or DNS ownership. Before true production launch, the operator must configure: Railway/project access, DNS records, SMTP, S3-compatible storage, an SMS provider account/template, an AI provider key if AI should be enabled, and a verified RazorpayX account/API configuration if live salary payouts should be enabled. Attendance hardware also needs its serial/model-specific server settings and network access.

Never store online-banking passwords, OTPs or card PINs in TCW HR. Live salary payout uses the payout provider's API credentials and business payout account after provider onboarding/KYC.
