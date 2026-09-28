import {BadRequestException,ForbiddenException,ServiceUnavailableException} from '@nestjs/common';
import type {Database} from '../../../packages/database';
import type {Context} from './context';
import {audit,requirePermission,tenant} from './context';

function object(value:any){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
function payoutConfig(company:any){
  const profile=object(company.profile);
  const provider=String(profile.payoutProvider??'NONE').toUpperCase();
  const enabled=process.env.PAYROLL_PAYOUTS_ENABLED==='true'&&provider==='RAZORPAYX'&&process.env.PAYOUT_PROVIDER==='RAZORPAYX'&&process.env.PAYOUT_COMPANY_CODE===company.code;
  return {provider,enabled,mode:String(profile.payoutMode??'IMPS').toUpperCase(),accountLabel:String(profile.payoutAccountLabel??'')};
}
function safeProviderDetails(data:any){return {id:data?.id??null,status:data?.status??null,utr:data?.utr??null,mode:data?.mode??null,fees:data?.fees??null,tax:data?.tax??null,status_details:data?.status_details??null};}
async function razorpayPayout(payoutId:string,employee:any,amount:number,month:string,mode:string){
  const key=process.env.RAZORPAY_KEY_ID?.trim(),secret=process.env.RAZORPAY_KEY_SECRET?.trim(),sourceAccount=process.env.RAZORPAYX_ACCOUNT_NUMBER?.trim();
  if(!key||!secret||!sourceAccount)throw new ServiceUnavailableException('RazorpayX payout credentials are incomplete.');
  const personal=object(employee.personal),accountNumber=String(personal.accountNumber??'').trim(),ifsc=String(personal.ifsc??'').trim().toUpperCase(),accountHolder=String(personal.accountHolder??`${employee.firstName} ${employee.lastName}`).trim();
  if(!accountNumber||!ifsc)throw new BadRequestException(`Bank account number and IFSC are required for ${employee.employeeCode}.`);
  const payload={account_number:sourceAccount,amount,currency:'INR',mode,purpose:'salary',queue_if_low_balance:false,reference_id:payoutId.slice(0,40),narration:`Salary ${month}`.replace(/[^A-Za-z0-9 ]/g,' ').slice(0,30),fund_account:{account_type:'bank_account',bank_account:{name:accountHolder,ifsc,account_number:accountNumber},contact:{name:`${employee.firstName} ${employee.lastName}`,email:employee.email,contact:employee.phone||undefined,type:'employee',reference_id:employee.employeeCode}}};
  const response=await fetch('https://api.razorpay.com/v1/payouts',{method:'POST',signal:AbortSignal.timeout(30000),headers:{Authorization:`Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,'Content-Type':'application/json','X-Payout-Idempotency':payoutId},body:JSON.stringify(payload)});
  const text=await response.text();let data:any={};try{data=JSON.parse(text)}catch{}
  if(!response.ok)throw new ServiceUnavailableException(`RazorpayX payout failed (${response.status}). ${String(data?.error?.description??'Check payout account, IP allowlist and balance.').slice(0,240)}`);
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
export class PayoutService{
  constructor(private db:Database){}
  async list(ctx:Context,runId:string){
    const tid=tenant(ctx);requirePermission(ctx,'payroll','VIEW');
    const company=await this.db.tenant.findUniqueOrThrow({where:{id:tid}}),config=payoutConfig(company);
    const items=await this.db.payrollPayout.findMany({where:{tenantId:tid,runId},orderBy:{employeeCode:'asc'}});
    return {items,config:{provider:config.provider,enabled:config.enabled,mode:config.mode,accountLabel:config.accountLabel}};
  }
  async sync(ctx:Context,runId:string){
    const tid=tenant(ctx);requirePermission(ctx,'payroll','VIEW');
    const company=await this.db.tenant.findUnique({where:{id:tid}});if(!company)throw new BadRequestException('Company was not found.');
    const config=payoutConfig(company);if(!config.enabled)throw new ForbiddenException('Live payout status sync is not enabled for this company.');
    const rows=await this.db.payrollPayout.findMany({where:{tenantId:tid,runId,provider:'RAZORPAYX',providerRef:{not:null}}});const results=[] as any[];
    for(const row of rows){
      if(['processed','reversed','cancelled','rejected','FAILED'].includes(row.status)) {results.push(row);continue;}
      try{const remote=await razorpayPayoutStatus(row.providerRef!);results.push(await this.db.payrollPayout.update({where:{id:row.id},data:{status:String(remote.status??row.status),utr:remote.utr??row.utr,details:safeProviderDetails(remote),error:null}}));}
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
    const config=payoutConfig(company);if(config.provider!=='RAZORPAYX')throw new BadRequestException('Set Salary payout method to RazorpayX in Company settings before using Pay salaries.');
    if(!config.enabled)throw new ForbiddenException('Live payouts are not enabled for this company. Configure PAYROLL_PAYOUTS_ENABLED, PAYOUT_COMPANY_CODE and RazorpayX credentials on the server.');
    const employees=await this.db.employee.findMany({where:{tenantId:tid,id:{in:run.items.map(i=>i.employeeId)}}});const byId=new Map(employees.map(e=>[e.id,e]));
    const missing=employees.filter(e=>{const p=object(e.personal);return !String(p.accountNumber??'').trim()||!String(p.ifsc??'').trim()});if(missing.length)throw new BadRequestException(`Complete bank account number and IFSC for: ${missing.slice(0,5).map(e=>e.employeeCode).join(', ')}${missing.length>5?'…':''}`);
    const results=[] as any[];
    for(const item of run.items){
      if(item.net<=0)continue;const employee=byId.get(item.employeeId);if(!employee)continue;
      let payout=await this.db.payrollPayout.findUnique({where:{tenantId_runId_employeeId:{tenantId:tid,runId:run.id,employeeId:item.employeeId}}});
      if(payout&&['processed','processing','queued','pending','PAID'].includes(payout.status)) {results.push(payout);continue;}
      payout=payout?await this.db.payrollPayout.update({where:{id:payout.id},data:{status:'INITIATING',error:null,mode,amount:item.net}}):await this.db.payrollPayout.create({data:{tenantId:tid,runId:run.id,employeeId:item.employeeId,employeeName:item.employeeName,employeeCode:item.employeeCode,amount:item.net,provider:'RAZORPAYX',mode,status:'INITIATING',reference:`SAL-${run.month}-${item.employeeCode}`.slice(0,80),initiatedBy:ctx.user.id}});
      try{const remote=await razorpayPayout(payout.id,employee,item.net,run.month,mode);const updated=await this.db.payrollPayout.update({where:{id:payout.id},data:{status:String(remote.status??'processing'),providerRef:remote.id??null,utr:remote.utr??null,details:safeProviderDetails(remote)}});results.push(updated);}
      catch(e:any){const updated=await this.db.payrollPayout.update({where:{id:payout.id},data:{status:'FAILED',error:String(e?.message??'Payout failed').slice(0,500)}});results.push(updated);}
    }
    await audit(this.db,ctx,'PAYROLL_PAYOUT_SENT','payroll',run.id,undefined,{month:run.month,count:results.length,provider:'RAZORPAYX',mode,total:results.reduce((n,r)=>n+r.amount,0)});
    return {items:results,failed:results.filter(r=>r.status==='FAILED').length,processed:results.filter(r=>['processed','processing','queued','pending'].includes(r.status)).length};
  }
}
