# TCW HR Software Android wrapper

This is a minimal Android WebView wrapper for the hosted HR portal. It does not store biometric face/fingerprint templates; biometric recognition stays on the approved attendance device.

## Build
1. Install Android Studio / Android SDK 35 and JDK 21.
2. Open this `native/android` folder in Android Studio.
3. Set the portal URL as Gradle property `TCW_APP_URL`, for example:
   `https://hr.yourdomain.com`
4. Build a debug APK for testing, then configure a signing key and build a signed release APK for client distribution.

Debug builds allow cleartext HTTP so LAN/USB development URLs can be tested. Release builds disable cleartext traffic and should use HTTPS.
