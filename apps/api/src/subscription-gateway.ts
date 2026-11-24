import {subscriptionQuote} from './subscription-quote';
import {planModuleFeatures} from '../../../packages/plan-access';
import {isPlanDowngrade,salePrice} from '../../../packages/subscription-policy';
import {recordSubscriptionInvoice} from './subscription-invoices';
import {BadRequestException,ConflictException,ForbiddenException,NotFoundException,ServiceUnavailableException} from '@nestjs/common';
import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import type {Database} from '../../../packages/database';
import {audit,platform,requirePermission,tenant,type Context} from './context';
import {jsonObject,openPayoutCredentials,sealPayoutCredentials} from './payout-connections';

const modeSchema=z.enum(['TEST','LIVE']),id=z.string().uuid(),ref=z.string().regex(/^[a-z]+_[A-Za-z0-9]+$/).max(100);
const closed=['cancelled','completed','expired'];
export function billingQuote(price:number,gstPercent:number,inclusive=false){
 if(!Number.isFinite(gstPercent)||gstPercent<0||gstPercent>100)throw new BadRequestException('Configure a valid GST percentage before checkout.');
 if(!Number.isSafeInteger(price)||price<100||price>100000000)throw new BadRequestException('Configure a plan price between ₹1 and ₹10,00,000.');
 const subtotal=inclusive?Math.round(price/(1+gstPercent/100)):price,tax=inclusive?price-subtotal:Math.round(price*gstPercent/100);return {subtotal,tax,amount:subtotal+tax};
}
export function addBillingMonths(start:Date,months:number){const end=new Date(start),d=end.getUTCDate();end.setUTCDate(1);end.setUTCMonth(end.getUTCMonth()+months);end.setUTCDate(Math.min(d,new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).getUTCDate()));return end;}
export function validBillingSignature(body:string|Buffer,signature:string,secret:string){if(!/^[a-f0-9]{64}$/i.test(signature))return false;return timingSafeEqual(Buffer.from(createHmac('sha256',secret).update(body).digest('hex'),'hex'),Buffer.from(signature,'hex'));}
type Version={mode:'TEST'|'LIVE';keyId:string;ciphertext:string};
export class SubscriptionGateway{
 constructor(private db:Database,private transport:typeof fetch=fetch){}
 async version(revision:string){const row=await this.db.platformSetting.findUnique({where:{key:'billing-gateway-version:'+revision}});if(!row)throw new ServiceUnavailableException('This gateway configuration is unavailable. Contact support.');return row.value as unknown as Version;}
 async request(version:Version,path:string,body?:any){
  const credentials=openPayoutCredentials('SUBSCRIPTIONS:'+version.mode,version.ciphertext);
  let response:Response;try{response=await this.transport('https://api.razorpay.com/v1/'+path,{method:body===undefined?'GET':'POST',redirect:'error',headers:{authorization:'Basic '+Buffer.from(version.keyId.trim()+':'+String(credentials.keySecret??'').trim()).toString('base64'),'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});}catch{throw new ServiceUnavailableException('Razorpay did not confirm the request. Check status before trying again.');}
  const result=await response.json().catch(()=>null) as any;if(!response.ok||!result)throw new ServiceUnavailableException('Razorpay: '+String(result?.error?.description??'request unavailable').slice(0,220));return result;
 }
 async config(){return jsonObject((await this.db.platformSetting.findUnique({where:{key:'billing-gateway'}}))?.value);}
 async settings(ctx:Context,method:'GET',body:any,query?:any):Promise<{enabled:boolean;autoPayEnabled:boolean;mode:'TEST'|'LIVE';activeMode:'TEST'|'LIVE';keyId:string;hasCredentials:boolean;webhookVerified:boolean;signedEventCount:number;lastSignedAt:Date|null;revision:string|null;webhookUrl:string|null;checkoutExperience:'STANDARD'}>;
 async settings(ctx:Context,method:string,body:any,query?:any):Promise<any>;
 async settings(ctx:Context,method:string,body:any,query:any={}){
  platform(ctx);requirePermission(ctx,'system',method==='GET'?'VIEW':'EDIT');const config=await this.config();
  if(method==='GET'){
   const mode=modeSchema.parse(query.mode??config.mode??'TEST'),revision=config.revisions?.[mode],v=revision?await this.version(revision):null;
   const [count,last]=revision?await Promise.all([this.db.billingGatewayEvent.count({where:{gatewayRevision:revision}}),this.db.billingGatewayEvent.findFirst({where:{gatewayRevision:revision},orderBy:{createdAt:'desc'},select:{createdAt:true}})]):[0,null];
   return {enabled:config.enabled===true,autoPayEnabled:config.autoPayEnabled===true,mode,activeMode:config.mode??'TEST',checkoutExperience:'STANDARD',keyId:v?.keyId??'',hasCredentials:!!v,webhookVerified:count>0,signedEventCount:count,lastSignedAt:last?.createdAt??null,revision:config.revision??null,webhookUrl:revision?this.webhookUrl(revision):null};
  }
  const input=z.object({mode:modeSchema,enabled:z.boolean(),autoPayEnabled:z.boolean(),checkoutExperience:z.enum(['STANDARD','CUSTOM']).optional(),keyId:z.string().trim().regex(/^rzp_(test|live)_[A-Za-z0-9]+$/),keySecret:z.string().trim().min(8).max(250).optional(),webhookSecret:z.string().min(16).max(250).optional(),expectedRevision:z.string().uuid().nullable()}).strict().parse(body);
  if(!input.keyId.startsWith(input.mode==='LIVE'?'rzp_live_':'rzp_test_'))throw new BadRequestException('The key must match the selected Test or Live mode.');
  return this.db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('tcw-subscription-gateway'))`;
   const current=jsonObject((await tx.platformSetting.findUnique({where:{key:'billing-gateway'}}))?.value);if((current.revision??null)!==input.expectedRevision)throw new ConflictException('Gateway settings changed in another window. Refresh first.');
   const oldId=current.revisions?.[input.mode],old=oldId?(await tx.platformSetting.findUnique({where:{key:'billing-gateway-version:'+oldId}}))?.value as unknown as Version:null,previous=old&&old.keyId===input.keyId?openPayoutCredentials('SUBSCRIPTIONS:'+input.mode,old.ciphertext):{};
   const keySecret=input.keySecret??previous.keySecret,webhookSecret=input.webhookSecret??previous.webhookSecret;if(!keySecret||!webhookSecret)throw new BadRequestException('Enter the API secret and a webhook secret of at least 16 characters.');
   const reuse=oldId&&old?.keyId===input.keyId&&!input.keySecret&&!input.webhookSecret,revision=reuse?String(oldId):randomUUID(),settingsRevision=randomUUID();
   if(input.autoPayEnabled&&!input.enabled)throw new BadRequestException('Enable checkout before enabling AutoPay.');
   if(!reuse)await tx.platformSetting.create({data:{key:'billing-gateway-version:'+revision,value:{mode:input.mode,keyId:input.keyId,ciphertext:sealPayoutCredentials('SUBSCRIPTIONS:'+input.mode,{keySecret,webhookSecret})}}});
   if(input.autoPayEnabled&&!await tx.billingGatewayEvent.count({where:{gatewayRevision:revision}}))throw new BadRequestException('Save credentials with AutoPay off, register this webhook in Razorpay and send a test event, then enable AutoPay.');

   const next={revision:settingsRevision,mode:input.mode,enabled:input.enabled,autoPayEnabled:input.autoPayEnabled,experiences:{...current.experiences,[input.mode]:'STANDARD'},revisions:{...current.revisions,[input.mode]:revision}};await tx.platformSetting.upsert({where:{key:'billing-gateway'},create:{key:'billing-gateway',value:next},update:{value:next}});
   await audit(tx,ctx,'SUBSCRIPTION_GATEWAY_CONFIGURED','system',revision,undefined,{mode:input.mode,enabled:input.enabled,autoPayEnabled:input.autoPayEnabled,checkoutExperience:next.experiences[input.mode]});return {ok:true,revision:settingsRevision,webhookUrl:this.webhookUrl(revision)};
  });
 }
 webhookUrl(revision:string){return new URL('/api/billing/razorpay/webhook/'+revision,process.env.WEB_URL??'https://hr.techcyberwarrior.in').toString();}
 async summary(ctx:Context){const tid=tenant(ctx),company=await this.db.tenant.findUniqueOrThrow({where:{id:tid}}),c=await this.config(),rows=await this.db.billingCheckout.findMany({where:{tenantId:tid,kind:'AUTOPAY',state:{not:'QUOTED'}},orderBy:{createdAt:'desc'},take:8});const pending=await this.db.billingCheckout.findMany({where:{tenantId:tid,mode:c.mode??'TEST',kind:'ONETIME',state:{in:['CREATING','INITIALIZING','READY','UNCERTAIN']},snapshot:{path:['quote','upgrade'],equals:true}},orderBy:{createdAt:'desc'},take:12});return {pendingCheckouts:pending.map(r=>({id:r.id,planName:r.planName,cycle:r.cycle,state:r.state,amount:jsonObject(r.snapshot).quote?.due.amount??r.amount,createdAt:r.createdAt,canReplace:r.state==='READY'&&!!r.providerRef,canResume:r.state==='READY'&&!!r.providerRef&&new Date(jsonObject(r.snapshot).quote?.validUntil??0).getTime()>Date.now()})),currentSubscription:{plan:company.plan,status:company.status,cycle:jsonObject(company.profile).subscriptionCycle??null,expiresAt:company.expiresAt,isTrial:company.status==='TRIAL'},gateway:{configured:c.enabled===true&&!!c.revisions?.[c.mode],mode:c.mode??'TEST',autoPayEnabled:c.autoPayEnabled===true,checkoutExperience:'STANDARD'},autopay:rows.map(r=>({id:r.id,planName:r.planName,cycle:r.cycle,mode:r.mode,status:r.mandateStatus??r.state,amount:r.amount,cancelScheduled:r.cancelScheduled,providerRef:r.providerRef,createdAt:r.createdAt})),recentCharges:await this.db.billingCharge.findMany({where:{tenantId:tid},orderBy:{createdAt:'desc'},take:12})};}
 async contactSales(ctx:Context,body:unknown){
  const tid=tenant(ctx);requirePermission(ctx,'company','EDIT');
  const input=z.object({contactName:z.string().trim().min(1).max(120),email:z.string().trim().email().max(200),phone:z.string().trim().max(40).default(''),employees:z.number().int().min(1).max(1000000),requirements:z.string().trim().min(10).max(3000),cycle:z.enum(['MONTHLY','YEARLY'])}).strict().parse(body);
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tid}::uuid FOR UPDATE`;
   const company=await tx.tenant.findUniqueOrThrow({where:{id:tid}}),marker='[CUSTOM_PLAN:'+tid+']';
   const existing=await tx.lead.findFirst({where:{notes:{startsWith:marker},stage:{notIn:['WON','LOST']}},orderBy:{createdAt:'desc'}});
   const notes=marker+'\nCustom subscription request · '+company.code+'\nBilling preference: '+input.cycle+'\nEmployees: '+input.employees+'\nRequirements: '+input.requirements;
   const values={company:company.name,contactName:input.contactName,email:input.email,phone:input.phone,notes};
   const lead=existing?await tx.lead.update({where:{id:existing.id},data:values}):await tx.lead.create({data:{...values,stage:'LEAD'}});
   await audit(tx,ctx,'CUSTOM_PLAN_REQUESTED','sales',lead.id,undefined,{companyId:tid,employees:input.employees,cycle:input.cycle});
   return {ok:true,reference:lead.id,message:'Your custom plan request is saved for the sales team. No payment or subscription change has been made.'};
  });
 }
 async checkout(ctx:Context,body:any,preview=false){
  const tid=tenant(ctx);requirePermission(ctx,'company','EDIT');const input=z.object({plan:z.enum(['STARTER','GROWTH','ENTERPRISE']),cycle:z.enum(['MONTHLY','YEARLY']),kind:z.enum(['ONETIME','AUTOPAY']),requestKey:id,autopayConsent:z.literal(true).optional()}).strict().parse(body),config=await this.config();
  if(input.kind==='AUTOPAY'&&input.autopayConsent!==true)throw new BadRequestException('Explicit customer consent is required before setting up AutoPay.');
  if(input.kind==='AUTOPAY'&&!config.autoPayEnabled)throw new ServiceUnavailableException('AutoPay has not been enabled by the administrator.');
  if(!config.enabled||!config.revisions?.[config.mode])throw new ServiceUnavailableException('Razorpay checkout is not connected yet.');
  const revision=String(config.revisions[config.mode]);let version=await this.version(revision);
  if(!preview){
   const pending=await this.db.billingCheckout.findMany({where:{tenantId:tid,mode:config.mode,kind:'ONETIME',requestKey:{not:input.requestKey},state:{in:['CREATING','INITIALIZING','READY','UNCERTAIN']},snapshot:{path:['quote','upgrade'],equals:true}},orderBy:{createdAt:'asc'}});
   for(const previous of pending){
    if(previous.state!=='READY'||!previous.providerRef)throw new ConflictException('The payment service is still confirming an earlier attempt. Check its status shortly before retrying.');
    const result=await this.reconcile(ctx,{checkoutId:previous.id},version);
    if(['PAID','TEST_PAID'].includes(result.status))throw new ConflictException('Your earlier payment is verified. Refresh your plan and review the updated upgrade total before paying again.');
    const company=await this.db.tenant.findUniqueOrThrow({where:{id:tid}}),saved=jsonObject(previous.snapshot).quote;
    if(previous.planName===input.plan&&previous.cycle===input.cycle&&saved&&new Date(saved.validUntil)>new Date()&&saved.companyRevision===company.updatedAt.toISOString()){
     const fresh=await this.db.billingCheckout.findUniqueOrThrow({where:{id:previous.id}});
     if(fresh.state==='READY')return this.checkoutPublic(fresh,await this.version(fresh.gatewayRevision));
     throw new ConflictException('Payment status changed. Refresh your plan before retrying.');
    }
    const replaced=await this.replaceUnpaid(ctx,{checkoutId:previous.id,confirm:true},version);
    if(replaced.status!=='ABANDONED')throw new ConflictException('Your earlier payment is verified. Refresh your plan and review the updated upgrade total before paying again.');
   }
  }

  let row=await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tid}::uuid FOR UPDATE`;
   if(!preview&&await tx.billingCheckout.count({where:{tenantId:tid,mode:config.mode,kind:'ONETIME',requestKey:{not:input.requestKey},state:{in:['CREATING','INITIALIZING','READY','UNCERTAIN']},snapshot:{path:['quote','upgrade'],equals:true}}}))throw new ConflictException('Another payment attempt is being checked. Please try again shortly.');
   const existing=await tx.billingCheckout.findUnique({where:{tenantId_requestKey:{tenantId:tid,requestKey:input.requestKey}}});if(existing){if(existing.planName!==input.plan||existing.cycle!==input.cycle||existing.kind!==input.kind)throw new ConflictException('Checkout request already belongs to another plan.');if(!preview&&existing.state==='QUOTED'){const company=await tx.tenant.findUniqueOrThrow({where:{id:tid}}),quote=jsonObject(existing.snapshot).quote;if(!quote||new Date(quote.validUntil)<new Date()||quote.companyRevision!==company.updatedAt.toISOString())throw new ConflictException('Your quote expired or workspace changed. Review a fresh quote before paying.');const others=await tx.billingCheckout.count({where:{tenantId:tid,id:{not:existing.id},kind:'AUTOPAY',mode:config.mode,state:{notIn:['FAILED','ABANDONED','QUOTED']},OR:[{mandateStatus:null},{mandateStatus:{notIn:closed}}]}});if(others)throw new ConflictException('An AutoPay mandate already exists. Stop its future payments before replacing it.');return tx.billingCheckout.update({where:{id:existing.id},data:{state:'CREATING'}});}return existing;}
   const mandate=await tx.billingCheckout.findFirst({where:{tenantId:tid,kind:'AUTOPAY',mode:config.mode,state:{notIn:['FAILED','ABANDONED','QUOTED']},OR:[{mandateStatus:null},{mandateStatus:{notIn:closed}}]}});if(mandate&&!preview)throw new ConflictException('An AutoPay mandate already exists. Manage or cancel it before starting another payment.');
   const [company,plan,payRow,employees,devices]=await Promise.all([tx.tenant.findUniqueOrThrow({where:{id:tid}}),tx.plan.findUnique({where:{name:input.plan}}),tx.platformSetting.findUnique({where:{key:'billing-payment'}}),tx.employee.count({where:{tenantId:tid,deletedAt:null}}),tx.attendanceDevice.count({where:{tenantId:tid,connectionMode:{not:'EMPLOYEE_APP'}}})]);
   if(company.currency!=='INR')throw new BadRequestException('This gateway supports INR subscription plans.');if(!plan)throw new NotFoundException('Plan not found.');if(employees>plan.employeeLimit||devices>plan.deviceLimit)throw new BadRequestException('This plan is below your current employee or device usage.');
   const pay=jsonObject(payRow?.value),rate=Math.max(0,Math.min(100,Number(pay.gstPercent??process.env.PAYMENT_GST_PERCENT??18))),quote=await subscriptionQuote(tx,company,plan,input.cycle,input.kind,rate,pay.pricesIncludeGst===true);
   billingQuote(quote.discountedPrice,rate,pay.pricesIncludeGst===true);
   return tx.billingCheckout.create({data:{tenantId:tid,requestKey:input.requestKey,gatewayRevision:revision,mode:version.mode,kind:input.kind,cycle:input.cycle,planName:plan.name,...quote.recurring,state:preview?'QUOTED':'CREATING',snapshot:{checkoutExperience:'STANDARD',employeeLimit:plan.employeeLimit,deviceLimit:plan.deviceLimit,features:plan.features,gstPercent:rate,pricesIncludeGst:pay.pricesIncludeGst===true,startAt:quote.startAt,quote}}});
  });
  version=await this.version(row.gatewayRevision);
  if(preview)return this.checkoutPublic(row,version,true);
  if(row.state!=='CREATING')return this.checkoutPublic(row,version);
  // Only the creator claims the remote operation. A timeout is not retried automatically.
  const claimed=await this.db.billingCheckout.updateMany({where:{id:row.id,state:'CREATING'},data:{state:'INITIALIZING'}});if(!claimed.count)throw new ConflictException('Checkout is being prepared. Refresh its status shortly.');
  try{
   let remote:any,providerPlanId:string|null=null;
   if(row.kind==='AUTOPAY'){const p=await this.request(version,'plans',{period:row.cycle==='YEARLY'?'yearly':'monthly',interval:1,item:{name:'TCW '+row.planName+' '+row.cycle,amount:row.amount,currency:'INR'},notes:{checkout_id:row.id}});providerPlanId=p.id;const startAt=jsonObject(row.snapshot).startAt;remote=await this.request(version,'subscriptions',{plan_id:p.id,total_count:row.cycle==='YEARLY'?10:120,quantity:1,customer_notify:true,...(jsonObject(row.snapshot).quote?.upfrontAmount?{addons:[{item:{name:'Immediate '+row.planName+' upgrade after unused-time credit',amount:jsonObject(row.snapshot).quote.upfrontAmount,currency:'INR'}}]}:{}),expire_by:Math.floor(Date.now()/1000)+86400,...(startAt&&startAt>Math.floor(Date.now()/1000)?{start_at:startAt}:{}),notes:{checkout_id:row.id,tenant_id:tid}});}
   else remote=await this.request(version,'orders',{amount:jsonObject(row.snapshot).quote?.due.amount??row.amount,currency:'INR',receipt:'TCW'+row.id.replace(/-/g,''),notes:{checkout_id:row.id,tenant_id:tid}});
   if(typeof remote.id!=='string'||!ref.safeParse(remote.id).success)throw new ServiceUnavailableException('Razorpay returned an invalid checkout identifier.');
   row=await this.db.billingCheckout.update({where:{id:row.id},data:{providerRef:remote.id,providerPlanId,state:'READY',mandateStatus:row.kind==='AUTOPAY'?String(remote.status??'created'):null}});return this.checkoutPublic(row,version);
  }catch(e){await this.db.billingCheckout.update({where:{id:row.id},data:{state:'UNCERTAIN'}});throw e;}
 }
 checkoutPublic(row:any,version:Version,preview=false){if(!preview&&(!row.providerRef||!['READY','PAID','TEST_PAID'].includes(row.state)))throw new ConflictException('Checkout is awaiting confirmation. Do not start a second mandate; contact support to reconcile it.');const quote=jsonObject(row.snapshot).quote;return {id:row.id,keyId:version.keyId,checkoutExperience:'STANDARD',mode:row.mode,kind:row.kind,cycle:row.cycle,planName:row.planName,amount:quote?.due.amount??row.amount,subtotal:quote?.due.subtotal??row.subtotal,tax:quote?.due.tax??row.tax,renewalAmount:row.amount,state:row.state,providerRef:row.providerRef,gstPercent:jsonObject(row.snapshot).gstPercent,startAt:jsonObject(row.snapshot).startAt,totalCycles:row.cycle==='YEARLY'?10:120,quote};}
 async saveCustomerDetails(ctx:Context,body:unknown){
  const tid=tenant(ctx);requirePermission(ctx,'company','EDIT');
  const input=z.object({name:z.string().trim().min(2).max(120),phone:z.string().trim().min(7).max(30).refine(v=>v.replace(/\D/g,'').length>=7,'Enter a valid phone number.'),email:z.email().trim().max(200),address:z.string().trim().min(5).max(1000)}).strict().parse(body);
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tid}::uuid FOR UPDATE`;
   const before=await tx.tenant.findUnique({where:{id:tid}});if(!before)throw new NotFoundException('Workspace not found.');
   const profile=jsonObject(before.profile),billingContact={name:input.name,phone:input.phone,email:input.email.toLowerCase(),address:input.address};
   const after=await tx.tenant.update({where:{id:tid},data:{profile:{...profile,billingContact}}});
   await audit(tx,ctx,'BILLING_DETAILS_UPDATED','company',tid,{billingContact:jsonObject(profile.billingContact)},{billingContact});
   return {billingContact};
  });
 }
 async checkoutDetails(ctx:Context,checkoutId:string){
  const tid=tenant(ctx);requirePermission(ctx,'company','VIEW');id.parse(checkoutId);
  const row=await this.db.billingCheckout.findFirst({where:{id:checkoutId,tenantId:tid,kind:{in:['ONETIME','AUTOPAY']}}});if(!row)throw new NotFoundException('Payment session not found.');
  const [version,company,charge]=await Promise.all([this.version(row.gatewayRevision),this.db.tenant.findUniqueOrThrow({where:{id:tid}}),this.db.billingCharge.findFirst({where:{checkoutId:row.id,tenantId:tid,mode:row.mode},orderBy:{createdAt:'desc'}})]);
  const verified=!!charge&&['PAID','TEST_PAID'].includes(row.state),invoice=verified&&row.mode==='LIVE'&&charge?.invoiceId?await this.db.invoice.findFirst({where:{id:charge.invoiceId,tenantId:tid},select:{id:true,number:true,total:true,createdAt:true,status:true}}):null;
  const profile=jsonObject(company.profile),saved=jsonObject(profile.billingContact),billingContact={name:String(saved.name??profile.contactPerson??''),phone:String(saved.phone??profile.phone??''),email:String(saved.email??profile.billingEmail??profile.email??''),address:String(saved.address??[profile.address,profile.city,profile.state,profile.postalCode,profile.country].filter(Boolean).join(', '))},billingDetailsSaved=Object.values(billingContact).every(value=>String(value).trim().length>0);
  const snapshot=jsonObject(row.snapshot),planDetails={features:planModuleFeatures(row.planName),employeeLimit:Number(snapshot.employeeLimit??0),deviceLimit:Number(snapshot.deviceLimit??0)};
  return {...this.checkoutPublic(row,version,true),state:verified?row.state:['PAID','TEST_PAID'].includes(row.state)?'PENDING':row.state,verified,reviewRequired:jsonObject(row.snapshot).reviewRequired===true,createdAt:row.createdAt,customer:{name:company.name,code:company.code,logo:company.logo,billingContact,billingDetailsSaved},planDetails,receipt:verified?{paymentId:charge!.providerPaymentId,amount:charge!.amount,periodStart:charge!.periodStart,periodEnd:charge!.periodEnd,createdAt:charge!.createdAt,invoice}:null};
 }
 async verify(ctx:Context,body:any){const tid=tenant(ctx);requirePermission(ctx,'company','EDIT');const input=z.object({checkoutId:id,paymentId:ref,signature:z.string().length(64)}).strict().parse(body),row=await this.db.billingCheckout.findFirst({where:{id:input.checkoutId,tenantId:tid}});if(!row?.providerRef)throw new NotFoundException('Checkout not found.');const version=await this.version(row.gatewayRevision),credentials=openPayoutCredentials('SUBSCRIPTIONS:'+version.mode,version.ciphertext),signed=row.kind==='AUTOPAY'?input.paymentId+'|'+row.providerRef:row.providerRef+'|'+input.paymentId;if(!validBillingSignature(signed,input.signature,String(credentials.keySecret??'').trim()))throw new ForbiddenException('Payment signature did not verify.');return this.acceptPayment(row,input.paymentId,version);}
 async acceptPayment(row:any,paymentId:string,version:Version){
  const p=await this.request(version,'payments/'+ref.parse(paymentId));if(p.id!==paymentId||p.currency!=='INR'||p.status!=='captured'||p.captured!==true)return {ok:false,status:'PENDING',message:'Payment is not captured yet. Check payment status shortly.'};
  let periodStart:Date|undefined,periodEnd:Date|undefined,providerInvoiceId:string|null=null,upfront=false;const quote=jsonObject(row.snapshot).quote;
  if(row.kind==='ONETIME'){if(p.order_id!==row.providerRef)throw new ForbiddenException('Payment belongs to another order.');}
  else{
   let invoiceRef=p.invoice_id;if(!invoiceRef&&quote?.upfrontAmount&&p.amount===quote.upfrontAmount){const list=await this.request(version,'invoices?subscription_id='+encodeURIComponent(row.providerRef)+'&count=100');invoiceRef=(list.items??[]).find((i:any)=>i.payment_id===p.id)?.id;if(!invoiceRef)return {ok:false,status:'PENDING',message:'Waiting for the verified upfront upgrade invoice.'};}
   if(!invoiceRef)return {ok:true,status:'MANDATE_AUTHORIZED',message:'Mandate authorization received. Access changes only after a full subscription charge.'};
   const inv=await this.request(version,'invoices/'+ref.parse(invoiceRef));if(inv.subscription_id!==row.providerRef||inv.payment_id!==p.id||inv.status!=='paid'||inv.currency!=='INR')throw new ForbiddenException('Payment does not match this subscription invoice.');
   if(!inv.billing_start||!inv.billing_end){if(quote?.upfrontAmount&&inv.amount_paid===quote.upfrontAmount){upfront=true;periodStart=new Date(quote.serviceStart);periodEnd=new Date(quote.serviceEnd);}else return {ok:true,status:'MANDATE_AUTHORIZED',message:'Mandate authorized; awaiting the first billing-period charge.'};}
   if(inv.amount_paid!==(upfront?quote.upfrontAmount:row.amount))throw new BadRequestException('Subscription invoice amount does not match the agreed plan.');providerInvoiceId=inv.id;if(!upfront){periodStart=new Date(inv.billing_start*1000);periodEnd=new Date(inv.billing_end*1000);}if(!periodStart||!periodEnd||!Number.isFinite(+periodEnd)||+periodEnd<=+periodStart)throw new BadRequestException('Invalid subscription billing period.');
  }
  const expected=row.kind==='ONETIME'?(quote?.due.amount??row.amount):upfront?quote.upfrontAmount:row.amount;if(p.amount!==expected||Number(p.amount_refunded??0)>0)throw new BadRequestException('Captured amount does not match this plan or has been refunded.');
  const result=await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM tenants WHERE id=${row.tenantId}::uuid FOR UPDATE`;
   const old=await tx.billingCharge.findUnique({where:{providerPaymentId:p.id}});if(old){if(old.checkoutId!==row.id)throw new ForbiddenException('Payment already belongs to another checkout.');return {ok:true,status:old.mode==='LIVE'?'PAID':'TEST_PAID',duplicate:true};}
   const latestCheckout=await tx.billingCheckout.findUniqueOrThrow({where:{id:row.id}}),superseded=latestCheckout.state==='ABANDONED'||!!jsonObject(latestCheckout.snapshot).abandonedAt;
   const company=await tx.tenant.findUniqueOrThrow({where:{id:row.tenantId}}),captured=new Date(Number(p.created_at)*1000);if(!Number.isFinite(+captured))throw new BadRequestException('Invalid payment time.');
   const catalog=await tx.plan.findUnique({where:{name:row.planName}}),published=catalog?(row.cycle==='YEARLY'?catalog.yearlyPrice:catalog.monthlyPrice):null,legacyPriceChanged=!quote&&row.kind==='ONETIME'&&catalog&&catalog.updatedAt>row.createdAt&&published&&row.amount<billingQuote(salePrice(published)!,Number(jsonObject(row.snapshot).gstPercent??18),jsonObject(row.snapshot).pricesIncludeGst===true).amount;
   const start=periodStart??(quote?.upgrade?new Date(quote.serviceStart):new Date(Math.max(+captured,company.expiresAt?.getTime()??0))),end=periodEnd??(quote?.upgrade?new Date(quote.serviceEnd):addBillingMonths(start,row.cycle==='YEARLY'?12:1));let invoiceId:string|null=null;const initial=upfront||row.kind==='ONETIME',breakdown=initial&&quote?quote.due:{subtotal:row.subtotal,tax:row.tax,amount:row.amount},needsReview=superseded||!!legacyPriceChanged||isPlanDowngrade(company.plan,row.planName)||(initial&&quote?.upgrade&&(quote.companyRevision!==company.updatedAt.toISOString()||captured>new Date(quote.validUntil)))||(row.kind==='AUTOPAY'&&!upfront&&jsonObject(row.snapshot).startAt&&+start<jsonObject(row.snapshot).startAt*1000);
   if(row.mode==='LIVE'){
    const invoice=await tx.invoice.create({data:{tenantId:row.tenantId,number:'TCW-'+p.id,amount:breakdown.subtotal,tax:breakdown.tax,total:p.amount,paidAmount:p.amount,status:'PAID',dueDate:captured}});invoiceId=invoice.id;await tx.payment.create({data:{tenantId:row.tenantId,invoiceId:invoice.id,amount:p.amount,reference:'RAZORPAY:'+p.id,date:captured}});
    await recordSubscriptionInvoice(tx,company,invoice,{...row,snapshot:{...jsonObject(row.snapshot),appliedCredit:initial?quote?.credit??0:0,appliedCreditSubtotal:initial?quote?.creditSubtotal??0:0,appliedCreditTax:initial?quote?.creditTax??0:0,needsReview}},start,end);
    const profile=jsonObject(company.profile);const last=Number(profile.gatewayLastPaidPeriodStart??0);if(!needsReview&&+start>=last){delete profile.suspensionReason;delete profile.billingPreviousStatus;delete profile.billingSuspendedAt;delete profile.pendingPaymentProof;delete profile.pendingPlan;profile.gatewayLastPaidPeriodStart=+start;profile.subscriptionCycle=row.cycle;await tx.tenant.update({where:{id:company.id},data:{status:company.status==='ARCHIVED'||company.status==='SUSPENDED'&&jsonObject(company.profile).suspensionReason!=='BILLING'?company.status:'ACTIVE',plan:row.planName,employeeLimit:jsonObject(row.snapshot).employeeLimit,expiresAt:initial&&quote?.upgrade?end:new Date(Math.max(company.expiresAt?.getTime()??0,+end)),profile}});}
   }
   await tx.billingCharge.create({data:{tenantId:row.tenantId,checkoutId:row.id,providerPaymentId:p.id,providerInvoiceId,invoiceId,amount:p.amount,mode:row.mode,periodStart:start,periodEnd:end}});await tx.billingCheckout.update({where:{id:row.id},data:{state:row.mode==='LIVE'?'PAID':'TEST_PAID',...(needsReview?{snapshot:{...jsonObject(latestCheckout.snapshot),reviewRequired:true}}:{})}});
   await tx.auditLog.create({data:{tenantId:row.tenantId,action:row.mode==='LIVE'?'SUBSCRIPTION_PAYMENT_VERIFIED':'SUBSCRIPTION_TEST_PAYMENT_VERIFIED',entity:'billing',entityId:row.id,after:{paymentId:p.id,amount:p.amount,credit:initial?quote?.credit??0:0,needsReview,mode:row.mode}}});return {ok:true,status:row.mode==='LIVE'?'PAID':'TEST_PAID',message:needsReview?'Payment recorded. Your current plan was kept unchanged because billing details changed. Contact billing to reconcile this receipt.':row.mode==='LIVE'?'Payment verified and subscription updated.':'Test payment verified. Your production subscription has not changed.'};
  },{timeout:30000});
  if(row.kind==='AUTOPAY')await this.syncMandate(row,version);return result;
 }
 async syncMandate(row:any,version:Version){return this.db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM tenants WHERE id=${row.tenantId}::uuid FOR UPDATE`;const s=await this.request(version,'subscriptions/'+ref.parse(row.providerRef));if(s.id!==row.providerRef)throw new BadRequestException('Invalid mandate response.');return tx.billingCheckout.update({where:{id:row.id},data:{mandateStatus:String(s.status),...(closed.includes(s.status)?{cancelScheduled:false}:{})}});},{timeout:22000});}
 async reconcile(ctx:Context,body:any,credentialVersion?:Version){const tid=tenant(ctx);requirePermission(ctx,'company','EDIT');const input=z.object({checkoutId:id}).strict().parse(body),row=await this.db.billingCheckout.findFirst({where:{id:input.checkoutId,tenantId:tid}});if(!row?.providerRef)throw new NotFoundException('Checkout is not ready.');const version=credentialVersion??await this.version(row.gatewayRevision);if(version.mode!==row.mode)throw new BadRequestException('Checkout and gateway modes do not match.');let items:any[]=[];if(row.kind==='ONETIME')items=(await this.request(version,'orders/'+ref.parse(row.providerRef)+'/payments')).items??[];else{await this.syncMandate(row,version);for(let skip=0;skip<200;skip+=100){const list=await this.request(version,'invoices?subscription_id='+encodeURIComponent(row.providerRef)+'&count=100&skip='+skip);items.push(...(list.items??[]).filter((i:any)=>i.status==='paid'&&i.payment_id).map((i:any)=>({id:i.payment_id})));if((list.items??[]).length<100)break;}}
  let result:any={ok:true,status:'PENDING',message:'No captured subscription payment yet.'};for(const p of items){const recorded=await this.db.billingCharge.findUnique({where:{providerPaymentId:p.id}});if(recorded){if(recorded.checkoutId!==row.id)throw new ForbiddenException('Payment belongs to another checkout.');result={ok:true,status:recorded.mode==='LIVE'?'PAID':'TEST_PAID'};continue;}const next=await this.acceptPayment(row,p.id,version);if(['PAID','TEST_PAID'].includes(next.status)||!['PAID','TEST_PAID'].includes(result.status))result=next;}return result;
 }
 async replaceUnpaid(ctx:Context,body:any,credentialVersion?:Version){
  const tid=tenant(ctx);requirePermission(ctx,'company','EDIT');
  const {checkoutId}=z.object({checkoutId:id,confirm:z.literal(true)}).strict().parse(body);
  const row=await this.db.billingCheckout.findFirst({where:{id:checkoutId,tenantId:tid,kind:'ONETIME'}});
  if(!row?.providerRef)throw new NotFoundException('Payment session not found or still being prepared.');
  if(['PAID','TEST_PAID'].includes(row.state)){if(!await this.db.billingCharge.count({where:{checkoutId,tenantId:tid}}))throw new ConflictException('The recorded payment needs verification. Check payment status before replacing it.');return {ok:true,status:row.state,message:'This payment is already recorded. Your current plan has been refreshed.'};}
  if(row.state==='ABANDONED')return {ok:true,status:'ABANDONED',message:'This unpaid checkout is already closed.'};
  if(row.state!=='READY')throw new ConflictException('This payment is awaiting provider confirmation. Check its status or contact support before replacing it.');
  const version=credentialVersion??await this.version(row.gatewayRevision);if(version.mode!==row.mode)throw new BadRequestException('Checkout and gateway modes do not match.');const order=await this.request(version,'orders/'+ref.parse(row.providerRef)),list=await this.request(version,'orders/'+ref.parse(row.providerRef)+'/payments?count=100');
  const expected=jsonObject(row.snapshot).quote?.due.amount??row.amount;
  if(order.id!==row.providerRef||order.currency!=='INR'||order.amount!==expected||!Number.isSafeInteger(order.amount_paid)||order.amount_paid<0||!Number.isSafeInteger(order.attempts)||order.attempts<0||!Array.isArray(list.items))throw new ServiceUnavailableException('The provider did not confirm the original order. Try checking its status again.');
  if(list.items.some((p:any)=>!ref.safeParse(p.id).success||p.order_id!==row.providerRef))throw new ServiceUnavailableException('The provider returned an invalid payment list.');
  if(order.status==='paid'||order.amount_paid>0||list.items.some((p:any)=>p.status==='captured')){const result=await this.reconcile(ctx,{checkoutId},version);if(!['PAID','TEST_PAID'].includes(result.status))throw new ConflictException('A payment was received and is awaiting confirmation. Do not start another payment.');return result;}
  if(!['created','attempted'].includes(order.status)||order.attempts>list.items.length||list.items.some((p:any)=>p.status!=='failed'))throw new ConflictException('A bank payment is still processing or its status is uncertain. Check payment status before replacing this checkout.');
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tid}::uuid FOR UPDATE`;
   const fresh=await tx.billingCheckout.findFirstOrThrow({where:{id:checkoutId,tenantId:tid}});
   if(['PAID','TEST_PAID'].includes(fresh.state)||await tx.billingCharge.count({where:{checkoutId,tenantId:tid}}))return {ok:true,status:fresh.state,message:'Payment was recorded while checking. Your current plan has been refreshed.'};
   if(fresh.state==='ABANDONED')return {ok:true,status:'ABANDONED',message:'This unpaid checkout is already closed.'};
   if(fresh.state!=='READY')throw new ConflictException('Payment status changed. Check it before starting another checkout.');
   await tx.billingCheckout.update({where:{id:checkoutId},data:{state:'ABANDONED',snapshot:{...jsonObject(fresh.snapshot),abandonedAt:new Date().toISOString()}}});
   await audit(tx,ctx,'UNPAID_SUBSCRIPTION_CHECKOUT_REPLACED','billing',checkoutId);
   return {ok:true,status:'ABANDONED',message:'Unpaid checkout closed. Review a fresh quote to continue. Your current paid plan is unchanged.'};
  });
 }
 async cancel(ctx:Context,body:any){const tid=tenant(ctx);requirePermission(ctx,'company','EDIT');const {checkoutId,immediate}=z.object({checkoutId:id,immediate:z.boolean().default(false),confirm:z.boolean().optional()}).strict().refine(v=>!v.immediate||v.confirm===true,'Confirm stopping this authorization before replacing it.').parse(body),row=await this.db.billingCheckout.findFirst({where:{id:checkoutId,tenantId:tid,kind:'AUTOPAY'}});if(!row?.providerRef)throw new NotFoundException('AutoPay mandate not found.');const version=await this.version(row.gatewayRevision),fresh=await this.syncMandate(row,version);if(closed.includes(fresh.mandateStatus??''))return {ok:true,message:'This mandate has already ended.'};const cancelAtEnd=!immediate&&['active','authenticated','pending','halted','paused'].includes(fresh.mandateStatus??'');await this.request(version,'subscriptions/'+ref.parse(row.providerRef)+'/cancel',{cancel_at_cycle_end:cancelAtEnd?1:0});const after=await this.syncMandate(row,version);await this.db.billingCheckout.update({where:{id:row.id},data:{cancelScheduled:!closed.includes(after.mandateStatus??'')}});await audit(this.db,ctx,'SUBSCRIPTION_AUTOPAY_CANCEL_REQUESTED','billing',row.id);return {ok:true,message:'AutoPay cancellation confirmed by Razorpay. Paid access continues until its existing expiry.'};}
 async webhook(revision:string,raw:Buffer,signature:string,eventId:string){
  id.parse(revision);const version=await this.version(revision),credentials=openPayoutCredentials('SUBSCRIPTIONS:'+version.mode,version.ciphertext);if(!raw?.length||!validBillingSignature(raw,signature,credentials.webhookSecret))throw new ForbiddenException('Invalid webhook signature.');
  const digest=createHash('sha256').update(raw).digest('hex'),eid=eventId||digest;if(eid.length>200)throw new BadRequestException('Invalid event identifier.');const existing=await this.db.billingGatewayEvent.findUnique({where:{gatewayRevision_eventId:{gatewayRevision:revision,eventId:eid}}});if(existing){if(existing.digest!==digest)throw new ForbiddenException('Webhook event identifier collision.');return {ok:true,duplicate:true};}
  const event=JSON.parse(raw.toString('utf8')),payment=event.payload?.payment?.entity,sub=event.payload?.subscription?.entity;let row:any=null;
  if(sub?.id)row=await this.db.billingCheckout.findFirst({where:{providerRef:String(sub.id),gatewayRevision:revision}});else if(payment?.order_id)row=await this.db.billingCheckout.findFirst({where:{providerRef:String(payment.order_id),gatewayRevision:revision}});
  if(!row&&payment?.invoice_id){const inv=await this.request(version,'invoices/'+ref.parse(payment.invoice_id));if(inv.subscription_id)row=await this.db.billingCheckout.findFirst({where:{providerRef:inv.subscription_id,gatewayRevision:revision}});}
  if(row){if(['payment.captured','subscription.charged','subscription.authenticated','invoice.paid'].includes(event.event)&&payment?.id){const result=await this.acceptPayment(row,ref.parse(payment.id),version);if(result.status==='PENDING')throw new ServiceUnavailableException('Payment capture is still pending. Retry this webhook.');}if(row.kind==='AUTOPAY')await this.syncMandate(row,version);}
  await this.db.billingGatewayEvent.upsert({where:{gatewayRevision_eventId:{gatewayRevision:revision,eventId:eid}},create:{gatewayRevision:revision,eventId:eid,digest},update:{}});return {ok:true};
 }
}
