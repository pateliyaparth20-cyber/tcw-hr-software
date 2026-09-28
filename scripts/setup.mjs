import {existsSync,writeFileSync,readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
const secret=()=>randomBytes(24).toString('base64url');
const encryptionSecret=()=>randomBytes(32).toString('base64url');
if(existsSync('.env')){
  const current=readFileSync('.env','utf8');const additions=[];
  if(!/^CONFIG_ENCRYPTION_KEY=/m.test(current))additions.push(`CONFIG_ENCRYPTION_KEY=${encryptionSecret()}`);
  if(!/^TRIAL_DAYS=/m.test(current))additions.push('TRIAL_DAYS=3');
  if(!/^LOCAL_TEST_MODE=/m.test(current))additions.push('LOCAL_TEST_MODE=true');
  if(!/^PUBLIC_SIGNUP_ENABLED=/m.test(current))additions.push('PUBLIC_SIGNUP_ENABLED=true');
  if(!/^AI_BASE_URL=/m.test(current))additions.push('AI_BASE_URL=');
  if(!/^AI_MODEL=/m.test(current))additions.push('AI_MODEL=');
  if(!/^AI_API_KEY=/m.test(current))additions.push('AI_API_KEY=');
  if(!/^NEXT_PUBLIC_ANDROID_APK_URL=/m.test(current))additions.push('NEXT_PUBLIC_ANDROID_APK_URL=');
  if(!/^NEXT_PUBLIC_WINDOWS_INSTALLER_URL=/m.test(current))additions.push('NEXT_PUBLIC_WINDOWS_INSTALLER_URL=');
  let normalized=current.replace(/^API_INTERNAL_URL=http:\/\/localhost:4000$/m,'API_INTERNAL_URL=http://127.0.0.1:4000').replace(/^COOKIE_SECURE=true$/m,'COOKIE_SECURE=false');
  if(additions.length)normalized=normalized.replace(/\s*$/,'')+'\n\n# TCW HR local launch configuration\n'+additions.join('\n')+'\n';
  if(normalized!==current){writeFileSync('.env',normalized,{encoding:'utf8',mode:0o600});console.log('.env was preserved and upgraded for reliable local/mobile login.');}
  else console.log('.env already exists. It was preserved.');
  process.exit(0);
}
const admin=secret(),owner=secret(),db=secret(),s3=secret(),configKey=encryptionSecret();
const env=`# Generated local development configuration. Never commit this file.
DATABASE_URL=postgresql://peopleos:${db}@localhost:5432/peopleos?schema=public
POSTGRES_USER=peopleos
POSTGRES_PASSWORD=${db}
POSTGRES_DB=peopleos
REDIS_URL=redis://localhost:6379
API_PORT=4000
API_BIND_HOST=0.0.0.0
API_INTERNAL_URL=http://127.0.0.1:4000
WEB_URL=http://localhost:3000
ADMIN_URL=http://localhost:3001
APP_ORIGINS=http://localhost:3000,http://localhost:3001
COOKIE_SECURE=false
LOCAL_TEST_MODE=true
AUTO_SUSPEND_OVERDUE=true
OVERDUE_GRACE_DAYS=3
TRIAL_DAYS=3
PUBLIC_SIGNUP_ENABLED=true
CONFIG_ENCRYPTION_KEY=${configKey}
ADMIN_EMAIL=admin@techcyberwarrior.local
ADMIN_PASSWORD=${admin}
OWNER_EMAIL=owner@peopleos.local
OWNER_PASSWORD=${owner}
DEMO_COMPANY_CODE=TCW-DEMO
SEED_DEMO=false
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_FROM=TCW HR Software <noreply@peopleos.local>
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=peopleos
S3_ACCESS_KEY=peopleos-local
S3_SECRET_KEY=${s3}
MINIO_ROOT_USER=peopleos-local
MINIO_ROOT_PASSWORD=${s3}
AI_BASE_URL=
AI_MODEL=
AI_API_KEY=
NEXT_PUBLIC_ANDROID_APK_URL=
NEXT_PUBLIC_WINDOWS_INSTALLER_URL=
BIOMETRIC_PUBLIC_URL=
BIOMAX_AUTO_MAP_EMPLOYEE_CODE=true
BIOMAX_ENFORCE_SOURCE_IP=false
`;
writeFileSync('.env',env,{mode:0o600});
console.log('Created .env with random local credentials.');
console.log('SaaS admin: admin@techcyberwarrior.local');console.log('Admin password:',admin);
console.log('HR owner: owner@peopleos.local | company TCW-DEMO');console.log('Owner password:',owner);
console.log('Next: npm run demo');
