import {BadRequestException,ForbiddenException,NotFoundException} from '@nestjs/common';
import type {Database} from '../../../packages/database';
import {restrictedRoles} from '../../../packages/permissions';
import {id} from '../../../packages/validation';
import {requirePermission,tenant,type Context} from './context';
import {toPdf} from '../../../packages/reporting-engine';

export function challanPaymentStatus(net:number,payout?:{status:string;amount:number}){
  if(net===0)return 'NO_PAYMENT_DUE';
  if(!payout)return 'PENDING';
  if(payout.amount!==net)return 'UNVERIFIED';
  const status=payout.status.toUpperCase();
  if(['PAID','PROCESSED'].includes(status))return 'PAID';
  if(['FAILED','REJECTED','REVERSED','CANCELLED'].includes(status))return 'FAILED';
  if(['UNKNOWN','INITIATING'].includes(status))return 'UNVERIFIED';
  return 'PENDING';
}

export async function salaryPaymentChallan(db:Database,ctx:Context,runId:string){
  const tenantId=tenant(ctx);requirePermission(ctx,'payroll','VIEW');
  if(restrictedRoles.has(ctx.user.role.code))throw new ForbiddenException('Salary payment challans are managed by your payroll team.');
  // Keep final salary amounts and payment statuses in one consistent read snapshot.
  return db.$transaction(async tx=>{
    const run=await tx.payrollRun.findFirst({where:{tenantId,id:id.parse(runId)},include:{items:{orderBy:{employeeCode:'asc'}}}});
    if(!run)throw new NotFoundException('Payroll run not found.');
    if(run.status!=='LOCKED')throw new BadRequestException('Finalize payroll before generating a salary payment challan.');
    if(!run.items.length)throw new BadRequestException('This payroll has no employee salaries.');
    const company=await tx.tenant.findUniqueOrThrow({where:{id:tenantId}});
    const connection=await tx.companyPayoutConnection.findUnique({where:{tenantId}});
    const payouts=await tx.payrollPayout.findMany({where:{tenantId,runId:run.id}});
    const byEmployee=new Map(payouts.map(p=>[p.employeeId,p]));
    const items=run.items.map(item=>{
      const p=byEmployee.get(item.employeeId);
      return {employeeCode:item.employeeCode,employeeName:item.employeeName,gross:item.gross,deductions:item.deductions,net:item.net,
        paymentStatus:challanPaymentStatus(item.net,p),mode:p?.mode??'',reference:p?.reference??`SAL-${run.month}-${item.employeeCode}`,
        utr:p?.utr??'',providerRef:p?.providerRef??'',paymentUpdatedAt:p?.updatedAt??null};
    });
    const totals=items.reduce((total,item)=>{
      total.gross+=item.gross;total.deductions+=item.deductions;total.net+=item.net;
      if(item.paymentStatus==='PAID'){total.paid+=item.net;total.paidEmployees++;}
      else if(item.paymentStatus==='FAILED'){total.failed+=item.net;total.failedEmployees++;}
      else if(item.paymentStatus==='NO_PAYMENT_DUE')total.zeroEmployees++;
      else{total.pending+=item.net;total.pendingEmployees++;}
      return total;
    },{employees:items.length,gross:0,deductions:0,net:0,paid:0,failed:0,pending:0,paidEmployees:0,failedEmployees:0,pendingEmployees:0,zeroEmployees:0});
    const profile=company.profile&&typeof company.profile==='object'&&!Array.isArray(company.profile)?company.profile as Record<string,unknown>:{};
    return {number:`SAL-${company.code}-${run.month}-${run.id}`,runId:run.id,month:run.month,finalizedAt:run.lockedAt,generatedAt:new Date(),
      company:{name:company.name,code:company.code,currency:company.currency,address:String(profile.address??''),accountLabel:connection?.accountLabel??String(profile.payoutAccountLabel??'')},
      items,totals,note:'Payment status reflects recorded transfers at generation time. Pending, failed and unverified amounts are not confirmed payments. This challan does not initiate a transfer.'};
  },{isolationLevel:'RepeatableRead'});
}

export type SalaryChallan=Awaited<ReturnType<typeof salaryPaymentChallan>>;
export function salaryChallanPdf(challan:SalaryChallan){
  const money=(amount:number)=>`${challan.company.currency} ${(amount/100).toFixed(2)}`;
  const t=challan.totals;
  return toPdf(challan.items.map(item=>({employee:`${item.employeeName} (${item.employeeCode})`,gross:money(item.gross),deductions:money(item.deductions),net:money(item.net),status:item.paymentStatus,payment:[item.mode,item.utr&&`UTR: ${item.utr}`,`Ref: ${item.reference}`,item.providerRef&&`Provider: ${item.providerRef}`].filter(Boolean).join(' / ')})),
    'Salary Payment Challan',{
      metadata:[`${challan.company.name} | ${challan.company.code} | Month: ${challan.month}`,`Challan: ${challan.number}`,`Generated: ${challan.generatedAt.toISOString()} | Employees: ${t.employees}`,`Gross: ${money(t.gross)} | Deductions: ${money(t.deductions)} | Net: ${money(t.net)}`,`Paid: ${money(t.paid)} | Pending/unverified: ${money(t.pending)} | Failed: ${money(t.failed)}`],
      summary:['Prepared by: ____________________    Checked by: ____________________    Authorized by: ____________________','Recorded status only. This document does not initiate or confirm pending payments.'],wrapCells:true
    });
}
