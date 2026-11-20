# Transactional email on the free API service

Set `EMAIL_OUTBOX_ENABLED=true` only when a separate BullMQ worker is not running.
The API then drains EMAIL outbox records every ten seconds. It requires
`RESEND_API_KEY` (a sending-only key scoped to the verified sender domain),
`SMTP_FROM`, `WEB_URL`, `ADMIN_URL`, and `EMPLOYEE_URL`. Keep credentials only in
runtime environment variables. Render's free instance must wake for email work;
the signup/reset HTTP request wakes the same API instance.

Use URLs that are currently reachable for reset and invitation links. Switch to
the custom subdomains only after their DNS and TLS certificates are active.

Delivery uses a stable Resend idempotency key per outbox row, database advisory
transaction locks to serialize API replicas, and up to five attempts. Expired or
invalidated password resets are not sent. Records older than 23 hours are not
retried beyond Resend's idempotency window. Delivered reset links and temporary
passwords are redacted from the outbox. Failures never mark a message as sent.

Existing user passwords are preserved. The platform administrator can request a
one-use, ten-minute reset email from `/admin-forgot-password`. New user and
employee invitation emails use the same outbox delivery path.

Verify with `node --import tsx --test tests/unit/email-outbox.test.ts` and
`npx tsc -p apps/api/tsconfig.build.json --noEmit`. After deployment, request a
reset for the real administrator and confirm the email provider delivery status.
