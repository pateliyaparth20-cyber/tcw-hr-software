# BioMax Step 2 — direct PUSH integration

## Scope

TCW HR Software v0.6.0 adds a direct attendance ingress for BioMax SpeedFace terminals using the common ZKTeco PUSH / ADMS request pattern documented by the vendor as a supported integration family. SpeedFace 5SE Lite is documented by BioMax with Wi-Fi, TCP/IP and Push Data support.

The implementation deliberately keeps biometric templates on the terminal. TCW ingests an employee/enrolment identifier, terminal timestamp, punch direction/status, verification code, terminal serial, and raw event metadata needed for audit/debugging.

## Native endpoints

- `GET /iclock/cdata?SN=<serial>&options=all` — registration/options handshake
- `POST /iclock/cdata?SN=<serial>&table=ATTLOG` — attendance logs
- `GET|POST /iclock/getrequest?SN=<serial>` — device poll/heartbeat
- `POST /iclock/devicecmd?SN=<serial>` — command acknowledgement
- `GET|POST /iclock/ping?SN=<serial>` — heartbeat compatibility

Non-attendance device tables are acknowledged and summarized in the sync log. Unknown attendance payloads return an error instead of silently accepting and losing punches.

## Mapping and tenancy

A native request is accepted only when its serial number matches exactly one pre-registered BioMax device. The company must be in `TRIAL` or `ACTIVE` status and its subscription/trial must not be expired.

If `BIOMAX_AUTO_MAP_EMPLOYEE_CODE=true`, TCW first looks for a manual `DeviceEmployeeMap`, then falls back to matching the device user ID to `Employee.employeeCode` case-insensitively. Once matched, TCW persists the mapping.

## Duplicate protection

A stable SHA-256-derived event key is generated from terminal serial + raw ATTLOG line. Replayed offline/backlog entries therefore resolve to the same `AttendancePunch.sourceId` and are ignored as duplicates.

## Time zone handling

Device timestamps are wall-clock values. The parser converts them using the timezone configured on the TCW attendance device before processing shift/attendance logic. Do not leave an incorrect timezone on the device record.

## Security

The TCW normalized JSON gateway remains available at `/api/biometric/biomax/push` and uses a generated per-device secret.

The native ZK PUSH family does not reliably expose a custom authorization-header mechanism across terminal firmware. Native mode therefore requires a pre-registered unique serial and should be deployed behind HTTPS plus network controls (firewall, VPN, allowlisting/private ingress where feasible). Optional strict source-IP checking can be enabled with `BIOMAX_ENFORCE_SOURCE_IP=true` when the terminal's source IP is stable and routable.

## Required environment settings

```env
API_BIND_HOST=0.0.0.0
BIOMETRIC_PUBLIC_URL=https://hr.example.com
BIOMAX_AUTO_MAP_EMPLOYEE_CODE=true
BIOMAX_ENFORCE_SOURCE_IP=false
```

For a same-LAN Windows demo, `BIOMETRIC_PUBLIC_URL` can temporarily be the PC LAN address and API port, for example `http://192.168.1.50:4000`.

## Operational verification

1. Create at least one Shift in TCW.
2. Register the device with the exact hardware serial and `NATIVE_PUSH` mode.
3. Configure the terminal to PUSH / T&A PUSH using the server address/port displayed by the TCW Setup dialog.
4. Verify Devices -> Test reports a recent connection.
5. Punch an enrolled user.
6. Verify Devices -> Live punches.
7. Verify Attendance daily processing.
8. Check Sync log for `UNMAPPED_PUNCH`, `PUNCH_FAILED`, or payload parse errors.

## Vendor references

- BioMax SpeedFace 5SE Lite: https://www.biomaxsecurity.com/ai/speedface5SE
- BioMax SDK / HR integration: https://new.biomaxsecurity.com/sdk
