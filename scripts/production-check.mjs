import {existsSync} from 'node:fs';

if(existsSync('.env') && typeof process.loadEnvFile==='function'){
  try{ process.loadEnvFile('.env'); }catch(e){ console.error(`Could not read .env: ${e.message}`); process.exit(1); }
}

const required=['DATABASE_URL','REDIS_URL','WEB_URL','ADMIN_URL','APP_ORIGINS','CONFIG_ENCRYPTION_KEY','SMTP_HOST','SMTP_FROM','S3_ENDPOINT','S3_BUCKET','S3_ACCESS_KEY','S3_SECRET_KEY','ADMIN_EMAIL','ADMIN_PASSWORD'];
const errors=[];
const value=(k)=>String(process.env[k]??'').trim();
const placeholder=/CHANGE_|CHANGE_ME|example\.com|yourdomain\.com|YOUR[-_]|YOUR\.|your-provider|your-s3|use-a-random/i;

for(const key of required){
  const v=value(key);
  if(!v)errors.push(`${key} is required.`);
  else if(placeholder.test(v))errors.push(`${key} still contains an example/placeholder value.`);
}
if(process.env.NODE_ENV!=='production')errors.push('NODE_ENV must be production.');
if(process.env.COOKIE_SECURE!=='true')errors.push('COOKIE_SECURE must be true.');
for(const key of ['WEB_URL','ADMIN_URL'])if(value(key)&&!value(key).startsWith('https://'))errors.push(`${key} must use HTTPS.`);
for(const origin of value('APP_ORIGINS').split(',').map(v=>v.trim()).filter(Boolean))if(!origin.startsWith('https://'))errors.push(`APP_ORIGINS contains a non-HTTPS origin: ${origin}`);
if(process.env.SEED_DEMO==='true')errors.push('SEED_DEMO must be false for production.');
if(value('ADMIN_PASSWORD').length<12)errors.push('ADMIN_PASSWORD must be a random password of at least 12 characters.');
if(value('ADMIN_PASSWORD')==='TCWAdmin@2026!'||value('ADMIN_EMAIL')==='admin@tcwhr.local')errors.push('Local QA Super Admin credentials must be replaced before production.');
if(value('CONFIG_ENCRYPTION_KEY').length<32)errors.push('CONFIG_ENCRYPTION_KEY should be at least 32 characters.');
if(process.env.PUBLIC_SIGNUP_ENABLED!=='true')errors.push('PUBLIC_SIGNUP_ENABLED is not true; self-service signup will be disabled.');
const smsProvider=value('SMS_PROVIDER').toUpperCase();
if(smsProvider==='MSG91'&&(!value('MSG91_AUTH_KEY')||!value('MSG91_TEMPLATE_ID')))errors.push('MSG91 SMS requires MSG91_AUTH_KEY and MSG91_TEMPLATE_ID.');
if(smsProvider==='TWILIO'&&(!value('TWILIO_ACCOUNT_SID')||!value('TWILIO_AUTH_TOKEN')||!value('TWILIO_FROM')))errors.push('Twilio SMS requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM.');
if(smsProvider==='WEBHOOK'&&!value('SMS_WEBHOOK_URL'))errors.push('SMS_PROVIDER=WEBHOOK requires SMS_WEBHOOK_URL.');
if(smsProvider&&!['MSG91','TWILIO','WEBHOOK'].includes(smsProvider))errors.push('SMS_PROVIDER must be MSG91, TWILIO or WEBHOOK when set.');
if(process.env.PAYROLL_PAYOUTS_ENABLED==='true'){
  if(value('PAYOUT_PROVIDER')!=='RAZORPAYX')errors.push('Live payroll payout currently requires PAYOUT_PROVIDER=RAZORPAYX.');
  for(const key of ['PAYOUT_COMPANY_CODE','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAYX_ACCOUNT_NUMBER'])if(!value(key))errors.push(`${key} is required when PAYROLL_PAYOUTS_ENABLED=true.`);
}
if(value('AI_API_KEY')&&(!value('AI_BASE_URL')||!value('AI_MODEL')))errors.push('AI_API_KEY also requires AI_BASE_URL and AI_MODEL.');

const webUrl=value('WEB_URL').replace(/\/$/,'');
const adminUrl=value('ADMIN_URL').replace(/\/$/,'');
const origins=value('APP_ORIGINS').split(',').map(v=>v.trim().replace(/\/$/,'')).filter(Boolean);
if(webUrl&&adminUrl&&webUrl===adminUrl)errors.push('WEB_URL and ADMIN_URL must be different; Super Admin is hosted separately from the HR portal.');
if(webUrl&&!origins.includes(webUrl))errors.push('APP_ORIGINS must include WEB_URL.');
if(adminUrl&&!origins.includes(adminUrl))errors.push('APP_ORIGINS must include ADMIN_URL.');

if(errors.length){
  console.error('\nTCW HR production check FAILED:\n');
  for(const e of errors)console.error(' - '+e);
  console.error('\nReplace the example values in .env before launch.\n');
  process.exit(1);
}
console.log('TCW HR production check passed. Environment is ready for build/deploy checks.');
