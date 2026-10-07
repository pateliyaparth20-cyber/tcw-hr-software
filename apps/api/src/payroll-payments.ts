import {BadRequestException,ConflictException,NotFoundException} from '@nestjs/common';
import {z} from 'zod';
import type {Database} from '../../../packages/database';
import {audit,tenant,type Context} from './context';
import {activeScheduleStatuses,lockCompanyPayments,paymentPermission} from './payout-connections';
import {paymentSnapshot} from './payment-readiness';
import {lockPayrollRun} from './payroll-lock';
import {PayoutService} from './payouts';
import {zonedMinute,localDate} from '../../../packages/attendance-engine';
const mode=z.enum(['IMPS','NEFT','RTGS']);
export class PayrollPayments{
 constructor(private db:Database,private payouts=new PayoutService(db)){}
 async overview(ctx:Context,runId:string){
  paymentPermission(ctx,'VIEW');const tid=tenant(ctx),company=await this.db.tenant.findUniqueOrThrow({where:{id:tid}});
  const snapshot=await paymentSnapshot(this.db,tid,runId,'NEFT');if(!snapshot)throw new NotFoundException('Payroll run not found.');
  const schedules=await this.db.payrollPaymentSchedule.findMany({where:{tenantId:tid,runId},orderBy:{createdAt:'desc'},take:20});
  return {items:snapshot.items,issues:snapshot.issues,ready:snapshot.ready,fingerprint:snapshot.fingerprint,totalNet:snapshot.run.totalNet,remainingNet:snapshot.items.filter((i:any)=>i.paymentStatus==='NOT_STARTED').reduce((n:number,i:any)=>n+i.net,0),timezone:company.timezone,schedules};
 }
 async schedule(ctx:Context,runId:string,body:unknown,now=new Date()){
  paymentPermission(ctx);const tid=tenant(ctx),input=z.union([z.object({scheduledAt:z.iso.datetime({offset:true}),mode,confirm:z.literal(true)}).strict(),z.object({localDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),localTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),mode,confirm:z.literal(true)}).strict()]).parse(body);
  return this.db.$transaction(async tx=>{
   await lockCompanyPayments(tx,tid);await lockPayrollRun(tx,tid,runId);
   const s=await paymentSnapshot(tx,tid,runId,input.mode);if(!s)throw new NotFoundException('Payroll run not found.');
   if(!s.ready)throw new BadRequestException(s.issues.join('. '));
   const when='scheduledAt' in input?new Date(input.scheduledAt):zonedMinute(input.localDate,Number(input.localTime.slice(0,2))*60+Number(input.localTime.slice(3)),s.company.timezone);
   if(!('scheduledAt' in input)){const clock=new Intl.DateTimeFormat('en-GB',{timeZone:s.company.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(when);if(localDate(when,s.company.timezone)!==input.localDate||clock!==input.localTime)throw new BadRequestException('This local date/time does not exist in the company timezone. Choose another time.');}
   if(!Number.isFinite(when.getTime())||when.getTime()<now.getTime()+60000||when.getTime()>now.getTime()+366*86400000)throw new BadRequestException('Select a salary payment time between one minute and one year from now.');
   if(await tx.payrollPaymentSchedule.count({where:{tenantId:tid,runId,status:{in:activeScheduleStatuses}}}))throw new ConflictException('A salary schedule is already active. Cancel it before changing the time.');
   const schedule=await tx.payrollPaymentSchedule.create({data:{tenantId:tid,runId,scheduledAt:when,timezone:s.company.timezone,mode:input.mode,fingerprint:s.fingerprint,connectionRevision:s.config.revision,approvedBy:ctx.user.id}});
   await audit(tx,ctx,'PAYROLL_PAYMENT_SCHEDULE_APPROVED','payroll',runId,undefined,{scheduleId:schedule.id,scheduledAt:when.toISOString(),timezone:s.company.timezone,mode:input.mode,total:s.run.totalNet});return schedule;
  });
 }
 async cancel(ctx:Context,runId:string){paymentPermission(ctx);const tid=tenant(ctx);return this.db.$transaction(async tx=>{
  await lockPayrollRun(tx,tid,runId);const s=await tx.payrollPaymentSchedule.findFirst({where:{tenantId:tid,runId,status:{in:activeScheduleStatuses}}});if(!s)throw new NotFoundException('No active salary schedule.');if(s.status==='RUNNING')throw new ConflictException('Payment has started. Check payment status; it cannot be cancelled here.');
  const after=await tx.payrollPaymentSchedule.update({where:{id:s.id},data:{status:'CANCELLED',finishedAt:new Date()}});await audit(tx,ctx,'PAYROLL_PAYMENT_SCHEDULE_CANCELLED','payroll',runId,{scheduleId:s.id},after);return after;
 });}
 async manual(ctx:Context,runId:string,body:unknown){
  paymentPermission(ctx);const tid=tenant(ctx),input=z.object({employeeId:z.string().uuid(),expectedNet:z.number().int().positive(),mode:z.enum(['BANK_TRANSFER','CASH','CHEQUE']),reference:z.string().trim().min(3).max(120),paidAt:z.iso.datetime({offset:true}),note:z.string().trim().max(1000).default(''),expectedPayoutUpdatedAt:z.iso.datetime().optional(),confirm:z.literal(true)}).strict().parse(body);
  const paidAt=new Date(input.paidAt);if(paidAt>new Date())throw new BadRequestException('An actual payment date cannot be in the future. Use scheduling for future bank payments.');
  return this.db.$transaction(async tx=>{
   await lockPayrollRun(tx,tid,runId);const run=await tx.payrollRun.findFirst({where:{id:runId,tenantId:tid}});if(!run)throw new NotFoundException('Payroll run not found.');if(run.status!=='LOCKED')throw new ConflictException('Finalize payroll before recording payment.');
   if(await tx.payrollPaymentSchedule.count({where:{tenantId:tid,runId,status:{in:activeScheduleStatuses}}}))throw new ConflictException('Cancel the active salary schedule before recording an outside payment.');
   const item=await tx.payrollItem.findFirst({where:{tenantId:tid,runId,employeeId:input.employeeId}});if(!item||item.net!==input.expectedNet)throw new ConflictException('Salary amount changed or employee was not found. Refresh payroll.');
   const existing=await tx.payrollPayout.findUnique({where:{tenantId_runId_employeeId:{tenantId:tid,runId,employeeId:input.employeeId}}});
   if(existing&&(!existing.providerRef||!['failed','reversed','rejected','cancelled'].includes(existing.status)||input.expectedPayoutUpdatedAt!==existing.updatedAt.toISOString()))throw new ConflictException('A transfer already exists for this employee. Reconcile it before any further payment.');
   const data={tenantId:tid,runId,employeeId:item.employeeId,employeeCode:item.employeeCode,employeeName:item.employeeName,amount:item.net,provider:'MANUAL',mode:input.mode,status:'PAID',utr:input.mode==='BANK_TRANSFER'?input.reference:null,reference:input.reference,initiatedBy:ctx.user.id,details:{paidAt:paidAt.toISOString(),note:input.note,evidence:'Company administrator confirmed outside payment',...(existing?{previousTransfer:{provider:existing.provider,status:existing.status,providerRef:existing.providerRef,reference:existing.reference,utr:existing.utr}}:{})}};
   const row=existing?await tx.payrollPayout.update({where:{id:existing.id},data:{...data,providerRef:null,error:null}}):await tx.payrollPayout.create({data});
   await audit(tx,ctx,'PAYROLL_MANUAL_PAYMENT_RECORDED','payroll',runId,existing??undefined,{payoutId:row.id,employeeId:item.employeeId,amount:item.net,mode:input.mode,reference:input.reference,paidAt:paidAt.toISOString()});return row;
  });
 }
 async executeDue(now=new Date()){
  // A crashed sender is never reclaimed: an accepted transfer may lack a local response.
  const stale=await this.db.payrollPaymentSchedule.findMany({where:{status:'RUNNING',startedAt:{lt:new Date(now.getTime()-3600000)}}});
  for(const s of stale)await this.finish(s,'NEEDS_ATTENTION','Scheduled sender stopped or exceeded one hour. Verify all transfers before any outside payment.',now);
  const due=await this.db.payrollPaymentSchedule.findMany({where:{status:'SCHEDULED',scheduledAt:{lte:now}},orderBy:{scheduledAt:'asc'},take:20});let started=0;
  const dispatch=async(schedule:typeof due[number])=>{
   const claimed=await this.db.payrollPaymentSchedule.updateMany({where:{id:schedule.id,status:'SCHEDULED'},data:{status:'RUNNING',startedAt:now}});if(!claimed.count)return;started++;
   try{
    if(now.getTime()-schedule.scheduledAt.getTime()>15*60000)throw new Error('Scheduled time was missed by over 15 minutes. Review and approve a new schedule.');
    const user=await this.db.user.findFirst({where:{id:schedule.approvedBy,tenantId:schedule.tenantId,active:true},include:{role:true}});if(!user)throw new Error('The schedule approver is no longer active.');
    const ctx:Context={tenantId:schedule.tenantId,user,session:{},ip:'SYSTEM_SCHEDULER'};paymentPermission(ctx);
    const s=await paymentSnapshot(this.db,schedule.tenantId,schedule.runId,schedule.mode);if(!s||!s.ready||s.fingerprint!==schedule.fingerprint||s.config.revision!==schedule.connectionRevision)throw new Error('Approved payroll, bank details or payment setup changed. Review and approve a new schedule.');
    const result=await this.payouts.pay(ctx,schedule.runId,{confirm:true,mode:schedule.mode},schedule.id);
    await this.finish(schedule,result.unknown||result.failed?'NEEDS_ATTENTION':'DISPATCHED',result.unknown||result.failed?'Some payments need reconciliation. Do not resend them.':null,now);
   }catch{await this.finish(schedule,'BLOCKED','Payment was not completed as approved. Check company access, approver permissions, unchanged bank details and schedule timing; verify existing transfers before rescheduling.',now);}
  };
  for(let offset=0;offset<due.length;offset+=4)await Promise.all(due.slice(offset,offset+4).map(dispatch));
  return {started};
 }
 private async finish(schedule:any,status:string,error:string|null,now:Date){
  const result=await this.db.payrollPaymentSchedule.updateMany({where:{id:schedule.id,status:'RUNNING'},data:{status,error,finishedAt:now}});if(!result.count)return;
  await this.db.notification.create({data:{tenantId:schedule.tenantId,title:status==='DISPATCHED'?'Scheduled salary payments submitted':'Salary payment schedule needs attention',message:`Salary payment schedule ${schedule.id}: ${status}. ${error??'Check bank statuses for final credit confirmation.'}`}});
  await this.db.auditLog.create({data:{tenantId:schedule.tenantId,actorId:schedule.approvedBy,action:'PAYROLL_PAYMENT_SCHEDULE_'+status,entity:'payroll',entityId:schedule.runId,after:{scheduleId:schedule.id,status,error}}});
 }
 async reconcilePending(){
  const rows=await this.db.payrollPayout.findMany({where:{provider:{in:['RAZORPAYX','BANK_API']},providerRef:{not:null},OR:[{status:{in:['queued','pending','processing']},updatedAt:{lt:new Date(Date.now()-300000)}},{status:'processed',createdAt:{gte:new Date(Date.now()-30*86400000)},updatedAt:{lt:new Date(Date.now()-3600000)}}]},orderBy:{updatedAt:'asc'},take:100});
  for(const key of [...new Set(rows.map(r=>r.tenantId+':'+r.runId))]){const [tid,runId]=key.split(':');const user=await this.db.user.findFirst({where:{tenantId:tid,active:true,role:{code:'COMPANY_OWNER'}},include:{role:true}});if(!user)continue;try{await this.payouts.sync({tenantId:tid,user,session:{},ip:'SYSTEM_RECONCILIATION'},runId)}catch{}}
 }
}
