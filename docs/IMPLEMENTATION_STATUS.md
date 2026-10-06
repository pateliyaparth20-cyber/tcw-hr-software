# Release 1.2.9 implementation status

This project provides working core applications and a source base for the seven-phase brief. “Working” below means implemented UI/API/data behavior, not a claim of production certification. The original specification remains the target product roadmap.

| Area | Included in this project | Still needed for the full brief |
| --- | --- | --- |
| Authentication | Login/logout, sessions, password change/reset, failed-login protection, secure-cookie production check, isolated HR/Admin portal cookies so both portals can stay signed in | 2FA enrollment, federated login, advanced abuse controls |
| Tenancy / RBAC | Tenant filters, composite data references, fixed platform/company roles, role assignment, employee and direct-manager scope | Custom role editor, full team hierarchy scope, RLS, fine-grained feature entitlements |
| Company / organization | Profile, logo upload/remove, company logo in workspace branding, departments, branches, teams, designations, locations, cost centers, reporting managers, searchable reporting chart with collapse/expand | Complete email/document branding, many-to-many teams |
| Employees | CRUD, archive, directory search/filter/pagination, manager validation, salary field, user linkage | Full personal/bank/tax vaults, photos, bulk update, CSV/Excel imports, all profile subtabs |
| Attendance | Shift configuration, preserved manual punches, idempotency, daily calculations, date filtering, CSV export | Vendor SDKs, push/pull syncing, roster assignments, full night/DST policy coverage, holiday/weekend policies, regularization |
| Devices | Company-scoped device registry, BioMax SpeedFace direct ZKTeco PUSH/ADMS ingestion, live punches, employee mapping, heartbeats, duplicate protection, sync logs, LAN reachability tests | Additional vendor-native connectors (Hikvision/eSSL/Suprema), remote enrollment commands, production network hardening |
| Leave | Types, annual allowance, overlap validation, working-day requests, half days, one reviewer, approvals/rejections | Multi-level workflows, carry forward, comp off, encashment, year-specific balances and entitlement accrual |
| Calendar | Month/week/day views, event CRUD, event filters | Automatic aggregation of every module event, recurring events, personal calendars |
| Workforce | Voluntary portal statuses, heartbeat, stale/offline rule, current team view | Installable desktop agent, idle detection, app/domain collection, timeline analytics, offline upload integration |
| Payroll | Monthly drafts, configured percentage deductions/caps, salary proration, unpaid leave, review/approve/lock, immutable records, later-month adjustments, print/PDF via browser | Statutory India payroll engine, full attendance/LOP policy integration, overtime pay, loans/advances, per-person structures, bank files, scheduled payslip PDFs |
| Recruitment | Positions, candidates, stage board, interview datetime, recruiter notes | Requisitions, separate interview/feedback records, offers, hiring-to-employee conversion, resume attachments/parsing |
| Performance | Goals, target/progress, due dates, status | KPI/KRA libraries, OKRs, review cycles, 360 feedback, appraisal forms |
| Training | Course scheduling, trainer/capacity, status | Enrollment, completion per employee, certificates, assessments |
| Assets | Inventory, assignment, return by editing assignment, status validation | Assignment history entities, maintenance schedules, QR inventory |
| Expenses / travel | Typed submissions, amount/date validation, one reviewer, audit | Receipt linking, line items, multi-level approvals, reimbursements, advance reconciliation |
| Documents | S3 storage, PDF/image upload validation, scoped download, categories | Templates, generated letters, digital signatures, DOCX validation, expiration workflows, malware scanning |
| Exit | Requests, approval/clearance/completion, asset checks, account deactivation | Clearance by department, statutory final settlement, generated experience/relieving letters |
| Sales CRM | Lead board, contacts on leads, follow-up datetime, stage/value tracking | Separate contacts/customers, tasks, quotations/PDF, orders, lead-to-company conversion |
| Subscriptions | Plans, company status/expiry, employee limit, immediate session revocation on suspension/archive, safe company archive, worker/demo expiry checks, overdue-invoice auto-suspension with configurable grace and billing-only auto-reactivation | Subscription history, renewals, device/storage/admin/AI enforcement, metering, automatic invoice generation |
| Billing | Invoices, overdue status, manual payments, per-company outstanding/overdue summary, overpayment prevention, configurable access suspension for unpaid overdue invoices | Refunds, tax jurisdiction rules, payment-gateway integration, professional invoice/receipt PDFs |
| Support | Tenant tickets and operator review/response | Conversations, attachments, assignments, SLA, escalation, knowledge base |
| Reports | Employee, attendance, leave, payroll, expense, asset, goal, candidate CSVs and preview | Full date/department/branch filters for all categories, Excel exports, full-scale report pagination, scheduled PDF generation |
| AI | Replaceable compatible provider, authorized aggregate context, chat request/response | Durable conversations, usage accounting, provider tool calling, resume AI, anomaly detection, comprehensive insights/reports |
| Notifications | Approval notifications, read status, password reset email architecture | Complete event catalog, per-user broadcast read receipts, SMS/WhatsApp connectors |
| Operations | Docker/Nginx examples, worker, backups, migrations, unit/integration/browser test sources | Real deployment verification, load testing, monitoring/alerts, restore drills, secrets/KMS, disaster recovery, penetration testing |

## Recommended next implementation order

1. Confirm employee/manager data scope and approval policies with the first customer; complete custom roles and entitlements.
2. Integrate one exact attendance vendor/model and validate raw records, overnight shifts, outages, and idempotent resync with real hardware.
3. Finish payroll policies and obtain qualified statutory review for the target jurisdictions before processing real payroll.
4. Expand employee documents, bank/tax vaults, imports, approval levels, and report pagination.
5. Build the signed desktop application with consent, encrypted buffering, and narrow collection policies.
6. Complete commercial billing, subscription history, documents, recruitment, and review/training workflows.
7. Conduct multi-tenant threat modeling, external security testing, performance testing, and deployment/restore validation.

No dashboard statistic is used to imply a live device, payment gateway, or AI connection. Demo records are seeded explicitly and clearly identified as fictional in the documentation and local startup output.
