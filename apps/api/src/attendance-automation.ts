import {BadRequestException,ConflictException,NotFoundException} from '@nestjs/common';
import type {Database} from '../../../packages/database';
import {attendancePayableUnits,attendanceWorkdayDate,calculateAttendance,localDate,monthBounds,workingDaySet,zonedMinute} from '../../../packages/attendance-engine';

const key=(d:Date)=>d.toISOString().slice(0,10);
const atDate=(s:string)=>new Date(`${s}T00:00:00.000Z`);
const eachDay=(first:Date,next:Date)=>{const out:Date[]=[];for(let t=+first;t<+next;t+=86400000)out.push(new Date(t));return out;};
const overlap=(start:Date,end:Date,date:Date)=>+start<=+date&&+end>=+date;

export async function assertAttendanceUnlocked(db:Database,tenantId:string,date:Date){
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

export async function reconcileAttendanceMonth(db:Database,tenantId:string,month:string){
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
    db.calendarEvent.findMany({where:{tenantId,kind:'HOLIDAY',date:{lt:next},OR:[{endDate:null},{endDate:{gte:first}}]}}),
    db.leaveRequest.findMany({where:{tenantId,status:'APPROVED',startDate:{lt:next},endDate:{gte:first}}}),
    db.leaveType.findMany({where:{tenantId}}),
    db.attendanceDaily.findMany({where:{tenantId,date:{gte:first,lt:next}}}),
    db.attendancePunch.findMany({where:{tenantId,punchTime:{gte:new Date(+first-86400000),lt:new Date(+next+86400000)}},orderBy:{punchTime:'asc'}})
  ]);
  if(!shifts.length)throw new BadRequestException('Create a shift before reconciling attendance.');
  const shiftMap=new Map(shifts.map(s=>[s.id,s]));
  const leaveTypeMap=new Map(leaveTypes.map(t=>[t.id,t]));
  const holidaySet=new Set<string>();
  for(const h of holidays){const end=h.endDate??h.date;for(let t=+h.date;t<=+end;t+=86400000)holidaySet.add(key(new Date(t)));}
  const existingMap=new Map(existing.map(r=>[`${r.employeeId}:${key(r.date)}`,r]));
  let generated=0,exceptions=0;
  for(const employee of employees){
    const shift=(employee.shiftId&&shiftMap.get(employee.shiftId))||shifts[0];
    const workDays=workingDaySet(shift.workingDays);
    const start=employee.joiningDate>first?employee.joiningDate:first;
    const employeeLeaves=leaves.filter(l=>l.employeeId===employee.id);
    const punchesByDay=new Map<string,typeof punches>();
    for(const punch of punches.filter(p=>p.employeeId===employee.id)){let punchDay=attendanceWorkdayDate(punch.punchTime,shift.startMinute,shift.endMinute,shift.timezone);if(punchDay.slice(0,7)!==month)continue;const list=punchesByDay.get(punchDay)??[];list.push(punch);punchesByDay.set(punchDay,list);}
    for(const day of eachDay(start,processNext)){
      const dateKey=key(day),record=existingMap.get(`${employee.id}:${dateKey}`),dayPunches=punchesByDay.get(dateKey)??[];
      let punchCalc:any=null;if(dayPunches.length&&!record?.correctionNote){const night=shift.endMinute<=shift.startMinute;punchCalc=calculateAttendance(dayPunches.map(p=>({time:p.punchTime,type:p.punchType as 'IN'|'OUT'})),{shiftStart:zonedMinute(dateKey,shift.startMinute,shift.timezone),shiftEnd:zonedMinute(dateKey,night?1440+shift.endMinute:shift.endMinute,shift.timezone),graceMinutes:shift.graceMinutes,earlyOutGraceMinutes:shift.earlyOutGraceMinutes,fullDayMinutes:shift.fullDayMinutes,halfDayMinutes:shift.halfDayMinutes,overtimeAfterMinutes:shift.overtimeAfterMinutes});}
      const holiday=holidaySet.has(dateKey),weeklyOff=!workDays.has(day.getUTCDay());
      const leave=employeeLeaves.find(l=>overlap(l.startDate,l.endDate,day));
      const leaveType=leave?leaveTypeMap.get(leave.leaveTypeId):undefined;
      const halfLeave=!!leave&&Number(leave.days)===0.5&&key(leave.startDate)===key(leave.endDate);
      const leaveUnits=leave?(halfLeave?50:100):0;
      const dayType=leave?(leaveType?.paid?'PAID_LEAVE':'UNPAID_LEAVE'):holiday?'HOLIDAY':weeklyOff?'WEEK_OFF':'WORKING';
      const scheduled=dayType==='WORKING'||dayType==='PAID_LEAVE'||dayType==='UNPAID_LEAVE',fullDayLeave=!!leave&&!halfLeave;
      const night=shift.endMinute<=shift.startMinute,shiftEnd=zonedMinute(dateKey,night?1440+shift.endMinute:shift.endMinute,shift.timezone);
      const activeNoPunchDay=dateKey===today&&scheduled&&!leave&&!holiday&&!weeklyOff&&!dayPunches.length&&!record?.correctionNote&&now<shiftEnd;
      let status=record?.correctionNote?record.status:activeNoPunchDay?'VOID':fullDayLeave?(leaveType?.paid?'PAID_LEAVE':'UNPAID_LEAVE'):punchCalc?.status??(holiday?'HOLIDAY':weeklyOff?'WEEK_OFF':leave?'HALF_DAY_LEAVE':'ABSENT');
      let payable=record?.correctionNote?record.payableUnits:attendancePayableUnits(status);
      if(!record?.correctionNote&&leave){const worked=punchCalc?attendancePayableUnits(punchCalc.status):0;if(leaveType?.paid)payable=Math.min(100,worked+leaveUnits);else payable=worked;if(!punchCalc&&!record&&halfLeave)payable=leaveType?.paid?50:0;}
      else if(!record?.correctionNote&&!scheduled){payable=0;if((punchCalc?.workMinutes??0)>0)status=punchCalc!.status;}
      const exceptionCode=status==='MISSING_PUNCH'?'MISSING_PUNCH':'';if(exceptionCode)exceptions++;
      const rawAttendanceValues=punchCalc?{firstIn:punchCalc.firstIn,lastOut:punchCalc.lastOut,workMinutes:punchCalc.workMinutes,lateMinutes:punchCalc.lateMinutes,earlyOutMinutes:punchCalc.earlyOutMinutes,overtimeMinutes:punchCalc.overtimeMinutes}:record?{firstIn:record.firstIn,lastOut:record.lastOut,workMinutes:record.workMinutes,lateMinutes:record.lateMinutes,earlyOutMinutes:record.earlyOutMinutes,overtimeMinutes:record.overtimeMinutes}:{firstIn:null,lastOut:null,workMinutes:0,lateMinutes:0,earlyOutMinutes:0,overtimeMinutes:0};
      const attendanceValues=fullDayLeave?{...rawAttendanceValues,lateMinutes:0,earlyOutMinutes:0,overtimeMinutes:0}:rawAttendanceValues;
      if(activeNoPunchDay)payable=0;
      const values={shiftId:shift.id,scheduledMinutes:activeNoPunchDay?0:(scheduled?shift.fullDayMinutes:0),payableUnits:payable,leaveUnits:activeNoPunchDay?0:leaveUnits,dayType,status,exceptionCode:activeNoPunchDay?'':exceptionCode,...attendanceValues};
      if(record){await db.attendanceDaily.update({where:{id:record.id},data:record.correctionNote?{shiftId:shift.id,scheduledMinutes:values.scheduledMinutes,leaveUnits,dayType}:{...values}});}else{await db.attendanceDaily.create({data:{tenantId,employeeId:employee.id,date:day,...values}});generated++;}
    }
  }
  await db.attendancePunch.updateMany({where:{tenantId,punchTime:{gte:new Date(+first-86400000),lt:new Date(+next+86400000)},processedAt:null},data:{processedAt:new Date()}});
  return {month,employees:employees.length,generated,exceptions};
}

export async function attendanceMonthSummary(db:Database,tenantId:string,month:string,employeeIds?:string[]|null){
  const {first,next}=monthBounds(month),now=new Date();
  const company=await db.tenant.findUnique({where:{id:tenantId},select:{timezone:true}});
  const tenantTimezone=company?.timezone||'Asia/Kolkata',today=localDate(now,tenantTimezone),currentMonth=today.slice(0,7);
  const reportNext=month<currentMonth?next:month===currentMonth?new Date(+atDate(today)+86400000):first;
  const [rows,employees,lock,shifts,holidays]=await Promise.all([
    db.attendanceDaily.findMany({where:{tenantId,date:{gte:first,lt:reportNext},status:{not:'VOID'},...(employeeIds?{employeeId:{in:employeeIds}}:{})},orderBy:[{employeeId:'asc'},{date:'asc'}]}),
    db.employee.findMany({where:{tenantId,deletedAt:null,...(employeeIds?{id:{in:employeeIds}}:{})},select:{id:true,employeeCode:true,firstName:true,lastName:true,shiftId:true,joiningDate:true}}),
    db.attendancePeriodLock.findUnique({where:{tenantId_month:{tenantId,month}}}),
    db.shift.findMany({where:{tenantId},orderBy:{createdAt:'asc'}}),
    db.calendarEvent.findMany({where:{tenantId,kind:'HOLIDAY',date:{lt:reportNext},OR:[{endDate:null},{endDate:{gte:first}}]}})
  ]);
  const employeeMap=new Map(employees.map(e=>[e.id,e]));
  const shiftMap=new Map(shifts.map(s=>[s.id,s]));
  const holidaySet=new Set<string>();
  for(const h of holidays){const end=h.endDate??h.date;for(let t=Math.max(+first,+h.date);t<+next&&t<=+end;t+=86400000)holidaySet.add(key(new Date(t)));}
  const groups=new Map<string,any>();
  for(const e of employees){
    if(e.joiningDate>=reportNext)continue;
    groups.set(e.id,{id:e.id,employeeId:e.id,employeeCode:e.employeeCode,employee:`${e.firstName} ${e.lastName}`,scheduledDays:0,payableUnits:0,presentDays:0,halfDays:0,paidLeaveUnits:0,unpaidLeaveUnits:0,absentDays:0,missingPunchDays:0,lateMinutes:0,earlyOutMinutes:0,overtimeMinutes:0});
  }
  for(const row of rows){
    const e=employeeMap.get(row.employeeId);if(!e)continue;
    const g=groups.get(row.employeeId)??{id:row.employeeId,employeeId:row.employeeId,employeeCode:e.employeeCode,employee:`${e.firstName} ${e.lastName}`,scheduledDays:0,payableUnits:0,presentDays:0,halfDays:0,paidLeaveUnits:0,unpaidLeaveUnits:0,absentDays:0,missingPunchDays:0,lateMinutes:0,earlyOutMinutes:0,overtimeMinutes:0};
    const shift=(e.shiftId&&shiftMap.get(e.shiftId))||shifts[0],rowKey=key(row.date),night=!!shift&&shift.endMinute<=shift.startMinute,shiftEnd=shift?zonedMinute(rowKey,night?1440+shift.endMinute:shift.endMinute,shift.timezone):null;
    const activeNoPunchDay=rowKey===today&&row.status==='ABSENT'&&!row.firstIn&&!row.lastOut&&!!shiftEnd&&now<shiftEnd;
    if(row.scheduledMinutes>0)g.scheduledDays++;
    if(activeNoPunchDay){groups.set(row.employeeId,g);continue;}
    g.payableUnits+=row.payableUnits;
    if(row.status==='PRESENT')g.presentDays++;
    if(['HALF_DAY','HALF_DAY_LEAVE'].includes(row.status))g.halfDays++;
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
    const workDays=workingDaySet(shift?.workingDays);let fullScheduledDays=0,elapsedScheduledDays=0;
    if(shift){
      for(const d of eachDay(first,next))if(workDays.has(d.getUTCDay())&&!holidaySet.has(key(d)))fullScheduledDays++;
      const employeeStart=e.joiningDate>first?e.joiningDate:first;
      for(const d of eachDay(employeeStart,reportNext))if(workDays.has(d.getUTCDay())&&!holidaySet.has(key(d)))elapsedScheduledDays++;
    }
    return {...g,scheduledDays:Math.max(g.scheduledDays,elapsedScheduledDays),fullScheduledDays};
  }).sort((a,b)=>a.employeeCode.localeCompare(b.employeeCode));
  const totals=items.reduce((a,r)=>({employees:a.employees+1,scheduledDays:a.scheduledDays+r.scheduledDays,payableUnits:a.payableUnits+r.payableUnits,absentDays:a.absentDays+r.absentDays,missingPunchDays:a.missingPunchDays+r.missingPunchDays,lateMinutes:a.lateMinutes+r.lateMinutes,earlyOutMinutes:a.earlyOutMinutes+r.earlyOutMinutes,overtimeMinutes:a.overtimeMinutes+r.overtimeMinutes}),{employees:0,scheduledDays:0,payableUnits:0,absentDays:0,missingPunchDays:0,lateMinutes:0,earlyOutMinutes:0,overtimeMinutes:0});
  return {month,items,totals,lock};
}

export async function lockAttendanceMonth(db:Database,tenantId:string,month:string,userId:string){
  const company=await db.tenant.findUnique({where:{id:tenantId},select:{timezone:true}});
  const currentMonth=localDate(new Date(),company?.timezone||'Asia/Kolkata').slice(0,7);
  if(month>=currentMonth)throw new BadRequestException('The current attendance month must stay open. Lock it only after the month has ended.');
  await reconcileAttendanceMonth(db,tenantId,month);
  const summary=await attendanceMonthSummary(db,tenantId,month);
  if(summary.totals.missingPunchDays)throw new BadRequestException(`Resolve ${summary.totals.missingPunchDays} missing-punch day(s) before locking attendance.`);
  const {first,next}=monthBounds(month),now=new Date();
  const activeOpen=await db.attendanceDaily.findFirst({where:{tenantId,date:{gte:first,lt:next},status:'MISSING_PUNCH',firstIn:{not:null},lastOut:null}});
  if(activeOpen)throw new BadRequestException('An employee is still working with an open IN punch. Check out or close the work session before locking attendance.');
  const row=await db.$transaction(async tx=>{
    await tx.attendanceDaily.updateMany({where:{tenantId,date:{gte:first,lt:next}},data:{lockedAt:now}});
    return tx.attendancePeriodLock.upsert({where:{tenantId_month:{tenantId,month}},create:{tenantId,month,status:'LOCKED',lockedBy:userId,lockedAt:now,summary:summary.totals},update:{status:'LOCKED',lockedBy:userId,lockedAt:now,unlockedBy:null,unlockedAt:null,summary:summary.totals}});
  });
  return {lock:row,summary};
}

export async function unlockAttendanceMonth(db:Database,tenantId:string,month:string,userId:string){
  const {first,next}=monthBounds(month);
  const payroll=await db.payrollRun.findUnique({where:{tenantId_month:{tenantId,month}}});
  if(payroll&&payroll.status!=='DRAFT')throw new ConflictException('Reopen payroll to draft before unlocking attendance for this month.');
  const current=await db.attendancePeriodLock.findUnique({where:{tenantId_month:{tenantId,month}}});
  if(!current)throw new NotFoundException('Attendance month has not been locked.');
  const now=new Date();
  return db.$transaction(async tx=>{
    await tx.attendanceDaily.updateMany({where:{tenantId,date:{gte:first,lt:next}},data:{lockedAt:null}});
    return tx.attendancePeriodLock.update({where:{id:current.id},data:{status:'UNLOCKED',unlockedBy:userId,unlockedAt:now}});
  });
}
