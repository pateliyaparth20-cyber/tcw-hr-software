# TCW HR Software v0.8 — AI and UI polish

## Login experience
- Desktop login uses a fixed 100dvh layout and does not require document scrolling at normal laptop/desktop heights.
- The TCW emblem is contained inside a light brand stage instead of floating as an oversized image.
- Shorter viewport rules compact logo, heading, form gaps and footer while preserving all login controls.
- Mobile keeps a single-column login experience.

## Dashboard
- Premium light surfaces and KPI treatment.
- Tenant users with AI permission see an on-demand AI Morning Brief card.
- AI is only called when the user presses Generate/Refresh, avoiding background API usage.

## AI configuration
Super Admin -> System health -> AI provider configuration:
- OpenAI-compatible HTTPS base URL
- Provider model name
- API key
- Enable/disable
- Test connection

The API key is AES-256-GCM encrypted before database storage. The key is never returned to the browser; only a masked last-four-character hint is exposed. `CONFIG_ENCRYPTION_KEY` is generated/added by `npm run setup` and must be protected like any other production secret.

Existing `AI_BASE_URL`, `AI_MODEL`, and `AI_API_KEY` environment configuration remains supported as a fallback when no database AI configuration row exists.

## AI data boundary
The AI provider receives only a bounded aggregate fact bundle assembled by the server for the signed-in tenant. It does not receive a database connection, arbitrary SQL, credentials, biometric templates, bank-account fields, or unrestricted employee records.
