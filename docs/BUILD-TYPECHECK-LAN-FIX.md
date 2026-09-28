# TCW HR v1.2.9 — Build / TypeScript / LAN startup fix

This patch addresses the Windows build failure reported during `npm run demo`.

## Fixed

- `packages/ui/portal.tsx`: normalized optional notification count before comparisons/rendering so Next.js TypeScript build does not fail with TS18048.
- Normalized optional employee search results before checking `.length`, preventing the same class of TypeScript error in the command search UI.
- `scripts/configure-mobile-lan.ps1`: if `.env` does not exist, the script now creates local configuration automatically instead of immediately failing.
- `npm run demo` / `phone:stable`: LAN configuration now runs automatically after setup, before login repair and frontend builds. This ensures phone origins and the detected PC LAN IP are actually written to `.env`.

## Recommended local startup

From a fresh extracted folder:

```powershell
npm ci
npm run demo
```

`npm run demo` now performs setup + LAN configuration + login repair + login doctor + production-style frontend build/start.

Do not run `npm audit fix --force` just to clear warnings; forced major dependency updates can break the application. Audit and upgrade dependencies deliberately.
