# TCW Android apps

The Android project now builds two separate APK flavours from the same secure portal codebase:

- **TCW HR Software** — package `com.tcw.hrsoftware`, for HR/Admin users.
- **TCW Employee** — package `com.tcw.hrsoftware.employee`, for Employee Self Service and Face Scan attendance.

Both APKs can be installed side-by-side on the same Android phone. The Employee APK identifies itself to the portal and only accepts Employee-role accounts.

## URLs

Set Gradle properties as needed:

`TCW_APP_URL=https://hr.yourdomain.com`

`TCW_EMPLOYEE_APP_URL=https://employee.yourdomain.com`

The Employee URL defaults to `https://employee.techcyberwarrior.in`; the HR URL defaults to `https://hr.techcyberwarrior.in`. Both use the same tenant/backend.

## Build

Requirements: Android SDK 35, JDK 21, Gradle 8.9.

HR/Admin debug APK:

`gradle -p native/android :app:assembleAdminDebug`

Employee debug APK:

`gradle -p native/android :app:assembleEmployeeDebug`

Release variants:

`gradle -p native/android :app:assembleAdminRelease :app:assembleEmployeeRelease`

Configure a signing key before distributing production release APKs.

The Employee APK requests Android camera permission only when the web Face Scan flow asks for camera access. Face Scan attendance is linked to the **TCW Employee Mobile App** source under Devices / Attendance sources.

## Location permission (v1.3.3)

Location is requested only when the employee consents and starts field work or Check IN. Android 12+ receives a combined fine/coarse permission request; field duty requires the **Precise** option. Approximate-only or denied access cannot open the attendance camera or create a field Check IN.

If phone Location is off, the app offers the phone Location settings. If permission is denied or restricted, it offers App info, where the user can select Permissions → Location → Allow only while using the app and enable Use precise location. After returning, retry Check IN; a permission change never submits attendance automatically.

An older installed APK must be replaced to pick up native permission changes. A Railway or website update cannot change Android manifest permissions. Versions before v1.3.2 did not declare location permissions.

Tracking remains foreground-only. The app does not lock phone GPS, request background location, or automatically grant consent. Field Check OUT remains available if GPS is off.
