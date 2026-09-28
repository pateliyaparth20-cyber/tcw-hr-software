# TCW HR Software v1.2.9 — Phone-first stability update

## What changed

- Local/LAN sign-in accepts TCW HR on ports 3000 and 3001 in `LOCAL_TEST_MODE`, including private IPv4, IPv6 and local host names.
- Login/session requests retry once on brief local network/API failures.
- Background API 401 responses no longer hard-refresh the entire browser page. The app now clears the expired session and uses a client-side sign-in redirect.
- React Query no longer refetches every screen merely because the phone browser regains focus.
- The authenticated local session has a persistent LAN-safe fallback and session snapshot.
- Next.js dev file watching ignores `.local-data`, preventing database writes from contributing to development refresh noise.
- `npm run demo` now runs the stable built frontend (`next start`) rather than hot-reload development mode.
- The trial-created screen remains visible with Company Code, Login ID and Copy/Open Dashboard actions.
- HR and Super Admin remain separate: HR is port 3000, Super Admin is port 3001.
- Mobile typography, touch targets, tables, forms, modals and bottom navigation were normalized for phone use.
- The HR dashboard was redesigned as a responsive digital command center with live clock, KPI signals, system health and workforce pulse.

## Recommended phone test

```powershell
npm ci
npm run configure:lan
npm run demo
```

Open the `Phone HR` URL printed by the terminal, for example:

`http://192.168.1.5:3000/login`

Free trial:

`http://192.168.1.5:3000/signup`

Super Admin (separate app):

`http://192.168.1.5:3001/login`

PC and phone must be on the same Wi-Fi/LAN. Keep the terminal open while testing.

If Windows Firewall blocks the phone, run PowerShell as Administrator once:

```powershell
New-NetFirewallRule -DisplayName "TCW HR Local" -Direction Inbound -Protocol TCP -LocalPort 3000,3001,4000 -Action Allow
```
