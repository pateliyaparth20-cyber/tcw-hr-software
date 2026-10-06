# Attendance and Time Off regression matrix

This matrix defines expected behavior and maps it to automated tests. All fixtures are isolated synthetic data; tests do not create employee attendance or leave in production. The configured half-day duration is exact: with half-day 240 and full-day 480 minutes, 240 is Half Day, 360 is Insufficient Time, and 480 or more is Present. Working time excludes applicable breaks.

## Attendance

| ID | Scenario | Expected result | Coverage |
| --- | --- | --- | --- |
| A01 | No punches before assigned shift | Pending | Unit: attendance-no-punch, attendance-a-to-z |
| A02 | No punches during shift | Not Clocked In | Same |
| A03 | No punches at shift end | Absent | Same |
| A04 | Zero completed working minutes | Insufficient Time | Unit: attendance-a-to-z |
| A05 | 239 minutes with half-day 240 | Insufficient Time | Same |
| A06 | Exactly 240 minutes | Half Day | Same |
| A07 | 241 minutes | Insufficient Time | Same |
| A08 | 360 minutes | Insufficient Time | Same |
| A09 | 479 minutes with full-day 480 | Insufficient Time | Same |
| A10 | Exactly 480 minutes | Present | Same |
| A11 | More than full-day time | Present; overtime follows separate threshold | Same |
| A12 | Custom half-day 195/full-day 420 | Same exact-duration rules use custom values | Same |
| A13 | Closed OUT before shift end | Duration status visible immediately | Unit + API integration |
| A14 | Open/reopened IN | Working; retain closed sessions, no final early-out | Unit + API integration |
| A15 | Out-of-order punches | Sorted without inflated working duration | Unit: attendance-a-to-z |
| A16 | Duplicate IN and OUT | No duplicate session work | Same |
| A17 | Two short sessions at second precision | Round total business duration once | Same |
| A18 | Late grace just below/at/above threshold | Late only for excess | Same |
| A19 | Early-out grace just below/at/above threshold | Early-out only for excess | Same |
| A20 | Automatic fixed break overlaps sessions | Deduct only covered working duration | Same + attendance-break |
| A21 | Actual OUT gap overlaps auto window | No double deduction | Same |
| A22 | Earliest IN is Manual in automatic shift | No automatic break or automatic credit | Unit: attendance-break + API integration |
| A23 | Manual OUT repair on device-opened day | Keep original automatic policy | Unit: attendance-break |
| A24 | Scheduled Manual OUT inside break window | Actual BREAK starts from OUT | API integration |
| A25 | Scheduled Manual OUT outside window | Final OUT, early-out as applicable | API integration + unit |
| A26 | Multiple scheduled break gaps | Share remaining allowance | API integration + unit |
| A27 | At break allowance boundary | BREAK; next excess second is OVER_BREAK | Unit: attendance-a-to-z |
| A28 | Exhausted break allowance | No additional entitled break | Same |
| A29 | Break conservation across many durations | Break + over-break equals actual gap | Same |
| A30 | Flexible first OUT/IN gap | Counts as first break | API integration |
| A31 | Flexible later final OUT | OUT; does not continue break counter | API integration |
| A32 | Flexible first gap exceeds allowance | OVER_BREAK retains start timestamp | API integration |
| A33 | Overnight shift across India midnight | Same original workday; correct work hours | Unit: attendance-a-to-z |
| A34 | Alternate Saturday and weekly schedules | Correct scheduled days | Unit: attendance-work-calendar |
| A35 | Leap February 2028 | 29 days | Unit: attendance-a-to-z |
| A36 | Half-day payroll fraction | 50 payable units | Same |
| A37 | Insufficient duration payroll rules | Existing threshold-based units preserved | Same |
| A38 | Tenant unavailable | Automated attendance skipped | Unit: attendance-tenant-status, attendance-refresh |
| A39 | Manual correction/month synchronization | Preserve correction and finalized rows | Integration attendance tests |
| A40 | Attendance period locked | Leave cannot change locked payroll attendance | API integration |
| A41 | Attendance Details initials | Name/surname initials remain visible | Browser: attendance detail profile |
| A42 | Live workforce versus attendance | Same Working/Break/Over Break/OUT policy | API integration |

## Time Off

| ID | Scenario | Expected result | Coverage |
| --- | --- | --- | --- |
| L01 | Missing or invalid calendar dates | Validation error, never TypeError/500 | Unit + API integration |
| L02 | Feb 30 | Rejected with 400 | API integration |
| L03 | End before start | Rejected | Same |
| L04 | Request across calendar years | Separate requests required | Same |
| L05 | Half-day request spans multiple dates | Rejected | Same |
| L06 | Blank reason | Rejected | Same |
| L07 | Leave before joining | Rejected | Same |
| L08 | Foreign company leave type | Rejected | Same |
| L09 | Weekend-only request | No working days; rejected | Same |
| L10 | Holiday-only request | No working days; rejected | Same |
| L11 | Single working half day | 0.5 days reserved | Same |
| L12 | Full working day | 1 day reserved | Same |
| L13 | Pending and approved overlap | 409 Conflict | Same |
| L14 | Half-day versus full-day overlap | 409 Conflict | Same |
| L15 | Exact annual allowance reached | Allowed; remaining zero | Same |
| L16 | Exceeds annual allowance | Rejected; pending usage included | Same |
| L17 | Exact same request key/payload replay | Same row; no repeated notification | Same |
| L18 | Reused request key with changed reason/date/duration | 409 Conflict | Same |
| L19 | Cancellation of pending leave | Release reservation | Same |
| L20 | Self approval or foreign company review | Forbidden/not found | Same |
| L21 | Already reviewed request | Second review conflicts | Same |
| L22 | Approved leave cancelled | Status cancelled; recompute attendance | Same |
| L23 | Repeated cancellation | Conflict | Same |
| L24 | Cancellation of locked approved leave | Conflict; attendance preserved | Same |
| L25 | Unlock then cancel | Clear leave units and restore working day type | Same |
| L26 | Retroactive paid leave after finalized absence | Physical absence preserved; paid leave units applied | Same |
| L27 | Unpaid approved leave | Unpaid day type; zero payable units | Same |
| L28 | Employee/year balance | Approved and pending separate; accurate remainder | Same |
| L29 | Invalid year or foreign employee balance query | 400/404; no data leakage | Same |
| L30 | More than 500 historical requests | Balances and totals use all records; list cap explicit | Same |
| L31 | Simultaneous different requests with one-day allowance | Only one reserves allowance | PostgreSQL concurrency |
| L32 | Simultaneous exact retry | One request and one approval record | PostgreSQL concurrency |
| L33 | Directory permission unavailable | Safe identity supplied by scoped leave response | API response + UI fallback |
| L34 | Status/search/year filters and reset | Matching rows and predictable reset | Browser |
| L35 | Selected request balance | Render server total, not displayed-row approximation | Browser |
| L36 | Keyboard Enter on a request row | Opens details | Browser |
| L37 | Failed form submission then retry | Preserve fields and original request key | Browser |
| L38 | Grouped request form | Employee/type, dates/duration, reason sections | Browser |
| L39 | Mobile 390px and 320px | No page overflow; form reason and submit reachable | Browser |
| L40 | Approve/reject/cancel dialogs | Context summary; permission-gated actions | Existing API lifecycle + UI |

## Verification

Run `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run build`, `npm run test:browser`, and `npm run test:concurrency` with an isolated local `tcw_payroll_test` PostgreSQL database. The CI verification workflow runs these suites and builds both frontends. Matrix rows describe scenarios, not individual test-runner counts: one test can cover multiple boundaries.

Real biometric hardware, physical clock reliability, production Railway latency, external email delivery, and each company’s historical data require separate live operational checks. These are not claimed as covered by synthetic automated tests. Publishing this change supplies a verified manual-update candidate; installation follows the Software Update button.
