# Salary Payment Challan

Open Payroll, select a completed month and finalize the reviewed payroll. Select **Salary Payment Challan** below the employee salary table.

The challan shows the company, a stable company/month/run identifier, generation time, employee salary snapshots, gross/deduction/net totals, payment mode, recorded references and UTR. Paid, pending/unverified and failed/reversed amounts have separate totals. Zero-net employees are marked No Payment Due. Salary transfers with a different amount from the finalized salary are Unverified.

**Refresh status** retrieves the latest recorded payment information. **Download challan PDF** downloads a paginated report with repeated company/month/totals and authorization lines. **Print / Save PDF** prints the detailed company challan. This is a salary payment summary; viewing or exporting it never initiates a transfer or marks an employee paid. Bank-file payments without recorded provider confirmation remain Pending.

`GET /api/payroll/:runId/payment-challan` returns the preview. Add `?format=pdf` for a PDF. The endpoint requires company payroll VIEW, prohibits employee/manager/team-leader roles, checks the tenant and finalized run, and requires payroll EXPORT for PDF. Responses are private and not cached. No schema migration or provider credential is needed.

Automated verification covers finalized-only access, tenant isolation, role restrictions, amount totals, immutable salary names/amounts, zero-net rows, mismatched and unknown transfers, read-only generation, and pagination with long references.
