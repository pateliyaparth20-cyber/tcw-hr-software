import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {BadRequestException,ConflictException,NotFoundException,ServiceUnavailableException} from '@nestjs/common';
import type {Database} from '../../../packages/database';

type PaymentConfig={
  provider:'RAZORPAY'|'NONE';
  keyId:string;
  keySecret:string;
  webhookSecret:string;
  upiId:string;
  payeeName:string;
  gstPercent:number;
  qrLifetimeSeconds:number;
  automatic:boolean;
};
type CheckoutSession={provider:'RAZORPAY';id:string;checkoutUrl:string;expiresAt:string};

function key(){
  const secret=String(process.env.CONFIG_ENCRYPTION_KEY??'').trim();
  if(!secret)throw new Error('CONFIG_ENCRYPTION_KEY is missing.');
  return createHash('sha256').update(secret).digest();
}
function encrypt(value:string){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
  const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${data.toString('base64url')}`;
}
function decrypt(value:string){
  if(!value)return '';
  const [version,iv,tag,data]=value.split(':');
  if(version!=='v1'||!iv||!tag||!data)throw new Error('Stored payment secret is invalid. Re-enter payment gateway credentials.');
  const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64url'));
  decipher.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8');
}
const obj=(value:any)=>value&&typeof value==='object'&&!Array.isArray(value)?{...value}:{};
const mask=(value:string)=>value?('••••'+value.slice(-4)):'';

export function inclusiveTax(total:number,gstPercent:number){
  const safeTotal=Math.max(0,Math.round(total)),rate=Math.max(0,Math.min(100,Number(gstPercent)||0));
  if(!rate)return {subtotal:safeTotal,tax:0,total:safeTotal};
  const subtotal=Math.round(safeTotal*100/(100+rate));
  return {subtotal,tax:safeTotal-subtotal,total:safeTotal};
}

export async function effectivePaymentConfig(db:Database):Promise<PaymentConfig>{
  const row=await db.platformSetting.findUnique({where:{key:'billing-payment'}});
  const value=obj(row?.value);
  const provider=String(value.provider??(process.env.RAZORPAY_KEY_ID&&process.env.RAZORPAY_KEY_SECRET?'RAZORPAY':'NONE')).toUpperCase()==='RAZORPAY'?'RAZORPAY':'NONE';
  const keyId=String(value.razorpayKeyId??process.env.RAZORPAY_KEY_ID??'').trim();
  const secretCipher=String(value.razorpayKeySecretCiphertext??'');
  const webhookCipher=String(value.razorpayWebhookSecretCiphertext??'');
  const keySecret=secretCipher?decrypt(secretCipher):String(process.env.RAZORPAY_KEY_SECRET??'').trim();
  const webhookSecret=webhookCipher?decrypt(webhookCipher):String(process.env.RAZORPAY_WEBHOOK_SECRET??'').trim();
  const upiId=String(value.upiId??process.env.PAYMENT_UPI_ID??'').trim();
  const payeeName=String(value.payeeName??process.env.PAYMENT_UPI_NAME??'TCW HR Software').trim()||'TCW HR Software';
  const gstPercent=Math.max(0,Math.min(100,Number(value.gstPercent??process.env.PAYMENT_GST_PERCENT??18)||18));
  const qrLifetimeSeconds=50;
  return {provider,keyId,keySecret,webhookSecret,upiId,payeeName,gstPercent,qrLifetimeSeconds,automatic:provider==='RAZORPAY'&&!!keyId&&!!keySecret&&!!webhookSecret};
}

export async function publicPaymentConfig(db:Database){
  const cfg=await effectivePaymentConfig(db);
  return {
    provider:cfg.provider,
    automaticConfigured:cfg.automatic,
    razorpayKeyId:cfg.keyId,
    razorpayKeyIdHint:mask(cfg.keyId),
    razorpayKeySecretConfigured:!!cfg.keySecret,
    webhookSecretConfigured:!!cfg.webhookSecret,
    upiId:cfg.upiId,
    payeeName:cfg.payeeName,
    gstPercent:cfg.gstPercent,
    qrLifetimeSeconds:50,
    webhookUrl:new URL('/api/payments/razorpay-webhook',process.env.WEB_URL??'https://hr.techcyberwarrior.in').toString()
  };
}

export async function savePaymentConfig(db:Database,input:{provider:'RAZORPAY'|'NONE';razorpayKeyId?:string;razorpayKeySecret?:string;razorpayWebhookSecret?:string;upiId:string;payeeName:string;gstPercent:number}){
  const existing=await db.platformSetting.findUnique({where:{key:'billing-payment'}});
  const current=obj(existing?.value);
  const keySecret=String(input.razorpayKeySecret??'').trim(),webhookSecret=String(input.razorpayWebhookSecret??'').trim();
  const value:any={
    ...current,
    provider:input.provider,
    razorpayKeyId:String(input.razorpayKeyId??'').trim(),
    upiId:String(input.upiId??'').trim(),
    payeeName:String(input.payeeName??'TCW HR Software').trim()||'TCW HR Software',
    gstPercent:Math.max(0,Math.min(100,Number(input.gstPercent)||0)),
    qrLifetimeSeconds:50
  };
  if(keySecret)value.razorpayKeySecretCiphertext=encrypt(keySecret);
  if(webhookSecret)value.razorpayWebhookSecretCiphertext=encrypt(webhookSecret);
  if(input.provider==='RAZORPAY'&&!value.razorpayKeyId)throw new BadRequestException('Enter the Razorpay Key ID.');
  if(input.provider==='RAZORPAY'&&!value.razorpayKeySecretCiphertext&&!process.env.RAZORPAY_KEY_SECRET)throw new BadRequestException('Enter the Razorpay Key Secret.');
  if(input.provider==='RAZORPAY'&&!value.razorpayWebhookSecretCiphertext&&!process.env.RAZORPAY_WEBHOOK_SECRET)throw new BadRequestException('Enter the Razorpay Webhook Secret.');
  await db.platformSetting.upsert({where:{key:'billing-payment'},create:{key:'billing-payment',value},update:{value}});
  return publicPaymentConfig(db);
}

function authHeader(cfg:PaymentConfig){return 'Basic '+Buffer.from(cfg.keyId+':'+cfg.keySecret).toString('base64');}
async function razorpayRequest(cfg:PaymentConfig,path:string,init:RequestInit={}){
  if(!cfg.automatic)throw new ServiceUnavailableException('Automatic payment gateway is not configured.');
  const response=await fetch('https://api.razorpay.com'+path,{...init,signal:AbortSignal.timeout(20000),headers:{Authorization:authHeader(cfg),'Content-Type':'application/json',...(init.headers??{})}});
  const text=await response.text();let data:any={};try{data=JSON.parse(text)}catch{}
  if(!response.ok)throw new ServiceUnavailableException(String(data?.error?.description??data?.error?.reason??`Payment gateway request failed (${response.status}).`));
  return data;
}

export async function createAutomaticCheckout(db:Database,args:{invoice:any;company:any;plan:any;owner?:any}):Promise<CheckoutSession>{
  const cfg=await effectivePaymentConfig(db);
  if(!cfg.automatic)throw new ServiceUnavailableException('Automatic payment gateway is not configured yet.');
  const expiresAt=new Date(Date.now()+cfg.qrLifetimeSeconds*1000);
  const profile=obj(args.company.profile);
  const email=String(profile.billingEmail??profile.email??args.owner?.email??'').trim();
  const phone=String(profile.phone??profile.ownerPhone??'').replace(/\s+/g,'').trim();
  const customer:any={name:String(args.company.name).slice(0,50)};
  if(email)customer.email=email;
  if(phone)customer.contact=phone;
  const payload:any={
    amount:args.invoice.total,
    currency:'INR',
    accept_partial:false,
    reference_id:args.invoice.id,
    description:`TCW HR ${args.plan.name} subscription · ${args.invoice.number}`,
    expire_by:Math.floor(expiresAt.getTime()/1000),
    customer,
    notify:{sms:false,email:false},
    reminder_enable:false,
    notes:{invoiceId:args.invoice.id,tenantId:args.company.id,plan:args.plan.name}
  };
  const row=await razorpayRequest(cfg,'/v1/payment_links',{method:'POST',body:JSON.stringify(payload)});
  if(!row?.id||!row?.short_url)throw new ServiceUnavailableException('Payment gateway did not return a checkout link.');
  return {provider:'RAZORPAY',id:String(row.id),checkoutUrl:String(row.short_url),expiresAt:expiresAt.toISOString()};
}

export async function cancelAutomaticCheckout(db:Database,session:any){
  if(!session?.id||session.provider!=='RAZORPAY')return;
  const cfg=await effectivePaymentConfig(db);
  if(!cfg.automatic)throw new ServiceUnavailableException('Automatic payment gateway is not configured.');
  await razorpayRequest(cfg,`/v1/payment_links/${encodeURIComponent(String(session.id))}/cancel`,{method:'POST',body:'{}'});
}

export async function fetchAutomaticCheckout(db:Database,session:any){
  if(!session?.id||session.provider!=='RAZORPAY')throw new BadRequestException('Automatic payment session was not found.');
  const cfg=await effectivePaymentConfig(db);
  const row=await razorpayRequest(cfg,`/v1/payment_links/${encodeURIComponent(String(session.id))}`,{method:'GET'});
  return {
    id:String(row.id??session.id),
    status:String(row.status??'').toLowerCase(),
    amount:Number(row.amount??0),
    amountPaid:Number(row.amount_paid??0),
    paymentId:String(row.payments?.find?.((p:any)=>p.status==='captured'||p.status==='authorized')?.payment_id??row.payments?.[0]?.payment_id??''),
    expiresAt:row.expire_by?new Date(Number(row.expire_by)*1000):new Date(session.expiresAt)
  };
}

export function verifyRazorpayWebhook(rawBody:Buffer,signature:string,secret:string){
  if(!rawBody.length||!signature||!secret)return false;
  const expected=createHmac('sha256',secret).update(rawBody).digest('hex');
  const a=Buffer.from(expected),b=Buffer.from(String(signature));
  return a.length===b.length&&timingSafeEqual(a,b);
}

function plusThirtyDays(from:Date){const d=new Date(from);d.setUTCDate(d.getUTCDate()+30);return d;}
export async function completeSubscriptionPayment(db:Database,args:{invoiceId:string;reference:string;amount:number;provider:string}){
  const now=new Date();
  const result=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${args.invoiceId}::uuid FOR UPDATE`;
    const invoice=await tx.invoice.findUnique({where:{id:args.invoiceId}});
    if(!invoice)throw new NotFoundException('Invoice not found.');
    if(args.amount!==invoice.total)throw new ConflictException('Verified payment amount does not match the invoice total.');
    const existing=await tx.payment.findUnique({where:{reference:args.reference}});
    if(invoice.status==='PAID'||invoice.paidAmount>=invoice.total){
      if(existing&&existing.invoiceId===invoice.id)return {alreadyPaid:true,invoice,tenantId:invoice.tenantId,payment:existing};
      throw new ConflictException('Invoice is already paid.');
    }
    if(existing&&existing.invoiceId!==invoice.id)throw new ConflictException('Payment reference is already linked to another invoice.');
    const payment=existing??await tx.payment.create({data:{tenantId:invoice.tenantId,invoiceId:invoice.id,amount:invoice.total,reference:args.reference,date:new Date(now.toISOString().slice(0,10))}});
    const paidInvoice=await tx.invoice.update({where:{id:invoice.id},data:{paidAmount:invoice.total,status:'PAID'}});
    const company=await tx.tenant.findUniqueOrThrow({where:{id:invoice.tenantId}});
    const profile=obj(company.profile),planName=String(profile.pendingPlan??company.plan);
    const plan=await tx.plan.findUnique({where:{name:planName as any}});
    const baseExpiry=company.expiresAt&&company.expiresAt>now?company.expiresAt:now;
    const nextExpiry=plusThirtyDays(baseExpiry);
    delete profile.pendingPaymentProof;delete profile.suspensionReason;delete profile.pendingPaymentSession;delete profile.pendingInvoiceId;delete profile.paymentRequestedAt;delete profile.paymentMode;delete profile.pendingPlan;
    const active=await tx.tenant.update({where:{id:company.id},data:{status:'ACTIVE',expiresAt:nextExpiry,...(plan?{plan:plan.name,employeeLimit:plan.employeeLimit}:{}),profile}});
    const owner=await tx.user.findFirst({where:{tenantId:company.id,active:true,role:{code:{in:['COMPANY_OWNER','HR_ADMIN']}}},orderBy:{createdAt:'asc'}});
    const target=String(profile.billingEmail??profile.email??owner?.email??'').trim();
    const notice=await tx.notification.create({data:{tenantId:company.id,title:'Payment successful — subscription activated',message:`${paidInvoice.number} is paid. ${plan?.name??planName} access is active until ${nextExpiry.toISOString().slice(0,10)}.`}});
    if(target)await tx.outbox.create({data:{tenantId:company.id,kind:'EMAIL',payload:{type:'BILLING_RECEIPT',to:target,subject:`Payment received · ${paidInvoice.number}`,company:company.name,invoiceNumber:paidInvoice.number,subtotal:paidInvoice.amount,tax:paidInvoice.tax,total:paidInvoice.total,paymentReference:payment.reference,provider:args.provider,plan:plan?.name??planName,expiresAt:nextExpiry.toISOString(),loginUrl:new URL('/login',process.env.WEB_URL??'https://hr.techcyberwarrior.in').toString(),text:`Payment received for invoice ${paidInvoice.number}. Total ₹${(paidInvoice.total/100).toFixed(2)}. Subscription active until ${nextExpiry.toISOString().slice(0,10)}.`}}});
    await tx.auditLog.create({data:{tenantId:company.id,action:'SUBSCRIPTION_PAYMENT_VERIFIED',entity:'payments',entityId:payment.id,after:{invoiceId:invoice.id,reference:payment.reference,amount:payment.amount,provider:args.provider,plan:plan?.name??planName,expiresAt:nextExpiry}}});
    return {alreadyPaid:false,invoice:paidInvoice,payment,company:active,notice,tenantId:company.id,expiresAt:nextExpiry,plan:plan?.name??planName};
  });
  return result;
}
