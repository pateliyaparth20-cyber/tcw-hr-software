import 'dotenv/config';
import {Queue,Worker} from 'bullmq';
import nodemailer from 'nodemailer';
import {db} from '../../../packages/database';
import {PayrollPayments} from '../../api/src/payroll-payments';
import {syncCompanyAccess} from '../../api/src/billing';
import {monitorAttendanceDevices,normalizeRecentHrAssignedLeave,prepareScheduledPayroll,repairPrematureCurrentMonthPayrollLocks} from '../../api/src/automation';
import {refreshCurrentNoPunchAttendance} from '../../api/src/attendance-automation';
const salaryPayments=new PayrollPayments(db);
let salaryScanning=false;
async function scanSalaryPayments(){if(salaryScanning)return;salaryScanning=true;try{await salaryPayments.executeDue()}catch{console.error('Salary payment scan failed; retrying without resending existing claims.')}finally{salaryScanning=false}}
const salaryInterval=setInterval(scanSalaryPayments,10000);void scanSalaryPayments();
let salaryReconciling=false;
async function reconcileSalaryPayments(){if(salaryReconciling)return;salaryReconciling=true;try{await salaryPayments.reconcilePending()}catch{console.error('Salary reconciliation failed; retrying on the next scan.')}finally{salaryReconciling=false}}
const salaryReconciliationInterval=setInterval(reconcileSalaryPayments,60000);void reconcileSalaryPayments();


const url=new URL(process.env.REDIS_URL??'redis://localhost:6379');
const connection={host:url.hostname,port:Number(url.port)||6379,password:url.password||undefined,...(url.protocol==='rediss:'?{tls:{}}:{})};
const queue=new Queue('peopleos-outbox',{connection});
const transport=process.env.SMTP_HOST?nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT??1025),secure:process.env.SMTP_SECURE==='true',...(process.env.SMTP_USER?{auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}}:{})}):null;
function escapeHtml(value:any){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch] as string))}
function emailShell(title:string,content:string,cta?:{label:string,url:string}){
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"></head><body style="margin:0;background:#f3f7fb;font-family:Arial,Helvetica,sans-serif;color:#20364d"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f7fb;padding:24px 10px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden;box-shadow:0 16px 44px rgba(31,64,99,.10)"><tr><td style="padding:28px 28px 24px;background:linear-gradient(135deg,#0f63d5,#2c82ed);color:#fff"><div style="font-size:12px;font-weight:700;letter-spacing:.12em;opacity:.8">TECH CYBER WARRIOR</div><div style="font-size:24px;font-weight:800;margin-top:6px">TCW HR Software</div><div style="font-size:13px;opacity:.82;margin-top:4px">Secure HR workspace</div></td></tr><tr><td style="padding:30px 28px"><h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;color:#183b5c">${escapeHtml(title)}</h1>${content}${cta?`<div style="margin-top:24px"><a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#176ee0;color:#fff;text-decoration:none;font-weight:700;font-size:14px">${escapeHtml(cta.label)}</a></div>`:''}<div style="margin-top:28px;padding-top:18px;border-top:1px solid #edf1f5;color:#8795a5;font-size:12px;line-height:1.6">This email was sent by TCW HR Software. For security, never share temporary passwords or reset links with anyone.</div></td></tr></table></td></tr></table></body></html>`;
}
function buildEmailHtml(payload:any){
  if(payload.type==='TRIAL_CREDENTIALS'){
    const ends=payload.trialEndsAt?new Date(payload.trialEndsAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'';
    const content=`<p style="margin:0 0 18px;color:#60758a;font-size:14px;line-height:1.7">Hi ${escapeHtml(payload.ownerName||'there')}, your TCW HR Software workspace for <strong style="color:#284660">${escapeHtml(payload.company)}</strong> is ready.</p><div style="padding:16px;border:1px solid #dfe7f0;border-radius:14px;background:#f8fbff"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:8px 0;color:#7f8fa0;font-size:12px">Company Code</td><td align="right" style="padding:8px 0;font-weight:800;color:#203b56;font-size:14px">${escapeHtml(payload.companyCode)}</td></tr><tr><td style="padding:8px 0;color:#7f8fa0;font-size:12px;border-top:1px solid #e8eef5">User ID</td><td align="right" style="padding:8px 0;font-weight:800;color:#203b56;font-size:14px;border-top:1px solid #e8eef5">${escapeHtml(payload.loginId)}</td></tr><tr><td style="padding:8px 0;color:#7f8fa0;font-size:12px;border-top:1px solid #e8eef5">Temporary Password</td><td align="right" style="padding:8px 0;font-family:monospace;font-weight:800;color:#0f63d5;font-size:15px;border-top:1px solid #e8eef5">${escapeHtml(payload.tempPassword)}</td></tr></table></div><p style="margin:16px 0 0;color:#60758a;font-size:13px;line-height:1.65">Use the temporary password for your first sign-in. You will then be asked to create your own private password.${ends?` Your ${escapeHtml(payload.trialDays)}-day trial runs until <strong>${escapeHtml(ends)}</strong>.`:''}</p>`;
    return emailShell('Your HR workspace is ready',content,{label:'Open TCW HR Software',url:String(payload.loginUrl??process.env.WEB_URL??'https://hr.techcyberwarrior.in/login')});
  }
  if(payload.type==='PASSWORD_RESET'){
    const content=`<p style="margin:0;color:#60758a;font-size:14px;line-height:1.7">We received a request to reset your TCW HR Software password. This secure link can be opened once and expires in 10 minutes.</p><p style="margin:16px 0 0;color:#8795a5;font-size:12px;line-height:1.6">If you did not request a password reset, you can ignore this email.</p>`;
    return emailShell('Reset your password',content,{label:'Create new password',url:String(payload.resetUrl??'')});
  }
  const content=`<p style="margin:0;color:#60758a;font-size:14px;line-height:1.7;white-space:pre-line">${escapeHtml(payload.text??'')}</p>`;
  return emailShell(String(payload.subject??'TCW HR Software'),content);
}
async function sendEmail(payload:any){
  const html=buildEmailHtml(payload);
  const resendKey=process.env.RESEND_API_KEY?.trim();
  let resendError='';
  if(resendKey){
    try{
      const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.SMTP_FROM??'TCW HR Software <noreply@techcyberwarrior.in>',to:[String(payload.to)],subject:String(payload.subject??'TCW HR Software'),text:String(payload.text??''),html})});
      if(response.ok)return;
      let detail='';try{detail=await response.text()}catch{}
      resendError=`Resend API failed (${response.status})${detail?`: ${detail.slice(0,180)}`:''}`;
    }catch(e:any){resendError=String(e?.message??e??'Resend request failed').slice(0,220)}
  }
  if(transport){
    try{await transport.sendMail({from:process.env.SMTP_FROM,to:payload.to,subject:payload.subject,text:payload.text,html});return}
    catch(e:any){throw new Error(`${resendError?resendError+'; ':''}SMTP fallback failed: ${String(e?.message??e).slice(0,180)}`)}
  }
  if(resendError)throw new Error(resendError);
  throw new Error('Email provider is not configured');
}
function normalizeMobile(value:string){
  let digits=String(value??'').replace(/\D/g,'');
  if(digits.length===10)digits='91'+digits;
  return digits;
}
function redactDeliveredCredential(payload:any,label='[delivered]'){
  const secret=typeof payload?.tempPassword==='string'?payload.tempPassword:'';
  const text=secret&&typeof payload?.text==='string'?payload.text.split(secret).join(label):payload?.text;
  return {...payload,...(text!==undefined?{text}:{}),delivered:true,...(secret?{tempPassword:label}:{})};
}
async function sendSms(payload:any){
  const provider=(process.env.SMS_PROVIDER??'').trim().toUpperCase();
  if(!provider)throw new Error('SMS provider is not configured');
  const mobile=normalizeMobile(payload.to);
  if(mobile.length<10)throw new Error('SMS mobile number is invalid');
  if(provider==='MSG91'){
    const authkey=process.env.MSG91_AUTH_KEY?.trim(),templateId=(payload.template&&process.env[`MSG91_TEMPLATE_${String(payload.template).toUpperCase()}_ID`])||process.env.MSG91_TEMPLATE_ID;
    if(!authkey||!templateId)throw new Error('MSG91 auth key/template ID is missing');
    const recipient:any={mobiles:mobile,COMPANY:String(payload.company??''),COMPANY_CODE:String(payload.companyCode??''),USER_ID:String(payload.loginId??''),PASSWORD:String(payload.tempPassword??''),LOGIN_URL:String(payload.loginUrl??''),MESSAGE:String(payload.text??'')};
    const response=await fetch('https://control.msg91.com/api/v5/flow',{method:'POST',signal:AbortSignal.timeout(20000),headers:{accept:'application/json',authkey,'content-type':'application/json'},body:JSON.stringify({template_id:templateId,short_url:'0',recipients:[recipient]})});
    const text=await response.text();if(!response.ok)throw new Error(`MSG91 delivery request failed (${response.status})`);let data:any={};try{data=JSON.parse(text)}catch{}if(data.type&&data.type!=='success')throw new Error('MSG91 rejected the SMS request');return;
  }
  if(provider==='TWILIO'){
    const sid=process.env.TWILIO_ACCOUNT_SID?.trim(),token=process.env.TWILIO_AUTH_TOKEN?.trim(),from=process.env.TWILIO_FROM?.trim();
    if(!sid||!token||!from)throw new Error('Twilio SMS configuration is incomplete');
    const body=new URLSearchParams({To:'+'+mobile,From:from,Body:String(payload.text??'')});
    const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,{method:'POST',signal:AbortSignal.timeout(20000),headers:{Authorization:`Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body});
    if(!response.ok)throw new Error(`Twilio delivery request failed (${response.status})`);return;
  }
  if(provider==='WEBHOOK'){
    const endpoint=process.env.SMS_WEBHOOK_URL?.trim();if(!endpoint)throw new Error('SMS_WEBHOOK_URL is missing');
    const response=await fetch(endpoint,{method:'POST',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',...(process.env.SMS_WEBHOOK_TOKEN?{Authorization:`Bearer ${process.env.SMS_WEBHOOK_TOKEN}`}:{})},body:JSON.stringify({...payload,to:mobile})});
    if(!response.ok)throw new Error(`SMS webhook failed (${response.status})`);return;
  }
  throw new Error(`Unsupported SMS provider: ${provider}`);
}

const worker=new Worker('peopleos-outbox',async job=>{
  const row=await db.outbox.findUnique({where:{id:job.data.id}});if(!row||row.sentAt)return;
  const payload=row.payload as any;
  try{
    if(row.kind==='EMAIL'){
      await sendEmail(payload);
    }else if(row.kind==='SMS')await sendSms(payload);
    else throw new Error(`Unsupported outbox kind: ${row.kind}`);
    await db.outbox.update({where:{id:row.id},data:{sentAt:new Date(),error:null,payload:redactDeliveredCredential(payload)}});
  }catch(error){
    const finalAttempt=row.attempts>=4;
    const safePayload=finalAttempt&&payload.tempPassword?redactDeliveredCredential(payload,'[delivery failed]'):payload;
    const detail=String((error as any)?.message??error??'unknown delivery error').replace(/(Bearer\s+)[^\s;]+/gi,'$1[redacted]').replace(/(api[_-]?key|auth[_-]?key|password|token)=?[^\s;]*/gi,'$1=[redacted]').slice(0,320);
    await db.outbox.update({where:{id:row.id},data:{attempts:{increment:1},error:`${row.kind} delivery failed: ${detail}`,...(finalAttempt?{payload:safePayload}:{})}});
    if(row.attempts===4&&row.tenantId)await db.notification.create({data:{tenantId:row.tenantId,title:'TCW Agent: message delivery issue',message:`${row.kind} delivery failed after repeated attempts. Open TCW Agent or contact your software administrator to review provider configuration.`}}).catch(()=>{});
    throw error;
  }
},{connection,concurrency:4});
worker.on('failed',(job,error)=>console.error('Outbox delivery failed for job',job?.id,String(error?.message??error??'unknown').slice(0,240)));
let attendanceScanning=false,attendanceTimer:ReturnType<typeof setTimeout>|null=null;
async function refreshAttendanceAtBoundary(){
  if(attendanceScanning)return;
  attendanceScanning=true;
  try{
    const refreshed=await refreshCurrentNoPunchAttendance(db,new Date());
    if(refreshed.updated>0)console.log(`Attendance auto-status refreshed: ${refreshed.updated} no-punch record(s) updated across ${refreshed.companies} company(s).`);
  }catch{console.error('Attendance auto-status refresh failed; retrying at the next minute boundary.')}
  finally{attendanceScanning=false}
}
function scheduleAttendanceBoundaryRefresh(){
  const now=Date.now(),delay=60_000-(now%60_000)+75;
  attendanceTimer=setTimeout(async()=>{await refreshAttendanceAtBoundary();scheduleAttendanceBoundaryRefresh()},delay);
  attendanceTimer.unref();
}
let scanning=false;
async function scan(){if(scanning)return;scanning=true;try{
  const smsConfigured=!!String(process.env.SMS_PROVIDER??'').trim();
  if(!smsConfigured){
    await db.outbox.updateMany({where:{kind:'SMS',sentAt:null},data:{sentAt:new Date(),error:null}});
    await db.notification.deleteMany({where:{title:'TCW Agent: message delivery issue',message:{startsWith:'SMS delivery failed'}}});
  }
  const rows=await db.outbox.findMany({where:{sentAt:null,attempts:{lt:5},...(smsConfigured?{}:{kind:{not:'SMS'}})},take:100,orderBy:{createdAt:'asc'}});
  for(const row of rows)await queue.add(row.kind,{id:row.id},{jobId:row.id,attempts:5,backoff:{type:'exponential',delay:5000},removeOnComplete:1000,removeOnFail:1000});
  await syncCompanyAccess(db);
  await normalizeRecentHrAssignedLeave(db);
  await repairPrematureCurrentMonthPayrollLocks(db);
  await prepareScheduledPayroll(db);
  await monitorAttendanceDevices(db);
}catch{console.error('Worker scan failed; retrying on next interval.')}finally{scanning=false}}
const interval=setInterval(scan,10000);scan();void refreshAttendanceAtBoundary();scheduleAttendanceBoundaryRefresh();
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{clearInterval(interval);clearInterval(salaryInterval);clearInterval(salaryReconciliationInterval);if(attendanceTimer)clearTimeout(attendanceTimer);await worker.close();await queue.close();await db.$disconnect();process.exit(0)});
console.log('TCW HR Software worker running: email/SMS outbox, subscription expiry, payroll automation, minute-boundary no-punch attendance finalization, attendance-device monitoring, and manual-sync attendance.');
