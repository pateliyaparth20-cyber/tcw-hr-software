import {lockPayrollRun} from './payroll-lock';
import {BadRequestException,ForbiddenException,ServiceUnavailableException} from '@nestjs/common';
import type {Database} from '../../../packages/database';
import type {Context} from './context';
import {audit,requirePermission,tenant} from './context';
import {restrictedRoles} from '../../../packages/permissions';

function object(value:any){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
function payoutConfig(company:any){
  const profile=object(company.profile);
  const provider=String(profile.payoutProvider??'NONE').toUpperCase();
  const enabled=process.env.PAYROLL_PAYOUTS_ENABLED==='true'&&provider==='RAZORPAYX'&&process.env.PAYOUT_PROVIDER==='RAZORPAYX'&&process.env.PAYOUT_COMPANY_CODE===company.code;
  return {provider,enabled,mode:String(profile.payoutMode??'IMPS').toUpperCase(),accountLabel:String(profile.payoutAccountLabel??'')};
}
function safeProviderDetails(data:any){return {id:data?.id??null,status:data?.status??null,utr:data?.utr??null,mode:data?.mode??null,fees:data?.fees??null,tax:data?.tax??null,status_details:data?.status_details??null};}
function requirePayoutCredentials(){
  if(!process.env.RAZORPAY_KEY_ID?.trim()||!process.env.RAZORPAY_KEY_SECRET?.trim()||!process.env.RAZORPAYX_ACCOUNT_NUMBER?.trim())throw new ServiceUnavailableException('RazorpayX payout credentials are incomplete.');
}
async function razorpayPayout(payoutId:string,employee:any,amount:number,month:string,mode:string){
  const key=process.env.RAZORPAY_KEY_ID?.trim(),secret=process.env.RAZORPAY_KEY_SECRET?.trim(),sourceAccount=process.env.RAZORPAYX_ACCOUNT_NUMBER?.trim();
  if(!key||!secret||!sourceAccount)throw new ServiceUnavailableException('RazorpayX payout credentials are incomplete.');
  const personal=object(employee.personal),accountNumber=String(personal.accountNumber??'').trim(),ifsc=String(personal.ifsc??'').trim().toUpperCase(),accountHolder=String(personal.accountHolder??`${employee.firstName} ${employee.lastName}`).trim();
  if(!accountNumber||!ifsc)throw new BadRequestException(`Bank account number and IFSC are required for ${employee.employeeCode}.`);
  const payload={account_number:sourceAccount,amount,currency:'INR',mode,purpose:'salary',queue_if_low_balance:false,reference_id:payoutId.slice(0,40),narration:`Salary ${month}`.replace(/[^A-Za-z0-9 ]/g,' ').slice(0,30),fund_account:{account_type:'bank_account',bank_account:{name:accountHolder,ifsc,account_number:accountNumber},contact:{name:`${employee.firstName} ${employee.lastName}`,email:employee.email,contact:employee.phone||undefined,type:'employee',reference_id:employee.employeeCode}}};
  const response=await fetch('https://api.razorpay.com/v1/payouts',{method:'POST',signal:AbortSignal.timeout(30000),headers:{Authorization:`Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,'Content-Type':'application/json','X-Payout-Idempotency':payoutId},body:JSON.stringify(payload)});
  const text=await response.text();let data:any={};try{data=JSON.parse(text)}catch{}
  if(!response.ok)throw new ServiceUnavailableException(`RazorpayX payout failed (${response.status}). ${String(data?.error?.description??'Check payout account, IP allowlist and balance.').slice(0,240)}`);
  if(typeof data.id!=='string'||!data.id||typeof data.status!=='string'||!data.status)throw new ServiceUnavailableException('The payout response could not be verified. Check the provider dashboard before any further transfer.');
  return data;
}

async function razorpayPayoutStatus(providerRef:string){
  const key=process.env.RAZORPAY_KEY_ID?.trim(),secret=process.env.RAZORPAY_KEY_SECRET?.trim();
  if(!key||!secret)throw new ServiceUnavailableException('RazorpayX payout credentials are incomplete.');
  const response=await fetch(`https://api.razorpay.com/v1/payouts/${encodeURIComponent(providerRef)}`,{method:'GET',signal:AbortSignal.timeout(20000),headers:{Authorization:`Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,'Content-Type':'application/json'}});
  const text=await response.text();let data:any={};try{data=JSON.parse(text)}catch{}
  if(!response.ok)throw new ServiceUnavailableException(`RazorpayX payout status check failed (${response.status}).`);
  return data;
}
export interface PayoutProvider{
  validateConfiguration():void;
  send(payoutId:string,employee:any,amount:number,month:string,mode:string):Promise<any>;
  status(providerRef:string):Promise<any>;
}
const defaultProvider:PayoutProvider={validateConfiguration:requirePayoutCredentials,send:razorpayPayout,status:razorpayPayoutStatus};
export class PayoutService{
  constructor(private db:Database,private provider:PayoutProvider=defaultProvider){}
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
    const company=await this.db.tenant.findUniqueOrThrow({where:{id:tid}}),config=payoutConfig(company);
    const items=await this.db.payrollPayout.findMany({where:{tenantId:tid,runId},orderBy:{employeeCode:'asc'}});
    return {items,config:{provider:config.provider,enabled:config.enabled,mode:config.mode,accountLabel:config.accountLabel}};
  }
  async sync(ctx:Context,runId:string){
    const tid=tenant(ctx);requirePermission(ctx,'payroll','APPROVE');
    if(restrictedRoles.has(ctx.user.role.code))throw new ForbiddenException('Salary payouts are managed by your payroll team.');
    const company=await this.db.tenant.findUnique({where:{id:tid}});if(!company)throw new BadRequestException('Company was not found.');
    const config=payoutConfig(company);if(!config.enabled)throw new ForbiddenException('Live payout status sync is not enabled for this company.');
    const rows=await this.db.payrollPayout.findMany({where:{tenantId:tid,runId,provider:'RAZORPAYX',providerRef:{not:null}}});const results=[] as any[];
    for(const row of rows){
      if(['processed','reversed','cancelled','rejected','FAILED'].includes(row.status)) {results.push(row);continue;}
      try{
        const remote=await this.provider.status(row.providerRef!);
        if(remote?.id!==row.providerRef||typeof remote?.status!=='string'||!remote.status)throw new Error('The provider status response could not be verified.');
        // Ignore stale overlapping sync responses instead of regressing a newer status.
        await this.db.payrollPayout.updateMany({where:{id:row.id,updatedAt:row.updatedAt},data:{status:remote.status,utr:remote.utr??row.utr,details:safeProviderDetails(remote),error:null}});
        results.push(await this.db.payrollPayout.findUniqueOrThrow({where:{id:row.id}}));
      }
      catch(e:any){results.push(await this.db.payrollPayout.update({where:{id:row.id},data:{error:String(e?.message??'Status sync failed').slice(0,500)}}));}
    }
    return {items:results};
  }
  async pay(ctx:Context,runId:string,body:any){
    const tid=tenant(ctx);requirePermission(ctx,'payroll','APPROVE');
    if(body?.confirm!==true)throw new BadRequestException('Confirm the salary payout before sending money.');
    const mode=String(body?.mode??'IMPS').toUpperCase();if(!['IMPS','NEFT','RTGS'].includes(mode))throw new BadRequestException('Choose IMPS, NEFT or RTGS.');
    if(restrictedRoles.has(ctx.user.role.code))throw new ForbiddenException('Salary payouts are managed by your payroll team.');
    // Claim each employee exactly once while holding the same period lock as reopen/delete.
    // Network requests run after commit so a slow provider does not hold database locks.
    const batch=await this.db.$transaction(async tx=>{
      await lockPayrollRun(tx,tid,runId);
      const [run,company]=await Promise.all([tx.payrollRun.findFirst({where:{id:runId,tenantId:tid},include:{items:true}}),tx.tenant.findUnique({where:{id:tid}})]);
      if(!run||!company)throw new BadRequestException('Payroll run was not found.');
      if(run.status!=='LOCKED')throw new BadRequestException('Lock payroll before sending salary payouts.');
      const config=payoutConfig(company);if(config.provider!=='RAZORPAYX')throw new BadRequestException('Set Salary payout method to RazorpayX in Company settings before using Pay salaries.');
      if(!config.enabled)throw new ForbiddenException('Live payouts are not enabled for this company. Configure PAYROLL_PAYOUTS_ENABLED, PAYOUT_COMPANY_CODE and RazorpayX credentials on the server.');
      const existing=await tx.payrollPayout.findMany({where:{tenantId:tid,runId}}),claimedIds=new Set(existing.map(p=>p.employeeId));
      const unpaid=run.items.filter(item=>item.net>0&&!claimedIds.has(item.employeeId));
      const claims=[] as {payout:any;employee:any}[];
      if(unpaid.length){
        this.provider.validateConfiguration();
        const employees=await tx.employee.findMany({where:{tenantId:tid,id:{in:unpaid.map(i=>i.employeeId)}}}),byId=new Map(employees.map(e=>[e.id,e]));
        const missing=unpaid.filter(item=>{const employee=byId.get(item.employeeId),p=object(employee?.personal);return !employee||!String(p.accountNumber??'').trim()||!String(p.ifsc??'').trim()});
        if(missing.length)throw new BadRequestException(`Complete bank account number and IFSC for: ${missing.slice(0,5).map(e=>e.employeeCode).join(', ')}${missing.length>5?'…':''}`);
        for(const item of unpaid){
          const payout=await tx.payrollPayout.create({data:{tenantId:tid,runId,employeeId:item.employeeId,employeeName:item.employeeName,employeeCode:item.employeeCode,amount:item.net,provider:'RAZORPAYX',mode,status:'INITIATING',reference:`SAL-${run.month}-${item.employeeCode}`.slice(0,80),initiatedBy:ctx.user.id}});
          claims.push({payout,employee:byId.get(item.employeeId)!});
        }
        await audit(tx,ctx,'PAYROLL_PAYOUT_CLAIMED','payroll',runId,undefined,{month:run.month,count:claims.length,provider:'RAZORPAYX',mode,total:claims.reduce((n,c)=>n+c.payout.amount,0)});
      }
      return {month:run.month,existing,claims};
    },{timeout:30000});
    const results=[...batch.existing];
    for(const {payout,employee} of batch.claims){
      let remote:any;
      try{
        remote=await this.provider.send(payout.id,employee,payout.amount,batch.month,payout.mode);
        if(typeof remote?.id!=='string'||!remote.id||typeof remote?.status!=='string'||!remote.status)throw new Error('The payout response could not be verified.');
      }catch(e:any){
        // A timeout/error does not prove that money was not sent. Never reuse this row to
        // initiate another transfer; reconcile with the provider first.
        results.push(await this.db.payrollPayout.update({where:{id:payout.id},data:{status:'UNKNOWN',error:`Verify this transfer in the provider dashboard. ${String(e?.message??'Payout response unavailable').slice(0,380)}`}}));
        continue;
      }
      // If persistence fails after a successful provider response, leave the committed
      // INITIATING claim intact. A later Pay request must still never resend it.
      results.push(await this.db.payrollPayout.update({where:{id:payout.id},data:{status:remote.status,providerRef:remote.id,utr:remote.utr??null,details:safeProviderDetails(remote),error:null}}));
    }
    return {items:results,initiated:batch.claims.length,skipped:batch.existing.length,unknown:results.filter(r=>r.status==='UNKNOWN').length,failed:results.filter(r=>['FAILED','failed','rejected','reversed','cancelled'].includes(r.status)).length,processed:results.filter(r=>['processed','processing','queued','pending'].includes(r.status)).length};
  }
}
