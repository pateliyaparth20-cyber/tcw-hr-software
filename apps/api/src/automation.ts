import type {Database} from '../../../packages/database';
import {calculatePay} from '../../../packages/payroll-engine';
import {attendanceMonthSummary,lockAttendanceMonth,reconcileAttendanceMonth} from './attendance-automation';

const monthKey=(d:Date)=>`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
export async function prepareScheduledPayroll(db:Database){
 const now=new Date(),day=now.getUTCDate(),lastDay=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,0)).getUTCDate();
 const companies=await db.tenant.findMany({where:{status:'ACTIVE'}});
 for(const company of companies){
  const profile=(company.profile&&typeof company.profile==='object'&&!Array.isArray(company.profile)?company.profile:{}) as any;
  if(!profile.autoPayroll)continue;const configured=Math.max(1,Math.min(31,Number(profile.salaryDay)||1)),scheduled=Math.min(configured,lastDay);if(day<scheduled)continue;
  const month=monthKey(now);if(await db.payrollRun.findUnique({where:{tenantId_month:{tenantId:company.id,month}}}))continue;
  try{
   await reconcileAttendanceMonth(db,company.id,month);const preview=await attendanceMonthSummary(db,company.id,month);
   if(preview.totals.missingPunchDays){
    await db.notification.create({data:{tenantId:company.id,title:'Automatic payroll needs attendance review',message:`${month} has ${preview.totals.missingPunchDays} missing-punch day(s). Resolve attendance exceptions and lock the month before payroll.`}});continue;
   }
   const locked=preview.lock?.status==='LOCKED'?preview.lock:(await lockAttendanceMonth(db,company.id,month,'SYSTEM_AUTOMATION')).lock;
   const summary=await attendanceMonthSummary(db,company.id,month),attendanceByEmployee=new Map(summary.items.map((r:any)=>[r.employeeId,r]));
   await db.$transaction(async tx=>{
    const run=await tx.payrollRun.create({data:{tenantId:company.id,month,attendanceLockId:locked.id}});
    const next=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1));
    const [employees,rules,adjustments]=await Promise.all([
      tx.employee.findMany({where:{tenantId:company.id,deletedAt:null,status:{in:['ACTIVE','PROBATION','NOTICE']},joiningDate:{lt:next}}}),
      tx.salaryRule.findMany({where:{tenantId:company.id,active:true}}),
      tx.payrollAdjustment.findMany({where:{tenantId:company.id,targetMonth:month,appliedRunId:null}})
    ]);
    let totalGross=0,totalDeductions=0,totalNet=0;
    for(const employee of employees){const attendance:any=attendanceByEmployee.get(employee.id);if(!attendance)continue;const denominator=Math.max(1,attendance.fullScheduledDays*100),attendanceGross=Math.round(employee.monthlySalary*Math.min(attendance.payableUnits,denominator)/denominator),adjustment=adjustments.filter(a=>a.employeeId===employee.id).reduce((sum,a)=>sum+a.amount,0),result=calculatePay(attendanceGross,rules.map(r=>({name:r.name,percent:Number(r.percent),cap:r.cap})),adjustment);
      await tx.payrollItem.create({data:{tenantId:company.id,runId:run.id,employeeId:employee.id,employeeName:`${employee.firstName} ${employee.lastName}`,employeeCode:employee.employeeCode,gross:result.gross,deductions:result.deductions,net:result.net,components:[...result.components,{name:'Attendance payable',units:attendance.payableUnits,fullScheduledDays:attendance.fullScheduledDays,eligibleScheduledDays:attendance.scheduledDays}],scheduledDays:attendance.scheduledDays,payableUnits:attendance.payableUnits,presentDays:attendance.presentDays,halfDays:attendance.halfDays,paidLeaveUnits:attendance.paidLeaveUnits,unpaidLeaveUnits:attendance.unpaidLeaveUnits,absentDays:attendance.absentDays,lateMinutes:attendance.lateMinutes,overtimeMinutes:attendance.overtimeMinutes}});totalGross+=result.gross;totalDeductions+=result.deductions;totalNet+=result.net;}
    await tx.payrollAdjustment.updateMany({where:{id:{in:adjustments.map(a=>a.id)},tenantId:company.id},data:{appliedRunId:run.id}});
    await tx.payrollRun.update({where:{id:run.id},data:{status:'REVIEW',totalGross,totalDeductions,totalNet}});
    await tx.notification.create({data:{tenantId:company.id,title:'Payroll prepared automatically',message:`${month} attendance was reconciled and locked, and payroll is ready for human review. No bank payout has been sent.`}});
    await tx.auditLog.create({data:{tenantId:company.id,action:'PAYROLL_AUTO_PREPARED',entity:'payroll',entityId:run.id,after:{month,totalNet,attendanceLockId:locked.id}}});
   });
  }catch(error:any){await db.notification.create({data:{tenantId:company.id,title:'Automatic payroll could not be prepared',message:String(error?.message??'Review attendance and payroll settings.').slice(0,500)}}).catch(()=>{});}
 }
}


export async function monitorAttendanceDevices(db:Database,offlineAfterMinutes=15){
 const cutoff=new Date(Date.now()-Math.max(5,offlineAfterMinutes)*60_000);
 const devices=await db.attendanceDevice.findMany({where:{status:{in:['ONLINE','DEGRADED']},lastSeenAt:{lt:cutoff}}});
 for(const device of devices){
  await db.$transaction(async tx=>{
   const current=await tx.attendanceDevice.findUnique({where:{id:device.id}});
   if(!current||!current.lastSeenAt||current.lastSeenAt>=cutoff||current.status==='OFFLINE')return;
   await tx.attendanceDevice.update({where:{id:current.id},data:{status:'OFFLINE',lastError:`No heartbeat or punch received for ${Math.max(5,offlineAfterMinutes)} minutes.`}});
   await tx.deviceSyncLog.create({data:{tenantId:current.tenantId,deviceId:current.id,level:'WARN',action:'DEVICE_OFFLINE',message:`${current.name} (${current.serialNumber}) has not been seen since ${current.lastSeenAt.toISOString()}.`,details:{lastSeenAt:current.lastSeenAt,offlineAfterMinutes:Math.max(5,offlineAfterMinutes)}}});
   await tx.notification.create({data:{tenantId:current.tenantId,title:'Attendance device offline',message:`${current.name} (${current.serialNumber}) has not sent a heartbeat or punch for ${Math.max(5,offlineAfterMinutes)} minutes. Attendance logs will sync when the device reconnects.`}});
  });
 }
 return {checkedAt:new Date(),offlineMarked:devices.length};
}
