# TCW Cloud Drive and shared navigation

Mobile navigation uses four shortcuts around a raised quick-actions button. Quick actions and menus keep role and subscription permission filtering. Desktop sidebars support an icon rail and expanded navigation; light/dark affects only the sidebar. Appearance choices persist locally. Existing sidebar scroll persistence, menu Escape handling and background scroll locking are retained. Reduced-motion preferences disable the new transitions.

Shared module styling updates cards, tables, forms, toolbars and pagination without changing feature behavior. Existing specialized payroll, attendance and dashboard layouts remain intact.

TCW Cloud Drive uses the existing company document records and `/documents` route (Enterprise documents entitlement). Files are private, retrieved through authenticated APIs with tenant and employee scope checks. Search and pagination run server-side. Usage totals reflect accessible files; no fictional storage quota is displayed. PDF, PNG and JPEG files are limited to 10 MB and verified by their file signature.

Super Admin can configure storage under **TCW Cloud Drive** or **Settings → Cloud Drive**. The connection supports the default Cloudflare R2 account endpoint and bucket-scoped S3-compatible credentials. R2 must first be enabled in the account dashboard. Keep the bucket private; do not enable public access. Create a bucket and an **Object Read & Write** token scoped to that bucket, then enter its access key ID and secret in the application form. Never send secrets in chat.

Configuration requires the existing `CONFIG_ENCRYPTION_KEY` (at least 32 characters). Credentials are encrypted with AES-256-GCM and domain-specific associated data; GET responses and audit records contain no credentials. Saving checks bucket access before committing and uses a revision lease to reject stale edits. Blank credential fields retain saved credentials. Existing `S3_*` server configuration is preserved as a fallback. Changing a configured storage location is blocked to avoid stranding existing files; credentials may be rotated for the same location. Storage migrations are a separate operation.

The connection check verifies bucket accessibility, not a completed production file upload. Tests use synthetic credentials and an injected object-store transport for upload/download. Live R2 activation and credentials are required before a real round-trip check is possible. No customer files or production secrets were read for development.

## Free Supabase storage

The existing free Supabase project can provide the private `tcw-cloud-drive` bucket. The project has a shared 1 GB free allowance; the application still limits each file to 10 MB and PDF/PNG/JPEG. Free-tier operation and bandwidth allowances also apply. This does not enable a paid plan or provide unlimited storage.

The backend supports `CLOUD_DRIVE_SUPABASE_URL`, `CLOUD_DRIVE_SUPABASE_BUCKET` and `CLOUD_DRIVE_SIGNING_KEY` (base64 PKCS#8 Ed25519 private key). Set these on the API service only. Do not commit the private signing key or use `NEXT_PUBLIC_` names. Existing encrypted manual storage connections retain priority; an explicit Supabase environment connection takes precedence over the legacy S3 environment fallback. Migration must be reviewed before switching a location containing files.

The `tcw-cloud-drive` Edge Function pins the matching **public** SPKI verification key. It performs its own request authentication, so gateway JWT verification is disabled for this one function. Each signature binds the method, bucket, full object key, timestamp, content hash and MIME type. Requests expire after 45 seconds. Only a validated `tenant UUID/object UUID` path is accepted. Uploads do not overwrite objects. The function accesses the private bucket using its built-in server-only service-role key; this key is never sent to the HR API or a browser. Downloads pass through the existing authenticated HR API and retain tenant/employee scope checks. No public bucket or browser storage policies are added.

Tests cover upload/download/delete, expired/forged/modified requests, private bucket checks and tenant isolation. Live verification uses a synthetic PDF and removes it through the Storage API. The public file URL and unsigned function request must fail. Preserve the API private signing key and the function's public key together when rotating credentials.
