import {BadRequestException} from '@nestjs/common';
import {isPlanDowngrade,pricedPlan} from '../../../packages/subscription-policy';
import {jsonObject} from './payout-connections';

export function calendarMonths(start:Date,months:number){const end=new Date(start),d=end.getUTCDate();end.setUTCDate(1);end.setUTCMonth(end.getUTCMonth()+months);end.setUTCDate(Math.min(d,new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).getUTCDate()));return end;}
export function taxedPrice(price:number,rate:number,inclusive:boolean){const subtotal=inclusive?Math.round(price/(1+rate/100)):price,tax=inclusive?price-subtotal:Math.round(price*rate/100);return {subtotal,tax,amount:subtotal+tax};}
export async function subscriptionQuote(db:any,company:any,rawPlan:any,cycle:string,kind:string,rate:number,inclusive:boolean,now=new Date()){
 if(isPlanDowngrade(company.plan,rawPlan.name))throw new BadRequestException('Plan downgrades are not available. Choose your current plan or upgrade to a higher plan.');
 const plan=pricedPlan(rawPlan),price=cycle==='YEARLY'?plan.yearlyPrice:plan.monthlyPrice;
 if(!price)throw new BadRequestException('The selected billing cycle has no published price yet.');
 if(price<100||price>100000000)throw new BadRequestException('This plan price needs administrator review before checkout.');
 const recurring=taxedPrice(price,rate,inclusive),paidTerm=company.status!=='TRIAL'&&company.expiresAt&&company.expiresAt>now,upgrade=paidTerm&&company.plan!==plan.name;
 if(paidTerm&&!upgrade&&kind==='ONETIME')throw new BadRequestException('Your paid plan is still running. Authorize AutoPay for renewal at expiry, or pay once after the current plan ends.');
 let credit=0,creditSubtotal=0,creditTax=0,basisInvoiceId:string|null=null;
 if(upgrade){
  // Credit only a fully paid, immutable service-period receipt. Never estimate
  // previous payments using today's catalog prices or manually granted access.
  const paid=await db.invoice.findMany({where:{tenantId:company.id,status:'PAID'},orderBy:{createdAt:'desc'},take:200});
  const snapshots=await db.platformSetting.findMany({where:{key:{in:paid.map((i:any)=>'subscription-invoice:'+i.id)}}});
  const byId=new Map<string,any>(snapshots.map((s:any)=>[s.key,jsonObject(s.value)]));
  const historical=await db.billingCharge.findMany({where:{tenantId:company.id,mode:'LIVE',invoiceId:{in:paid.map((i:any)=>i.id)},periodStart:{lte:now},periodEnd:{gt:now}}});
  const checkouts=await db.billingCheckout.findMany({where:{id:{in:historical.map((c:any)=>c.checkoutId)}},select:{id:true,planName:true}});
  for(const charge of historical){const plan=checkouts.find((c:any)=>c.id===charge.checkoutId);const key='subscription-invoice:'+charge.invoiceId;if(!byId.has(key)&&plan)byId.set(key,{plan:plan.planName,periodStart:charge.periodStart.toISOString(),periodEnd:charge.periodEnd.toISOString()});}
  const fulfilled=await db.billingCheckout.findMany({where:{tenantId:company.id,mode:'LIVE',state:'PAID'},select:{snapshot:true}});
  const consumed=new Set(fulfilled.map((row:any)=>jsonObject(row.snapshot)).filter((s:any)=>!s.reviewRequired&&s.quote?.credit>0).map((s:any)=>s.quote.basisInvoiceId));
  const candidates=paid.map((invoice:any)=>({invoice,snapshot:byId.get('subscription-invoice:'+invoice.id) as any})).filter(({invoice,snapshot}:any)=>snapshot?.plan===company.plan&&!consumed.has(invoice.id)&&!snapshot.needsReview&&invoice.paidAmount>=invoice.total&&new Date(snapshot.periodStart)<=now&&new Date(snapshot.periodEnd)>now).sort((a:any,b:any)=>+new Date(b.snapshot.periodStart)-+new Date(a.snapshot.periodStart));
  if(candidates.length){const {invoice,snapshot}=candidates[0],start=+new Date(snapshot.periodStart),end=+new Date(snapshot.periodEnd),fraction=Math.min(1,Math.max(0,(Math.min(end,+company.expiresAt)-+now)/(end-start)));if(Number.isFinite(fraction)){creditSubtotal=Math.floor(Number(snapshot.serviceSubtotal??invoice.amount)*fraction);creditTax=Math.floor(Number(snapshot.serviceTax??invoice.tax)*fraction);credit=creditSubtotal+creditTax;basisInvoiceId=invoice.id;}}
 }
 const due=upgrade?{subtotal:recurring.subtotal-creditSubtotal,tax:recurring.tax-creditTax,amount:recurring.amount-credit}:recurring;
 if(upgrade&&(due.amount<100||due.subtotal<0||due.tax<0))throw new BadRequestException('Your remaining paid credit covers this billing period. Choose a longer billing cycle or contact billing so none of your credit is lost.');
 const serviceStart=upgrade?now:null,serviceEnd=upgrade?calendarMonths(now,cycle==='YEARLY'?12:1):null;
 const startAt=kind==='AUTOPAY'?(serviceEnd?Math.ceil(+serviceEnd/1000):company.expiresAt&&company.expiresAt>now?Math.ceil(+company.expiresAt/1000):null):null;
 return {recurring,due,credit,creditSubtotal,creditTax,basisInvoiceId,upgrade:!!upgrade,companyRevision:company.updatedAt.toISOString(),serviceStart:serviceStart?.toISOString()??null,serviceEnd:serviceEnd?.toISOString()??null,startAt,upfrontAmount:kind==='AUTOPAY'&&upgrade?due.amount:0,dueToday:kind==='AUTOPAY'&&startAt&&!upgrade?0:due.amount,listPrice:cycle==='YEARLY'?rawPlan.yearlyPrice:rawPlan.monthlyPrice,discountedPrice:price,discountPercent:plan.discountPercent,quotedAt:now.toISOString(),validUntil:new Date(+now+10*60000).toISOString()};
}
