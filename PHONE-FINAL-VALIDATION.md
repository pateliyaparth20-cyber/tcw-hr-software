# TCW HR Software v1.2.9 — Phone Final Validation

## Phone-first fixes

- HR sign-in, trial signup and dashboard transitions use client-side navigation instead of a full document reload.
- Local/LAN session fallback supports private IPv4, localhost, Windows host names and mDNS names on TCW ports 3000/3001.
- Brief local API failures on sign-in/signup/session verification are retried once.
- Background 401 responses no longer call a browser hard refresh; they clear the expired session and route to the correct login screen.
- Mobile window-focus no longer refetches every React Query screen automatically.
- Local session snapshot/token fallback prevents mobile tab restoration from losing the just-created session.
- Default `npm run demo` uses built Next.js frontends with `next start`, not HMR development mode.
- `.local-data` is excluded from development watch noise.
- Pull/overscroll behavior and mobile viewport sizing are constrained for a steadier app-shell experience.
- Form controls are at least 16px on phones to avoid browser input zoom; primary touch targets are approximately 44–48px.
- Tables, dialogs, tabs, toolbar actions and bottom navigation are phone-responsive.
- HR dashboard is a responsive digital command center with live clock, KPI cards, workforce pulse, operational health and action panels.
- Trial signup keeps Company Code/Login ID visible until the user explicitly opens the dashboard.
- HR and Super Admin remain separate applications: HR `:3000`, Super Admin `:3001`.

## Static validation performed

- TypeScript/TSX syntax parse: 60 files, 0 syntax errors.
- JSON parse: 0 errors.
- Next.js/setup JavaScript config syntax: clean.
- CSS brace balance: clean.
- No forced hard reload remains in the normal login -> dashboard or signup -> dashboard flow.

## Runtime note

The validation environment could not complete `npm ci` because package-registry access timed out. Run the final runtime smoke test on the target Windows PC with the commands below.

```powershell
npm ci
npm run configure:lan
npm run demo
```

Then test the terminal's printed Phone HR URL from a phone on the same Wi-Fi.
