# TCW HR Software — Host Anywhere

This package is not tied to Netlify. It can run on any provider that gives you either:

1. Docker / Docker Compose, or
2. Node.js 22.12+ with PostgreSQL and Redis.

The application has four runtime processes: HR Web (3000), Super Admin (3001), API (4000 internal), and Worker. PostgreSQL stores business data and Redis powers queues/background work.

## Recommended: Docker Compose

Copy `.env.hosting.example` to `.env`, replace every `CHANGE_ME` / example domain, then run:

```bash
npm run production:secrets   # optional helper for random secrets
cp .env.hosting.example .env # Linux/macOS; on Windows copy the file in Explorer
# edit .env
npm run host:check
docker compose --env-file .env -f docker-compose.production.yml up -d --build
```

Without a domain/reverse proxy:

- HR: `http://SERVER-IP:3000`
- Super Admin: `http://SERVER-IP:3001`

For production customer data, use HTTPS. If DNS already points `hr.example.com` and `admin.example.com` to the server, set `HR_DOMAIN` / `ADMIN_DOMAIN` and run:

```bash
docker compose --env-file .env -f docker-compose.production.yml --profile proxy up -d --build
```

The included Caddy service automatically requests and renews TLS certificates. Open only ports 80 and 443 publicly. You can instead use your host's reverse proxy or the included `nginx.example.conf`.

## Plain Node.js hosting (no Docker)

You need external PostgreSQL, Redis, SMTP and S3-compatible storage. Set `DATABASE_URL`, `REDIS_URL`, `WEB_URL`, `ADMIN_URL`, `APP_ORIGINS`, `API_INTERNAL_URL=http://127.0.0.1:4000`, and the remaining values in `.env`.

Then:

```bash
npm ci
npm run host:check
npm run db:migrate
npm run db:seed
npm run build
npm run start:all
```

Your hosting/process manager should keep `npm run start:all` alive and restart it after a server reboot. On platforms that expect one service per process, deploy the same repository four times with these start commands:

```text
API          npm run start:api
HR Web       npm run start:web
Super Admin  npm run start:admin
Worker       npm run start:worker
```

For HR Web and Super Admin, set `API_INTERNAL_URL` to the private/internal API URL supplied by the provider. For the API and Worker, set the same `DATABASE_URL` and `REDIS_URL`.

## Compatible hosting patterns

- VPS / dedicated server: Docker Compose is the simplest option.
- Render / Railway / Fly.io / DigitalOcean App Platform: create API, Web, Admin and Worker services from the same source; use managed PostgreSQL/Redis if desired.
- AWS / Azure / Google Cloud: run the Docker image in a container service or VM and attach managed PostgreSQL/Redis.
- cPanel/Plesk Node hosting: use the plain Node.js method only if the provider supports persistent Node processes, PostgreSQL and Redis. Typical static/shared hosting without Node is not sufficient.

## Required production rules

- Use HTTPS and `COOKIE_SECURE=true`.
- Keep HR and Super Admin on different origins, e.g. `hr.example.com` and `admin.example.com`.
- `APP_ORIGINS` must contain both exact HTTPS origins.
- Do not expose `.env` or commit secrets to Git.
- Use a real SMTP provider and S3-compatible storage for production.
- Back up PostgreSQL and object storage.
- Set `SEED_DEMO=false` before real customer use.

## Health / smoke test

After deployment:

1. Open `https://YOUR-HR-DOMAIN/api/health`.
2. Create a test free trial at `/signup`.
3. Log in to the HR portal and open the dashboard on desktop and phone.
4. Log in separately to the Super Admin portal and confirm the trial appears in `/trials`.
5. Test leave, attendance, employee, payroll, reports, email reset and document upload/download.

The HR and Super Admin applications proxy `/api/*` to the API server, so browsers do not need direct access to port 4000.
