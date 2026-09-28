# TCW HR Software — Universal hosting ready

TCW HR is now provider-independent. Use `HOST-ANYWHERE.md` for the deployment guide.

Recommended production method: Docker Compose with `docker-compose.production.yml`. It runs HR Web, separate Super Admin, API, Worker, PostgreSQL and Redis. Optional Caddy gives HTTPS on your own HR/Admin domains.

This package does not require Netlify. Provider-specific examples, if present under `deploy/providers/`, are optional only.
