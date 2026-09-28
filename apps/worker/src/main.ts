import 'dotenv/config';
import {Queue,Worker} from 'bullmq';
import nodemailer from 'nodemailer';
import {db} from '../../../packages/database';
import {syncCompanyAccess} from '../../api/src/billing';
import {monitorAttendanceDevices,prepareScheduledPayroll} from '../../api/src/automation';

const url=new URL(process.env.REDIS_URL??'redis://localhost:6379');
const connection={host:url.hostname,port:Number(url.port)||6379,password:url.password||undefined,...(url.protocol==='rediss:'?{tls:{}}:{})};
const queue=new Queue('peopleos-outbox',{connection});
const transport=process.env.SMTP_HOST?nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT??1025),secure:process.env.SMTP_SECURE==='true',...(process.env.SMTP_USER?{auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}}:{})}):null;
async function sendEmail(payload:any){
  const resendKey=process.env.RESEND_API_KEY?.trim();
  if(resendKey){
    const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.SMTP_FROM??'TCW HR Software <noreply@techcyberwarrior.in>',to:[String(payload.to)],subject:String(payload.subject??'TCW HR Software'),text:String(payload.text??'')})});
    if(!response.ok){let detail='';try{detail=await response.text()}catch{}throw new Error(`Resend API failed (${response.status})${detail?`: ${detail.slice(0,180)}`:''}`);}
    return;
  }
  if(!transport)throw new Error('Email provider is not configured');
  await transport.sendMail({from:process.env.SMTP_FROM,to:payload.to,subject:payload.subject,text:payload.text});
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
    await db.outbox.update({where:{id:row.id},data:{attempts:{increment:1},error:`${row.kind} delivery failed; check provider configuration and service logs.`,...(finalAttempt?{payload:safePayload}:{})}});throw error;
  }
},{connection,concurrency:4});
worker.on('failed',(job,error)=>console.error('Outbox delivery failed for job',job?.id,String(error?.message??error??'unknown').slice(0,240)));
let scanning=false;
async function scan(){if(scanning)return;scanning=true;try{
  const rows=await db.outbox.findMany({where:{sentAt:null,attempts:{lt:5}},take:100,orderBy:{createdAt:'asc'}});
  for(const row of rows)await queue.add(row.kind,{id:row.id},{jobId:row.id,attempts:5,backoff:{type:'exponential',delay:5000},removeOnComplete:1000,removeOnFail:1000});
  await syncCompanyAccess(db);
  await prepareScheduledPayroll(db);
  await monitorAttendanceDevices(db);
}catch{console.error('Worker scan failed; retrying on next interval.')}finally{scanning=false}}
const interval=setInterval(scan,10000);scan();
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{clearInterval(interval);await worker.close();await queue.close();await db.$disconnect();process.exit(0)});
console.log('TCW HR Software worker running: email/SMS outbox, subscription expiry, payroll automation, and attendance-device monitoring.');
