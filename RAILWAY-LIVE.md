# TCW HR Software v1.3.0 — Railway production deployment

TCW HR can run on one public Railway application service plus Railway PostgreSQL and Redis. The application service starts HR Web (3000), Super Admin (3001), API (4000) and Worker, then exposes them through one Railway public port with hostname routing.

## Production domains
Keep the existing company website on `techcyberwarrior.in` unchanged.

- HR portal: `hr.techcyberwarrior.in`
- Super Admin: `admin.techcyberwarrior.in`

Add both custom domains to the same Railway application service. The gateway routes `admin.techcyberwarrior.in` to the isolated Super Admin frontend and the HR hostname to the company portal. `/api/*`, `/socket.io/*` and `/iclock/*` go directly to the API so attendance devices and API calls do not depend on a frontend proxy.

## Railway setup
1. Put this source in a **private** Git repository and create a Railway project from it.
2. Add Railway PostgreSQL and Redis services to that project.
3. In the application service, add the variables from `.env.railway.example`. Use Railway variable references for `DATABASE_URL` and `REDIS_URL`.
4. Deploy the application service. `railway.toml` runs the production build. `npm run railway:boot` automatically runs Prisma migrations, production seed/bootstrap, and then starts the complete application gateway.
5. Add `hr.techcyberwarrior.in` and `admin.techcyberwarrior.in` as custom domains on the same application service. Add only the DNS records Railway shows at the DNS provider that manages `techcyberwarrior.in`.
6. Verify `https://hr.techcyberwarrior.in/api/health`, then test trial signup, HR login/dashboard, separate Super Admin login and Trial Follow-up.

## Production integrations
- **SMS:** MSG91, Twilio or a generic webhook. The software sends Company Code, short User ID and a one-time 8-character temporary password, then forces password change at first sign-in. Delivery payloads are redacted after delivery/final failure.
- **Email:** SMTP account for onboarding/reset/notifications.
- **Files:** S3-compatible object storage for persistent employee documents.
- **AI:** OpenAI-compatible provider key. When `AI_BASE_URL`, `AI_MODEL` and `AI_API_KEY` are configured, the assistant is enabled automatically; alternatively configure it in Super Admin → System health.
- **Salary payout:** RazorpayX business payout account. Keep `PAYROLL_PAYOUTS_ENABLED=false` until provider KYC, API access, source account and operational approval are ready. Salary payment is only available after Attendance lock → Payroll calculate → Review → Approve → Lock.
- **Attendance:** BioMax/ZKTeco PUSH/ADMS can call `/iclock/*` directly. Other devices can use vendor middleware or a bridge to POST normalized punches to `/api/biometric/push` using the per-device serial and secret.

## Generic attendance webhook
For non-ZKTeco devices, send a JSON array (or `{ "punches": [...] }`) to:

`POST https://hr.techcyberwarrior.in/api/biometric/push`

Headers:
- `x-tcw-device-serial: <registered device serial>`
- `x-tcw-device-key: <one-time device push secret>`

Each event contains `eventId`, `userId`, ISO `timestamp`, optional `type` (`IN`, `OUT`, `AUTO`) and optional verification type. Map the device user ID to an employee in Attendance Devices first (or enable employee-code auto mapping).

## Security rules
Do not send bank passwords, OTPs, card PINs, personal Railway passwords or DNS-account passwords through chat or source code. Put provider API secrets only in Railway Variables. Use provider KYC/API credentials for salary payout, and keep the payout feature disabled until production verification is complete.
