TCW HR Software — Animated Marketing Website v1.3.0
====================================================

FILES
- index.html
- styles.css
- app.js
- config.js

1. Open config.js and replace:
   https://hr.yourdomain.com
   https://admin.yourdomain.com
   support@yourdomain.com

2. When signed native releases exist, set:
   androidApk: "https://yourdomain.com/releases/TCW-HR-Software.apk"
   windowsExe: "https://yourdomain.com/releases/TCW-HR-Software-Setup.exe"

   If those values are empty, Android/Windows buttons cleanly open the live HR web app instead of showing a negative/unavailable state.

3. Upload these files to any static host (Nginx, Cloudflare Pages, Netlify, Vercel static, S3/CloudFront, etc.).

4. Recommended public URLs:
   Main marketing site: https://www.yourdomain.com
   HR portal:           https://hr.yourdomain.com
   Super Admin:         https://admin.yourdomain.com

5. This site is responsive and includes reduced-motion accessibility.

Dashboard previews are product UI mockups designed to demonstrate the current TCW HR workflow; they do not expose customer data.
