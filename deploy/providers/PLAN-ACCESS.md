# Plan module access

Purchased modules supplement role permissions. Neither an HR Admin role nor a direct URL grants an unlicensed module. Existing data is retained.

| Plan | Included modules |
| --- | --- |
| Starter | Core HR, attendance and leave |
| Growth | Starter modules plus payroll and recruitment |
| Enterprise | Growth modules plus performance, training, assets, expenses, travel, documents, offboarding, reports, field work and HR Assistant |

Core login, profile, organization, calendar, company settings, users/roles, security, support and billing remain available subject to their existing role permissions. Expiry restrictions still apply separately. Employee/device capacity remains governed by the saved plan limits.

`packages/plan-access.ts` defines the effective tier policy and route aliases. Authentication filters a fresh copy of the user's role permissions using the current database plan on every request; it never edits the stored role. The API checks the route before module handlers, and permission checks retain the plan constraint. Platform administration is unaffected; company proxy sessions show the company's actual licensed access.

The client also checks the current plan to protect cached broad role permissions. Navigation, dashboard widgets and assistant entry points follow that check; direct module URLs show an upgrade prompt. The pricing page displays the effective included module list. Super Admin plan highlight text is descriptive; it cannot grant additional modules beyond the tier policy.

Starting checkout does not unlock modules. A verified live captured payment updates the company plan through the existing billing transaction. Payment verification/reconciliation refreshes the authenticated client session; focus also refreshes it so a server-side plan update can take effect. Test payments never activate live access.

Validation uses embedded test data and synthetic provider responses, including same-session Growth-to-Enterprise verification, rejected direct API reads/writes, stale sessions after a plan change, unchanged stored roles, core access, expiry rules and UI permission checks. No real payments are made by the tests.
