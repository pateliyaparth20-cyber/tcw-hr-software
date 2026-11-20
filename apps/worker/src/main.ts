import {cleanFieldWork} from '../../api/src/field-work';
import 'dotenv/config';
import {Queue,Worker} from 'bullmq';
import {sendEmail,redactDeliveredCredential} from '../../../packages/email';
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
function normalizeMobile(value:string){
  let digits=String(value??'').replace(/\D/g,'');
  if(digits.length===10)digits='91'+digits;
  return digits;
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
      await sendEmail(payload,`tcw-outbox/${row.id}`);
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
let fieldCleaning=false;
const fieldInterval=setInterval(async()=>{if(fieldCleaning)return;fieldCleaning=true;try{await cleanFieldWork(db)}catch{console.error('Field-work expiry/retention check failed; retrying.')}finally{fieldCleaning=false}},60000);
const interval=setInterval(scan,10000);scan();void refreshAttendanceAtBoundary();scheduleAttendanceBoundaryRefresh();
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{clearInterval(interval);clearInterval(fieldInterval);clearInterval(salaryInterval);clearInterval(salaryReconciliationInterval);if(attendanceTimer)clearTimeout(attendanceTimer);await worker.close();await queue.close();await db.$disconnect();process.exit(0)});
console.log('TCW HR Software worker running: email/SMS outbox, subscription expiry, payroll automation, minute-boundary no-punch attendance finalization, attendance-device monitoring, and manual-sync attendance.');
