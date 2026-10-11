# Render deployment

Use the root `render.yaml` in the **HR SOFTWARE** Render workspace. The older `deploy/providers/render.yaml` is a backend-only example.

The root Blueprint provisions an API, HR portal, employee portal, Super Admin, automation worker, PostgreSQL and Key Value in Singapore. Next.js services bind to Render's assigned `$PORT`. Their API proxy and Socket.IO rewrites use the API's HTTPS Render URL during build and runtime. The worker shares encryption and connection settings with the API.

## Before Apply

- Review pricing: web services, PostgreSQL and Key Value use free plans; the separate worker uses Starter because Render has no free background worker. Do not Apply until this recurring cost is approved.
- Free services are for evaluation: web services sleep after inactivity and free PostgreSQL expires after 30 days. Upgrade before live company payroll use; sleep can delay API requests and expire temporary data.
- Set `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD` securely in Render. Set `WEB_URL`, `ADMIN_URL` and `APP_ORIGINS` to the actual portal URLs, including the employee portal in origins.
- For an existing Railway database, export and restore PostgreSQL first and preserve the original `CONFIG_ENCRYPTION_KEY`. Generating a replacement key will not decrypt existing bank settings and face profiles. Never put credentials or database backups in Git.
- Configure SMTP and S3 credentials for email and stored files. These integrations need their existing provider configuration.
- Keep existing domain DNS until database restoration and health checks pass. An empty Render database does not contain the Railway company's employees or payroll.

## Deployment

Connect this repository to a new Blueprint in the existing HR SOFTWARE workspace, use `main` and `render.yaml`, review resources, set the secret fields and Apply. API startup applies migrations and seeds the administrator with demo data disabled. The worker applies migrations before processing jobs.

Verify API `/api/health` returns 200, all deployments are live, and portal login, employee attendance and administrator login work. Check worker logs and queue connectivity before enabling scheduled payouts. Attach and verify the custom domains only after these checks.

Blueprint changes alone do not activate bank transfers: payment provider credentials, company bank authorization and payment configuration remain necessary.
