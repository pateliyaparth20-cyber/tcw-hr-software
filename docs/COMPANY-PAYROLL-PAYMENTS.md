# Company payroll and salary payment operations

Every customer company configures its own salary account in **Payroll → Payment settings**. There is no shared customer bank account. Monetary values in APIs and storage use integer paise; forms display the company currency.

## Payroll cycle

1. Configure effective Basic, HRA, allowances and overtime salary revisions. Review employee bank account/IFSC and applicable contribution rules. Salary history shows monthly and annual fixed gross; these figures exclude employer contributions, variable earnings and overtime and are not a complete CTC quote.
2. Reconcile completed-month attendance, resolve missing punches and prepare payroll. Review prorated salary, overtime, adjustments, loan recovery and any person-specific manual salary overrides.
3. Finalize the reviewed run. Finalized amounts become the payslip and salary payment source.
4. Choose direct API payout now, approve a future salary payment time, download unpaid bank advice for corporate banking, or record a full salary already paid outside the software.
5. Review payment status, UTR, payment register and Salary Payment Challan. Employees see their own finalized payslip payment status and UTR. Submission/dispatch is not bank credit confirmation.

## Salary contribution rules

Payroll supports percentage or fixed rules, Gross or Basic wage basis, optional maximum wage basis and maximum contribution. Employer contributions appear as separate components and never reduce employee net pay. Existing rules retain their previous Gross/percentage behavior. Rates, applicability and caps are company-reviewed inputs; no statutory rate is silently installed. Fixed rules are fixed amounts for the payroll month and are not automatically attendance-prorated.

This release does not implement automatic income-tax declarations/projections, Form 16 generation, state-specific PT/LWF slabs, PF/ESI eligibility enforcement, government ECR filing, or government-issued statutory payment challans. The Salary Payment Challan is a salary payment summary, not evidence of a government contribution deposit. Generic bank advice must be converted to the bank's required upload format where necessary.

## Payment modes and connection setup

- **Manual:** bank transfer, cash or a cleared cheque. Record the actual paid date, full net amount, UTR/receipt reference and confirmation. Recording does not send money. Duplicate, stale, zero and future payment records are rejected.
- **Bank file:** unpaid bank advice omits every previously claimed transfer, including unknown/failed/pending entries, and zero salaries. It never sends money. Known final failures can be replaced by a confirmed outside payment, preserving the original transfer in audit history.
- **RazorpayX:** implemented company-specific composite payout API, stable payout UUID idempotency/reference, salary purpose and exact amount, account/IFSC and INR checks. Each company must obtain its own enabled account, keys, sufficient balance, permitted transfer limits and any provider IP allowlisting/approvals.
- **Business bank API:** works through an explicitly installed bank-tested server adapter. No native Axis/ICICI/HDFC protocol is claimed by this generic contract. The customer's bank must provide its current API onboarding requirements and sandbox documentation; installation requires adapting and testing its authentication, certificates, request signing, response/status semantics and idempotency. Until installed, the company can save its bank name with live payments disabled and use bank-file/manual modes.

Payment account settings are separate from historical company-profile preferences and are authoritative once saved. Editing requires company EDIT and payroll APPROVE permissions. Secrets are encrypted using a dedicated AES-256-GCM key derived from CONFIG_ENCRYPTION_KEY (at least 32 characters), with tenant ID as authenticated associated data. Browser responses and audits contain masked account identifiers and configuration metadata only. Never replace the encryption key without migrating encrypted records. Immutable connection revisions retain the original account for historical status reconciliation.

## Scheduled transfers

Finalized payroll plus explicit schedule approval is required. Enter date/time in the company's timezone. The persisted UTC instant is the requested submission time; normal worker polling is every ten seconds with bounded parallel batches, subject to service availability and queued work, with no guarantee of bank settlement at that instant. A schedule cannot be duplicated or edited in place; cancel and approve another time before dispatch. No recurring implicit money authorization is created.

The scheduler atomically claims a due schedule across worker replicas and rechecks the active approver's current permissions/company membership, subscription access, unchanged net salaries, employee beneficiary details and connection revision. It checks the approved fingerprint again under the payroll/company locks before creating payout claims. Account changes, manual payment and reopening conflict with an active schedule. Missed schedules older than fifteen minutes are blocked for fresh review. A sender left RUNNING beyond one hour is marked NEEDS_ATTENTION and is not reclaimed.

Each employee is claimed once before any network call. A timeout, malformed response or uncertain database persistence leaves UNKNOWN/INITIATING for reconciliation; it is never automatically retried as a new transfer. Known provider references are polled for status. Processing payments are checked after five minutes; recently processed payments are checked hourly for thirty days for reversals. Manual status checks remain available for historical transfers. This is polling, not a signed provider-webhook integration.

An UNKNOWN/INITIATING payout can recover its reference from Payment reconciliation. The server fetches that provider ID using the original account and requires exact payout UUID reference, amount and INR currency before changing the record. Terminal failed/reversed/rejected/cancelled payouts with a verified provider reference can be replaced by an outside payment with an explicit confirmation and matching record timestamp. Submitted or unverified transfers cannot be manually marked paid or automatically retried.

## Installed business-bank adapter contract

Only a software administrator can register adapters through BANK_PAYOUT_CONNECTORS_JSON, for example:

```json
{"BANK_CODE":{"label":"Bank name","url":"https://bank-adapter.example.invalid/v1"}}
```

Companies never supply request URLs. HTTPS endpoints must have no URL credentials, query or fragment; redirects are rejected. This environment variable contains adapter endpoints, not customer keys. Customer key ID/secret, source account and corporate ID are encrypted per company through Payment settings.

The adapter accepts Basic authentication with that customer's key ID/secret and X-Corporate-Id. It must bind those credentials to that company's source account, never trust a caller-supplied account alone, and reject cross-company beneficiary/status access.

POST /payouts uses Idempotency-Key and an immutable JSON payload with idempotencyKey, reference (payout UUID), corporateId, sourceAccount, integer amount in paise, currency INR, purpose salary, month, mode and beneficiary {name,accountNumber,ifsc}. The adapter must implement durable same-key/same-payload idempotency at the bank and return a stable provider payout ID.

GET /payouts/{providerId} is read-only. Responses must contain id, reference_id (original payout UUID), integer amount, currency INR, status and optional utr. Supported statuses: queued, pending, processing, processed, rejected, cancelled, reversed, failed. Only processed confirms credit; reversed invalidates it. Errors/timeouts never prove that no transfer occurred. This contract is not an implementation of any bank's unpublished API.

## Official product patterns reviewed

The implementation uses common payroll preparation, approval, disbursement and reconciliation patterns, without claiming an exhaustive survey of all Indian payroll software:

- Zoho Payroll: salary revisions, approved pay runs, bank advice/direct deposit and bank-specific account onboarding: https://www.zoho.com/in/payroll/help/employer/pay-runs/ and https://www.zoho.com/in/payroll/help/employer/direct-deposit/direct-deposit-yes-bank.html
- Keka: review/approval and bank transfer-file workflows: https://www.keka.com/payroll-processing and https://help.keka.com/hc/en-us/articles/39946832526993-Can-Keka-integrate-directly-with-corporate-banks-for-automated-salary-disbursal-or-is-manual-file-upload-always-required
- greytHR: payslips, salary revisions, bank account validation and integrated PayNow: https://www.greythr.com/payroll-software/ and https://www.greythr.com/greythr-help/admin/91142472/
- RazorpayX: composite payouts, idempotency and payout status documentation: https://razorpay.com/docs/api/x/payout-composite/create/bank-account/ and https://razorpay.com/docs/api/x/payouts/fetch-all/
- Axis corporate API catalogue confirms bank-specific payout and status APIs: https://apiportal.axisbank.com/portal/product/30707

## Validation and deployment

Integration tests use synthetic accounts and injectable payout providers with no live bank transfer. They cover tenant credential isolation, encryption/AAD, historical account binding, schedule timezone, changed beneficiary/missed time/revoked approver/RTGS checks, duplicate prevention, manual replacement, challan updates and reference recovery. PostgreSQL tests exercise competing schedulers and pending-provider races. Browser tests exercise company settings, manual payment, challan updates and desktop/mobile layouts. The HR Railway service owns the worker; its durable database schedules survive worker restarts. Live customer payouts stay disabled until that company explicitly configures and enables its own account.
