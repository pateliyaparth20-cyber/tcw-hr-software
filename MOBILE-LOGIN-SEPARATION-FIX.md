# TCW HR v1.2.9 - Mobile Login + Portal Separation Fix

## Fixed
- HR/company portal is TENANT-only. `/admin-login`, `/admin-forgot-password`, `/admin-reset-password` and `/super-admin` are no longer exposed by the HR app.
- Super Admin remains a separate app: local `http://localhost:3001` (or `http://<PC-IP>:3001` from a phone).
- Local phone login accepts trusted private LAN origins automatically in non-production mode (10.x, 172.16-31.x, 192.168.x on ports 3000/3001). Production stays strict.
- Development session token now has a localStorage fallback so mobile browser reload/navigation does not lose the local test session. Production does not receive this token.
- Auth requests fail fast instead of waiting up to 60 seconds. On local/LAN, client auth/me timeout is 4.5s and the local auth proxy timeout is 10s; hosted production gets longer cold-start-safe auth timeouts.
- Removed the redundant auth/me round-trip immediately after login.
- Workspace loader now uses the TCW logo and redirects faster on failed sessions.
- Browser favicon changed from the old P mark to the TCW logo.
- Mobile login inputs/checkboxes/touch targets received additional small-screen polish.

## Local test
```powershell
npm ci
npm run demo
```
The terminal prints the PC and detected phone/LAN URLs automatically. Keep the terminal running and use the same Wi-Fi on PC and phone.

HR: `http://<PC-IP>:3000/login`
Super Admin: `http://<PC-IP>:3001/login`

If Windows Firewall blocks access, allow TCP ports 3000, 3001 and 4000.
