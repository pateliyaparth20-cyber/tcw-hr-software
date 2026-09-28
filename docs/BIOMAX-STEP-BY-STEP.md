# TCW HR Software v0.5 — BioMax Attendance Step 1

This release adds the secure biometric attendance foundation for multi-company use.

## What works in Step 1

- Company-wise biometric device registration.
- BioMax vendor option with `SpeedFace 5SE Lite` preset text.
- Cloud Push, LAN Pull, Wi-Fi/LAN and Middleware connection profiles.
- One-time secure push key generated per device. Only its SHA-256 hash is stored.
- Employee ↔ device enrolment/user ID mapping.
- Normalized BioMax gateway punch ingestion.
- Face / fingerprint / card / PIN verification labels.
- Duplicate event protection using a per-device source ID.
- Automatic IN/OUT alternation when the gateway sends `AUTO`.
- Shift-based attendance calculation, late minutes and overtime through the existing attendance engine.
- Unmapped punches and processing failures appear in the device sync log.
- Device Online / Awaiting Connection / Degraded state and last-seen timestamp.
- LAN/Wi-Fi TCP reachability test.
- Existing embedded `.local-data` databases are upgraded for the new biometric tables on startup.

## Important boundary

The public endpoint in v0.5 is a **TCW normalized gateway contract**. It does not pretend to understand an undocumented native BioMax SpeedFace packet. To connect a SpeedFace 5SE Lite directly, TCW needs a verified sample from the BioMax Push SDK/API (URL path, authentication method, request content type and attendance payload fields). Once supplied, the native parser can be added in `packages/device-connectors/biomax` without changing the HR attendance model.

TCW intentionally does not store face images or biometric templates in this Step 1 flow. Face/fingerprint matching remains on the attendance device; TCW receives the employee/device user ID, time and verification type.

## HR setup

1. Sign in to the company HR portal.
2. Create at least one Shift.
3. Open **Attendance → Devices**.
4. Add a device:
   - Vendor: `BIOMAX`
   - Model: `SpeedFace 5SE Lite`
   - Serial / Device ID: the unique device serial
   - Connection mode: `CLOUD_PUSH` for cloud/gateway operation
   - For LAN/Wi-Fi testing, add the local IP and port.
5. Save the one-time Push Key shown after creation.
6. Click **Map employees** and map every BioMax enrolment/user ID to the correct TCW employee.
7. Configure the gateway to POST normalized punches to `/api/biometric/biomax/push`.
8. Use **Test** and **Sync log** to verify connectivity and mapping errors.

## Normalized push contract

Headers:

```text
X-TCW-Device-Serial: <device serial>
X-TCW-Device-Key: <one-time push key>
Content-Type: application/json
```

Body:

```json
{
  "punches": [
    {
      "eventId": "unique-event-123",
      "userId": "101",
      "timestamp": "2026-09-26T09:15:00.000Z",
      "type": "AUTO",
      "verification": "FACE"
    }
  ]
}
```

`type` can be `IN`, `OUT` or `AUTO`. `verification` can be `FACE`, `FINGERPRINT`, `CARD`, `PIN` or `UNKNOWN`.

## PowerShell gateway test

Replace the values with the secret shown by TCW after device creation:

```powershell
$headers = @{
  "X-TCW-Device-Serial" = "YOUR-SERIAL"
  "X-TCW-Device-Key" = "YOUR-PUSH-KEY"
}
$body = @{
  punches = @(
    @{
      eventId = "test-001"
      userId = "101"
      timestamp = (Get-Date).ToUniversalTime().ToString("o")
      type = "AUTO"
      verification = "FACE"
    }
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "http://localhost:4000/api/biometric/biomax/push" -Method Post -Headers $headers -ContentType "application/json" -Body $body
```

The `userId` must already be mapped to an employee. A shift must exist before the first punch can be processed.

## Step 2 — native BioMax connector

Provide one of these from the real SpeedFace 5SE Lite environment:

- BioMax Push SDK/API PDF or ZIP, or
- a vendor-provided sample integration, or
- one captured attendance callback/request with secrets removed, plus the device's Cloud/ADMS server settings screen.

Step 2 will map the native packet to the normalized contract, add any required handshake/registration endpoints, and validate online/offline resync against the real device.
