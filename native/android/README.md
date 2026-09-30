# TCW Android apps

The Android project now builds two separate APK flavours from the same secure portal codebase:

- **TCW HR Software** — package `com.tcw.hrsoftware`, for HR/Admin users.
- **TCW Employee** — package `com.tcw.hrsoftware.employee`, for Employee Self Service and Face Scan attendance.

Both APKs can be installed side-by-side on the same Android phone. The Employee APK identifies itself to the portal and only accepts Employee-role accounts.

## URLs

Set Gradle properties as needed:

`TCW_APP_URL=https://hr.yourdomain.com`

`TCW_EMPLOYEE_APP_URL=https://hr.yourdomain.com`

The Employee URL defaults to the HR URL because both apps use the same tenant/backend and role-based portal.

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
