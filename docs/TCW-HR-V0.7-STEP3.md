# TCW HR Software v0.7.0 — Attendance-to-Payroll Automation

Step 3 connects biometric/manual punch data to a controlled monthly attendance close and payroll calculation workflow.

## Added in this build

- Employee-level shift assignment.
- Configurable working weekdays, late grace and early-out grace on shifts.
- Late, early-out, half-day, absence and overtime calculations from raw punches.
- Month reconciliation against approved leave, holidays and weekly offs.
- Paid/unpaid leave units and payable attendance units for payroll.
- Missing-punch exception handling and HR attendance corrections with audit records.
- Monthly attendance lock/unlock with payroll safeguards.
- Payroll calculation requires a locked attendance month.
- Payroll items retain the attendance basis: scheduled days, payable units, present/half days, leave, absences, late and overtime minutes.
- Monthly attendance CSV report.
- Automatic payroll preparation can reconcile, lock and prepare a REVIEW run after the configured salary day.
- BioMax device offline/recovery monitoring and notifications.

## Operational sequence

1. Configure shifts and working weekdays.
2. Assign a shift to each employee.
3. Collect BioMax/manual punches.
4. Approve leave and maintain holidays.
5. Reconcile the month in Attendance → Monthly automation.
6. Correct missing-punch exceptions with a reason.
7. Lock the month for payroll.
8. Calculate payroll for the same month.
9. Review, approve and lock payroll under your internal controls.
10. Export the bank payout file or connect a separately verified payout provider.

## Payable-day model

The engine uses integer attendance units to avoid floating-point drift:

- Full payable day = 100 units.
- Half payable day = 50 units.
- Unpaid absence = 0 units.
- Approved paid leave contributes payable units.
- Unpaid leave contributes leave history but not payable salary units.

Monthly salary is prorated against the employee's eligible scheduled days for that month, then salary rules and adjustments are applied.

## Locking behavior

Attendance cannot be locked while unresolved `MISSING_PUNCH` days remain. Once locked, ordinary attendance mutation and leave decisions affecting that period are blocked. An attendance month cannot be unlocked once its payroll has advanced beyond `DRAFT`.

## Automatic payroll

When auto-payroll is enabled, the scheduled process prepares payroll only after attendance can be reconciled without missing-punch exceptions. The run is left in `REVIEW`; the process does not claim that funds were transferred.

## Biometric monitoring

A BioMax terminal previously considered online is marked offline after approximately 15 minutes without heartbeat/punch traffic. HR receives a notification. Reconnection returns the device online, and pending terminal logs can continue through the Step 2 direct PUSH connector.

## Production boundary

This build automates attendance and payroll computation. Actual bank disbursement remains an external regulated operation and requires an approved payout/banking integration, credentials, KYC, authorization controls, idempotency and provider reconciliation. No fake transfer success is produced by this build.
