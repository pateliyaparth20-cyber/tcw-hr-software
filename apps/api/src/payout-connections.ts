import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {BadRequestException,ConflictException,ForbiddenException,ServiceUnavailableException} from '@nestjs/common';
import {z} from 'zod';
import type {Database} from '../../../packages/database';
import {audit,requirePermission,tenant,type Context} from './context';
import {restrictedRoles} from '../../../packages/permissions';
export const jsonObject=(v:any):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
export const activeScheduleStatuses=['SCHEDULED','RUNNING'];
export function paymentPermission(ctx:Context,action='APPROVE'){tenant(ctx);requirePermission(ctx,'payroll',action);if(restrictedRoles.has(ctx.user.role.code))throw new ForbiddenException('Salary payments are managed by your payroll team.');}
function key(){const secret=process.env.CONFIG_ENCRYPTION_KEY?.trim();if(!secret||secret.length<32)throw new ServiceUnavailableException('Secure payment credential storage has not been configured by the software administrator.');return createHash('sha256').update(secret+':tcw-company-payout-v1').digest();}
export function sealPayoutCredentials(tid:string,value:any){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(tid));return Buffer.concat([iv,cipher.update(JSON.stringify(value),'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64');}
export function openPayoutCredentials(tid:string,value:string){try{const b=Buffer.from(value,'base64'),decipher=createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));decipher.setAAD(Buffer.from(tid));decipher.setAuthTag(b.subarray(-16));return JSON.parse(Buffer.concat([decipher.update(b.subarray(12,-16)),decipher.final()]).toString());}catch{throw new ServiceUnavailableException('Payment credentials could not be opened. Ask the company owner to reconnect this account.');}}
export function bankConnectors():Record<string,{label:string;url:string}>{
 let parsed:any={};try{parsed=JSON.parse(process.env.BANK_PAYOUT_CONNECTORS_JSON??'{}')}catch{}
 const out:Record<string,{label:string;url:string}>={};
 for(const [code,value] of Object.entries(jsonObject(parsed))){const v=jsonObject(value);try{const url=new URL(String(v.url));if(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash)out[code]={label:String(v.label??code).slice(0,120),url:url.toString().replace(/\/$/,'')};}catch{}}
 return out;
}
export async function lockCompanyPayments(tx:any,tid:string){await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tid}::uuid FOR UPDATE`;}
export function publicConnection(row:any){return row?{provider:row.provider,bankName:row.bankName,accountLabel:row.accountLabel,accountHint:row.accountHint,mode:row.mode,enabled:row.enabled,hasCredentials:!!row.credentialsCiphertext,revision:row.revision,updatedAt:row.updatedAt}:null;}
export async function paymentConnection(db:any,company:any){
 const row=await db.companyPayoutConnection.findUnique({where:{tenantId:company.id}});
 if(row)return {provider:row.provider,enabled:row.enabled&&!!row.credentialsCiphertext&&(['RAZORPAYX'].includes(row.provider)||row.provider==='BANK_API'&&!!bankConnectors()[row.bankName]),mode:row.mode,accountLabel:row.accountLabel,accountHint:row.accountHint,revision:row.revision,credentials:row.credentialsCiphertext?()=>openPayoutCredentials(company.id,row.credentialsCiphertext):null,bankName:row.bankName};
 // Compatibility for a previously installed single-company account. New connections always override this fallback.
 const p=jsonObject(company.profile),provider=String(p.payoutProvider??'NONE');
 return {provider,enabled:process.env.PAYROLL_PAYOUTS_ENABLED==='true'&&provider==='RAZORPAYX'&&process.env.PAYOUT_PROVIDER==='RAZORPAYX'&&process.env.PAYOUT_COMPANY_CODE===company.code,mode:String(p.payoutMode??'IMPS'),accountLabel:String(p.payoutAccountLabel??''),accountHint:'',revision:0,bankName:'',credentials:null};
}
export class PayoutConnections{
 constructor(private db:Database){}
 async get(ctx:Context){paymentPermission(ctx,'VIEW');const tid=tenant(ctx),company=await this.db.tenant.findUniqueOrThrow({where:{id:tid}}),row=await this.db.companyPayoutConnection.findUnique({where:{tenantId:tid}});return {connection:publicConnection(row),timezone:company.timezone,currency:company.currency,secureStorageReady:!!process.env.CONFIG_ENCRYPTION_KEY&&process.env.CONFIG_ENCRYPTION_KEY.trim().length>=32,bankConnectors:Object.entries(bankConnectors()).map(([code,v])=>({code,label:v.label})),providers:['MANUAL','BANK_FILE','RAZORPAYX','BANK_API']};}
 async save(ctx:Context,body:unknown){
  paymentPermission(ctx);requirePermission(ctx,'company','EDIT');const tid=tenant(ctx);
  const input=z.object({provider:z.enum(['MANUAL','BANK_FILE','RAZORPAYX','BANK_API']),bankName:z.string().trim().max(120).default(''),accountLabel:z.string().trim().min(1).max(120),mode:z.enum(['IMPS','NEFT','RTGS']),enabled:z.boolean(),expectedRevision:z.number().int().nonnegative(),confirm:z.literal(true),credentials:z.object({keyId:z.string().trim().max(200).optional(),keySecret:z.string().trim().max(1000).optional(),sourceAccount:z.string().trim().max(50).optional(),corporateId:z.string().trim().max(120).optional()}).strict().optional()}).strict().parse(body);
  return this.db.$transaction(async tx=>{
   await lockCompanyPayments(tx,tid);const existing=await tx.companyPayoutConnection.findUnique({where:{tenantId:tid}});
   if((existing?.revision??0)!==input.expectedRevision)throw new ConflictException('Payment settings changed. Refresh and review before saving.');
   if(await tx.payrollPaymentSchedule.count({where:{tenantId:tid,status:{in:activeScheduleStatuses}}}))throw new ConflictException('Cancel or finish active salary schedules before changing the payment account.');
   if(await tx.payrollPayout.count({where:{tenantId:tid,provider:{in:['RAZORPAYX','BANK_API']},status:{notIn:['processed','PAID','failed','FAILED','reversed','cancelled','rejected']}}}))throw new ConflictException('Resolve pending or unverified bank transfers before changing the payment account.');
   const isApi=['RAZORPAYX','BANK_API'].includes(input.provider);let ciphertext=isApi&&existing?.provider===input.provider&&existing.bankName===input.bankName?existing.credentialsCiphertext:null,accountHint=ciphertext?existing!.accountHint:'';
   if(isApi&&input.credentials&&Object.values(input.credentials).some(Boolean)){
    const c=input.credentials;if(!c.keyId||!c.keySecret||!c.sourceAccount||input.provider==='BANK_API'&&!c.corporateId)throw new BadRequestException('Enter the API key ID, secret, source account and, for a bank connector, corporate ID together.');
    if(!/^[A-Za-z0-9_-]{4,50}$/.test(c.sourceAccount))throw new BadRequestException('Enter a valid source account identifier.');
    ciphertext=sealPayoutCredentials(tid,c);accountHint='••••'+c.sourceAccount.slice(-4);
   }
   if(input.enabled&&(!isApi||!ciphertext))throw new BadRequestException('Live API payments require complete credentials. Manual and bank-file modes cannot send money automatically.');
   if(input.enabled&&input.provider==='BANK_API'&&!bankConnectors()[input.bankName])throw new BadRequestException('This bank has no installed connector. Save it with live payments off and request the bank integration from your software administrator.');
   const data={provider:input.provider,bankName:input.bankName,accountLabel:input.accountLabel,mode:input.mode,enabled:input.enabled,credentialsCiphertext:ciphertext,accountHint,revision:input.expectedRevision+1,updatedBy:ctx.user.id};
   const row=await tx.companyPayoutConnection.upsert({where:{tenantId:tid},create:{tenantId:tid,...data},update:data});
   await tx.companyPayoutConnectionVersion.create({data:{tenantId:tid,revision:row.revision,provider:row.provider,bankName:row.bankName,credentialsCiphertext:row.credentialsCiphertext}});
   await audit(tx,ctx,'COMPANY_PAYOUT_CONNECTION_UPDATED','payroll',tid,publicConnection(existing),publicConnection(row));return publicConnection(row);
  });
 }
}

export async function historicalPaymentConnection(db:any,company:any,payout:any){
 const revision=Number(jsonObject(payout.details).connectionRevision??0);
 if(!revision)return paymentConnection(db,company);
 const row=await db.companyPayoutConnectionVersion.findUnique({where:{tenantId_revision:{tenantId:company.id,revision}}});
 if(!row||row.provider!==payout.provider||!row.credentialsCiphertext)throw new ServiceUnavailableException('Original salary payment connection is unavailable.');
 return {provider:row.provider,enabled:true,revision,bankName:row.bankName,credentials:()=>openPayoutCredentials(company.id,row.credentialsCiphertext),mode:payout.mode};
}
