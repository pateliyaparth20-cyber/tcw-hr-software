# TCW HR Software v1.2.9 — Local + Phone Login Root-Cause Fix

This package includes the September 2026 local/mobile authentication fixes.

## What changed

- Local Next.js API proxy now uses `127.0.0.1:4000` instead of `localhost:4000` to avoid Windows IPv6 localhost (`::1`) connection mismatches.
- `npm run demo` now runs the known-good local login repair + login doctor before starting API, HR and Super Admin.
- Local/LAN session token storage is guarded so Android browsers/WebViews cannot break login if one browser storage API fails.
- A verified session snapshot is saved after login/signup and used immediately on dashboard navigation. `/auth/me` verifies it in the background instead of blocking the whole dashboard behind a spinner.
- The workspace loader is no longer endless. If the API is unavailable it shows Try again / Sign in actions with a clear message.
- Fresh local browsers with no session go directly to the login screen instead of spinning on `/dashboard`.
- Trial signup no longer auto-redirects after ~0.9 seconds. The success screen stays visible and shows Company Code, Login ID and email, with Copy login details and Open dashboard buttons.
- HR and Super Admin remain separate: HR on port 3000, Super Admin on port 3001. HR does not expose Super Admin login routes.
- LAN setup forces `COOKIE_SECURE=false`, `LOCAL_TEST_MODE=true` and internal API `127.0.0.1:4000` for local HTTP testing.

## Recommended local start

From the project folder:

```powershell
npm ci
npm run configure:lan
npm run demo
```

`npm run demo` now repairs local login credentials and validates the local database before the servers start.

## URLs

PC HR:
- http://localhost:3000/login

PC Super Admin:
- http://localhost:3001/login

Phone HR:
- use the `Phone HR:` URL printed by the terminal, for example http://192.168.1.5:3000/login

Phone Super Admin:
- use the `Phone Super Admin:` URL printed by the terminal, for example http://192.168.1.5:3001/login

Phone and PC must be on the same Wi-Fi/LAN.

## Stable local test credentials

`npm run demo` runs the local login repair. It prints the current credentials in the terminal. The repair script uses these local-only defaults:

HR company code: `TCW-DEMO`
HR login ID: `TCW-DEMO-ADMIN`
HR password: `TCWOwner@2026!`

Super Admin login ID: `TCW-ADMIN`
Super Admin password: `TCWAdmin@2026!`

These are for LOCAL TESTING ONLY. Do not use them in production.

## Trial signup phone test

1. Open the phone HR URL and add `/signup`.
2. Create the trial.
3. Keep the success screen open and save the generated Company Code and Login ID.
4. Tap `Open dashboard`.
5. The dashboard should open immediately from the server-issued session and verify in the background.

## If the phone cannot reach the PC

Run PowerShell as Administrator:

```powershell
New-NetFirewallRule -DisplayName "TCW HR Web" -Direction Inbound -Protocol TCP -LocalPort 3000,3001,4000 -Action Allow
```

Then restart `npm run demo` and use the Phone HR URL printed in the terminal.

## Verification performed in this package

- 62 TypeScript/TSX files parsed with 0 syntax errors.
- JSON files parsed successfully.
- CSS brace validation passed.
- Static assertions for HR/Super Admin route separation, session snapshot flow, non-blocking loader, fixed `demo` startup and persistent trial credential screen passed.

Full `npm ci` / browser runtime could not be completed inside the packaging sandbox because dependency installation timed out. Run `npm ci` once on your PC before local testing.
