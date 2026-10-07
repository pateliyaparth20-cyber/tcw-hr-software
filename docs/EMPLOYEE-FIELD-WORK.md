# Employee field work and face verification

Company HR uses **Field work → Company settings** to enable tracking, select all or specific employees, and set GPS interval (15–300 seconds), maximum uncertainty (20–500 metres), and session expiry (1–12 hours). Each company has independent settings; the feature starts disabled. Employee and team-manager reads follow the existing employee scope. No payroll amounts, bank details or personal records are returned by location APIs.

Employees check in to attendance, give explicit session consent and start field work. A persistent shell watcher sends fresh device GPS only while the app is visible. Page navigation keeps the watcher active. Stop, attendance OUT, expired duty or company policy removal prevents more points; a worker closes expired/non-duty sessions every minute. Active visits closed this way are marked incomplete rather than completed. Location denial and low GPS accuracy are visible to the employee. HR displays delayed updates separately from live positions. GPS is device-reported and can be spoofed; it is not independently verified evidence.

Use **Visits** to assign or plan a customer visit with purpose, instructions, optional scheduled time, site coordinates and radius. Check-in requires an active on-duty session and fresh accurate GPS; when a site is configured, distance plus GPS uncertainty must fit within its radius. Only the assigned employee can start/complete a visit. Completion stores a GPS checkout and outcome. Planned visits can be cancelled. Route history uses the company timezone for date boundaries and display, shows at most 1,000 points and marks truncation. Location points, closed sessions and completed/cancelled/incomplete visits expire after 30 days. Pending future visit plans remain available. Map links open OpenStreetMap only when clicked; no background third-party map embeds receive coordinates.

## Face identity upgrade

Previous browser-provided descriptors **cannot authorize new face attendance**. Existing profiles are marked `LEGACY`; every employee completes fresh camera setup. The Node WASM face engine and models are pinned local npm dependencies; the server decodes actual images, detects a single clear face and computes its own descriptor. Browser-supplied descriptor payloads are rejected.

A server-issued random left/right movement challenge is bound to company, employee, user and login session, expires after two minutes and is claimed once even when verification fails. Three images must show consistent identity, initial front pose, the requested turn and return to front. Static identical captures, multiple faces and invalid images fail closed. Images are capped, decoded with a pixel limit and processed through a bounded inference queue.

Setup creates a **pending** employee-bound encrypted template. One encrypted preview is available only to company HR administrators for identity review. Employees cannot approve or replace their approved face. HR confirms identity through the company's identity process, then approves or rejects setup in **Field work → Face approvals**. The preview is removed after review; pending previews expire after 30 days. Templates and preview use AES-GCM authenticated with company, employee and purpose. `CONFIG_ENCRYPTION_KEY` must be stable and at least 32 characters on every API replica/service sharing the database. Never rotate it without a migration/re-enrollment plan.

Each attendance scan repeats a fresh movement challenge, matches all server-computed samples against the approved centroid with normalized Euclidean threshold 0.42, and rechecks profile approval/version under the employee lock before creating a punch. A failed match creates no attendance. HR can reset approved faces through existing employee app access management. No new bank or biometrics cloud provider keys are required.

Head movement is a basic replay deterrent, **not certified presentation-attack detection**. Recognition is probabilistic and cannot guarantee zero false acceptance or rejection. A controlled employee rollout should verify actual mobile cameras, lighting and left/right instructions before enabling company-wide use. High-assurance anti-spoofing requires a separately validated liveness provider/native capture integration.

## Mobile limits and rollout

Browser/WebView foreground tracking is supported. Closing the app, locking the phone or background OS suspension interrupts updates; HR will see a delayed state. This version does not claim continuous screen-off tracking. Android source now requests foreground coarse/fine GPS for the configured HTTPS app origin only. Existing APKs need a rebuild/update to receive those permissions; the hosted employee portal supports browser GPS immediately.

The additive migrations retain original attendance punches and legacy face templates until replaced. Payroll and payouts are unchanged. HR must review new employee face setups before those accounts can use camera attendance.
