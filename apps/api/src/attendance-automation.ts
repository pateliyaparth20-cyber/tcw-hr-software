import {BadRequestException,ConflictException,NotFoundException} from '@nestjs/common';
import type {Prisma} from '@prisma/client';
import {lockPayrollPeriod} from './payroll-lock';
import type {Database} from '../../../packages/database';
import {attendanceCalculationPunches,attendancePayableUnits,attendanceWorkdayDate,calculateAttendance,isScheduledWorkDay,punchedAttendanceStatusAtMoment,localDate,monthBounds,noPunchAttendanceStatus,zonedMinute} from '../../../packages/attendance-engine';

const key=(d:Date)=>d.toISOString().slice(0,10);
const atDate=(s:string)=>new Date(`${s}T00:00:00.000Z`);
const eachDay=(first:Date,next:Date)=>{const out:Date[]=[];for(let t=+first;t<+next;t+=86400000)out.push(new Date(t));return out;};
const overlap=(start:Date,end:Date,date:Date)=>+start<=+date&&+end>=+date;
const shiftBreakWindow=(day:string,shift:any)=>{if(shift?.breakStartMinute==null||shift?.breakEndMinute==null)return null;const night=shift.endMinute<=shift.startMinute;let startMinute=Number(shift.breakStartMinute),endMinute=Number(shift.breakEndMinute);if(night&&startMinute<shift.startMinute)startMinute+=1440;if(night&&endMinute<shift.startMinute)endMinute+=1440;if(endMinute<=startMinute)endMinute+=1440;const shiftStart=zonedMinute(day,shift.startMinute,shift.timezone),shiftEnd=zonedMinute(day,night?1440+shift.endMinute:shift.endMinute,shift.timezone),start=new Date(Math.max(+shiftStart,+zonedMinute(day,startMinute,shift.timezone))),end=new Date(Math.min(+shiftEnd,+zonedMinute(day,endMinute,shift.timezone)));return end>start?{start,end}:null;};

export async function assertAttendanceUnlocked(db:Prisma.TransactionClient,tenantId:string,date:Date){
  const month=key(date).slice(0,7);
  const lock=await db.attendancePeriodLock.findUnique({where:{tenantId_month:{tenantId,month}}});
  if(lock?.status==='LOCKED')throw new ConflictException(`Attendance for ${month} is locked. Unlock it before making corrections.`);
}

export async function employeeShift(db:Database,tenantId:string,employeeId:string,preferredShiftId?:string|null){
  const employee=await db.employee.findFirst({where:{tenantId,id:employeeId,deletedAt:null},select:{shiftId:true}});
  if(!employee)throw new NotFoundException('Employee not found.');
  const wanted=preferredShiftId??employee.shiftId;
  const shift=wanted?await db.shift.findFirst({where:{tenantId,id:wanted}}):await db.shift.findFirst({where:{tenantId},orderBy:{createdAt:'asc'}});
  if(!shift)throw new BadRequestException('Create at least one shift before processing attendance.');
  return shift;
}

export function attendanceAutomationTenantStatus(status:string){return ['ACTIVE','TRIAL'].includes(String(status));}

const noPunchRefreshAt=new Map<string,number>();
export async function refreshTenantCurrentNoPunchAttendance(db:Database,tenantId:string,now=new Date(),minIntervalMs=30000){
  const last=noPunchRefreshAt.get(tenantId)??0;
  if(minIntervalMs>0&&now.getTime()-last<minIntervalMs)return {tenantId,skipped:true,updated:0};
  const company=await db.tenant.findUnique({where:{id:tenantId},select:{id:true,status:true,timezone:true}});
  if(!company||!attendanceAutomationTenantStatus(company.status))return {tenantId,skipped:true,updated:0};
  const timezone=company.timezone||'Asia/Kolkata',today=localDate(now,timezone),previous=new Date(Date.parse(today)-86400000).toISOString().slice(0,10);
  const windowStart=atDate(previous),windowEnd=new Date(+atDate(today)+2*86400000);
  const months=[...new Set([previous.slice(0,7),today.slice(0,7)])];
  const [locks,employees,shifts,holidays,leaves,existing,punches]=await Promise.all([
    db.attendancePeriodLock.findMany({where:{tenantId,month:{in:months},status:'LOCKED'},select:{month:true}}),
    db.employee.findMany({where:{tenantId,deletedAt:null,status:{in:['ACTIVE','PROBATION','NOTICE']},joiningDate:{lt:windowEnd}},select:{id:true,shiftId:true,joiningDate:true}}),
    db.shift.findMany({where:{tenantId},orderBy:{createdAt:'asc'}}),
    db.calendarEvent.findMany({where:{tenantId,kind:{in:['HOLIDAY','ROSTER_OFF']},date:{lt:windowEnd},OR:[{endDate:null},{endDate:{gte:windowStart}}]},select:{date:true,endDate:true,kind:true,shiftId:true}}),
    db.leaveRequest.findMany({where:{tenantId,status:'APPROVED',startDate:{lt:windowEnd},endDate:{gte:windowStart}},select:{employeeId:true,startDate:true,endDate:true}}),
    db.attendanceDaily.findMany({where:{tenantId,date:{gte:windowStart,lt:windowEnd}},select:{id:true,employeeId:true,date:true,shiftId:true,firstIn:true,lastOut:true,workMinutes:true,lateMinutes:true,earlyOutMinutes:true,overtimeMinutes:true,payableUnits:true,scheduledMinutes:true,dayType:true,exceptionCode:true,correctionNote:true,status:true,syncedAt:true}}),
    db.attendancePunch.findMany({where:{tenantId,punchTime:{gte:new Date(+windowStart-12*3600000),lt:new Date(+windowEnd+12*3600000)}},orderBy:{punchTime:'asc'},select:{employeeId:true,punchTime:true,punchType:true,verificationType:true,rawPayload:true}})
  ]);
  if(!shifts.length){noPunchRefreshAt.set(tenantId,now.getTime());return {tenantId,skipped:true,updated:0};}
  const lockedMonths=new Set(locks.map(r=>r.month)),shiftMap=new Map(shifts.map(s=>[s.id,s])),existingMap=new Map(existing.map(r=>[`${r.employeeId}:${key(r.date)}`,r])),punchesByEmployee=new Map<string,typeof punches>();
  for(const punch of punches){const list=punchesByEmployee.get(punch.employeeId)??[];list.push(punch);punchesByEmployee.set(punch.employeeId,list);}
  let updated=0;
  for(const employee of employees){
    const currentShift=(employee.shiftId&&shiftMap.get(employee.shiftId))||shifts[0];
    const candidateDays=[previous,today];
    for(const workDay of candidateDays){
      const record=existingMap.get(`${employee.id}:${workDay}`);
      const shift=(record?.shiftId&&shiftMap.get(record.shiftId))||currentShift;
      if(lockedMonths.has(workDay.slice(0,7))||workDay<key(employee.joiningDate))continue;
      const day=atDate(workDay);
      if(!isScheduledWorkDay(day,shift))continue;
      if(holidays.some(h=>h.kind==='HOLIDAY'?overlap(h.date,h.endDate??h.date,day):h.kind==='ROSTER_OFF'&&h.shiftId===shift.id&&+h.date===+day))continue;
      if(leaves.some(l=>l.employeeId===employee.id&&overlap(l.startDate,l.endDate,day)))continue;
      const workDayPunches=(punchesByEmployee.get(employee.id)??[]).filter(p=>attendanceWorkdayDate(p.punchTime,shift.startMinute,shift.endMinute,shift.timezone)===workDay);
      const night=shift.endMinute<=shift.startMinute,shiftStart=zonedMinute(workDay,shift.startMinute,shift.timezone),shiftEnd=zonedMinute(workDay,night?1440+shift.endMinute:shift.endMinute,shift.timezone),breakWindow=shiftBreakWindow(workDay,shift);
      if(now<shiftStart)continue;
      if(workDayPunches.length){
        if(record?.correctionNote)continue;
        if(record?.syncedAt&&record.syncedAt.getTime()>=shiftEnd.getTime())continue;
        const needsSyncedFinalization=!!record?.syncedAt&&now.getTime()>=shiftEnd.getTime();
        const effectivePunches=attendanceCalculationPunches(workDayPunches),calculated=calculateAttendance(effectivePunches.map(p=>({time:p.punchTime,type:p.punchType as 'IN'|'OUT'})),{shiftStart,shiftEnd,breakStart:shift.punchDrivenBreaks?undefined:breakWindow?.start,breakEnd:shift.punchDrivenBreaks?undefined:breakWindow?.end,graceMinutes:shift.graceMinutes,earlyOutGraceMinutes:shift.earlyOutGraceMinutes,fullDayMinutes:shift.fullDayMinutes,halfDayMinutes:shift.halfDayMinutes,overtimeAfterMinutes:shift.overtimeAfterMinutes}),status=punchedAttendanceStatusAtMoment(calculated.status,now,shiftEnd,true),payableUnits=attendancePayableUnits(status,calculated.workMinutes,shift.halfDayMinutes),values={shiftId:shift.id,scheduledMinutes:shift.fullDayMinutes,payableUnits,leaveUnits:0,dayType:'WORKING',status,exceptionCode:status==='MISSING_PUNCH'?'MISSING_PUNCH':'',firstIn:calculated.firstIn,lastOut:calculated.lastOut,workMinutes:calculated.workMinutes,lateMinutes:calculated.lateMinutes,earlyOutMinutes:calculated.earlyOutMinutes,overtimeMinutes:calculated.overtimeMinutes,...(needsSyncedFinalization?{syncedAt:now}:{})};
        const sameDate=(a:Date|null|undefined,b:Date|null|undefined)=>a&&b?a.getTime()===b.getTime():!a&&!b,unchanged=!!record&&record.shiftId===shift.id&&record.status===status&&Number(record.scheduledMinutes)===shift.fullDayMinutes&&Number(record.payableUnits)===payableUnits&&record.dayType==='WORKING'&&record.exceptionCode===values.exceptionCode&&sameDate(record.firstIn,calculated.firstIn)&&sameDate(record.lastOut,calculated.lastOut)&&Number(record.workMinutes)===calculated.workMinutes&&Number(record.lateMinutes)===calculated.lateMinutes&&Number(record.earlyOutMinutes)===calculated.earlyOutMinutes&&Number(record.overtimeMinutes)===calculated.overtimeMinutes&&!needsSyncedFinalization;
        if(!unchanged){if(record)await db.attendanceDaily.update({where:{id:record.id},data:values});else await db.attendanceDaily.create({data:{tenantId,employeeId:employee.id,date:day,...values}});updated++;}
        continue;
      }
      const syncedAfterShiftEnd=!!record?.syncedAt&&record.syncedAt.getTime()>=shiftEnd.getTime();
      if(record?.correctionNote||record?.firstIn||record?.lastOut||syncedAfterShiftEnd)continue;
      const phase=noPunchAttendanceStatus(now,shiftStart,shiftEnd,shift.graceMinutes);
      if(phase==='PENDING')continue;
      const needsNoPunchSyncedFinalization=now.getTime()>=shiftEnd.getTime();
      const values={shiftId:shift.id,scheduledMinutes:shift.fullDayMinutes,payableUnits:attendancePayableUnits(phase),leaveUnits:0,dayType:'WORKING',status:phase,exceptionCode:'',firstIn:null,lastOut:null,workMinutes:0,lateMinutes:0,earlyOutMinutes:0,overtimeMinutes:0,...(needsNoPunchSyncedFinalization?{syncedAt:now}:{})};
      if(record)await db.attendanceDaily.update({where:{id:record.id},data:values});
      else await db.attendanceDaily.create({data:{tenantId,employeeId:employee.id,date:day,...values}});
      updated++;
    }
  }
  noPunchRefreshAt.set(tenantId,now.getTime());
  return {tenantId,skipped:false,updated};
}
export async function refreshCurrentNoPunchAttendance(db:Database,now=new Date()){
  const companies=await db.tenant.findMany({where:{status:{in:['ACTIVE','TRIAL']}},select:{id:true}});
  let updated=0;
  for(const company of companies)updated+=(await refreshTenantCurrentNoPunchAttendance(db,company.id,now,0)).updated;
  return {companies:companies.length,updated};
}

export async function reconcileAttendanceMonth(db:Database,tenantId:string,month:string){
  return db.$transaction(async tx=>{
    await lockPayrollPeriod(tx,tenantId,month);
    return reconcileAttendanceMonthInTransaction(tx,tenantId,month);
  },{timeout:60000});
}

export async function reconcileAttendanceMonthInTransaction(db:Prisma.TransactionClient,tenantId:string,month:string){
  const {first,next}=monthBounds(month),now=new Date();
  const company=await db.tenant.findUnique({where:{id:tenantId},select:{timezone:true}});
  const tenantTimezone=company?.timezone||'Asia/Kolkata',today=localDate(now,tenantTimezone),currentMonth=today.slice(0,7);
  if(month>currentMonth)throw new BadRequestException('Future attendance months cannot be reconciled.');
  const processNext=month===currentMonth?new Date(+atDate(today)+86400000):next;
  const lock=await db.attendancePeriodLock.findUnique({where:{tenantId_month:{tenantId,month}}});
  if(lock?.status==='LOCKED')throw new ConflictException(`${month} attendance is locked.`);
  if(month===currentMonth)await db.attendanceDaily.updateMany({where:{tenantId,date:{gte:processNext,lt:next},correctionNote:'',firstIn:null,lastOut:null,status:{not:'VOID'}},data:{status:'VOID',scheduledMinutes:0,payableUnits:0,leaveUnits:0,exceptionCode:''}});
  const [employees,shifts,holidays,leaves,leaveTypes,existing,punches]=await Promise.all([
    db.employee.findMany({where:{tenantId,deletedAt:null,status:{in:['ACTIVE','PROBATION','NOTICE']},joiningDate:{lt:next}},orderBy:{employeeCode:'asc'}}),
    db.shift.findMany({where:{tenantId},orderBy:{createdAt:'asc'}}),
    db.calendarEvent.findMany({where:{tenantId,kind:{in:['HOLIDAY','ROSTER_OFF']},date:{lt:next},OR:[{endDate:null},{endDate:{gte:first}}]}}),
    db.leaveRequest.findMany({where:{tenantId,status:'APPROVED',startDate:{lt:next},endDate:{gte:first}}}),
    db.leaveType.findMany({where:{tenantId}}),
    db.attendanceDaily.findMany({where:{tenantId,date:{gte:first,lt:next}}}),
    db.attendancePunch.findMany({where:{tenantId,punchTime:{gte:new Date(+first-86400000),lt:new Date(+next+86400000)}},orderBy:{punchTime:'asc'}})
  ]);
  if(!shifts.length)throw new BadRequestException('Create a shift before reconciling attendance.');
  const shiftMap=new Map(shifts.map(s=>[s.id,s]));
  const leaveTypeMap=new Map(leaveTypes.map(t=>[t.id,t]));
  const holidaySet=new Set<string>(),rosterOffSet=new Set<string>();
  for(const h of holidays){if(h.kind==='ROSTER_OFF'){if(h.shiftId)rosterOffSet.add(`${h.shiftId}:${key(h.date)}`);continue;}const end=h.endDate??h.date;for(let t=+h.date;t<=+end;t+=86400000)holidaySet.add(key(new Date(t)));}
  const existingMap=new Map(existing.map(r=>[`${r.employeeId}:${key(r.date)}`,r]));
  let generated=0,exceptions=0;
  for(const employee of employees){
    const currentShift=(employee.shiftId&&shiftMap.get(employee.shiftId))||shifts[0];
    const start=employee.joiningDate>first?employee.joiningDate:first;
    const employeeLeaves=leaves.filter(l=>l.employeeId===employee.id);
    const employeePunches=punches.filter(p=>p.employeeId===employee.id);
    for(const day of eachDay(start,processNext)){
      const dateKey=key(day),record=existingMap.get(`${employee.id}:${dateKey}`);
      const shift=(record?.shiftId&&shiftMap.get(record.shiftId))||currentShift;
      const night=shift.endMinute<=shift.startMinute,shiftStart=zonedMinute(dateKey,shift.startMinute,shift.timezone),shiftEnd=zonedMinute(dateKey,night?1440+shift.endMinute:shift.endMinute,shift.timezone),breakWindow=shiftBreakWindow(dateKey,shift);
      const approvedLeave=employeeLeaves.find(l=>overlap(l.startDate,l.endDate,day));
      if(record?.syncedAt&&record.syncedAt.getTime()>=shiftEnd.getTime()&&!approvedLeave)continue;
      const recordStart=record?.firstIn?new Date(record.firstIn.getTime()-60000):null;
      const recordEnd=record?.firstIn&&record.status!=='MISSING_PUNCH'&&record.lastOut?new Date(record.lastOut.getTime()+60000):null;
      const dayPunches=employeePunches.filter(p=>recordStart?(p.punchTime>=recordStart&&(!recordEnd||p.punchTime<=recordEnd)):attendanceWorkdayDate(p.punchTime,shift.startMinute,shift.endMinute,shift.timezone)===dateKey);
      let punchCalc:any=null;if(dayPunches.length&&!record?.correctionNote){const effectiveDayPunches=attendanceCalculationPunches(dayPunches);punchCalc=calculateAttendance(effectiveDayPunches.map(p=>({time:p.punchTime,type:p.punchType as 'IN'|'OUT'})),{shiftStart,shiftEnd,breakStart:shift.punchDrivenBreaks?undefined:breakWindow?.start,breakEnd:shift.punchDrivenBreaks?undefined:breakWindow?.end,graceMinutes:shift.graceMinutes,earlyOutGraceMinutes:shift.earlyOutGraceMinutes,fullDayMinutes:shift.fullDayMinutes,halfDayMinutes:shift.halfDayMinutes,overtimeAfterMinutes:shift.overtimeAfterMinutes});}
      const punchStatus=punchCalc?punchedAttendanceStatusAtMoment(punchCalc.status,now,shiftEnd,dayPunches.length>0):null;
      const holiday=holidaySet.has(dateKey),rosterOff=rosterOffSet.has(`${shift.id}:${dateKey}`),weeklyOff=!isScheduledWorkDay(day,shift);
      const leave=approvedLeave;
      const leaveType=leave?leaveTypeMap.get(leave.leaveTypeId):undefined;
      const halfLeave=!!leave&&Number(leave.days)===0.5&&key(leave.startDate)===key(leave.endDate);
      const effectiveLeave=!holiday&&!weeklyOff&&!rosterOff?leave:undefined;
      const effectiveLeaveType=effectiveLeave?leaveType:undefined;
      const effectiveHalfLeave=!!effectiveLeave&&halfLeave;
      const effectiveLeaveUnits=effectiveLeave?(effectiveHalfLeave?50:100):0;
      const dayType=holiday?'HOLIDAY':weeklyOff||rosterOff?'WEEK_OFF':effectiveLeave?(effectiveLeaveType?.paid?'PAID_LEAVE':'UNPAID_LEAVE'):'WORKING';
      const scheduled=dayType==='WORKING'||dayType==='PAID_LEAVE'||dayType==='UNPAID_LEAVE',fullDayLeave=!!effectiveLeave&&!effectiveHalfLeave;
      const currentNoPunchDay=dateKey===today&&scheduled&&!effectiveLeave&&!holiday&&!weeklyOff&&!rosterOff&&!dayPunches.length&&!record?.correctionNote;
      const noPunchPhase=currentNoPunchDay?noPunchAttendanceStatus(now,shiftStart,shiftEnd,shift.graceMinutes):null;
      let status:string=record?.correctionNote?record.status:currentNoPunchDay?(noPunchPhase==='PENDING'?'VOID':noPunchPhase??'ABSENT'):fullDayLeave?(punchStatus??'ABSENT'):punchStatus??(holiday?'HOLIDAY':weeklyOff||rosterOff?'WEEK_OFF':effectiveLeave?'HALF_DAY_LEAVE':'ABSENT');
      let payable=record?.correctionNote?record.payableUnits:attendancePayableUnits(status,punchCalc?.workMinutes??0,shift.halfDayMinutes);
      if(!record?.correctionNote&&effectiveLeave){const worked=punchCalc?attendancePayableUnits(punchStatus??punchCalc.status,punchCalc.workMinutes,shift.halfDayMinutes):0;if(effectiveLeaveType?.paid)payable=Math.min(100,worked+effectiveLeaveUnits);else payable=worked;if(!punchCalc&&!record&&effectiveHalfLeave)payable=effectiveLeaveType?.paid?50:0;}
      else if(!record?.correctionNote&&!scheduled){payable=0;if((punchCalc?.workMinutes??0)>0)status=punchStatus??punchCalc!.status;}
      const exceptionCode=status==='MISSING_PUNCH'?'MISSING_PUNCH':'';if(exceptionCode)exceptions++;
      const rawAttendanceValues=punchCalc?{firstIn:punchCalc.firstIn,lastOut:punchCalc.lastOut,workMinutes:punchCalc.workMinutes,lateMinutes:punchCalc.lateMinutes,earlyOutMinutes:punchCalc.earlyOutMinutes,overtimeMinutes:punchCalc.overtimeMinutes}:record?{firstIn:record.firstIn,lastOut:record.lastOut,workMinutes:record.workMinutes,lateMinutes:record.lateMinutes,earlyOutMinutes:record.earlyOutMinutes,overtimeMinutes:record.overtimeMinutes}:{firstIn:null,lastOut:null,workMinutes:0,lateMinutes:0,earlyOutMinutes:0,overtimeMinutes:0};
      const attendanceValues=fullDayLeave?{...rawAttendanceValues,lateMinutes:0,earlyOutMinutes:0,overtimeMinutes:0}:rawAttendanceValues;
      if(currentNoPunchDay&&noPunchPhase==='PENDING')payable=0;
      const inProgressWorkDay=dayType==='WORKING'&&now.getTime()>=shiftStart.getTime()&&now.getTime()<shiftEnd.getTime();
      const values={shiftId:shift.id,scheduledMinutes:currentNoPunchDay&&noPunchPhase==='PENDING'?0:(scheduled?shift.fullDayMinutes:0),payableUnits:payable,leaveUnits:currentNoPunchDay&&noPunchPhase==='PENDING'?0:effectiveLeaveUnits,dayType,status,exceptionCode:currentNoPunchDay?'':exceptionCode,syncedAt:inProgressWorkDay?null:now,...attendanceValues};
      if(record){await db.attendanceDaily.update({where:{id:record.id},data:record.correctionNote?{shiftId:shift.id,scheduledMinutes:values.scheduledMinutes,leaveUnits:effectiveLeaveUnits,dayType}:{...values}});}else{await db.attendanceDaily.create({data:{tenantId,employeeId:employee.id,date:day,...values}});generated++;}
    }
  }
  await db.attendancePunch.updateMany({where:{tenantId,punchTime:{gte:new Date(+first-86400000),lt:new Date(+next+86400000)},processedAt:null},data:{processedAt:new Date()}});
  return {month,employees:employees.length,generated,exceptions};
}

export async function attendanceMonthSummary(db:Prisma.TransactionClient,tenantId:string,month:string,employeeIds?:string[]|null){
  const {first,next}=monthBounds(month),now=new Date();
  const company=await db.tenant.findUnique({where:{id:tenantId},select:{timezone:true}});
  const tenantTimezone=company?.timezone||'Asia/Kolkata',today=localDate(now,tenantTimezone),currentMonth=today.slice(0,7);
  const reportNext=month<currentMonth?next:month===currentMonth?new Date(+atDate(today)+86400000):first;
  const [rows,employees,lock,shifts,holidays]=await Promise.all([
    db.attendanceDaily.findMany({where:{tenantId,date:{gte:first,lt:reportNext},status:{not:'VOID'},syncedAt:{not:null},...(employeeIds?{employeeId:{in:employeeIds}}:{})},orderBy:[{employeeId:'asc'},{date:'asc'}]}),
    db.employee.findMany({where:{tenantId,deletedAt:null,...(employeeIds?{id:{in:employeeIds}}:{})},select:{id:true,employeeCode:true,firstName:true,lastName:true,shiftId:true,joiningDate:true}}),
    db.attendancePeriodLock.findUnique({where:{tenantId_month:{tenantId,month}}}),
    db.shift.findMany({where:{tenantId},orderBy:{createdAt:'asc'}}),
    db.calendarEvent.findMany({where:{tenantId,kind:{in:['HOLIDAY','ROSTER_OFF']},date:{lt:reportNext},OR:[{endDate:null},{endDate:{gte:first}}]}})
  ]);
  const employeeMap=new Map(employees.map(e=>[e.id,e]));
  const shiftMap=new Map(shifts.map(s=>[s.id,s]));
  const holidaySet=new Set<string>(),summaryRosterOffSet=new Set<string>();
  for(const h of holidays){if(h.kind==='ROSTER_OFF'){if(h.shiftId)summaryRosterOffSet.add(`${h.shiftId}:${key(h.date)}`);continue;}const end=h.endDate??h.date;for(let t=Math.max(+first,+h.date);t<+next&&t<=+end;t+=86400000)holidaySet.add(key(new Date(t)));}
  const groups=new Map<string,any>();
  for(const e of employees){
    if(e.joiningDate>=reportNext)continue;
    groups.set(e.id,{id:e.id,employeeId:e.id,employeeCode:e.employeeCode,employee:`${e.firstName} ${e.lastName}`,scheduledDays:0,payableUnits:0,presentDays:0,halfDays:0,insufficientHoursDays:0,paidLeaveUnits:0,unpaidLeaveUnits:0,absentDays:0,missingPunchDays:0,lateMinutes:0,earlyOutMinutes:0,overtimeMinutes:0});
  }
  for(const row of rows){
    const e=employeeMap.get(row.employeeId);if(!e)continue;
    const g=groups.get(row.employeeId)??{id:row.employeeId,employeeId:row.employeeId,employeeCode:e.employeeCode,employee:`${e.firstName} ${e.lastName}`,scheduledDays:0,payableUnits:0,presentDays:0,halfDays:0,insufficientHoursDays:0,paidLeaveUnits:0,unpaidLeaveUnits:0,absentDays:0,missingPunchDays:0,lateMinutes:0,earlyOutMinutes:0,overtimeMinutes:0};
    const shift=(row.shiftId&&shiftMap.get(row.shiftId))||(e.shiftId&&shiftMap.get(e.shiftId))||shifts[0],rowKey=key(row.date);
    if(row.scheduledMinutes>0)g.scheduledDays++;
    g.payableUnits+=row.payableUnits;
    if(row.status==='PRESENT')g.presentDays++;
    if(['INSUFFICIENT_HOURS','SHORT_HOURS'].includes(row.status))g.insufficientHoursDays++;
    if(['SHORT_HOURS','HALF_DAY'].includes(row.status))g.halfDays++;
    if(row.dayType==='PAID_LEAVE')g.paidLeaveUnits+=row.leaveUnits;
    if(row.dayType==='UNPAID_LEAVE')g.unpaidLeaveUnits+=row.leaveUnits;
    const fullDayLeave=['PAID_LEAVE','UNPAID_LEAVE'].includes(row.dayType)&&row.leaveUnits>=100;
    if(row.status==='ABSENT'&&!fullDayLeave)g.absentDays++;
    const activeToday=!!shift&&row.status==='MISSING_PUNCH'&&!!row.firstIn&&!row.lastOut&&rowKey===localDate(now,shift.timezone);
    if(row.status==='MISSING_PUNCH'&&!activeToday&&!fullDayLeave)g.missingPunchDays++;
    g.lateMinutes+=fullDayLeave?0:row.lateMinutes;g.earlyOutMinutes+=fullDayLeave?0:row.earlyOutMinutes;g.overtimeMinutes+=fullDayLeave?0:row.overtimeMinutes;
    groups.set(row.employeeId,g);
  }
  const items=[...groups.values()].map(g=>{
    const e=employeeMap.get(g.employeeId)!;const shift=(e.shiftId&&shiftMap.get(e.shiftId))||shifts[0];
    let fullScheduledDays=0,elapsedScheduledDays=0;
    if(shift){
      for(const d of eachDay(first,next)){const dk=key(d);if(isScheduledWorkDay(d,shift)&&!holidaySet.has(dk)&&!summaryRosterOffSet.has(`${shift.id}:${dk}`))fullScheduledDays++;}
      const employeeStart=e.joiningDate>first?e.joiningDate:first;
      for(const d of eachDay(employeeStart,reportNext)){const dk=key(d);if(isScheduledWorkDay(d,shift)&&!holidaySet.has(dk)&&!summaryRosterOffSet.has(`${shift.id}:${dk}`))elapsedScheduledDays++;}
    }
    return {...g,scheduledDays:g.scheduledDays||elapsedScheduledDays,fullScheduledDays};
  }).sort((a,b)=>a.employeeCode.localeCompare(b.employeeCode));
  const totals=items.reduce((a,r)=>({employees:a.employees+1,scheduledDays:a.scheduledDays+r.scheduledDays,payableUnits:a.payableUnits+r.payableUnits,absentDays:a.absentDays+r.absentDays,missingPunchDays:a.missingPunchDays+r.missingPunchDays,lateMinutes:a.lateMinutes+r.lateMinutes,earlyOutMinutes:a.earlyOutMinutes+r.earlyOutMinutes,overtimeMinutes:a.overtimeMinutes+r.overtimeMinutes}),{employees:0,scheduledDays:0,payableUnits:0,absentDays:0,missingPunchDays:0,lateMinutes:0,earlyOutMinutes:0,overtimeMinutes:0});
  return {month,items,totals,lock};
}

export async function lockAttendanceMonth(db:Database,tenantId:string,month:string,userId:string){
  return db.$transaction(async tx=>{
    await lockPayrollPeriod(tx,tenantId,month);
    return lockAttendanceMonthInTransaction(tx,tenantId,month,userId);
  },{timeout:30000});
}

export async function lockAttendanceMonthInTransaction(db:Prisma.TransactionClient,tenantId:string,month:string,userId:string){
  const company=await db.tenant.findUnique({where:{id:tenantId},select:{timezone:true}});
  const currentMonth=localDate(new Date(),company?.timezone||'Asia/Kolkata').slice(0,7);
  if(month>=currentMonth)throw new BadRequestException('The current attendance month must stay open. Lock it only after the month has ended.');
  const {first,next}=monthBounds(month);
  const syncedCount=await db.attendanceDaily.count({where:{tenantId,date:{gte:first,lt:next},syncedAt:{not:null}}});
  if(!syncedCount)throw new BadRequestException('Sync this attendance month before locking it for payroll.');
  const summary=await attendanceMonthSummary(db,tenantId,month);
  if(summary.totals.missingPunchDays)throw new BadRequestException(`Resolve ${summary.totals.missingPunchDays} missing-punch day(s) before locking attendance.`);
  const now=new Date();
  const activeOpen=await db.attendanceDaily.findFirst({where:{tenantId,date:{gte:first,lt:next},status:'MISSING_PUNCH',firstIn:{not:null},lastOut:null}});
  if(activeOpen)throw new BadRequestException('An employee is still working with an open IN punch. Check out or close the work session before locking attendance.');
  await db.attendanceDaily.updateMany({where:{tenantId,date:{gte:first,lt:next}},data:{lockedAt:now}});
  const row=await db.attendancePeriodLock.upsert({where:{tenantId_month:{tenantId,month}},create:{tenantId,month,status:'LOCKED',lockedBy:userId,lockedAt:now,summary:summary.totals},update:{status:'LOCKED',lockedBy:userId,lockedAt:now,unlockedBy:null,unlockedAt:null,summary:summary.totals}});
  return {lock:row,summary};
}

export async function unlockAttendanceMonth(db:Database,tenantId:string,month:string,userId:string){
  return db.$transaction(async tx=>{
    await lockPayrollPeriod(tx,tenantId,month);
    const {first,next}=monthBounds(month);
    const payroll=await tx.payrollRun.findUnique({where:{tenantId_month:{tenantId,month}}});
    if(payroll&&payroll.status!=='DRAFT')throw new ConflictException('Reopen payroll to draft before unlocking attendance for this month.');
    if(payroll&&await tx.payrollPayout.count({where:{tenantId,runId:payroll.id}}))throw new ConflictException('Attendance with salary payout records cannot be unlocked.');
    const current=await tx.attendancePeriodLock.findUnique({where:{tenantId_month:{tenantId,month}}});
    if(!current)throw new NotFoundException('Attendance month has not been locked.');
    const now=new Date();
    await tx.attendanceDaily.updateMany({where:{tenantId,date:{gte:first,lt:next}},data:{lockedAt:null}});
    return tx.attendancePeriodLock.update({where:{id:current.id},data:{status:'UNLOCKED',unlockedBy:userId,unlockedAt:now}});
  },{timeout:30000});
}
