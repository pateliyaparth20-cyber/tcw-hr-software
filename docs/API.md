# API map

Base path: `/api`. Payloads and error responses are JSON except document transfers and CSV exports. Mutating browser requests require an allowlisted `Origin`, session cookie, and `X-CSRF-Token` (except login/forgot/reset which do not yet have a session). GET `/auth/me` returns the current session's CSRF token and public account details.

| Route | Methods / behavior |
| --- | --- |
| `/health` | GET public liveness |
| `/auth/login` | POST email, password, optional companyCode, remember |
| `/auth/me` | GET authenticated public identity |
| `/auth/logout` | POST revoke current session |
| `/auth/forgot-password` | POST generic response and email outbox |
| `/auth/reset-password` | POST single-use token + new password |
| `/auth/change-password` | POST currentPassword + password |
| `/auth/sessions`, `/auth/sessions/:id` | GET current user's sessions, DELETE own session |
| `/dashboard` | GET role-scoped aggregates |
| `/company` | GET / PATCH company profile and logo |
| `/employees`, `/employees/:id` | GET/POST; GET/PATCH/DELETE (archive) |
| `/users`, `/users/:id`, `/roles` | User list/create/update and role definitions |
| `/branches`, `/departments`, `/designations`, `/teams`, `/locations`, `/cost-centers` | GET/POST collection, PATCH/DELETE record |
| `/shifts`, `/devices` | Typed CRUD; `/devices/:id/test` reports unconfigured SDK |
| `/attendance` | GET daily results; POST raw manual punch and derive result |
| `/leave-types`, `/calendar` | Typed CRUD |
| `/leave` | GET/POST requests |
| `/leave/:id/review`, `/expenses/:id/review`, `/travel/:id/review` | POST APPROVED or REJECTED |
| `/payroll` | GET runs or own finalized items; POST month |
| `/payroll/:id/calculate`, `/approve`, `/lock`, `/reopen` | POST workflow transitions (full path includes payroll ID) |
| `/payroll-adjustments` | POST later-month adjustment |
| `/salary-rules` | GET/POST/PATCH/DELETE configured deductions |
| `/jobs`, `/candidates`, `/goals`, `/courses`, `/assets`, `/productivity-rules` | Typed CRUD, authorization on every resource |
| `/expenses`, `/travel`, `/exit` | GET/POST immutable submissions; review endpoints update state |
| `/exit/:id/review` | POST clearance workflow |
| `/workforce` | GET scoped statuses; POST authenticated user's explicit status |
| `/documents` | GET list; POST multipart file/title/category/employeeId |
| `/documents/:id` | GET authorized attachment download |
| `/support` | Tenant ticket CRUD |
| `/notifications`, `/notifications/:id` | GET list, PATCH read flag |
| `/audit` | GET last 200 events in the authorized scope |
| `/reports/:category` | GET CSV for employee/attendance/leave/payroll/expense/asset/goal/candidate categories |
| `/ai` | POST bounded aggregate summary question |
| `/platform/companies` | GET list / POST company + owner |
| `/platform/companies/:id` | PATCH status, plan, employee limit, expiration |
| `/platform/plans`, `/platform/leads` | GET/POST/PATCH |
| `/platform/invoices`, `/platform/payments` | GET/POST; payments atomically update invoice balance |
| `/platform/support/:id` | PATCH operator response and status |
| `/system` | GET platform service configuration and database connectivity |

Collection responses normally contain `items`, plus `total`, `page`, and `pageSize` for paginated resources. Employee search supports `q`, `status`, `departmentId`, `page`, and `pageSize`. Generic resources accept pagination with a maximum page size of 500. Attendance accepts `from` and `to` calendar dates and returns up to 1,000 records. Current browser tables and exports expose bounded windows; large-volume pagination across every domain is future work.

Validation schemas are in `packages/validation/index.ts`. Authentication failures return 401; permission/origin/CSRF failures 403; absent scoped records 404; conflicts 409; validation errors 400. Secrets are never returned by user/account list routes.
