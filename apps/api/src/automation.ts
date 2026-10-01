import type {Database} from '../../../packages/database';
import {employeeShift,reconcileAttendanceMonth} from './attendance-automation';
import {localDate,monthBounds,zonedMinute} from '../../../packages/attendance-engine';
import {preparePayrollMonth} from './payroll-service';

const previousMonth=(localToday:string)=>{const y=Number(localToday.slice(0,4)),m=Number(localToday.slice(5,7));const d=new Date(Date.UTC(y,m-2,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;};
const AUTO_PAYROLL_FAILURE='Automatic payroll could not be prepared',AUTO_PAYROLL_REVIEW='Automatic payroll needs attendance review';
async function createAutomationNoticeOnce(db:Database,tenantId:string,title:string,message:string,windowHours=24){
 const since=new Date(Date.now()-Math.max(1,windowHours)*3600_000);
 const existing=await db.notification.findFirst({where:{tenantId,title,message,createdAt:{gte:since}},select:{id:true}});
 if(existing)return existing;
 return db.notification.create({data:{tenantId,title,message}});
}
export async function repairPrematureCurrentMonthPayrollLocks(db:Database){
 const now=new Date(),companies=await db.tenant.findMany({where:{status:'ACTIVE'},select:{id:true,timezone:true}});
 let repaired=0;
 for(const company of companies){
  const currentMonth=localDate(now,company.timezone||'Asia/Kolkata').slice(0,7);
  const lock=await db.attendancePeriodLock.findUnique({where:{tenantId_month:{tenantId:company.id,month:currentMonth}}});
  if(!lock||lock.status!=='LOCKED'||lock.lockedBy!=='SYSTEM_AUTOMATION')continue;
  const run=await db.payrollRun.findUnique({where:{tenantId_month:{tenantId:company.id,month:currentMonth}}});
  if(run){
   const autoAudit=await db.auditLog.findFirst({where:{tenantId:company.id,action:'PAYROLL_AUTO_PREPARED',entity:'payroll',entityId:run.id}});
   const payouts=await db.payrollPayout.count({where:{tenantId:company.id,runId:run.id}});
   if(!autoAudit||payouts||!['DRAFT','REVIEW'].includes(run.status)||run.approvedBy||run.lockedAt)continue;
  }
  const {first,next}=monthBounds(currentMonth);
  await db.$transaction(async tx=>{
   if(run){
    await tx.payrollAdjustment.updateMany({where:{tenantId:company.id,appliedRunId:run.id},data:{appliedRunId:null}});
    await tx.payrollItem.deleteMany({where:{tenantId:company.id,runId:run.id}});
    await tx.payrollRun.delete({where:{id:run.id}});
   }
   await tx.attendanceDaily.updateMany({where:{tenantId:company.id,date:{gte:first,lt:next}},data:{lockedAt:null}});
   await tx.attendancePeriodLock.update({where:{id:lock.id},data:{status:'UNLOCKED',unlockedBy:'SYSTEM_CORRECTION',unlockedAt:now}});
   await tx.auditLog.create({data:{tenantId:company.id,action:'AUTO_PAYROLL_CURRENT_MONTH_REPAIRED',entity:'attendance',entityId:lock.id,before:{month:currentMonth,lockedBy:lock.lockedBy,payrollRunId:run?.id??null},after:{month:currentMonth,status:'UNLOCKED',reason:'Current month must remain open for attendance'}}});
   await tx.notification.create({data:{tenantId:company.id,title:'Current attendance reopened',message:`${currentMonth} was locked early by automatic payroll and has been reopened. Automatic payroll now processes the previous completed month.`}});
  });
  repaired++;
 }
 return {repaired};
}
export async function prepareScheduledPayroll(db:Database){
 const now=new Date();
 const companies=await db.tenant.findMany({where:{status:'ACTIVE'}});
 for(const company of companies){
  const profile=(company.profile&&typeof company.profile==='object'&&!Array.isArray(company.profile)?company.profile:{}) as any;
  if(!profile.autoPayroll)continue;
  const localToday=localDate(now,company.timezone||'Asia/Kolkata'),year=Number(localToday.slice(0,4)),monthNumber=Number(localToday.slice(5,7)),day=Number(localToday.slice(8,10));
  const lastDay=new Date(Date.UTC(year,monthNumber,0)).getUTCDate(),configured=Math.max(1,Math.min(31,Number(profile.salaryDay)||1)),scheduled=Math.min(configured,lastDay);
  if(day<scheduled)continue;
  const month=previousMonth(localToday);
  const existing=await db.payrollRun.findUnique({where:{tenantId_month:{tenantId:company.id,month}}});
  if(existing){
   await db.notification.deleteMany({where:{tenantId:company.id,title:{in:[AUTO_PAYROLL_FAILURE,AUTO_PAYROLL_REVIEW]},message:{contains:month}}}).catch(()=>{});
   continue;
  }
  const manualDelete=await db.auditLog.findFirst({where:{tenantId:company.id,action:'PAYROLL_RUN_DELETED',entity:'payroll-month',entityId:month},select:{id:true}});
  if(manualDelete){
   await db.notification.deleteMany({where:{tenantId:company.id,title:{in:[AUTO_PAYROLL_FAILURE,AUTO_PAYROLL_REVIEW]},message:{contains:month}}}).catch(()=>{});
   continue;
  }
  try{
   const run=await preparePayrollMonth(db,company.id,month,'SYSTEM_AUTOMATION');
   await db.notification.create({data:{tenantId:company.id,title:'Payroll prepared automatically',message:`${month} attendance is closed and payroll is ready for review. No salary payout has been sent.`}});
   await db.notification.deleteMany({where:{tenantId:company.id,title:{in:[AUTO_PAYROLL_FAILURE,AUTO_PAYROLL_REVIEW]},message:{contains:month}}});
   await db.auditLog.create({data:{tenantId:company.id,action:'PAYROLL_AUTO_PREPARED',entity:'payroll',entityId:run.id,after:{month,totalNet:run.totalNet,attendanceLockId:run.attendanceLockId}}});
  }catch(error:any){
   const message=`${month}: ${String(error?.message??'Review attendance and payroll settings.').slice(0,450)}`;
   await createAutomationNoticeOnce(db,company.id,AUTO_PAYROLL_FAILURE,message).catch(()=>{});
  }
 }
}

const HR_ASSIGN_ROLES=new Set(['COMPANY_OWNER','HR_ADMIN','HR_EXECUTIVE']);
const coveredMonths=(start:Date,end:Date)=>{const out:string[]=[];let y=start.getUTCFullYear(),m=start.getUTCMonth();const ey=end.getUTCFullYear(),em=end.getUTCMonth();while(y<ey||(y===ey&&m<=em)){out.push(`${y}-${String(m+1).padStart(2,'0')}`);m++;if(m>11){m=0;y++;}}return out;};

export async function normalizeRecentHrAssignedLeave(db:Database,lookbackHours=48){
 const cutoff=new Date(Date.now()-Math.max(1,lookbackHours)*3600_000);
 const audits=await db.auditLog.findMany({where:{action:'LEAVE_REQUESTED',entity:'leave',entityId:{not:null},createdAt:{gte:cutoff}},orderBy:{createdAt:'desc'},take:500});
 if(!audits.length)return {checked:0,approved:0};
 const ids=[...new Set(audits.map(a=>a.entityId).filter((v):v is string=>!!v))];
 const leaves=await db.leaveRequest.findMany({where:{id:{in:ids},status:'PENDING'}});
 if(!leaves.length)return {checked:ids.length,approved:0};
 const actorIds=[...new Set(audits.map(a=>a.actorId).filter((v):v is string=>!!v))];
 const actors=await db.user.findMany({where:{id:{in:actorIds}},include:{role:true}});
 const actorMap=new Map(actors.map(a=>[a.id,a]));
 const auditByLeave=new Map<string,typeof audits[number]>();
 for(const row of audits)if(row.entityId&&!auditByLeave.has(row.entityId))auditByLeave.set(row.entityId,row);
 let approved=0;
 for(const leave of leaves){
  const source=auditByLeave.get(leave.id),actor=source?.actorId?actorMap.get(source.actorId):null;
  if(!actor||actor.tenantId!==leave.tenantId||actor.employeeId===leave.employeeId||!HR_ASSIGN_ROLES.has(actor.role.code))continue;
  const months=coveredMonths(leave.startDate,leave.endDate);
  if(await db.attendancePeriodLock.count({where:{tenantId:leave.tenantId,month:{in:months},status:'LOCKED'}}))continue;
  const updated=await db.leaveRequest.updateMany({where:{id:leave.id,tenantId:leave.tenantId,status:'PENDING'},data:{status:'APPROVED',reviewerId:actor.id,reviewNote:'Assigned by HR'}});
  if(updated.count!==1)continue;
  if(Number(leave.days)!==0.5){
   try{
    const shift=await employeeShift(db,leave.tenantId,leave.employeeId),now=new Date(),night=shift.endMinute<=shift.startMinute;
    let workDay=localDate(now,shift.timezone);
    if(night&&now<zonedMinute(workDay,shift.endMinute,shift.timezone))workDay=new Date(Date.parse(workDay)-86400000).toISOString().slice(0,10);
    const first=leave.startDate.toISOString().slice(0,10),last=leave.endDate.toISOString().slice(0,10);
    if(workDay>=first&&workDay<=last){
      const start=zonedMinute(workDay,night?shift.startMinute-120:0,shift.timezone),end=zonedMinute(workDay,night?1440+shift.endMinute+120:1440,shift.timezone);
      const latest=await db.attendancePunch.findFirst({where:{tenantId:leave.tenantId,employeeId:leave.employeeId,punchTime:{gte:start,lt:end}},orderBy:{punchTime:'desc'}});
      if(latest?.punchType==='IN'){
        const sourceId=`leave-${leave.id}-auto-out`,existing=await db.attendancePunch.findUnique({where:{tenantId_sourceId:{tenantId:leave.tenantId,sourceId}}});
        if(!existing)await db.attendancePunch.create({data:{tenantId:leave.tenantId,employeeId:leave.employeeId,sourceId,punchTime:now,punchType:'OUT',verificationType:'HR_LEAVE',processedAt:now,rawPayload:{source:'LEAVE_ASSIGNMENT_BACKFILL',leaveId:leave.id,actorId:actor.id,administrative:true}}});
      }
    }
   }catch{}
  }
  for(const month of months)await reconcileAttendanceMonth(db,leave.tenantId,month);
  await db.auditLog.create({data:{tenantId:leave.tenantId,actorId:actor.id,action:'LEAVE_ASSIGNED_BACKFILL',entity:'leave',entityId:leave.id,after:{status:'APPROVED',source:'HR_ASSIGNMENT_NORMALIZATION'}}});
  const employeeUser=await db.user.findFirst({where:{tenantId:leave.tenantId,employeeId:leave.employeeId,active:true}});
  if(employeeUser)await db.notification.create({data:{tenantId:leave.tenantId,userId:employeeUser.id,title:'Leave assigned',message:'HR assigned approved leave to your schedule.'}});
  approved++;
 }
 return {checked:ids.length,approved};
}

export async function monitorAttendanceDevices(db:Database,offlineAfterMinutes=15){
 const cutoff=new Date(Date.now()-Math.max(5,offlineAfterMinutes)*60_000);
 await db.attendanceDevice.updateMany({where:{connectionMode:'EMPLOYEE_APP',OR:[{status:{not:'ONLINE'}},{lastError:{not:null}}]},data:{status:'ONLINE',lastError:null}});
 const devices=await db.attendanceDevice.findMany({where:{connectionMode:{not:'EMPLOYEE_APP'},status:{in:['ONLINE','DEGRADED']},lastSeenAt:{lt:cutoff}}});
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
