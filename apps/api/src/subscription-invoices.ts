import {NotFoundException} from '@nestjs/common';
import {z} from 'zod';
import type {Database} from '../../../packages/database';
import {requirePermission,tenant,type Context} from './context';
import {toPdf} from '../../../packages/reporting-engine';
import {jsonObject} from './payout-connections';

const money=(n:number)=>'INR '+(n/100).toFixed(2),date=(v:Date|string)=>new Date(v).toISOString().slice(0,10);
// Called in the same transaction as the uniquely verified live charge. Callback
// and webhook retries therefore cannot queue a second receipt.
export async function recordSubscriptionInvoice(tx:any,company:any,invoice:any,checkout:any,start:Date,end:Date){
 const seller=jsonObject((await tx.platformSetting.findUnique({where:{key:'platform-profile'}}))?.value),profile=jsonObject(company.profile);
 const snapshot={sellerName:String(seller.legalName||seller.companyName||'Tech Cyber Warrior'),sellerAddress:String(seller.address??''),sellerTaxId:String(seller.taxId??''),buyerName:company.name,buyerCode:company.code,buyerAddress:String(profile.address??''),buyerTaxId:String(profile.gstNumber??profile.gstin??profile.taxId??''),plan:checkout.planName,cycle:checkout.cycle,periodStart:start.toISOString(),periodEnd:end.toISOString(),gstPercent:jsonObject(checkout.snapshot).gstPercent??null};
 await tx.platformSetting.create({data:{key:'subscription-invoice:'+invoice.id,value:snapshot}});
 const owner=await tx.user.findFirst({where:{tenantId:company.id,active:true,role:{code:{in:['COMPANY_OWNER','HR_ADMIN']}}},orderBy:[{createdAt:'asc'},{id:'asc'}],select:{email:true}});
 const email=z.string().email().safeParse(profile.billingEmail||owner?.email);
 if(email.success){
  const url=new URL('/subscription',process.env.PUBLIC_WEB_URL??'https://hr.techcyberwarrior.in');url.searchParams.set('invoice',invoice.id);
  await tx.outbox.create({data:{tenantId:company.id,kind:'EMAIL',payload:{type:'SUBSCRIPTION_RECEIPT',to:email.data,subject:'Payment received · '+invoice.number,invoiceNumber:invoice.number,invoiceUrl:url.toString(),text:`Payment received for ${company.name}.\nInvoice: ${invoice.number}\nPlan: ${checkout.planName} (${checkout.cycle})\nSubtotal: ${money(invoice.amount)}\nTax: ${money(invoice.tax)}\nPaid: ${money(invoice.paidAmount)}\nPeriod: ${date(start)} to ${date(end)}\nSign in to download your invoice: ${url}`}}});
 }
}
export async function subscriptionInvoice(db:Database,ctx:Context,invoiceId:string){
 const id=z.string().uuid().parse(invoiceId);
 if(ctx.user.role.scope==='PLATFORM')requirePermission(ctx,'billing','VIEW');else{tenant(ctx);requirePermission(ctx,'company','VIEW');}
 const invoice=await db.invoice.findFirst({where:{id,...(ctx.user.role.scope==='PLATFORM'?{}:{tenantId:ctx.tenantId!})}});if(!invoice)throw new NotFoundException('Invoice not found.');
 const company=await db.tenant.findUniqueOrThrow({where:{id:invoice.tenantId}}),saved=await db.platformSetting.findUnique({where:{key:'subscription-invoice:'+id}}),snapshot=jsonObject(saved?.value);
 const charge=await db.billingCharge.findFirst({where:{invoiceId:id,tenantId:invoice.tenantId,mode:'LIVE'}}),checkout=charge?await db.billingCheckout.findUnique({where:{id:charge.checkoutId}}):null;
 const rows=[
  {Detail:'Invoice number',Value:invoice.number},{Detail:'Invoice date',Value:date(invoice.createdAt)},{Detail:'Status',Value:invoice.status},
  {Detail:'From',Value:String(snapshot.sellerName??'Tech Cyber Warrior')},{Detail:'Seller address',Value:String(snapshot.sellerAddress??'')},{Detail:'Seller GST / tax ID',Value:String(snapshot.sellerTaxId??'')},
  {Detail:'Billed to',Value:String(snapshot.buyerName??company.name)},{Detail:'Company code',Value:String(snapshot.buyerCode??company.code)},{Detail:'Billing address',Value:String(snapshot.buyerAddress??'')},{Detail:'Buyer GST / tax ID',Value:String(snapshot.buyerTaxId??'')},
  {Detail:'Plan',Value:String(snapshot.plan??checkout?.planName??'See invoice reference')},{Detail:'Billing cycle',Value:String(snapshot.cycle??checkout?.cycle??'—')},
  ...(charge?[{Detail:'Service period',Value:date(snapshot.periodStart??charge.periodStart)+' to '+date(snapshot.periodEnd??charge.periodEnd)},{Detail:'Payment reference',Value:charge.providerPaymentId}]:[]),
  {Detail:'Subtotal',Value:money(invoice.amount)},{Detail:'Tax',Value:money(invoice.tax)},{Detail:'Total',Value:money(invoice.total)},{Detail:'Paid',Value:money(invoice.paidAmount)},{Detail:'Outstanding',Value:money(Math.max(0,invoice.total-invoice.paidAmount))}
 ];
 return {bytes:toPdf(rows,'TCW HR · Subscription invoice'),filename:invoice.number.replace(/[^a-zA-Z0-9._-]/g,'-')+'.pdf'};
}
