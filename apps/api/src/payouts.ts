import {z} from 'zod';
import {lockPayrollRun} from './payroll-lock';
import {BadRequestException,ConflictException,ForbiddenException,ServiceUnavailableException} from '@nestjs/common';
import type {Database} from '../../../packages/database';
import type {Context} from './context';
import {audit,requirePermission,tenant} from './context';
import {restrictedRoles} from '../../../packages/permissions';
import {paymentConnection,lockCompanyPayments,activeScheduleStatuses,jsonObject,bankConnectors,historicalPaymentConnection} from './payout-connections';

function object(value:any){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
function safeProviderDetails(data:any){return {id:data?.id??null,status:data?.status??null,utr:data?.utr??null,mode:data?.mode??null,fees:data?.fees??null,tax:data?.tax??null,status_details:data?.status_details??null};}
function requirePayoutCredentials(config?:any){
  if(config?.credentials){const c=config.credentials();if(!c.keyId||!c.keySecret||!c.sourceAccount)throw new ServiceUnavailableException('Company payout credentials are incomplete.');return;}
  if(!process.env.RAZORPAY_KEY_ID?.trim()||!process.env.RAZORPAY_KEY_SECRET?.trim()||!process.env.RAZORPAYX_ACCOUNT_NUMBER?.trim())throw new ServiceUnavailableException('RazorpayX payout credentials are incomplete.');
}
async function razorpayPayout(payoutId:string,employee:any,amount:number,month:string,mode:string,config?:any){
  const c=config?.credentials?.(),key=c?.keyId??process.env.RAZORPAY_KEY_ID?.trim(),secret=c?.keySecret??process.env.RAZORPAY_KEY_SECRET?.trim(),sourceAccount=c?.sourceAccount??process.env.RAZORPAYX_ACCOUNT_NUMBER?.trim();
  if(!key||!secret||!sourceAccount)throw new ServiceUnavailableException('RazorpayX payout credentials are incomplete.');
  const personal=object(employee.personal),accountNumber=String(personal.accountNumber??'').trim(),ifsc=String(personal.ifsc??'').trim().toUpperCase(),accountHolder=String(personal.accountHolder||`${employee.firstName} ${employee.lastName}`).trim();
  if(!accountNumber||!ifsc)throw new BadRequestException(`Bank account number and IFSC are required for ${employee.employeeCode}.`);
  const payload={account_number:sourceAccount,amount,currency:'INR',mode,purpose:'salary',queue_if_low_balance:false,reference_id:payoutId.slice(0,40),narration:`Salary ${month}`.replace(/[^A-Za-z0-9 ]/g,' ').slice(0,30),fund_account:{account_type:'bank_account',bank_account:{name:accountHolder,ifsc,account_number:accountNumber},contact:{name:accountHolder.slice(0,50),type:'employee',reference_id:employee.id}}};
  const response=await fetch('https://api.razorpay.com/v1/payouts',{method:'POST',signal:AbortSignal.timeout(30000),headers:{Authorization:`Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,'Content-Type':'application/json','X-Payout-Idempotency':payoutId},body:JSON.stringify(payload)});
  const text=await response.text();let data:any={};try{data=JSON.parse(text)}catch{}
  if(!response.ok)throw new ServiceUnavailableException(`RazorpayX payout failed (${response.status}). Check payout account, IP allowlist and balance.`);
  if(typeof data.id!=='string'||!data.id||typeof data.status!=='string'||!data.status)throw new ServiceUnavailableException('The payout response could not be verified. Check the provider dashboard before any further transfer.');
  return data;
}

async function razorpayPayoutStatus(providerRef:string,config?:any){
  const c=config?.credentials?.(),key=c?.keyId??process.env.RAZORPAY_KEY_ID?.trim(),secret=c?.keySecret??process.env.RAZORPAY_KEY_SECRET?.trim();
  if(!key||!secret)throw new ServiceUnavailableException('RazorpayX payout credentials are incomplete.');
  const response=await fetch(`https://api.razorpay.com/v1/payouts/${encodeURIComponent(providerRef)}`,{method:'GET',signal:AbortSignal.timeout(20000),headers:{Authorization:`Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,'Content-Type':'application/json'}});
  const text=await response.text();let data:any={};try{data=JSON.parse(text)}catch{}
  if(!response.ok)throw new ServiceUnavailableException(`RazorpayX payout status check failed (${response.status}).`);
  return data;
}
export interface PayoutProvider{
  validateConfiguration(config?:any):void;
  send(payoutId:string,employee:any,amount:number,month:string,mode:string,config?:any):Promise<any>;
  status(providerRef:string,config?:any):Promise<any>;
}
const razorpayProvider:PayoutProvider={validateConfiguration:requirePayoutCredentials,send:razorpayPayout,status:razorpayPayoutStatus};
export class PayoutService{
  constructor(private db:Database,private provider?:PayoutProvider){}
  async reconciliation(ctx:Context){
    const tid=tenant(ctx);requirePermission(ctx,'payroll','VIEW');
    if(restrictedRoles.has(ctx.user.role.code))throw new ForbiddenException('Salary payouts are managed by your payroll team.');
    const rows=await this.db.payrollPayout.findMany({where:{tenantId:tid},orderBy:{createdAt:'desc'}});
    const runs=await this.db.payrollRun.findMany({where:{tenantId:tid,id:{in:rows.map(r=>r.runId)}},select:{id:true,month:true}}),months=new Map(runs.map(r=>[r.id,r.month]));
    return {items:rows.map(r=>({id:r.id,runId:r.runId,month:months.get(r.runId)??'',employeeCode:r.employeeCode,employeeName:r.employeeName,amount:r.amount,provider:r.provider,providerRef:r.providerRef,reference:r.reference,status:r.status,utr:r.utr,error:r.error,updatedAt:r.updatedAt}))};
  }
  async list(ctx:Context,runId:string){
    const tid=tenant(ctx);requirePermission(ctx,'payroll','VIEW');
    if(restrictedRoles.has(ctx.user.role.code))throw new ForbiddenException('Salary payouts are managed by your payroll team.');
    const company=await this.db.tenant.findUniqueOrThrow({where:{id:tid}}),config=await paymentConnection(this.db,company);
    const items=await this.db.payrollPayout.findMany({where:{tenantId:tid,runId},orderBy:{employeeCode:'asc'}});
    return {items,config:{provider:config.provider,enabled:config.enabled,mode:config.mode,accountLabel:config.accountLabel,accountHint:config.accountHint,revision:config.revision}};
  }
  async sync(ctx:Context,runId:string){
    const tid=tenant(ctx);requirePermission(ctx,'payroll','APPROVE');
    if(restrictedRoles.has(ctx.user.role.code))throw new ForbiddenException('Salary payouts are managed by your payroll team.');
    const company=await this.db.tenant.findUnique({where:{id:tid}});if(!company)throw new BadRequestException('Company was not found.');
    const rows=await this.db.payrollPayout.findMany({where:{tenantId:tid,runId,provider:{in:['RAZORPAYX','BANK_API']},providerRef:{not:null}}});const results=[] as any[];
    for(const row of rows){
      if(['reversed','cancelled','rejected','failed','FAILED'].includes(row.status)) {results.push(row);continue;}
      try{
        const config=await historicalPaymentConnection(this.db,company,row);
        const remote=await (this.provider??providerFor(config)).status(row.providerRef!,config);
        if(remote?.id!==row.providerRef||!validRemoteStatus(remote?.status)||remote.amount!=null&&remote.amount!==row.amount||remote.currency!=null&&remote.currency!=='INR'||!this.provider&&(remote.amount!==row.amount||remote.currency!=='INR'||remote.reference_id!==row.id))throw new Error('The provider status response could not be verified.');
        if(row.status==='processed'&&!['processed','reversed'].includes(remote.status)){results.push(row);continue;}
        // Ignore stale overlapping sync responses instead of regressing a newer status.
        await this.db.payrollPayout.updateMany({where:{id:row.id,updatedAt:row.updatedAt},data:{status:remote.status,utr:remote.utr??row.utr,details:{...safeProviderDetails(remote),connectionRevision:Number(jsonObject(row.details).connectionRevision??0)},error:null}});
        results.push(await this.db.payrollPayout.findUniqueOrThrow({where:{id:row.id}}));
      }
      catch(e:any){results.push(await this.db.payrollPayout.update({where:{id:row.id},data:{error:String(e?.message??'Status sync failed').slice(0,500)}}));}
    }
    return {items:results};
  }
  async recoverReference(ctx:Context,runId:string,body:unknown){
    const tid=tenant(ctx);requirePermission(ctx,'payroll','APPROVE');if(restrictedRoles.has(ctx.user.role.code))throw new ForbiddenException('Salary payouts are managed by your payroll team.');
    const input=z.object({payoutId:z.string().uuid(),providerRef:z.string().trim().min(3).max(120),expectedUpdatedAt:z.iso.datetime()}).strict().parse(body);
    const row=await this.db.payrollPayout.findFirst({where:{id:input.payoutId,tenantId:tid,runId,status:{in:['UNKNOWN','INITIATING']},providerRef:null}});if(!row||row.updatedAt.toISOString()!==input.expectedUpdatedAt)throw new ConflictException('Transfer changed or is not eligible for reference recovery.');
    const company=await this.db.tenant.findUniqueOrThrow({where:{id:tid}}),config=await historicalPaymentConnection(this.db,company,row);if(!config.enabled||config.provider!==row.provider)throw new ForbiddenException('Reconnect the original company payment account to reconcile this transfer.');
    const remote=await (this.provider??providerFor(config)).status(input.providerRef,config);
    if(remote?.id!==input.providerRef||remote.reference_id!==row.id||remote.amount!==row.amount||remote.currency!=='INR'||!validRemoteStatus(remote.status))throw new BadRequestException('Provider reference does not match this exact salary transfer, amount and currency. No record was changed.');
    const updated=await this.db.payrollPayout.updateMany({where:{id:row.id,updatedAt:row.updatedAt,providerRef:null},data:{providerRef:remote.id,status:remote.status,utr:remote.utr??null,details:{...safeProviderDetails(remote),connectionRevision:Number(jsonObject(row.details).connectionRevision??0)},error:null}});if(!updated.count)throw new ConflictException('Transfer changed. Refresh and review it again.');
    await audit(this.db,ctx,'PAYROLL_PAYOUT_REFERENCE_RECOVERED','payroll',runId,{payoutId:row.id,status:row.status},{payoutId:row.id,providerRef:remote.id,status:remote.status});return this.db.payrollPayout.findUniqueOrThrow({where:{id:row.id}});
  }
  async pay(ctx:Context,runId:string,body:any,scheduleId?:string){
    const tid=tenant(ctx);requirePermission(ctx,'payroll','APPROVE');
    if(body?.confirm!==true)throw new BadRequestException('Confirm the salary payout before sending money.');
    const mode=String(body?.mode??'IMPS').toUpperCase();if(!['IMPS','NEFT','RTGS'].includes(mode))throw new BadRequestException('Choose IMPS, NEFT or RTGS.');
    if(restrictedRoles.has(ctx.user.role.code))throw new ForbiddenException('Salary payouts are managed by your payroll team.');
    // Claim each employee exactly once while holding the same period lock as reopen/delete.
    // Network requests run after commit so a slow provider does not hold database locks.
    const batch=await this.db.$transaction(async tx=>{
      await lockCompanyPayments(tx,tid);await lockPayrollRun(tx,tid,runId);
      const [run,company]=await Promise.all([tx.payrollRun.findFirst({where:{id:runId,tenantId:tid},include:{items:true}}),tx.tenant.findUnique({where:{id:tid}})]);
      if(!run||!company)throw new BadRequestException('Payroll run was not found.');
      if(run.status!=='LOCKED')throw new BadRequestException('Lock payroll before sending salary payouts.');
      const config=await paymentConnection(tx,company);if(!['RAZORPAYX','BANK_API'].includes(config.provider))throw new BadRequestException('Connect this company’s payout API in Payment settings before sending salaries.');
      if(company.currency!=='INR')throw new BadRequestException('Live bank salary payments currently support INR only.');
      if(!['ACTIVE','TRIAL'].includes(company.status)||(company.expiresAt&&company.expiresAt<new Date()))throw new ForbiddenException('Company access is inactive or expired.');
      const active=await tx.payrollPaymentSchedule.findFirst({where:{tenantId:tid,runId,status:{in:activeScheduleStatuses}}});
      if(active&&active.id!==scheduleId)throw new ConflictException('Cancel the scheduled payment before initiating another salary payment.');
      if(scheduleId){if(!active||active.status!=='RUNNING'||active.approvedBy!==ctx.user.id)throw new ConflictException('Salary schedule authorization is no longer active.');const {paymentSnapshot}=await import('./payment-readiness');const snapshot=await paymentSnapshot(tx,tid,runId,mode);if(!snapshot||snapshot.fingerprint!==active.fingerprint||config.revision!==active.connectionRevision)throw new ConflictException('Approved salary payment details changed.');}
      if(!config.enabled)throw new ForbiddenException('Live payouts are not enabled for this company. Complete its Payment settings first.');
      const existing=await tx.payrollPayout.findMany({where:{tenantId:tid,runId}}),claimedIds=new Set(existing.map(p=>p.employeeId));
      const unpaid=run.items.filter(item=>item.net>0&&!claimedIds.has(item.employeeId));
      const claims=[] as {payout:any;employee:any}[];
      if(unpaid.length){
        (this.provider??providerFor(config)).validateConfiguration(config);
        const employees=await tx.employee.findMany({where:{tenantId:tid,id:{in:unpaid.map(i=>i.employeeId)}}}),byId=new Map(employees.map(e=>[e.id,e]));
        const missing=unpaid.filter(item=>{const employee=byId.get(item.employeeId);return employeePayoutIssues(config,employee,item.net,mode).length>0});
        if(missing.length)throw new BadRequestException(`Resolve bank details and provider transfer requirements for: ${missing.slice(0,5).map(e=>e.employeeCode).join(', ')}${missing.length>5?'…':''}`);
        for(const item of unpaid){
          const payout=await tx.payrollPayout.create({data:{tenantId:tid,runId,employeeId:item.employeeId,employeeName:item.employeeName,employeeCode:item.employeeCode,amount:item.net,provider:config.provider,mode,status:'INITIATING',details:{connectionRevision:config.revision},reference:`SAL-${run.month}-${item.employeeCode}`.slice(0,80),initiatedBy:ctx.user.id}});
          claims.push({payout,employee:byId.get(item.employeeId)!});
        }
        await audit(tx,ctx,'PAYROLL_PAYOUT_CLAIMED','payroll',runId,undefined,{month:run.month,count:claims.length,provider:config.provider,mode,total:claims.reduce((n,c)=>n+c.payout.amount,0)});
      }
      return {month:run.month,existing,claims,config};
    },{timeout:30000});
    const results=[...batch.existing];
    for(let offset=0;offset<batch.claims.length;offset+=4){
      const completed=await Promise.all(batch.claims.slice(offset,offset+4).map(async({payout,employee})=>{
      let remote:any;
      try{
        remote=await (this.provider??providerFor(batch.config)).send(payout.id,employee,payout.amount,batch.month,payout.mode,batch.config);
        if(typeof remote?.id!=='string'||!remote.id||!validRemoteStatus(remote?.status)||remote.amount!=null&&remote.amount!==payout.amount||remote.currency!=null&&remote.currency!=='INR'||!this.provider&&(remote.amount!==payout.amount||remote.currency!=='INR'||remote.reference_id!==payout.id))throw new Error('The payout response could not be verified.');
      }catch(e:any){
        // A timeout/error does not prove that money was not sent. Never reuse this row to
        // initiate another transfer; reconcile with the provider first.
        return this.db.payrollPayout.update({where:{id:payout.id},data:{status:'UNKNOWN',error:`Verify this transfer in the provider dashboard. ${String(e?.message??'Payout response unavailable').slice(0,380)}`}});
      }
      // If persistence fails after a successful provider response, leave the committed
      // INITIATING claim intact. A later Pay request must still never resend it.
      return this.db.payrollPayout.update({where:{id:payout.id},data:{status:remote.status,providerRef:remote.id,utr:remote.utr??null,details:{...safeProviderDetails(remote),connectionRevision:batch.config.revision},error:null}});
      }));results.push(...completed);
    }
    return {items:results,initiated:batch.claims.length,skipped:batch.existing.length,unknown:results.filter(r=>r.status==='UNKNOWN').length,failed:results.filter(r=>['FAILED','failed','rejected','reversed','cancelled'].includes(r.status)).length,processed:results.filter(r=>['processed','processing','queued','pending'].includes(r.status)).length};
  }
}

export function validEmployeeBank(p:any){return /^[A-Za-z0-9]{5,35}$/.test(String(p.accountNumber??'').trim())&&/^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(p.ifsc??'').trim().toUpperCase());}
export function employeePayoutIssues(config:any,employee:any,amount:number,mode:string){
 const p=object(employee?.personal),issues:string[]=[];
 if(!employee||!validEmployeeBank(p))issues.push('Valid account number and IFSC required');
 if(mode==='RTGS'&&amount<20000000)issues.push('RTGS requires INR 2 lakh per transfer');
 if(config.provider==='RAZORPAYX'){
  if(amount<100)issues.push('RazorpayX requires a minimum INR 1 transfer');
  const holder=String(p.accountHolder||`${employee?.firstName??''} ${employee?.lastName??''}`).trim();
  if(holder.length<4||holder.length>120||!/^[A-Za-z0-9 ’_\/().-]+$/.test(holder))issues.push('RazorpayX requires a supported bank account holder name (4–120 characters)');
 }
 return issues;
}
function validRemoteStatus(status:any){return ['queued','pending','processing','processed','rejected','cancelled','reversed','failed'].includes(status);}
function providerFor(config:any):PayoutProvider{
 if(config.provider==='RAZORPAYX')return razorpayProvider;
 if(config.provider!=='BANK_API')throw new BadRequestException('Unsupported payment provider.');
 // Bank protocols differ. Only administrator-installed, bank-tested adapters are callable;
 // companies never supply endpoint URLs. The documented connector contract uses paise.
 const endpoint=bankConnectors()[config.bankName]?.url;
 return {
  validateConfiguration(){if(!endpoint)throw new ServiceUnavailableException('The bank connector is not installed.');requirePayoutCredentials(config);},
  async send(id,employee,amount,month,mode){const c=config.credentials(),p=jsonObject(employee.personal);return bankRequest('/payouts','POST',{idempotencyKey:id,reference:id,corporateId:c.corporateId,sourceAccount:c.sourceAccount,amount,currency:'INR',purpose:'salary',month,mode,beneficiary:{name:String(p.accountHolder||`${employee.firstName} ${employee.lastName}`),accountNumber:String(p.accountNumber),ifsc:String(p.ifsc).toUpperCase()}},id);},
  async status(id){return bankRequest('/payouts/'+encodeURIComponent(id),'GET');}
 };
 async function bankRequest(path:string,method:string,body?:any,id?:string){
  if(!endpoint)throw new ServiceUnavailableException('The bank connector is not installed.');const c=config.credentials();
  const r=await fetch(endpoint+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Basic ${Buffer.from(`${c.keyId}:${c.keySecret}`).toString('base64')}`,'Content-Type':'application/json','X-Corporate-Id':c.corporateId,...(id?{'Idempotency-Key':id}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(!r.ok)throw new ServiceUnavailableException(`Bank connector response unavailable (${r.status}). Verify the transfer in corporate banking.`);return r.json();
 }
}
