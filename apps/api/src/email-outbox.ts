import type {Database} from '../../../packages/database';
import {digest} from '../../../packages/auth';
import {sendEmail,redactDeliveredCredential} from '../../../packages/email';

// For a single free web service without Redis or a separate queue worker.
// Do not enable alongside the BullMQ outbox worker.
export function startEmailOutbox(db:Database){
  if(process.env.EMAIL_OUTBOX_ENABLED!=='true')return async()=>{};
  if(!process.env.RESEND_API_KEY&&!process.env.SMTP_HOST)throw new Error('Email outbox requires an email provider.');
  let stopped=false,running:Promise<void>|undefined;
  async function drain(){
    const rows=await db.outbox.findMany({where:{kind:'EMAIL',sentAt:null,attempts:{lt:5}},orderBy:{createdAt:'asc'},take:10,select:{id:true}});
    for(const candidate of rows){
      if(stopped)break;
      await db.$transaction(async tx=>{
        const [lock]=await tx.$queryRaw<{locked:boolean}[]>`SELECT pg_try_advisory_xact_lock(hashtextextended(${candidate.id}, 0)) AS locked`;
        if(!lock?.locked)return;
        const row=await tx.outbox.findUnique({where:{id:candidate.id}});
        if(!row||row.sentAt||row.attempts>=5)return;
        const payload=row.payload as Record<string,any>;
        // Resend idempotency lasts 24h. Never retry an old queued credential.
        let expired=Date.now()-row.createdAt.getTime()>23*60*60*1000;
        if(payload.type==='PASSWORD_RESET'){
          let token='';try{token=new URL(String(payload.resetUrl)).searchParams.get('token')??'';}catch{}
          const reset=token?await tx.passwordReset.findUnique({where:{tokenHash:digest(token)}}):null;
          expired=expired||!reset||!!reset.usedAt||reset.expiresAt<=new Date();
        }
        if(expired){
          await tx.outbox.update({where:{id:row.id},data:{attempts:5,error:'Email expired before delivery; request a new link or invitation.',payload:redactDeliveredCredential(payload,'[expired]')}});
          return;
        }
        try{
          await sendEmail(payload,`tcw-outbox/${row.id}`);
          await tx.outbox.update({where:{id:row.id},data:{sentAt:new Date(),error:null,payload:redactDeliveredCredential(payload)}});
        }catch{
          await tx.outbox.update({where:{id:row.id},data:{attempts:{increment:1},error:'Email provider rejected delivery or timed out; retry pending.',...(row.attempts>=4?{payload:redactDeliveredCredential(payload,'[delivery failed]')}:{})}});
          console.error(JSON.stringify({event:'email_delivery_failed',attempt:row.attempts+1}));
        }
      },{maxWait:5000,timeout:30000});
    }
  }
  function tick(){
    if(stopped||running)return;
    running=drain().catch(()=>console.error(JSON.stringify({event:'email_outbox_scan_failed'}))).finally(()=>{running=undefined;});
  }
  const timer=setInterval(tick,10000);timer.unref();tick();
  return async()=>{stopped=true;clearInterval(timer);await running;};
}
