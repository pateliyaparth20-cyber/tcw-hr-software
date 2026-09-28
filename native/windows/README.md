# TCW HR Software Windows wrapper

Windows applications use EXE/MSI installers, not APK files. This folder builds an Electron desktop wrapper for the hosted HR portal.

## Build on Windows
1. Install current Node.js.
2. Open PowerShell in `native/windows`.
3. Run `npm install`.
4. Set the production portal URL for the build/run environment: `$env:TCW_APP_URL='https://hr.yourdomain.com'`.
5. Test with `npm start`.
6. Build the installer with `npm run dist`.

The installer is written to the `dist` folder. Code-sign the production EXE before public distribution.
