import {BadRequestException,ForbiddenException,ServiceUnavailableException} from '@nestjs/common';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import type {Database} from '../../../packages/database';
import type {Context} from './context';
import {audit,requirePermission,tenant} from './context';

function object(value:any){return value&&typeof value==='object'&&!Array.isArray(value)?{...value}:{};}
function encryptionKey(){
  const secret=String(process.env.CONFIG_ENCRYPTION_KEY??'').trim();
  if(!secret)throw new Error('CONFIG_ENCRYPTION_KEY is required for encrypted payout credentials.');
  return createHash('sha256').update(secret).digest();
}
function encrypt(value:string){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);
  const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${data.toString('base64url')}`;
}
function decrypt(value:string){
  if(!value)return '';
  const [version,iv,tag,data]=value.split(':');
  if(version!=='v1'||!iv||!tag||!data)throw new Error('Stored payout credential is invalid. Re-enter RazorpayX credentials.');
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(iv,'base64url'));
  decipher.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8');
}
const mask=(value:string)=>value?('••••'+value.slice(-4)):'';
const payoutSettingKey=(tenantId:string)=>`tenant-payout:${tenantId}`;
type PayoutConfig={provider:'NONE'|'BANK_FILE'|'RAZORPAYX';enabled:boolean;mode:string;accountLabel:string;keyId:string;keySecret:string;sourceAccount:string;};

async function effectivePayoutConfig(db:Database,company:any):Promise<PayoutConfig>{
  const row=await db.platformSetting.findUnique({where:{key:payoutSettingKey(company.id)}});
  const value=object(row?.value),profile=object(company.profile);
  const legacyAllowed=process.env.PAYOUT_COMPANY_CODE===company.code;
  const rawProvider=String(value.provider??profile.payoutProvider??'NONE').toUpperCase();
  const provider:PayoutConfig['provider']=rawProvider==='RAZORPAYX'?'RAZORPAYX':rawProvider==='BANK_FILE'?'BANK_FILE':'NONE';
  const keyId=String(value.razorpayKeyId??(legacyAllowed?process.env.RAZORPAY_KEY_ID:'')??'').trim();
  const keySecret=String(value.razorpayKeySecretCiphertext??'')?decrypt(String(value.razorpayKeySecretCiphertext)):String(legacyAllowed?process.env.RAZORPAY_KEY_SECRET??'':'').trim();
  const sourceAccount=String(value.sourceAccountCiphertext??'')?decrypt(String(value.sourceAccountCiphertext)):String(legacyAllowed?process.env.RAZORPAYX_ACCOUNT_NUMBER??'':'').trim();
  const mode=String(value.mode??profile.payoutMode??'IMPS').toUpperCase();
  const accountLabel=String(value.accountLabel??profile.payoutAccountLabel??'').trim();
  const explicit=Object.prototype.hasOwnProperty.call(value,'liveEnabled')?value.liveEnabled===true:(legacyAllowed&&process.env.PAYROLL_PAYOUTS_ENABLED==='true'&&process.env.PAYOUT_PROVIDER==='RAZORPAYX');
  return {provider,enabled:provider==='RAZORPAYX'&&explicit&&!!keyId&&!!keySecret&&!!sourceAccount,mode:['IMPS','NEFT','RTGS'].includes(mode)?mode:'IMPS',accountLabel,keyId,keySecret,sourceAccount};
}
async function publicPayoutConfig(db:Database,company:any){
  const cfg=await effectivePayoutConfig(db,company);
  return {provider:cfg.provider,enabled:cfg.enabled,mode:cfg.mode,accountLabel:cfg.accountLabel,razorpayKeyId:cfg.keyId,keySecretConfigured:!!cfg.keySecret,sourceAccountConfigured:!!cfg.sourceAccount,sourceAccountHint:mask(cfg.sourceAccount)};
}
async function savePayoutConfig(db:Database,company:any,input:any){
  const existing=await db.platformSetting.findUnique({where:{key:payoutSettingKey(company.id)}}),current=object(existing?.value);
  const keySecret=String(input.razorpayKeySecret??'').trim(),sourceAccount=String(input.sourceAccount??'').trim();
  const value:any={...current,provider:input.provider,razorpayKeyId:String(input.razorpayKeyId??'').trim(),mode:input.mode,accountLabel:String(input.accountLabel??'').trim(),liveEnabled:input.liveEnabled===true};
  if(keySecret)value.razorpayKeySecretCiphertext=encrypt(keySecret);
  if(sourceAccount)value.sourceAccountCiphertext=encrypt(sourceAccount);
  const effectiveSecret=keySecret||(value.razorpayKeySecretCiphertext?decrypt(String(value.razorpayKeySecretCiphertext)):'');
  const effectiveSource=sourceAccount||(value.sourceAccountCiphertext?decrypt(String(value.sourceAccountCiphertext)):'');
  if(input.provider==='RAZORPAYX'&&input.liveEnabled&&(!value.razorpayKeyId||!effectiveSecret||!effectiveSource))throw new BadRequestException('Enter RazorpayX Key ID, Key Secret and source account number before enabling live salary payouts.');
  await db.$transaction(async tx=>{
    await tx.platformSetting.upsert({where:{key:payoutSettingKey(company.id)},create:{key:payoutSettingKey(company.id),value},update:{value}});
    const profile=object(company.profile);
    await tx.tenant.update({where:{id:company.id},data:{profile:{...profile,payoutProvider:input.provider,payoutMode:input.mode,payoutAccountLabel:value.accountLabel}}});
  });
  const updated=await db.tenant.findUniqueOrThrow({where:{id:company.id}});
  return publicPayoutConfig(db,updated);
}

function safeProviderDetails(data:any){return {id:data?.id??null,status:data?.status??null,utr:data?.utr??null,mode:data?.mode??null,fees:data?.fees??null,tax:data?.tax??null,status_details:data?.status_details??null};}
function authHeader(cfg:PayoutConfig){return `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64')}`;}
async function razorpayXRequest(cfg:PayoutConfig,path:string,init:RequestInit={}){
  if(!cfg.enabled)throw new ServiceUnavailableException('RazorpayX live salary payouts are not configured for this company.');
  const response=await fetch('https://api.razorpay.com'+path,{...init,signal:AbortSignal.timeout(30000),headers:{Authorization:authHeader(cfg),'Content-Type':'application/json',...(init.headers??{})}});
  const text=await response.text();let data:any={};try{data=JSON.parse(text)}catch{}
  if(!response.ok)throw new ServiceUnavailableException(`RazorpayX request failed (${response.status}). ${String(data?.error?.description??data?.error?.reason??'Check payout account, API access, IP allowlist and balance.').slice(0,240)}`);
  return data;
}
async function ensureRazorpayFundAccount(db:Database,cfg:PayoutConfig,employee:any){
  const personal=object(employee.personal),accountNumber=String(personal.accountNumber??'').trim(),ifsc=String(personal.ifsc??'').trim().toUpperCase(),accountHolder=String(personal.accountHolder??`${employee.firstName} ${employee.lastName}`).trim();
  if(!accountNumber||!ifsc)throw new BadRequestException(`Bank account number and IFSC are required for ${employee.employeeCode}.`);
  const fingerprint=createHash('sha256').update([accountNumber,ifsc,accountHolder].join('|')).digest('hex'),mappingKey=`payout-beneficiary:${employee.tenantId}:${employee.id}`;
  const cached=object((await db.platformSetting.findUnique({where:{key:mappingKey}}))?.value);
  if(cached.fundAccountId&&cached.bankFingerprint===fingerprint)return String(cached.fundAccountId);
  const contact=await razorpayXRequest(cfg,'/v1/contacts',{method:'POST',body:JSON.stringify({name:`${employee.firstName} ${employee.lastName}`.slice(0,50),email:employee.email||undefined,contact:employee.phone||undefined,type:'employee',reference_id:`EMP-${employee.id.slice(0,24)}`})});
  if(!contact?.id)throw new ServiceUnavailableException('RazorpayX did not return an employee contact ID.');
  const fund=await razorpayXRequest(cfg,'/v1/fund_accounts',{method:'POST',body:JSON.stringify({contact_id:contact.id,account_type:'bank_account',bank_account:{name:accountHolder,ifsc,account_number:accountNumber}})});
  if(!fund?.id)throw new ServiceUnavailableException('RazorpayX did not return an employee fund account ID.');
  await db.platformSetting.upsert({where:{key:mappingKey},create:{key:mappingKey,value:{contactId:String(contact.id),fundAccountId:String(fund.id),bankFingerprint:fingerprint}},update:{value:{contactId:String(contact.id),fundAccountId:String(fund.id),bankFingerprint:fingerprint}}});
  return String(fund.id);
}
async function razorpayPayout(db:Database,cfg:PayoutConfig,payoutId:string,employee:any,amount:number,month:string,mode:string){
  const fundAccountId=await ensureRazorpayFundAccount(db,cfg,employee);
  const payload={account_number:cfg.sourceAccount,fund_account_id:fundAccountId,amount,currency:'INR',mode,purpose:'salary',queue_if_low_balance:false,reference_id:payoutId.slice(0,40),narration:`Salary ${month}`.replace(/[^A-Za-z0-9 ]/g,' ').slice(0,30)};
  return razorpayXRequest(cfg,'/v1/payouts',{method:'POST',headers:{'X-Payout-Idempotency':payoutId},body:JSON.stringify(payload)});
}
async function razorpayPayoutStatus(cfg:PayoutConfig,providerRef:string){return razorpayXRequest(cfg,`/v1/payouts/${encodeURIComponent(providerRef)}`,{method:'GET'});}

export class PayoutService{
  constructor(private db:Database){}
  async settings(ctx:Context,method:string,body?:unknown){
    const tid=tenant(ctx);requirePermission(ctx,'company',method==='GET'?'VIEW':'EDIT');
    const company=await this.db.tenant.findUniqueOrThrow({where:{id:tid}});
    if(method==='GET')return publicPayoutConfig(this.db,company);
    if(method!=='PUT')throw new BadRequestException('Unsupported payout settings operation.');
    const input=z.object({
      provider:z.enum(['NONE','BANK_FILE','RAZORPAYX']),
      razorpayKeyId:z.string().trim().max(160).default(''),
      razorpayKeySecret:z.string().max(300).default(''),
      sourceAccount:z.string().trim().max(120).default(''),
      mode:z.enum(['IMPS','NEFT','RTGS']).default('IMPS'),
      accountLabel:z.string().trim().max(160).default(''),
      liveEnabled:z.boolean().default(false)
    }).strict().parse(body);
    const result=await savePayoutConfig(this.db,company,input);
    await audit(this.db,ctx,'SALARY_PAYOUT_SETTINGS_UPDATED','company',tid,undefined,{provider:result.provider,enabled:result.enabled,mode:result.mode,keySecretConfigured:result.keySecretConfigured,sourceAccountConfigured:result.sourceAccountConfigured});
    return result;
  }
  async list(ctx:Context,runId:string){
    const tid=tenant(ctx);requirePermission(ctx,'payroll','VIEW');
    const company=await this.db.tenant.findUniqueOrThrow({where:{id:tid}}),config=await effectivePayoutConfig(this.db,company);
    const items=await this.db.payrollPayout.findMany({where:{tenantId:tid,runId},orderBy:{employeeCode:'asc'}});
    return {items,config:{provider:config.provider,enabled:config.enabled,mode:config.mode,accountLabel:config.accountLabel,keyConfigured:!!config.keyId&&!!config.keySecret,sourceAccountConfigured:!!config.sourceAccount}};
  }
  async sync(ctx:Context,runId:string){
    const tid=tenant(ctx);requirePermission(ctx,'payroll','VIEW');
    const company=await this.db.tenant.findUnique({where:{id:tid}});if(!company)throw new BadRequestException('Company was not found.');
    const config=await effectivePayoutConfig(this.db,company);if(!config.enabled)throw new ForbiddenException('Live payout status sync is not enabled for this company.');
    const rows=await this.db.payrollPayout.findMany({where:{tenantId:tid,runId,provider:'RAZORPAYX',providerRef:{not:null}}});const results=[] as any[];
    for(const row of rows){
      if(['processed','reversed','cancelled','rejected','FAILED','PAID'].includes(row.status)){results.push(row);continue;}
      try{const remote=await razorpayPayoutStatus(config,row.providerRef!);results.push(await this.db.payrollPayout.update({where:{id:row.id},data:{status:String(remote.status??row.status),utr:remote.utr??row.utr,details:safeProviderDetails(remote),error:null}}));}
      catch(e:any){results.push(await this.db.payrollPayout.update({where:{id:row.id},data:{error:String(e?.message??'Status sync failed').slice(0,500)}}));}
    }
    return {items:results};
  }
  async pay(ctx:Context,runId:string,body:any){
    const tid=tenant(ctx);requirePermission(ctx,'payroll','APPROVE');
    if(body?.confirm!==true)throw new BadRequestException('Confirm the salary payout before sending money.');
    const mode=String(body?.mode??'IMPS').toUpperCase();if(!['IMPS','NEFT','RTGS'].includes(mode))throw new BadRequestException('Choose IMPS, NEFT or RTGS.');
    const [run,company]=await Promise.all([this.db.payrollRun.findFirst({where:{id:runId,tenantId:tid},include:{items:true}}),this.db.tenant.findUnique({where:{id:tid}})]);
    if(!run||!company)throw new BadRequestException('Payroll run was not found.');
    if(run.status!=='LOCKED')throw new BadRequestException('Lock payroll before sending salary payouts.');
    const config=await effectivePayoutConfig(this.db,company);if(config.provider!=='RAZORPAYX')throw new BadRequestException('Set Salary payout method to RazorpayX in Company profile before using Pay salaries.');
    if(!config.enabled)throw new ForbiddenException('Live payouts are not enabled for this company. Open Company profile → Salary payout setup and complete RazorpayX credentials.');
    const employees=await this.db.employee.findMany({where:{tenantId:tid,id:{in:run.items.map(i=>i.employeeId)}}});const byId=new Map(employees.map(e=>[e.id,e]));
    const missing=employees.filter(e=>{const p=object(e.personal);return !String(p.accountNumber??'').trim()||!String(p.ifsc??'').trim()});if(missing.length)throw new BadRequestException(`Complete bank account number and IFSC for: ${missing.slice(0,5).map(e=>e.employeeCode).join(', ')}${missing.length>5?'…':''}`);
    const results=[] as any[];
    for(const item of run.items){
      if(item.net<=0)continue;const employee=byId.get(item.employeeId);if(!employee)continue;
      let payout=await this.db.payrollPayout.findUnique({where:{tenantId_runId_employeeId:{tenantId:tid,runId:run.id,employeeId:item.employeeId}}});
      if(payout&&['processed','processing','queued','pending','PAID'].includes(payout.status)){results.push(payout);continue;}
      payout=payout?await this.db.payrollPayout.update({where:{id:payout.id},data:{status:'INITIATING',error:null,mode,amount:item.net}}):await this.db.payrollPayout.create({data:{tenantId:tid,runId:run.id,employeeId:item.employeeId,employeeName:item.employeeName,employeeCode:item.employeeCode,amount:item.net,provider:'RAZORPAYX',mode,status:'INITIATING',reference:`SAL-${run.month}-${item.employeeCode}`.slice(0,80),initiatedBy:ctx.user.id}});
      try{const remote=await razorpayPayout(this.db,config,payout.id,employee,item.net,run.month,mode);const updated=await this.db.payrollPayout.update({where:{id:payout.id},data:{status:String(remote.status??'processing'),providerRef:remote.id??null,utr:remote.utr??null,details:safeProviderDetails(remote),error:null}});results.push(updated);}
      catch(e:any){const updated=await this.db.payrollPayout.update({where:{id:payout.id},data:{status:'FAILED',error:String(e?.message??'Payout failed').slice(0,500)}});results.push(updated);}
    }
    await audit(this.db,ctx,'PAYROLL_PAYOUT_SENT','payroll',run.id,undefined,{month:run.month,count:results.length,provider:'RAZORPAYX',mode,total:results.reduce((n,r)=>n+r.amount,0)});
    return {items:results,failed:results.filter(r=>r.status==='FAILED').length,processed:results.filter(r=>['processed','processing','queued','pending'].includes(r.status)).length};
  }
}
