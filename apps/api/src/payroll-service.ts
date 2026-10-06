import {MANUAL_SALARY,manualSalary,manualSalaryValues} from '../../../packages/payroll-engine/manual';
import {BadRequestException,ConflictException,NotFoundException} from '@nestjs/common';
import type {Prisma} from '@prisma/client';
import {lockPayrollPeriod,lockPayrollRun,lockSalaryInputs} from './payroll-lock';
import type {Database} from '../../../packages/database';
import {localDate,monthBounds} from '../../../packages/attendance-engine';
import {calculatePay} from '../../../packages/payroll-engine';
import {attendanceMonthSummary,lockAttendanceMonthInTransaction,reconcileAttendanceMonthInTransaction} from './attendance-automation';

const monthPattern=/^\d{4}-(0[1-9]|1[0-2])$/;
const nextMonthStart=(month:string)=>new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),1));

async function completedMonthGuard(db:Prisma.TransactionClient,tenantId:string,month:string){
  if(!monthPattern.test(month))throw new BadRequestException('Choose a valid payroll month.');
  const company=await db.tenant.findUnique({where:{id:tenantId},select:{timezone:true}});
  if(!company)throw new NotFoundException('Company not found.');
  const currentMonth=localDate(new Date(),company.timezone||'Asia/Kolkata').slice(0,7);
  if(month>=currentMonth)throw new BadRequestException('Payroll can be prepared only for a completed month. Keep the current month open for attendance.');
  return company;
}

export async function preparePayrollMonth(db:Database,tenantId:string,month:string,actorId:string){
  return db.$transaction(async tx=>{
    await lockSalaryInputs(tx,tenantId);
    await lockPayrollPeriod(tx,tenantId,month);
    await completedMonthGuard(tx,tenantId,month);
    let run=await tx.payrollRun.findUnique({where:{tenantId_month:{tenantId,month}}});
    if(run?.status==='LOCKED'||run?.status==='APPROVED')throw new ConflictException('Reopen this payroll before recalculation.');
    if(run&&await tx.payrollPayout.count({where:{tenantId,runId:run.id}}))throw new ConflictException('Payroll with payout records cannot be recalculated.');
    let period=await tx.attendancePeriodLock.findUnique({where:{tenantId_month:{tenantId,month}}});
    if(period?.status!=='LOCKED'){
      await reconcileAttendanceMonthInTransaction(tx,tenantId,month);
      period=(await lockAttendanceMonthInTransaction(tx,tenantId,month,actorId)).lock;
    }
    const summary=await attendanceMonthSummary(tx,tenantId,month);
    if(summary.totals.missingPunchDays)throw new BadRequestException(`Resolve ${summary.totals.missingPunchDays} missing-punch day(s) before preparing payroll.`);
    const attendanceByEmployee=new Map(summary.items.map((r:any)=>[r.employeeId,r]));
    const employeeIds=[...attendanceByEmployee.keys()];
    if(!employeeIds.length)throw new BadRequestException('No attendance records are available for this payroll month.');
    if(!run)run=await tx.payrollRun.create({data:{tenantId,month,attendanceLockId:period!.id}});
    await tx.payrollAdjustment.updateMany({where:{tenantId,appliedRunId:run.id},data:{appliedRunId:null}});
    await tx.loanInstallment.updateMany({where:{tenantId,appliedRunId:run.id},data:{appliedRunId:null}});
    const previousItems=await tx.payrollItem.findMany({where:{tenantId,runId:run.id},select:{employeeId:true,components:true}});
    const manualByEmployee=new Map(previousItems.map(i=>[i.employeeId,manualSalary(i.components)]));
    await tx.payrollItem.deleteMany({where:{tenantId,runId:run.id}});

    const [employees,rules,adjustments,versions,loans,installments]=await Promise.all([
      tx.employee.findMany({where:{tenantId,id:{in:employeeIds},joiningDate:{lt:nextMonthStart(month)}}}),
      tx.salaryRule.findMany({where:{tenantId,active:true}}),
      tx.payrollAdjustment.findMany({where:{tenantId,targetMonth:month,appliedRunId:null}}),
      tx.salaryVersion.findMany({where:{tenantId,employeeId:{in:employeeIds},effectiveMonth:{lte:month}},orderBy:[{effectiveMonth:'desc'},{createdAt:'desc'},{id:'desc'}]}),
      tx.payrollLoan.findMany({where:{tenantId,employeeId:{in:employeeIds}}}),
      tx.loanInstallment.findMany({where:{tenantId,month,appliedRunId:null,cancelled:false}})
    ]);
    if(!employees.length)throw new BadRequestException('No employees are eligible for this payroll month.');

    let totalGross=0,totalDeductions=0,totalNet=0,itemCount=0;
    const appliedAdjustmentIds:string[]=[];
    const appliedInstallmentIds:string[]=[];
    for(const employee of employees){
      const attendance:any=attendanceByEmployee.get(employee.id);
      if(!attendance)continue;
      const eligibleDays=Math.max(0,Number(attendance.scheduledDays||0));
      const denominator=Math.max(100,eligibleDays*100);
      const payableUnits=Math.min(Number(attendance.payableUnits||0),denominator);
      const salary=versions.find(v=>v.employeeId===employee.id);
      const monthlySalary=salary?salary.basic+salary.hra+salary.allowances:employee.monthlySalary;
      const attendanceGross=eligibleDays?Math.round(monthlySalary*payableUnits/denominator):0;
      const overtime=salary?Math.round(Number(attendance.overtimeMinutes||0)*salary.overtimeHourly/60):0;
      const earnings=salary?(()=>{const basic=eligibleDays?Math.round(salary.basic*payableUnits/denominator):0,hra=eligibleDays?Math.round((salary.basic+salary.hra)*payableUnits/denominator)-basic:0;return [{type:'EARNING',name:'Basic',amount:basic},{type:'EARNING',name:'HRA',amount:hra},{type:'EARNING',name:'Allowances',amount:attendanceGross-basic-hra}];})():[{type:'EARNING',name:'Salary',amount:attendanceGross}];
      const employeeLoanIds=new Set(loans.filter(l=>l.employeeId===employee.id).map(l=>l.id)),recoveries=installments.filter(i=>employeeLoanIds.has(i.loanId));
      const recovery=recoveries.reduce((n,i)=>n+i.amount,0);
      const employeeAdjustments=adjustments.filter(a=>a.employeeId===employee.id);
      const adjustment=employeeAdjustments.reduce((sum,a)=>sum+a.amount,0);
      const calculated=calculatePay(attendanceGross+overtime,rules.map(r=>({name:r.name,percent:Number(r.percent),cap:r.cap})),adjustment);
      const result={...calculated,deductions:calculated.deductions+recovery,net:calculated.net-recovery};
      if(result.net<0)throw new BadRequestException(`Loan deductions exceed pay for ${employee.employeeCode}. Adjust the recovery schedule before preparing.`);
      if(result.gross>1e9||result.deductions>1e9)throw new BadRequestException(`Salary exceeds the supported amount for ${employee.employeeCode}.`);
      const override=manualByEmployee.get(employee.id);
      const values=override?manualSalaryValues(override.net,result.deductions):result;
      const components=[...earnings,...(overtime?[{type:'EARNING',name:'Overtime',amount:overtime,minutes:attendance.overtimeMinutes,hourlyRate:salary!.overtimeHourly}]:[]),...result.components.map(c=>({...c,type:c.name==='Adjustment'?'ADJUSTMENT':'DEDUCTION'})),...recoveries.map(i=>({type:'DEDUCTION',name:'Loan recovery',amount:i.amount,loanId:i.loanId})),{name:'Attendance',units:payableUnits,eligibleScheduledDays:eligibleDays,monthlySalary},...(override?[{...override,type:MANUAL_SALARY,calculatedGross:result.gross,calculatedNet:result.net}]:[])];
      await tx.payrollItem.create({data:{
        tenantId,runId:run.id,employeeId:employee.id,employeeName:`${employee.firstName} ${employee.lastName}`,employeeCode:employee.employeeCode,
        gross:values.gross,deductions:values.deductions,net:values.net,
        components,
        scheduledDays:eligibleDays,payableUnits,presentDays:attendance.presentDays,halfDays:attendance.halfDays,
        paidLeaveUnits:attendance.paidLeaveUnits,unpaidLeaveUnits:attendance.unpaidLeaveUnits,absentDays:attendance.absentDays,
        lateMinutes:attendance.lateMinutes,overtimeMinutes:attendance.overtimeMinutes
      }});
      totalGross+=values.gross;totalDeductions+=values.deductions;totalNet+=values.net;itemCount++;
      appliedAdjustmentIds.push(...employeeAdjustments.map(a=>a.id));
      appliedInstallmentIds.push(...recoveries.map(i=>i.id));
    }
    if(!itemCount)throw new BadRequestException('No payable employees are available for this payroll month.');
    if(appliedAdjustmentIds.length)await tx.payrollAdjustment.updateMany({where:{tenantId,id:{in:appliedAdjustmentIds}},data:{appliedRunId:run.id}});
    if(appliedInstallmentIds.length)await tx.loanInstallment.updateMany({where:{tenantId,id:{in:appliedInstallmentIds}},data:{appliedRunId:run.id}});
    return tx.payrollRun.update({where:{id:run.id},data:{status:'REVIEW',totalGross,totalDeductions,totalNet,approvedBy:null,lockedAt:null,attendanceLockId:period!.id},include:{items:true}});
  },{timeout:60000});
}

export async function reopenPayrollMonth(db:Database,tenantId:string,runId:string,actorId:string){
  return db.$transaction(async tx=>{
    await lockPayrollRun(tx,tenantId,runId);
    const run=await tx.payrollRun.findFirst({where:{id:runId,tenantId}});
    if(!run)throw new NotFoundException('Payroll run not found.');
    if(await tx.payrollPayout.count({where:{tenantId,runId}}))throw new ConflictException('Salary payout has already started. Use a later-month adjustment instead of reopening this payroll.');
    if(!['DRAFT','REVIEW','APPROVED','LOCKED'].includes(run.status))throw new ConflictException('This payroll cannot be reopened.');

    await tx.payrollRun.update({where:{id:runId},data:{status:'DRAFT',lockedAt:null,approvedBy:null,attendanceLockId:null}});
    await tx.payrollAdjustment.updateMany({where:{tenantId,appliedRunId:runId},data:{appliedRunId:null}});
    await tx.loanInstallment.updateMany({where:{tenantId,appliedRunId:runId},data:{appliedRunId:null}});
    await tx.payrollItem.deleteMany({where:{tenantId,runId}});
    await tx.payrollRun.update({where:{id:runId},data:{totalGross:0,totalDeductions:0,totalNet:0}});

    const lock=await tx.attendancePeriodLock.findUnique({where:{tenantId_month:{tenantId,month:run.month}}});
    if(lock?.status==='LOCKED'){
      const {first,next}=monthBounds(run.month),now=new Date();
      await tx.attendanceDaily.updateMany({where:{tenantId,date:{gte:first,lt:next}},data:{lockedAt:null}});
      await tx.attendancePeriodLock.update({where:{id:lock.id},data:{status:'UNLOCKED',unlockedBy:actorId,unlockedAt:now}});
    }
    return tx.payrollRun.findUniqueOrThrow({where:{id:runId},include:{items:true}});
  },{timeout:30000});
}

export async function finalizePayrollMonth(db:Database,tenantId:string,runId:string,actorId:string){
  return db.$transaction(async tx=>{
    await lockPayrollRun(tx,tenantId,runId);
    const run=await tx.payrollRun.findFirst({where:{id:runId,tenantId},include:{items:true}});
    if(!run)throw new NotFoundException('Payroll run not found.');
    if(run.status==='LOCKED')return {run,changed:false};
    if(!['REVIEW','APPROVED'].includes(run.status))throw new ConflictException('Prepare payroll and review the employee amounts before finalizing.');
    if(!run.items.length)throw new BadRequestException('Payroll has no employee items. Prepare it again.');
    const period=await tx.attendancePeriodLock.findUnique({where:{tenantId_month:{tenantId,month:run.month}}});
    if(!period||period.status!=='LOCKED')throw new ConflictException('Attendance changed after payroll preparation. Prepare payroll again before finalizing.');
    const finalized=await tx.payrollRun.update({where:{id:runId},data:{status:'LOCKED',approvedBy:actorId,lockedAt:new Date(),attendanceLockId:period.id},include:{items:true}});
    return {run:finalized,changed:true};
  },{timeout:30000});
}
