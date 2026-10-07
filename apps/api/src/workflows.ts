import {approvalEnabled,approvalRows,createApproval,reviewApproval} from './approvals';
import {updateManualSalary} from './manual-payroll';
import {lockPayrollPeriod,lockPayrollRun} from './payroll-lock';
import {BadRequestException,ForbiddenException,NotFoundException,ConflictException} from '@nestjs/common';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import type {Database} from '../../../packages/database';
import {id,date,leaveSchema} from '../../../packages/validation';
import {allocateBreakUsageSeconds,attendanceBusinessMinutesFromSeconds,attendanceCalculationPunches,attendanceElapsedSeconds,attendancePayableUnits,attendancePunchDrivenBreaks,attendanceWorkdayDate,calculateAttendance,flexibleBreakLiveState,punchedAttendanceStatusAtMoment,isScheduledBreakOut,isScheduledWorkDay,localDate,monthBounds,punchDrivenBreakUsageSeconds,zonedMinute} from '../../../packages/attendance-engine';
import {hasPermission} from '../../../packages/permissions';
import {audit,assertEmployee,employeeScope,requirePermission,tenant,Context} from './context';
import {assertAttendanceUnlocked,attendanceMonthSummary,employeeShift,lockAttendanceMonth,reconcileAttendanceMonth,refreshTenantCurrentNoPunchAttendance,unlockAttendanceMonth} from './attendance-automation';
import {sendPush} from './push';
import {enrollEmployeeFace,faceProfileStatus,verifyEmployeeFace} from './face-profile';
import {finalizePayrollMonth,preparePayrollMonth,reopenPayrollMonth} from './payroll-service';

const monthsCovered=(start:Date,end:Date)=>{const out:string[]=[];let y=start.getUTCFullYear(),m=start.getUTCMonth();const ey=end.getUTCFullYear(),em=end.getUTCMonth();while(y<ey||(y===ey&&m<=em)){out.push(`${y}-${String(m+1).padStart(2,'0')}`);m++;if(m>11){m=0;y++;}}return out;};
const shiftBreakWindow=(day:string,shift:any)=>{if(shift?.breakStartMinute==null||shift?.breakEndMinute==null)return null;const night=shift.endMinute<=shift.startMinute;let startMinute=Number(shift.breakStartMinute),endMinute=Number(shift.breakEndMinute);if(night&&startMinute<shift.startMinute)startMinute+=1440;if(night&&endMinute<shift.startMinute)endMinute+=1440;if(endMinute<=startMinute)endMinute+=1440;const shiftStart=zonedMinute(day,shift.startMinute,shift.timezone),shiftEnd=zonedMinute(day,night?1440+shift.endMinute:shift.endMinute,shift.timezone),start=new Date(Math.max(+shiftStart,+zonedMinute(day,startMinute,shift.timezone))),end=new Date(Math.min(+shiftEnd,+zonedMinute(day,endMinute,shift.timezone)));return end>start?{start,end}:null;};
const shiftForOpenPunch=async(tx:any,tenantId:string,employeeId:string,openPunch:any,fallback:any)=>{const attendance=await tx.attendanceDaily.findFirst({where:{tenantId,employeeId,firstIn:openPunch.punchTime,shiftId:{not:null}},select:{shiftId:true,date:true}});if(!attendance?.shiftId)return {shift:fallback,day:null};const historical=await tx.shift.findFirst({where:{tenantId,id:attendance.shiftId}});return historical?{shift:historical,day:attendance.date.toISOString().slice(0,10)}:{shift:fallback,day:null};};
export class Workflows {
  constructor(public db:Database){}
  private async closeOpenWorkForApprovedFullDayLeave(ctx:Context,row:any){
    if(!row||Number(row.days)===0.5)return;
    const tid=tenant(ctx),shift=await employeeShift(this.db,tid,row.employeeId),now=new Date(),night=shift.endMinute<=shift.startMinute;
    let workDay=localDate(now,shift.timezone);
    if(night&&now<zonedMinute(workDay,shift.endMinute,shift.timezone))workDay=new Date(Date.parse(workDay)-86400000).toISOString().slice(0,10);
    const leaveStart=new Date(row.startDate).toISOString().slice(0,10),leaveEnd=new Date(row.endDate).toISOString().slice(0,10);
    if(workDay<leaveStart||workDay>leaveEnd)return;
    const start=zonedMinute(workDay,night?shift.startMinute-120:0,shift.timezone),end=zonedMinute(workDay,night?1440+shift.endMinute+120:1440,shift.timezone);
    await this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${row.employeeId}::uuid AND tenant_id = ${tid}::uuid FOR UPDATE`;
      const last=await tx.attendancePunch.findFirst({where:{tenantId:tid,employeeId:row.employeeId,punchTime:{gte:start,lt:end}},orderBy:{punchTime:'desc'}});
      if(!last||last.punchType!=='IN')return;
      const sourceId=`leave-${row.id}-auto-out`;
      const existing=await tx.attendancePunch.findUnique({where:{tenantId_sourceId:{tenantId:tid,sourceId}}});if(existing)return;
      const out=await tx.attendancePunch.create({data:{tenantId:tid,employeeId:row.employeeId,sourceId,punchTime:now,punchType:'OUT',verificationType:'HR_LEAVE',processedAt:now,rawPayload:{source:'LEAVE_APPROVAL',leaveId:row.id,actorId:ctx.user.id,administrative:true}}});
      await audit(tx,ctx,'LEAVE_AUTO_CHECKOUT','attendance',out.id,last,{leaveId:row.id,employeeId:row.employeeId,punchTime:now});
    });
  }
  private async reconcileLeaveAttendance(ctx:Context,row:any){
    if(!row)return;
    const tid=tenant(ctx),company=await this.db.tenant.findUnique({where:{id:tid},select:{timezone:true}}),currentMonth=localDate(new Date(),company?.timezone||'Asia/Kolkata').slice(0,7);
    for(const month of monthsCovered(row.startDate,row.endDate)){
      if(month>currentMonth)continue;
      await reconcileAttendanceMonth(this.db,tid,month);
    }
  }
  async attendance(ctx:Context,method:string,body:any,query:any={},recordId?:string,action?:string){
    const tid=tenant(ctx);const scope=await employeeScope(this.db,ctx);
    if(recordId==='face-profile'){
      requirePermission(ctx,'attendance','VIEW');
      if(method==='GET')return faceProfileStatus(this.db,ctx);
      if(method==='POST')return enrollEmployeeFace(this.db,ctx,body);
      throw new BadRequestException('Unsupported face profile operation.');
    }
    if(recordId==='summary'&&method==='GET'){
      requirePermission(ctx,'attendance','VIEW');const month=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).parse(String(query.month??''));
      return attendanceMonthSummary(this.db,tid,month,scope);
    }
    if(recordId==='reconcile'&&method==='POST'){
      requirePermission(ctx,'attendance','MANAGE');const {month}=z.object({month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)}).strict().parse(body);
      const result=await reconcileAttendanceMonth(this.db,tid,month);await audit(this.db,ctx,'ATTENDANCE_RECONCILED','attendance',month,undefined,result);return result;
    }
    if(recordId==='reset-month'&&method==='DELETE'){
      requirePermission(ctx,'attendance','MANAGE');
      const {month}=z.object({month:z.string().refine(value=>value.length===7&&value.charAt(4)==='-'&&Number(value.slice(0,4))>=2000&&Number(value.slice(5,7))>=1&&Number(value.slice(5,7))<=12,{message:'Month must use YYYY-MM format'})}).strict().parse(body);
      const [year,monthNumber]=month.split('-').map(Number),first=new Date(Date.UTC(year,monthNumber-1,1)),next=new Date(Date.UTC(year,monthNumber,1));
      const result=await this.db.$transaction(async tx=>{
        await lockPayrollPeriod(tx,tid,month);
        const payroll=await tx.payrollRun.findUnique({where:{tenantId_month:{tenantId:tid,month}}});
        if(payroll&&payroll.status!=='DRAFT')throw new ConflictException('Reopen or remove payroll before deleting synced attendance.');
        if(payroll&&await tx.payrollPayout.count({where:{tenantId:tid,runId:payroll.id}}))throw new ConflictException('Attendance with salary payout records cannot be deleted.');
        const rows=await tx.attendanceDaily.findMany({where:{tenantId:tid,date:{gte:first,lt:next}},select:{id:true,employeeId:true,date:true,shiftId:true}});
        const employeeIds=[...new Set(rows.map(r=>r.employeeId))];
        if(employeeIds.length)await tx.$queryRaw`SELECT set_config('app.raw_punch_delete_tenant', ${tid}, true), set_config('app.allow_raw_punch_delete', 'on', true)`;
        const deletedPunches=employeeIds.length?await tx.attendancePunch.deleteMany({where:{tenantId:tid,employeeId:{in:employeeIds},punchTime:{gte:new Date(+first-2*86400000),lt:new Date(+next+2*86400000)}}}):{count:0};
        const deletedDays=await tx.attendanceDaily.deleteMany({where:{tenantId:tid,date:{gte:first,lt:next}}});
        const deletedLocks=await tx.attendancePeriodLock.deleteMany({where:{tenantId:tid,month}});
        await audit(tx,ctx,'ATTENDANCE_MONTH_DELETED','attendance-month',month,undefined,{month,deletedDays:deletedDays.count,deletedPunches:deletedPunches.count,deletedLocks:deletedLocks.count,permanent:true});
        return {month,deletedDays:deletedDays.count,deletedPunches:deletedPunches.count,deletedLocks:deletedLocks.count,permanent:true};
      });
      return result;
    }
    if(recordId==='lock'&&method==='POST'){
      requirePermission(ctx,'attendance','MANAGE');const {month}=z.object({month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)}).strict().parse(body);
      const result=await lockAttendanceMonth(this.db,tid,month,ctx.user.id);await audit(this.db,ctx,'ATTENDANCE_LOCKED','attendance',month,undefined,result.summary.totals);return result;
    }
    if(recordId==='unlock'&&method==='POST'){
      requirePermission(ctx,'attendance','MANAGE');const {month}=z.object({month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)}).strict().parse(body);
      const result=await unlockAttendanceMonth(this.db,tid,month,ctx.user.id);await audit(this.db,ctx,'ATTENDANCE_UNLOCKED','attendance',month);return result;
    }
    if(recordId==='face-scan'&&method==='POST'){
      requirePermission(ctx,'attendance','VIEW');
      if(ctx.user.role.code!=='EMPLOYEE')throw new ForbiddenException('Face Scan attendance is available from an Employee account.');
      if(!ctx.user.employeeId)throw new BadRequestException('Link this user account to an employee before using Face Scan attendance.');
      const input=z.object({frame:z.string().min(1000).max(800000),descriptor:z.array(z.number().min(-5).max(5)).length(128),clientNonce:z.string().min(8).max(64),intent:z.enum(['IN','OUT']).optional()}).strict().parse(body);
      const matched=input.frame.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/);if(!matched)throw new BadRequestException('Capture a valid camera image.');
      const bytes=Buffer.from(matched[2],'base64');const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
      if(bytes.length<5000||bytes.length>500000||(!png&&!jpg))throw new BadRequestException('Face Scan image is invalid. Keep your face clearly inside the camera frame and try again.');
      const match=await verifyEmployeeFace(this.db,ctx,input.descriptor);
      if(!match.enrolled)throw new ForbiddenException('Add your face before using Face Scan attendance.');
      if(!match.matched){
        await audit(this.db,ctx,'FACE_SCAN_REJECTED','attendance',ctx.user.employeeId,undefined,{reason:'FACE_MISMATCH',distance:match.distance,threshold:match.threshold});
        throw new ForbiddenException('Face did not match the enrolled employee face. Attendance was not recorded.');
      }
      const employeeId=ctx.user.employeeId;await assertEmployee(this.db,ctx,employeeId);
      const punchTime=new Date();await assertAttendanceUnlocked(this.db,tid,punchTime);
      let shift=await employeeShift(this.db,tid,employeeId);let day=attendanceWorkdayDate(punchTime,shift.startMinute,shift.endMinute,shift.timezone);let night=shift.endMinute<=shift.startMinute;
      let start=zonedMinute(day,night?shift.startMinute-240:0,shift.timezone),end=zonedMinute(day,night?1440+shift.startMinute-240:1440,shift.timezone);start=new Date(Math.min(+start,punchTime.getTime()-300000));end=new Date(Math.max(+end,punchTime.getTime()+300000));
      const faceHash=createHash('sha256').update(bytes).digest('hex'),sourceId=`face-${ctx.user.id.slice(0,18)}-${input.clientNonce.slice(0,36)}`;
      return this.db.$transaction(async tx=>{
        await tx.$queryRaw`SELECT id FROM employees WHERE id = ${employeeId}::uuid AND tenant_id = ${tid}::uuid FOR UPDATE`;
        let mobileDevice=await tx.attendanceDevice.findFirst({where:{tenantId:tid,connectionMode:'EMPLOYEE_APP'}});
        if(!mobileDevice){
          mobileDevice=await tx.attendanceDevice.create({data:{tenantId:tid,name:'TCW Employee Mobile App',vendor:'TCW_MOBILE',model:'TCW Employee Face Scan',serialNumber:'TCW-EMPLOYEE-APP',connectionMode:'EMPLOYEE_APP',host:'',port:443,timezone:shift.timezone,status:'ONLINE',lastSeenAt:punchTime}});
          await tx.deviceSyncLog.create({data:{tenantId:tid,deviceId:mobileDevice.id,action:'MOBILE_APP_AUTO_ENABLED',message:'Employee Mobile App attendance source was enabled by the first Face Scan punch.'}});
        }else{
          mobileDevice=await tx.attendanceDevice.update({where:{id:mobileDevice.id},data:{status:'ONLINE',lastSeenAt:punchTime,lastError:null}});
        }
        const duplicate=await tx.attendancePunch.findUnique({where:{tenantId_sourceId:{tenantId:tid,sourceId}}});if(duplicate)return {ok:true,duplicate:true,punchType:duplicate.punchType,punchTime:duplicate.punchTime};
        const statePunches=(await tx.attendancePunch.findMany({where:{tenantId:tid,employeeId,punchTime:{lte:punchTime}},orderBy:{punchTime:'desc'},take:200})).reverse(),effectiveState=attendanceCalculationPunches(statePunches);let openPunch:any=null,lastAccepted:any=null;for(const p of effectiveState){if(p.punchType==='IN'){if(!openPunch){openPunch=p;lastAccepted=p}}else if(openPunch){openPunch=null;lastAccepted=p}}if(openPunch&&input.intent!=='IN'){const resolved=await shiftForOpenPunch(tx,tid,employeeId,openPunch,shift);shift=resolved.shift;day=resolved.day??attendanceWorkdayDate(openPunch.punchTime,shift.startMinute,shift.endMinute,shift.timezone);night=shift.endMinute<=shift.startMinute;const scheduledStart=zonedMinute(day,night?shift.startMinute-240:0,shift.timezone);start=new Date(Math.min(+scheduledStart,+openPunch.punchTime-60000));const scheduledEnd=zonedMinute(day,night?1440+shift.startMinute-240:1440,shift.timezone);end=new Date(Math.max(+scheduledEnd,punchTime.getTime()+300000));await assertAttendanceUnlocked(tx as any,tid,new Date(day));}const priorPunches=await tx.attendancePunch.findMany({where:{tenantId:tid,employeeId,punchTime:{gte:start,lt:end}},orderBy:{punchTime:'asc'}});
        if(lastAccepted&&punchTime.getTime()-lastAccepted.punchTime.getTime()<45000)throw new ConflictException('A Face Scan punch was just recorded. Wait a few seconds before scanning again.');
        let punchType:'IN'|'OUT';if(input.intent==='IN'){if(openPunch)throw new ConflictException('You are already checked in. Check out before starting another IN.');punchType='IN';}else if(input.intent==='OUT'){if(!openPunch)throw new ConflictException('You are not currently checked in. Check in before checking out.');punchType='OUT';}else punchType=openPunch?'OUT':'IN';
        await lockPayrollPeriod(tx,tid,day.slice(0,7));await assertAttendanceUnlocked(tx,tid,new Date(day));
      const targetDate=new Date(day),targetAttendance=await tx.attendanceDaily.findUnique({where:{tenantId_employeeId_date:{tenantId:tid,employeeId,date:targetDate}}});if(targetAttendance?.shiftId===shift.id&&targetAttendance.firstIn)start=new Date(targetAttendance.firstIn.getTime()-60000);else if(punchType==='IN')start=new Date(punchTime.getTime()-60000);
        const row=await tx.attendancePunch.create({data:{tenantId:tid,employeeId,deviceId:mobileDevice.id,sourceId,punchTime,punchType,verificationType:'FACE_SCAN',rawPayload:{source:'FACE_SCAN',app:'TCW_EMPLOYEE',intent:punchType,actorId:ctx.user.id,faceCaptureHash:faceHash,captureBytes:bytes.length,rawImageStored:false,faceMatched:true,faceDistance:match.distance,faceThreshold:match.threshold}}});
        const punches=await tx.attendancePunch.findMany({where:{tenantId:tid,employeeId,punchTime:{gte:start,lt:end}},orderBy:{punchTime:'asc'}});const effectivePunches=attendanceCalculationPunches(punches);
        const shiftEnd=zonedMinute(day,night?1440+shift.endMinute:shift.endMinute,shift.timezone),breakWindow=shiftBreakWindow(day,shift);
        const calculated=calculateAttendance(effectivePunches.map(p=>({time:p.punchTime,type:p.punchType as 'IN'|'OUT'})),{shiftStart:zonedMinute(day,shift.startMinute,shift.timezone),shiftEnd,breakStart:attendancePunchDrivenBreaks(shift,effectivePunches)?undefined:breakWindow?.start,breakEnd:attendancePunchDrivenBreaks(shift,effectivePunches)?undefined:breakWindow?.end,graceMinutes:shift.graceMinutes,earlyOutGraceMinutes:shift.earlyOutGraceMinutes,fullDayMinutes:shift.fullDayMinutes,halfDayMinutes:shift.halfDayMinutes,overtimeAfterMinutes:shift.overtimeAfterMinutes});
        const status=punchedAttendanceStatusAtMoment(calculated.status,new Date(),shiftEnd,effectivePunches.length>0),attendanceValues={...calculated,status},reportDate=new Date(day),payableUnits=attendancePayableUnits(status,calculated.workMinutes,shift.halfDayMinutes);
        await tx.attendanceDaily.upsert({where:{tenantId_employeeId_date:{tenantId:tid,employeeId,date:reportDate}},create:{tenantId:tid,employeeId,date:reportDate,shiftId:shift.id,scheduledMinutes:shift.fullDayMinutes,payableUnits,leaveUnits:0,dayType:'WORKING',exceptionCode:status==='MISSING_PUNCH'?'MISSING_PUNCH':'',...attendanceValues},update:{shiftId:shift.id,scheduledMinutes:shift.fullDayMinutes,payableUnits,exceptionCode:status==='MISSING_PUNCH'?'MISSING_PUNCH':'',correctionNote:'',...attendanceValues}});
        await tx.attendancePunch.updateMany({where:{tenantId:tid,id:{in:punches.map(p=>p.id)}},data:{processedAt:new Date()}});
        await tx.deviceSyncLog.create({data:{tenantId:tid,deviceId:mobileDevice.id,action:'FACE_SCAN_PUNCH',message:`Employee Face Scan ${punchType} recorded.`,details:{employeeId,punchType,punchTime,verificationType:'FACE_SCAN'}}});
        await audit(tx,ctx,'FACE_PUNCH_RECORDED','attendance',row.id,undefined,{employeeId,punchTime,punchType,verificationType:'FACE_SCAN',faceCaptureHash:faceHash,rawImageStored:false,faceMatched:true,faceDistance:match.distance});
        return {ok:true,punchType,punchTime,status,workMinutes:calculated.workMinutes,firstIn:calculated.firstIn,lastOut:calculated.lastOut};
      });
    }
    if(recordId&&method==='DELETE'&&!action){
      requirePermission(ctx,'attendance','MANAGE');
      const before=await this.db.attendanceDaily.findFirst({where:{tenantId:tid,id:id.parse(recordId)}});
      if(!before)throw new NotFoundException('Attendance record not found.');
      await assertAttendanceUnlocked(this.db,tid,before.date);
      await assertEmployee(this.db,ctx,before.employeeId);
      const shift=await employeeShift(this.db,tid,before.employeeId,before.shiftId??undefined);
      const day=before.date.toISOString().slice(0,10),night=shift.endMinute<=shift.startMinute;
      const scheduledStart=zonedMinute(day,shift.startMinute,shift.timezone),scheduledEnd=zonedMinute(day,night?1440+shift.endMinute:shift.endMinute,shift.timezone);
      const start=before.firstIn?new Date(before.firstIn.getTime()-60000):new Date(scheduledStart.getTime()-120*60000);
      const end=before.firstIn?(before.lastOut?new Date(before.lastOut.getTime()+60000):new Date(Date.now()+60000)):new Date(scheduledEnd.getTime()+120*60000);
      if(before.syncedAt)throw new ConflictException('This attendance day is already synced and cannot be deleted.');
      return this.db.$transaction(async tx=>{
        await lockPayrollPeriod(tx,tid,day.slice(0,7));
        await assertAttendanceUnlocked(tx,tid,before.date);
        const current=await tx.attendanceDaily.findFirst({where:{id:before.id,tenantId:tid}});
        if(!current)throw new NotFoundException('Attendance record not found.');
        if(current.syncedAt)throw new ConflictException('This attendance day is already synced and cannot be deleted.');
        const removed=await tx.attendancePunch.deleteMany({where:{tenantId:tid,employeeId:before.employeeId,punchTime:{gte:start,lt:end}}});
        await tx.attendanceDaily.delete({where:{id:before.id}});
        await audit(tx,ctx,'ATTENDANCE_DAY_DELETED','attendance',before.id,before,{deletedPunches:removed.count,date:day,shiftId:before.shiftId,permanent:true});
        return {ok:true,deleted:true,permanent:true,deletedPunches:removed.count,date:day};
      });
    }
    if(recordId&&action==='correct'&&method==='POST'){
      requirePermission(ctx,'attendance','MANAGE');const input=z.object({status:z.enum(['PRESENT','INSUFFICIENT_HOURS','ABSENT','SHORT_HOURS','HALF_DAY']),workMinutes:z.number().int().min(0).max(1440).optional(),note:z.string().trim().min(5).max(1000)}).strict().parse(body);
      const located=await this.db.attendanceDaily.findFirst({where:{tenantId:tid,id:id.parse(recordId)},select:{date:true}});if(!located)throw new NotFoundException();
      return this.db.$transaction(async tx=>{
        await lockPayrollPeriod(tx,tid,located.date.toISOString().slice(0,7));
        const before=await tx.attendanceDaily.findFirst({where:{tenantId:tid,id:recordId}});if(!before)throw new NotFoundException();
        await assertAttendanceUnlocked(tx,tid,before.date);
        const shift=before.shiftId?await tx.shift.findFirst({where:{tenantId:tid,id:before.shiftId}}):null,correctedWork=input.workMinutes??before.workMinutes,normalizedStatus=input.status==='SHORT_HOURS'?'INSUFFICIENT_HOURS':input.status;
        const payableUnits=attendancePayableUnits(normalizedStatus,correctedWork,shift?.halfDayMinutes??0);
        const overtimeThreshold=shift?Math.max(Number(shift.fullDayMinutes)||0,Number(shift.overtimeAfterMinutes)||0):0;
        const after=await tx.attendanceDaily.update({where:{id:before.id},data:{status:normalizedStatus,workMinutes:correctedWork,overtimeMinutes:shift?Math.max(0,correctedWork-overtimeThreshold):before.overtimeMinutes,payableUnits,exceptionCode:'',correctionNote:input.note}});
        await audit(tx,ctx,'ATTENDANCE_CORRECTED','attendance',before.id,before,after);return after;
      },{timeout:30000});
    }
    requirePermission(ctx,'attendance',method==='GET'?'VIEW':'CREATE');
    if(method==='GET'){
      await refreshTenantCurrentNoPunchAttendance(this.db,tid,new Date(),0);
      const start=query.from?date.parse(query.from):new Date(Date.now()-31*86400000);const end=query.to?date.parse(query.to):new Date();
      let visibleEmployeeIds=scope??(await this.db.employee.findMany({where:{tenantId:tid,deletedAt:null},select:{id:true}})).map(e=>e.id);if(query.employeeId){const selected=id.parse(String(query.employeeId));if(!visibleEmployeeIds.includes(selected))throw new ForbiddenException('Employee is outside your attendance scope.');visibleEmployeeIds=[selected];}const employeeSearch=String(query.employeeSearch??'').trim();if(employeeSearch){const employeeSearchTerms=employeeSearch.split(/\s+/).filter(Boolean).slice(0,4),matched=await this.db.employee.findMany({where:{tenantId:tid,deletedAt:null,id:{in:visibleEmployeeIds},AND:employeeSearchTerms.map(term=>({OR:[{firstName:{startsWith:term,mode:'insensitive' as const}},{lastName:{startsWith:term,mode:'insensitive' as const}},{employeeCode:{startsWith:term,mode:'insensitive' as const}}]}))},select:{id:true}});visibleEmployeeIds=matched.map(e=>e.id);}
      const previousDate=new Date(+start-86400000);
      const [candidateItems,punchRows,shifts,attendanceEmployees]=await Promise.all([this.db.attendanceDaily.findMany({where:{tenantId:tid,date:{gte:previousDate,lte:end},employeeId:{in:visibleEmployeeIds},status:{not:'VOID'}},orderBy:[{date:'desc'},{employeeId:'asc'}],take:1100}),this.db.attendancePunch.findMany({where:{tenantId:tid,employeeId:{in:visibleEmployeeIds},punchTime:{gte:new Date(+start-2*86400000),lte:new Date(+end+2*86400000)}},orderBy:{punchTime:'asc'},select:{id:true,employeeId:true,sourceId:true,punchTime:true,punchType:true,verificationType:true,rawPayload:true}}),this.db.shift.findMany({where:{tenantId:tid},select:{id:true,name:true,startMinute:true,endMinute:true,timezone:true,graceMinutes:true,earlyOutGraceMinutes:true,breakMinutes:true,punchDrivenBreaks:true,flexibleBreakAnytime:true,breakStartMinute:true,breakEndMinute:true,fullDayMinutes:true,overtimeAfterMinutes:true}}),this.db.employee.findMany({where:{tenantId:tid,id:{in:visibleEmployeeIds},deletedAt:null},select:{id:true,firstName:true,lastName:true,employeeCode:true,photo:true}})]);const shiftById=new Map(shifts.map(s=>[s.id,s])),employeeById=new Map(attendanceEmployees.map(e=>[e.id,e])),items=candidateItems.filter(row=>{if(row.date>=start&&row.date<=end)return true;if(+row.date!==+previousDate||!row.shiftId)return false;const shift=shiftById.get(row.shiftId);return !!shift&&shift.endMinute<=shift.startMinute;});
      return {items:items.map(row=>{const shiftRule=row.shiftId?shiftById.get(row.shiftId):undefined,day=row.date.toISOString().slice(0,10),night=!!shiftRule&&shiftRule.endMinute<=shiftRule.startMinute,scheduledRowStart=shiftRule?zonedMinute(day,night?shiftRule.startMinute-240:0,shiftRule.timezone):new Date(+row.date-6*3600000),scheduledRowEnd=shiftRule?zonedMinute(day,night?1440+shiftRule.startMinute-240:1440,shiftRule.timezone):new Date(+row.date+30*3600000),rowStart=row.firstIn?new Date(+row.firstIn-60000):scheduledRowStart,rowEnd=row.firstIn&&row.status!=='MISSING_PUNCH'&&row.lastOut?new Date(+row.lastOut+60000):scheduledRowEnd,actualShiftStart=shiftRule?zonedMinute(day,shiftRule.startMinute,shiftRule.timezone):rowStart,actualShiftEnd=shiftRule?zonedMinute(day,night?1440+shiftRule.endMinute:shiftRule.endMinute,shiftRule.timezone):rowEnd;const historyRowPunches=punchRows.filter(p=>p.employeeId===row.employeeId&&(shiftRule?attendanceWorkdayDate(p.punchTime,shiftRule.startMinute,shiftRule.endMinute,shiftRule.timezone)===day:(p.punchTime>=rowStart&&p.punchTime<=rowEnd))).sort((a,b)=>+a.punchTime-+b.punchTime),calculationRowPunches=shiftRule?historyRowPunches:historyRowPunches.filter(p=>p.punchTime>=rowStart&&p.punchTime<=rowEnd),rowPunches=attendanceCalculationPunches(calculationRowPunches);const sourceLabel=(v:string)=>v==='FACE_SCAN'?'Mobile Face':v==='FACE_DEVICE'?'Device Face':v==='FINGERPRINT_DEVICE'?'Fingerprint':v==='CARD_DEVICE'?'Card':v==='MANUAL'?'Manual':v||'Unknown';const effectivePunchIds=new Set(rowPunches.map(p=>p.id)),punchHistory=historyRowPunches.map((p,index)=>{const previous=index>0?historyRowPunches[index-1]:null,intervalSeconds=previous?attendanceElapsedSeconds(previous.punchTime,p.punchTime):null,intervalType=!previous?'START':previous.punchType==='IN'&&p.punchType==='OUT'?'WORK':previous.punchType==='OUT'&&p.punchType==='IN'?'OUT_GAP':'PUNCH_GAP';return {id:p.id,punchTime:p.punchTime,punchType:p.punchType,source:sourceLabel(p.verificationType),verificationType:p.verificationType,intervalSeconds,intervalType,includedInCalculation:effectivePunchIds.has(p.id)}}),verificationTypes=[...new Set(historyRowPunches.map(p=>p.verificationType))];const attendanceSource=verificationTypes.includes('FACE_SCAN')?'Mobile Face':verificationTypes.includes('FACE_DEVICE')?'Device Face':verificationTypes.includes('FINGERPRINT_DEVICE')?'Fingerprint':verificationTypes.includes('CARD_DEVICE')?'Card':verificationTypes.includes('MANUAL')?'Manual':verificationTypes.length?verificationTypes.join(', '):'—';const sessions:any[]=[];let openPunch:any=null,latestOut:Date|null=null;for(const p of rowPunches){if(p.punchType==='IN'){if(!openPunch)openPunch=p}else if(openPunch){const seconds=attendanceElapsedSeconds(openPunch.punchTime,p.punchTime),minutes=Math.floor(seconds/60);sessions.push({inTime:openPunch.punchTime,outTime:p.punchTime,seconds,minutes,inSource:sourceLabel(openPunch.verificationType),outSource:sourceLabel(p.verificationType)});latestOut=p.punchTime;openPunch=null}}if(openPunch)sessions.push({inTime:openPunch.punchTime,outTime:null,seconds:0,minutes:0,inSource:sourceLabel(openPunch.verificationType),outSource:null});const punchDrivenBreaks=attendancePunchDrivenBreaks(shiftRule??{},rowPunches),flexibleBreakAnytime=punchDrivenBreaks&&!!shiftRule?.flexibleBreakAnytime,breakWindow=shiftRule?shiftBreakWindow(day,shiftRule):null,allowedBreakMinutes=Math.max(0,Number(shiftRule?.breakMinutes??0)),allowedBreakSeconds=allowedBreakMinutes*60;let breakSeconds=0,overBreakSeconds=0,completedPunchBreak=false;for(let i=0;i<sessions.length-1;i++){if(!sessions[i].outTime||!sessions[i+1].inTime)continue;const gapStart=new Date(sessions[i].outTime),rawGapEnd=new Date(sessions[i+1].inTime),gapEnd=new Date(Math.min(rawGapEnd.getTime(),actualShiftEnd.getTime()));if(gapEnd<=gapStart||punchDrivenBreaks&&flexibleBreakAnytime&&completedPunchBreak)continue;if(punchDrivenBreaks&&flexibleBreakAnytime){if(gapStart>=actualShiftStart&&gapStart<actualShiftEnd){const elapsed=Math.max(0,Math.floor((gapEnd.getTime()-gapStart.getTime())/1000)),usage=allocateBreakUsageSeconds(elapsed,0,allowedBreakSeconds);breakSeconds+=usage.breakSeconds;overBreakSeconds+=usage.overBreakSeconds;completedPunchBreak=elapsed>0;}}else{const eligibleEnd=breakWindow?.end;if(breakWindow&&eligibleEnd&&isScheduledBreakOut(gapStart,breakWindow.start,eligibleEnd)){if(punchDrivenBreaks){const usage=punchDrivenBreakUsageSeconds(gapStart,gapEnd,breakWindow.start,breakWindow.end,allowedBreakSeconds),elapsed=usage.breakSeconds+usage.overBreakSeconds;breakSeconds+=usage.breakSeconds;overBreakSeconds+=usage.overBreakSeconds;completedPunchBreak=elapsed>0;}else{breakSeconds+=Math.max(0,Math.floor((Math.min(gapEnd.getTime(),breakWindow.end.getTime())-gapStart.getTime())/1000));overBreakSeconds+=Math.max(0,Math.floor((gapEnd.getTime()-breakWindow.end.getTime())/1000));}}}}const rawCompletedBreakSeconds=breakSeconds+overBreakSeconds,breakBusinessMinutes=punchDrivenBreaks?Math.min(attendanceBusinessMinutesFromSeconds(breakSeconds),allowedBreakMinutes):Math.min(attendanceBusinessMinutesFromSeconds(rawCompletedBreakSeconds),allowedBreakMinutes),overBreakBusinessMinutes=punchDrivenBreaks?attendanceBusinessMinutesFromSeconds(overBreakSeconds):Math.max(0,attendanceBusinessMinutesFromSeconds(rawCompletedBreakSeconds)-allowedBreakMinutes),breakMinutes=breakBusinessMinutes,rawCompletedWorkedSeconds=sessions.filter(s=>s.outTime).reduce((n,s)=>n+Math.max(0,Number(s.seconds??0)),0),hasClosedSession=sessions.some(s=>!!s.outTime),manualCorrected=!!String(row.correctionNote??'').trim(),nowMs=Date.now(),autoBreakOverlapSeconds=(start:any,end:any)=>{if(punchDrivenBreaks||!breakWindow)return 0;const startMs=Math.max(new Date(start).getTime(),breakWindow.start.getTime(),actualShiftStart.getTime()),endMs=Math.min(new Date(end).getTime(),breakWindow.end.getTime(),actualShiftEnd.getTime());return Math.max(0,Math.floor((endMs-startMs)/1000))},completedAutoBreakSeconds=sessions.filter(s=>s.outTime).reduce((sum,s)=>sum+autoBreakOverlapSeconds(s.inTime,s.outTime),0),completedWorkedSeconds=manualCorrected||!hasClosedSession?Number(row.workMinutes??0)*60:Math.max(0,rawCompletedWorkedSeconds-completedAutoBreakSeconds),workingNow=!!openPunch,openWorkedSeconds=openPunch?Math.max(0,Math.floor((nowMs-openPunch.punchTime.getTime())/1000)):0,openAutoBreakSeconds=openPunch?autoBreakOverlapSeconds(openPunch.punchTime,new Date(Math.min(nowMs,actualShiftEnd.getTime()))):0,liveWorkedSeconds=Math.max(0,completedWorkedSeconds+openWorkedSeconds-openAutoBreakSeconds),insideShift=nowMs>=actualShiftStart.getTime()&&nowMs<actualShiftEnd.getTime(),eligibleBreakStart=flexibleBreakAnytime?actualShiftStart:breakWindow?.start,eligibleBreakEnd=flexibleBreakAnytime?actualShiftEnd:breakWindow?.end,canOpenPunchBreak=punchDrivenBreaks&&(!flexibleBreakAnytime||!completedPunchBreak),flexibleCurrentGapSeconds=latestOut?Math.max(0,Math.floor((Math.min(nowMs,actualShiftEnd.getTime())-latestOut.getTime())/1000)):0,flexibleCurrentState=flexibleBreakAnytime&&canOpenPunchBreak&&!workingNow&&!!latestOut&&insideShift&&!!eligibleBreakStart&&!!eligibleBreakEnd&&isScheduledBreakOut(latestOut,eligibleBreakStart,eligibleBreakEnd)?flexibleBreakLiveState(0,allowedBreakSeconds,flexibleCurrentGapSeconds):null,onBreak=flexibleBreakAnytime?flexibleCurrentState==='BREAK'||flexibleCurrentState==='OVER_BREAK':(punchDrivenBreaks?canOpenPunchBreak:true)&&!workingNow&&!!latestOut&&insideShift&&!!eligibleBreakStart&&!!eligibleBreakEnd&&isScheduledBreakOut(latestOut,eligibleBreakStart,eligibleBreakEnd),currentBreakSince=onBreak?new Date(latestOut!.getTime()):null,currentBreakEnd=currentBreakSince?new Date(Math.min(nowMs,actualShiftEnd.getTime())):null,currentBreakSeconds=currentBreakSince&&currentBreakEnd?Math.max(0,Math.floor((currentBreakEnd.getTime()-currentBreakSince.getTime())/1000)):0,currentScheduledBreakUsage=punchDrivenBreaks&&!flexibleBreakAnytime&&currentBreakSince?allocateBreakUsageSeconds(currentBreakSeconds,breakSeconds,allowedBreakSeconds):null,currentFlexibleBreakUsage=punchDrivenBreaks&&flexibleBreakAnytime&&currentBreakSince?allocateBreakUsageSeconds(currentBreakSeconds,breakSeconds,allowedBreakSeconds):null,rawLiveBreakSeconds=punchDrivenBreaks?(flexibleBreakAnytime?breakSeconds+Number(currentFlexibleBreakUsage?.breakSeconds??0):breakSeconds+Number(currentScheduledBreakUsage?.breakSeconds??0)):Math.min(allowedBreakSeconds,breakSeconds+completedAutoBreakSeconds+openAutoBreakSeconds+(onBreak&&breakWindow?Math.max(0,Math.floor((Math.min(nowMs,breakWindow.end.getTime())-latestOut!.getTime())/1000)):0)),rawLiveOverBreakSeconds=punchDrivenBreaks?(flexibleBreakAnytime?overBreakSeconds+Number(currentFlexibleBreakUsage?.overBreakSeconds??0):overBreakSeconds+Number(currentScheduledBreakUsage?.overBreakSeconds??0)):overBreakSeconds+(onBreak&&breakWindow?Math.max(0,Math.floor((nowMs-breakWindow.end.getTime())/1000)):0),liveBreakBusinessMinutes=Math.min(attendanceBusinessMinutesFromSeconds(rawLiveBreakSeconds),allowedBreakMinutes),liveOverBreakBusinessMinutes=attendanceBusinessMinutesFromSeconds(rawLiveOverBreakSeconds),liveBreakSeconds=Math.min(rawLiveBreakSeconds,allowedBreakSeconds),unusedBreakSeconds=Math.max(0,allowedBreakSeconds-liveBreakSeconds),workedBreakWindowSeconds=breakWindow?sessions.reduce((sum,s)=>{const start=Math.max(new Date(s.inTime).getTime(),breakWindow.start.getTime(),actualShiftStart.getTime()),sessionEnd=s.outTime?new Date(s.outTime).getTime():Math.min(nowMs,actualShiftEnd.getTime()),end=Math.min(sessionEnd,breakWindow.end.getTime(),actualShiftEnd.getTime());return sum+Math.max(0,Math.floor((end-start)/1000))},0):0,rawBreakCreditSeconds=!punchDrivenBreaks||rowPunches.find(p=>p.punchType==='IN')?.verificationType==='MANUAL'?0:onBreak?0:flexibleBreakAnytime?Math.min(unusedBreakSeconds,Math.max(0,liveWorkedSeconds-Math.max(0,Number(shiftRule?.fullDayMinutes??0))*60)):Math.min(unusedBreakSeconds,workedBreakWindowSeconds),breakCreditSeconds=Math.max(0,Math.floor(rawBreakCreditSeconds)),breakCreditMinutes=Math.floor(breakCreditSeconds/60),currentOverBreakSeconds=rawLiveOverBreakSeconds,liveOverBreakSeconds=rawLiveOverBreakSeconds,overBreakNow=onBreak&&(flexibleBreakAnytime?flexibleCurrentState==='OVER_BREAK':rawLiveOverBreakSeconds>0),breakEntitlementEnd=flexibleBreakAnytime||!currentBreakSince?null:!punchDrivenBreaks?breakWindow?.end??null:new Date(Math.min(actualShiftEnd.getTime(),currentBreakSince.getTime()+Math.max(0,allowedBreakSeconds-breakSeconds)*1000)),firstInTime=rowPunches.find(p=>p.punchType==='IN')?.punchTime??row.firstIn,lateArrivalSeconds=firstInTime?Math.max(0,Math.floor((new Date(firstInTime).getTime()-actualShiftStart.getTime())/1000)):Number(row.lateMinutes??0)*60,lateRawMinutes=attendanceBusinessMinutesFromSeconds(lateArrivalSeconds),lateGraceAllowanceMinutes=Math.max(0,Number(shiftRule?.graceMinutes??0)),lateGraceUsedMinutes=Math.min(lateRawMinutes,lateGraceAllowanceMinutes),lateMinutes=Math.max(0,lateRawMinutes-lateGraceAllowanceMinutes),lateGraceAllowanceSeconds=lateGraceAllowanceMinutes*60,lateGraceUsedSeconds=lateGraceUsedMinutes*60,lateSeconds=lateMinutes*60,finalOutBase=!workingNow&&!onBreak?(latestOut??row.lastOut):null,earlyOutRawSeconds=!finalOutBase?0:Math.max(0,Math.floor((actualShiftEnd.getTime()-new Date(finalOutBase).getTime())/1000)),earlyOutRawMinutes=attendanceBusinessMinutesFromSeconds(earlyOutRawSeconds),earlyOutGraceAllowanceMinutes=Math.max(0,Number(shiftRule?.earlyOutGraceMinutes??0)),earlyOutGraceUsedMinutes=Math.min(earlyOutRawMinutes,earlyOutGraceAllowanceMinutes),earlyOutMinutes=Math.max(0,earlyOutRawMinutes-earlyOutGraceAllowanceMinutes),earlyOutGraceAllowanceSeconds=earlyOutGraceAllowanceMinutes*60,earlyOutGraceUsedSeconds=earlyOutGraceUsedMinutes*60,earlyOutSeconds=earlyOutMinutes*60,liveWorkedBusinessMinutes=attendanceBusinessMinutesFromSeconds(liveWorkedSeconds),overtimeThresholdMinutes=Math.max(Math.max(0,Number(shiftRule?.fullDayMinutes??0)),Math.max(0,Number(shiftRule?.overtimeAfterMinutes??0))),liveOvertimeMinutes=Math.max(0,liveWorkedBusinessMinutes-overtimeThresholdMinutes),liveOvertimeSeconds=liveOvertimeMinutes*60,overtimeSince=workingNow&&liveOvertimeMinutes>0?new Date(nowMs-liveOvertimeMinutes*60000):null,automaticBreakNow=!punchDrivenBreaks&&workingNow&&insideShift&&!!breakWindow&&nowMs>=breakWindow.start.getTime()&&nowMs<breakWindow.end.getTime(),liveState=automaticBreakNow?'BREAK':workingNow?(liveOvertimeMinutes>0?'OVERTIME':'WORKING'):overBreakNow?'OVER_BREAK':onBreak?'BREAK':insideShift&&!!latestOut?'OUT':null,inCount=historyRowPunches.filter(p=>p.punchType==='IN').length,outCount=historyRowPunches.filter(p=>p.punchType==='OUT').length,employee=employeeById.get(row.employeeId),common={employeeName:employee?((employee.firstName+' '+employee.lastName).trim()):'Employee',employeeCode:employee?.employeeCode??'',employeePhoto:employee?.photo??null,attendanceSource,shiftName:shiftRule?.name??'—',shiftTimezone:shiftRule?.timezone??null,serverNow:new Date(nowMs),shiftStartTime:actualShiftStart,shiftEndTime:actualShiftEnd,inTime:firstInTime,outTime:workingNow?null:(latestOut??row.lastOut),workedMinutes:row.workMinutes,workedSeconds:completedWorkedSeconds,liveWorkedSeconds,completedWorkedSeconds,openSessionSince:openPunch?.punchTime??null,breakMinutes,breakSeconds:punchDrivenBreaks?Math.min(breakSeconds,allowedBreakSeconds):Math.min(breakSeconds+completedAutoBreakSeconds+openAutoBreakSeconds,allowedBreakSeconds),liveBreakSeconds,currentBreakSince,allowedBreakMinutes,allowedBreakSeconds,breakMode:flexibleBreakAnytime?'PUNCH_ANYTIME':punchDrivenBreaks?'PUNCH_SCHEDULED':'AUTO_SCHEDULED',breakWindowStartTime:breakWindow?.start??null,breakEntitlementEnd,breakStartMinute:shiftRule?.breakStartMinute??null,breakEndMinute:shiftRule?.breakEndMinute??null,breakCreditMinutes,breakCreditSeconds,overBreakMinutes:liveOverBreakBusinessMinutes,overBreakSeconds:liveOverBreakSeconds,completedOverBreakSeconds:overBreakSeconds,workingNow,liveState,liveOvertimeMinutes,liveOvertimeSeconds,overtimeSeconds:liveOvertimeSeconds,overtimeSince,lateArrivalSeconds,lateGraceAllowanceSeconds,lateGraceUsedSeconds,lateMinutes,lateSeconds,earlyOutRawSeconds,earlyOutGraceAllowanceSeconds,earlyOutGraceUsedSeconds,earlyOutMinutes,earlyOutSeconds,inCount,outCount,punchCount:historyRowPunches.length,punchHistory,sessions};const fullDayLeave=['PAID_LEAVE','UNPAID_LEAVE'].includes(row.dayType)&&row.leaveUnits>=100;if(!fullDayLeave)return {...row,...common};return {...row,...common,exceptionCode:'',lateMinutes:0,earlyOutMinutes:0,overtimeMinutes:0};})};
    }
    const input=z.object({employeeId:id,punchTime:z.iso.datetime().transform(v=>new Date(v)),punchType:z.enum(['IN','OUT']),sourceId:z.string().min(1).max(100),shiftId:id.optional()}).strict().parse(body);
    await assertEmployee(this.db,ctx,input.employeeId);await assertAttendanceUnlocked(this.db,tid,input.punchTime);
    if(input.punchTime.getTime()>Date.now()+300000||input.punchTime.getTime()<Date.now()-366*86400000)throw new BadRequestException('Punch time must be within the last year and not in the future.');
    let shift=await employeeShift(this.db,tid,input.employeeId);let day=attendanceWorkdayDate(input.punchTime,shift.startMinute,shift.endMinute,shift.timezone);let night=shift.endMinute<=shift.startMinute;
    let start=zonedMinute(day,night?shift.startMinute-240:0,shift.timezone),end=zonedMinute(day,night?1440+shift.startMinute-240:1440,shift.timezone);
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${input.employeeId}::uuid AND tenant_id = ${tid}::uuid FOR UPDATE`;
      const existing=await tx.attendancePunch.findUnique({where:{tenantId_sourceId:{tenantId:tid,sourceId:input.sourceId}}});
      if(existing){if(existing.employeeId!==input.employeeId||existing.punchType!==input.punchType||+existing.punchTime!==+input.punchTime)throw new ConflictException('Source ID already belongs to another punch.');return {ok:true,duplicate:true};}
      if(input.punchType==='OUT'){const statePunches=(await tx.attendancePunch.findMany({where:{tenantId:tid,employeeId:input.employeeId,punchTime:{lte:input.punchTime}},orderBy:{punchTime:'desc'},take:200})).reverse(),validState=attendanceCalculationPunches(statePunches);let open:any=null;for(const p of validState){if(p.punchType==='IN'){if(!open)open=p}else if(open)open=null}if(open){const resolved=await shiftForOpenPunch(tx,tid,input.employeeId,open,shift);shift=resolved.shift;day=resolved.day??attendanceWorkdayDate(open.punchTime,shift.startMinute,shift.endMinute,shift.timezone);night=shift.endMinute<=shift.startMinute;const scheduledStart=zonedMinute(day,night?shift.startMinute-240:0,shift.timezone);start=new Date(Math.min(+scheduledStart,+open.punchTime-60000));const scheduledEnd=zonedMinute(day,night?1440+shift.startMinute-240:1440,shift.timezone);end=new Date(Math.max(+scheduledEnd,input.punchTime.getTime()+300000));await assertAttendanceUnlocked(tx as any,tid,new Date(day));}}
      await lockPayrollPeriod(tx,tid,day.slice(0,7));await assertAttendanceUnlocked(tx,tid,new Date(day));
      const targetDate=new Date(day),targetAttendance=await tx.attendanceDaily.findUnique({where:{tenantId_employeeId_date:{tenantId:tid,employeeId:input.employeeId,date:targetDate}}});if(targetAttendance?.shiftId===shift.id&&targetAttendance.firstIn)start=new Date(targetAttendance.firstIn.getTime()-60000);else if(input.punchType==='IN')start=new Date(input.punchTime.getTime()-60000);
      const row=await tx.attendancePunch.create({data:{tenantId:tid,employeeId:input.employeeId,sourceId:input.sourceId,punchTime:input.punchTime,punchType:input.punchType,verificationType:'MANUAL',rawPayload:{...body,source:'MANUAL',actorId:ctx.user.id}}});
      const punches=await tx.attendancePunch.findMany({where:{tenantId:tid,employeeId:input.employeeId,punchTime:{gte:start,lt:end}},orderBy:{punchTime:'asc'}});const effectivePunches=attendanceCalculationPunches(punches);
      const shiftEnd=zonedMinute(day,night?1440+shift.endMinute:shift.endMinute,shift.timezone),breakWindow=shiftBreakWindow(day,shift);
      const calculated=calculateAttendance(effectivePunches.map(p=>({time:p.punchTime,type:p.punchType as 'IN'|'OUT'})),{shiftStart:zonedMinute(day,shift.startMinute,shift.timezone),shiftEnd,breakStart:attendancePunchDrivenBreaks(shift,effectivePunches)?undefined:breakWindow?.start,breakEnd:attendancePunchDrivenBreaks(shift,effectivePunches)?undefined:breakWindow?.end,graceMinutes:shift.graceMinutes,earlyOutGraceMinutes:shift.earlyOutGraceMinutes,fullDayMinutes:shift.fullDayMinutes,halfDayMinutes:shift.halfDayMinutes,overtimeAfterMinutes:shift.overtimeAfterMinutes});
      const status=punchedAttendanceStatusAtMoment(calculated.status,new Date(),shiftEnd,effectivePunches.length>0),attendanceValues={...calculated,status},reportDate=new Date(day),payableUnits=attendancePayableUnits(status,calculated.workMinutes,shift.halfDayMinutes);
      await tx.attendanceDaily.upsert({where:{tenantId_employeeId_date:{tenantId:tid,employeeId:input.employeeId,date:reportDate}},create:{tenantId:tid,employeeId:input.employeeId,date:reportDate,shiftId:shift.id,scheduledMinutes:shift.fullDayMinutes,payableUnits,leaveUnits:0,dayType:'WORKING',exceptionCode:status==='MISSING_PUNCH'?'MISSING_PUNCH':'',...attendanceValues},update:{shiftId:shift.id,scheduledMinutes:shift.fullDayMinutes,payableUnits,exceptionCode:status==='MISSING_PUNCH'?'MISSING_PUNCH':'',correctionNote:'',...attendanceValues}});
      await tx.attendancePunch.updateMany({where:{tenantId:tid,id:{in:punches.map(p=>p.id)}},data:{processedAt:new Date()}});await audit(tx,ctx,'PUNCH_RECORDED','attendance',row.id,undefined,{employeeId:input.employeeId,punchTime:input.punchTime,punchType:input.punchType});return attendanceValues;
    });
  }
  private async notifyLeaveReporting(ctx:Context,row:any,assignedByHr:boolean){
    const tid=tenant(ctx);
    const employee=await this.db.employee.findFirst({where:{tenantId:tid,id:row.employeeId,deletedAt:null},select:{id:true,firstName:true,lastName:true,email:true,managerId:true}});
    if(!employee)return;
    const employeeName=(employee.firstName+' '+employee.lastName).trim();
    const manager=employee.managerId?await this.db.user.findFirst({where:{tenantId:tid,employeeId:employee.managerId,active:true},select:{id:true,email:true,name:true}}):null;
    const hrUsers=await this.db.user.findMany({where:{tenantId:tid,active:true,role:{code:{in:['COMPANY_OWNER','HR_ADMIN','HR_EXECUTIVE']}}},select:{id:true,email:true,name:true}});
    const recipients=new Map<string,{id:string,email:string,name:string}>();
    if(manager)recipients.set(manager.id,manager);
    for(const hr of hrUsers)recipients.set(hr.id,hr);
    const start=new Date(row.startDate).toISOString().slice(0,10),end=new Date(row.endDate).toISOString().slice(0,10);
    const title=assignedByHr?'Leave assigned by HR':'New leave request';
    const message=assignedByHr?`${employeeName} has approved leave assigned by HR for ${start} to ${end}.`:`${employeeName} requested leave for ${start} to ${end}. Please review the request.`;
    for(const recipient of recipients.values()){
      const notice=await this.db.notification.create({data:{tenantId:tid,userId:recipient.id,title,message}});
      sendPush(this.db,{tenantId:tid,userId:recipient.id,title:notice.title,body:notice.message,url:'/leave',tag:'tcw-'+notice.id}).catch(()=>{});
      if(recipient.email)await this.db.outbox.create({data:{tenantId:tid,kind:'EMAIL',payload:{type:'LEAVE_REPORTING',to:recipient.email,subject:title+' - '+employeeName,text:message}}});
    }
  }
  async leaveBalances(ctx:Context,query:any){
    const tid=tenant(ctx);requirePermission(ctx,'leave','VIEW');
    const input=z.object({employeeId:id,year:z.coerce.number().int().min(1970).max(2100)}).parse(query);
    await assertEmployee(this.db,ctx,input.employeeId);
    const [types,usage]=await Promise.all([
      this.db.leaveType.findMany({where:{tenantId:tid},orderBy:{name:'asc'}}),
      this.db.leaveRequest.groupBy({by:['leaveTypeId','status'],where:{tenantId:tid,employeeId:input.employeeId,status:{in:['PENDING','APPROVED']},startDate:{gte:new Date(Date.UTC(input.year,0,1)),lt:new Date(Date.UTC(input.year+1,0,1))}},_sum:{days:true}})
    ]);
    const items=types.map(type=>{const approved=Number(usage.find(r=>r.leaveTypeId===type.id&&r.status==='APPROVED')?._sum.days??0),pending=Number(usage.find(r=>r.leaveTypeId===type.id&&r.status==='PENDING')?._sum.days??0),annual=Number(type.annualDays);return {id:type.id,name:type.name,paid:type.paid,annual,approved,pending,remaining:Math.max(0,annual-approved-pending)};});
    return {employeeId:input.employeeId,year:input.year,items,paidTaken:items.filter(r=>r.paid).reduce((sum,r)=>sum+r.approved,0),unpaidTaken:items.filter(r=>!r.paid).reduce((sum,r)=>sum+r.approved,0)};
  }
  async leave(ctx:Context,method:string,body:any){
    const tid=tenant(ctx);requirePermission(ctx,'leave',method==='GET'?'VIEW':'CREATE');
    const scope=await employeeScope(this.db,ctx);
    if(method==='GET'){const visibleEmployeeIds=scope??(await this.db.employee.findMany({where:{tenantId:tid,deletedAt:null},select:{id:true}})).map(e=>e.id),where={tenantId:tid,employeeId:{in:visibleEmployeeIds}};const [list,summary]=await Promise.all([this.db.leaveRequest.findMany({where,orderBy:{createdAt:'desc'},take:500}),this.db.leaveRequest.groupBy({by:['status'],where,_count:{_all:true}})]);const people=await this.db.employee.findMany({where:{tenantId:tid,id:{in:[...new Set(list.map(r=>r.employeeId))]}},select:{id:true,firstName:true,lastName:true,employeeCode:true,designation:true,photo:true}});return {items:(await approvalRows(this.db,tid,'leave',list)).map(row=>({...row,employee:people.find(p=>p.id===row.employeeId)??null})),summary:Object.fromEntries(summary.map(r=>[r.status,r._count._all])),total:summary.reduce((sum,r)=>sum+r._count._all,0)};}
    const input=leaveSchema.parse(body);await assertEmployee(this.db,ctx,input.employeeId);
    let autoApprove=false,duplicate=false;
    const after=await this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${input.employeeId}::uuid AND tenant_id = ${tid}::uuid FOR UPDATE`;
      if(input.requestKey){const existing=await tx.leaveRequest.findFirst({where:{tenantId:tid,requestKey:input.requestKey}});if(existing){if(existing.employeeId!==input.employeeId||existing.leaveTypeId!==input.leaveTypeId||+existing.startDate!==+input.startDate||+existing.endDate!==+input.endDate||existing.reason!==input.reason||(Number(existing.days)===0.5)!==input.halfDay)throw new ConflictException('Request key already belongs to a different leave request.');duplicate=true;return existing;}}
      const leaveType=await tx.leaveType.findFirst({where:{id:input.leaveTypeId,tenantId:tid}});if(!leaveType)throw new BadRequestException('Leave type not found.');
      for(const month of monthsCovered(input.startDate,input.endDate))await lockPayrollPeriod(tx,tid,month);
      const locked=await tx.attendancePeriodLock.findFirst({where:{tenantId:tid,month:{in:monthsCovered(input.startDate,input.endDate)},status:'LOCKED'}});if(locked)throw new ConflictException(`Attendance for ${locked.month} is locked. Unlock it before creating leave that changes payroll.`);
      const overlap=await tx.leaveRequest.count({where:{tenantId:tid,employeeId:input.employeeId,status:{in:['PENDING','APPROVED']},startDate:{lte:input.endDate},endDate:{gte:input.startDate}}});
      if(overlap)throw new ConflictException('This employee already has leave requested for these dates.');
      const employee=await tx.employee.findFirst({where:{tenantId:tid,id:input.employeeId},select:{shiftId:true,joiningDate:true}}),shift=employee?.shiftId?await tx.shift.findFirst({where:{tenantId:tid,id:employee.shiftId}}):await tx.shift.findFirst({where:{tenantId:tid},orderBy:{createdAt:'asc'}});
      if(!shift)throw new BadRequestException('Create a shift before requesting leave.');
      if(employee&&input.startDate.toISOString().slice(0,10)<employee.joiningDate.toISOString().slice(0,10))throw new BadRequestException('Leave cannot start before the employee joining date.');
      const calendarOffs=await tx.calendarEvent.findMany({where:{tenantId:tid,kind:{in:['HOLIDAY','ROSTER_OFF']},date:{lte:input.endDate},OR:[{endDate:null},{endDate:{gte:input.startDate}}]}});const excluded=new Set<string>();
      for(const h of calendarOffs){if(h.kind==='ROSTER_OFF'){if(h.shiftId===shift.id)excluded.add(h.date.toISOString().slice(0,10));continue;}const end=h.endDate??h.date;for(let t=Math.max(+input.startDate,+h.date);t<=Math.min(+input.endDate,+end);t+=86400000)excluded.add(new Date(t).toISOString().slice(0,10));}let days=0;
      for(let t=+input.startDate;t<=+input.endDate;t+=86400000){const day=new Date(t);if(isScheduledWorkDay(day,shift)&&!excluded.has(day.toISOString().slice(0,10)))days++;}
      if(input.halfDay)days=days?0.5:0;
      if(!days)throw new BadRequestException('There are no working days in the requested period.');
      const year=input.startDate.getUTCFullYear();
      const used=await tx.leaveRequest.aggregate({where:{tenantId:tid,employeeId:input.employeeId,leaveTypeId:input.leaveTypeId,status:{in:['PENDING','APPROVED']},startDate:{gte:new Date(`${year}-01-01`),lt:new Date(`${year+1}-01-01`)}},_sum:{days:true}});
      if(Number(used._sum.days??0)+days>Number(leaveType.annualDays))throw new BadRequestException('The request exceeds the annual leave allowance.');
      const {halfDay,...values}=input;
      autoApprove=!await approvalEnabled(tx,tid,'leave')&&['COMPANY_OWNER','HR_ADMIN','HR_EXECUTIVE'].includes(ctx.user.role.code)&&input.employeeId!==ctx.user.employeeId;
      const created=await tx.leaveRequest.create({data:{tenantId:tid,...values,days,...(autoApprove?{status:'APPROVED',reviewerId:ctx.user.id,reviewNote:'Assigned by HR'}:{})}});
      if(!autoApprove)await createApproval(tx,tid,'leave',created);
      await audit(tx,ctx,autoApprove?'LEAVE_ASSIGNED':'LEAVE_REQUESTED','leave',created.id,undefined,created);return created;
    });
    if(duplicate)return after;
    await this.notifyLeaveReporting(ctx,after,autoApprove);
    if(autoApprove&&after.status==='APPROVED'){
      await this.closeOpenWorkForApprovedFullDayLeave(ctx,after);
      await this.reconcileLeaveAttendance(ctx,after);
      const user=await this.db.user.findFirst({where:{tenantId:tid,employeeId:after.employeeId}});
      if(user){const notice=await this.db.notification.create({data:{tenantId:tid,userId:user.id,title:'Leave assigned',message:'HR assigned approved leave to your schedule.'}});sendPush(this.db,{tenantId:tid,userId:user.id,title:notice.title,body:notice.message,url:'/leave',tag:'tcw-'+notice.id}).catch(()=>{});}
    }
    return after;
  }
  async cancelLeave(ctx:Context,recordId:string,body:any={}){
    const tid=tenant(ctx),input=z.object({note:z.string().trim().max(1000).default('')}).strict().parse(body??{});
    const before=await this.db.leaveRequest.findFirst({where:{tenantId:tid,id:id.parse(recordId)}});if(!before)throw new NotFoundException('Leave request not found.');
    await assertEmployee(this.db,ctx,before.employeeId);
    const isSelf=before.employeeId===ctx.user.employeeId;
    requirePermission(ctx,'leave',isSelf?'CREATE':'EDIT');
    if(!['PENDING','APPROVED'].includes(String(before.status)))throw new ConflictException('Only pending or approved leave can be cancelled.');
    const cancellation=await this.db.$transaction(async tx=>{
      for(const month of monthsCovered(before.startDate,before.endDate))await lockPayrollPeriod(tx,tid,month);
      await tx.$queryRaw`SELECT id FROM leave_requests WHERE id = ${before.id}::uuid AND tenant_id = ${tid}::uuid FOR UPDATE`;
      const current=await tx.leaveRequest.findFirst({where:{tenantId:tid,id:before.id}});if(!current)throw new NotFoundException('Leave request not found.');
      if(!['PENDING','APPROVED'].includes(String(current.status)))throw new ConflictException('This leave request can no longer be cancelled.');
      const locked=await tx.attendancePeriodLock.findFirst({where:{tenantId:tid,month:{in:monthsCovered(current.startDate,current.endDate)},status:'LOCKED'}});
      if(locked)throw new ConflictException(`Attendance for ${locked.month} is locked. Unlock it before cancelling this leave.`);
      const cancellationNote=input.note?(`Cancelled: ${input.note}`):'Cancelled';
      const updated=await tx.leaveRequest.update({where:{id:current.id},data:{status:'CANCELLED',reviewNote:current.reviewNote?[current.reviewNote,cancellationNote].join('\n'):cancellationNote}});
      await audit(tx,ctx,'LEAVE_CANCELLED','leave',current.id,current,updated);
      const user=await tx.user.findFirst({where:{tenantId:tid,employeeId:current.employeeId}});
      if(user&&user.id!==ctx.user.id){
        const notice=await tx.notification.create({data:{tenantId:tid,userId:user.id,title:'Leave cancelled',message:'Your time off request has been cancelled.'}});
        sendPush(this.db,{tenantId:tid,userId:user.id,title:notice.title,body:notice.message,url:'/leave',tag:'tcw-'+notice.id}).catch(()=>{});
      }
      if(current.status==='APPROVED'){
        const sourceId=`leave-${current.id}-auto-out`;
        const generated=await tx.attendancePunch.findUnique({where:{tenantId_sourceId:{tenantId:tid,sourceId}}});
        if(generated){
          await tx.$queryRaw`SELECT set_config('app.raw_punch_delete_tenant', ${tid}, true), set_config('app.allow_raw_punch_delete', 'on', true)`;
          await tx.attendancePunch.delete({where:{id:generated.id}});
          await audit(tx,ctx,'LEAVE_AUTO_CHECKOUT_REVERSED','attendance',generated.id,generated,{leaveId:current.id,cancelled:true});
        }
        await tx.attendanceDaily.updateMany({
          where:{tenantId:tid,employeeId:current.employeeId,date:{gte:current.startDate,lte:current.endDate},dayType:{in:['PAID_LEAVE','UNPAID_LEAVE']},correctionNote:''},
          data:{syncedAt:null}
        });
      }
      return {updated,wasApproved:String(current.status)==='APPROVED'};
    });
    const after=cancellation.updated;
    if(cancellation.wasApproved){
      await this.reconcileLeaveAttendance(ctx,after);
    }
    return after;
  }

  async review(ctx:Context,type:string,recordId:string,body:any){
    const models:Record<string,string>={leave:'leaveRequest',expenses:'expenseClaim',travel:'travelRequest'};const model=models[type];if(!model)throw new NotFoundException();const tid=tenant(ctx);
    const input=z.object({decision:z.enum(['APPROVED','REJECTED']),note:z.string().max(1000).default('')}).strict().parse(body);requirePermission(ctx,type,input.decision==='APPROVED'?'APPROVE':'REJECT');let affectedMonths:string[]=[];
    const reviewed=await this.db.$transaction(async tx=>{
      const table=(tx as any)[model];const before=await table.findFirst({where:{id:id.parse(recordId),tenantId:tid}});if(!before)throw new NotFoundException();await assertEmployee(tx,ctx,before.employeeId);
      if(before.employeeId===ctx.user.employeeId)throw new ForbiddenException('You cannot approve your own request.');
      if(type==='leave'){affectedMonths=monthsCovered(before.startDate,before.endDate);for(const month of affectedMonths)await lockPayrollPeriod(tx,tid,month);const locked=await tx.attendancePeriodLock.findFirst({where:{tenantId:tid,month:{in:affectedMonths},status:'LOCKED'}});if(locked)throw new ConflictException(`Attendance for ${locked.month} is locked. Unlock it before reviewing this leave.`);}
      const tableName={leave:'leave_requests',expenses:'expense_claims',travel:'travel_requests'}[type]!;
      await tx.$queryRawUnsafe(`SELECT id FROM ${tableName} WHERE id = $1::uuid AND tenant_id = $2::uuid FOR UPDATE`,recordId,tid);
      const current=await table.findFirst({where:{id:recordId,tenantId:tid}});if(current.status!=='PENDING')throw new ConflictException('This request has already been reviewed.');
      const decision=await reviewApproval(tx,ctx,type,current,input);
      const data=type==='leave'?{status:decision.status,reviewerId:ctx.user.id,reviewNote:input.note}:{status:decision.status,reviewedBy:ctx.user.id};
      const result=await table.updateMany({where:{id:recordId,tenantId:tid,status:'PENDING'},data});if(result.count!==1)throw new ConflictException('This request has already been reviewed.');
      await audit(tx,ctx,`${type.toUpperCase()}_${decision.status==='PENDING'?'MANAGER_APPROVED':input.decision}`,type,recordId,before,data);const user=await tx.user.findFirst({where:{tenantId:tid,employeeId:before.employeeId}});if(user){const notice=await tx.notification.create({data:{tenantId:tid,userId:user.id,title:`${type} ${decision.status==='PENDING'?'manager approved':input.decision.toLowerCase()}`,message:decision.status==='PENDING'?'Reporting manager approved. Final HR review is pending.':'Your request has been reviewed.'}});sendPush(this.db,{tenantId:tid,userId:user.id,title:notice.title,body:notice.message,url:type==='leave'?'/leave':'/notifications',tag:'tcw-'+notice.id}).catch(()=>{});}return table.findUnique({where:{id:recordId}});
    });
    if(type==='leave'&&reviewed.status==='APPROVED'){
      await this.closeOpenWorkForApprovedFullDayLeave(ctx,reviewed);
      await this.reconcileLeaveAttendance(ctx,reviewed);
    }
    return reviewed;
  }
  async payroll(ctx:Context,method:string,recordId?:string,action?:string,body:any={}){
    const tid=tenant(ctx);
    const permission=method==='GET'?'VIEW':action==='manual-salary'?'MANAGE':action==='finalize'||action==='lock'||action==='approve'||action==='reopen'||action==='unlock'?'APPROVE':'CREATE';
    requirePermission(ctx,'payroll',permission);
    const scope=await employeeScope(this.db,ctx);

    if(method==='GET'){
      if(scope){
        return {items:await this.db.payrollItem.findMany({
          where:{tenantId:tid,employeeId:ctx.user.employeeId??'00000000-0000-0000-0000-000000000000',run:{status:'LOCKED'}},
          include:{run:{select:{month:true,status:true,lockedAt:true}}},
          orderBy:{createdAt:'desc'}
        })};
      }
      return {items:await this.db.payrollRun.findMany({
        where:{tenantId:tid,...(recordId?{id:id.parse(recordId)}:{})},
        include:{items:true},
        orderBy:{month:'desc'},take:120
      })};
    }
    if(scope)throw new ForbiddenException('Payroll is managed by your payroll team.');

    if(method==='DELETE'){
      if(!recordId)throw new BadRequestException('Payroll run id is required.');
      return this.db.$transaction(async tx=>{
        await lockPayrollRun(tx,tid,id.parse(recordId));
        const run=await tx.payrollRun.findFirst({where:{id:recordId,tenantId:tid}});
        if(!run)throw new NotFoundException('Payroll run not found.');
        if(await tx.payrollPayout.count({where:{tenantId:tid,runId:recordId}}))throw new ConflictException('Payroll with payout records cannot be deleted.');
        if(!['DRAFT','REVIEW'].includes(run.status)||run.approvedBy||run.lockedAt)throw new ConflictException('Only an unfinalized payroll can be deleted. Reopen finalized payroll first.');
        await tx.payrollAdjustment.updateMany({where:{tenantId:tid,appliedRunId:recordId},data:{appliedRunId:null}});
        await tx.loanInstallment.updateMany({where:{tenantId:tid,appliedRunId:recordId},data:{appliedRunId:null}});
        await tx.payrollItem.deleteMany({where:{tenantId:tid,runId:recordId}});
        const period=await tx.attendancePeriodLock.findUnique({where:{tenantId_month:{tenantId:tid,month:run.month}}});
        if(period?.status==='LOCKED'){
          const {first,next}=monthBounds(run.month),now=new Date();
          await tx.attendanceDaily.updateMany({where:{tenantId:tid,date:{gte:first,lt:next}},data:{lockedAt:null}});
          await tx.attendancePeriodLock.update({where:{id:period.id},data:{status:'UNLOCKED',unlockedBy:ctx.user.id,unlockedAt:now}});
        }
        await audit(tx,ctx,'PAYROLL_RUN_DELETED','payroll-month',run.month,run,{deleted:true,month:run.month,skipAutomaticRecreation:true,attendanceReopened:period?.status==='LOCKED'});
        await tx.payrollRun.delete({where:{id:recordId}});
        await tx.notification.deleteMany({where:{tenantId:tid,title:{in:['Automatic payroll could not be prepared','Automatic payroll needs attendance review']},message:{contains:run.month}}});
        return {ok:true,id:recordId,month:run.month};
      });
    }

    if(!recordId){
      if(method!=='POST')throw new BadRequestException('Unsupported payroll request.');
      const input=z.object({month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)}).strict().parse(body);
      const before=await this.db.payrollRun.findUnique({where:{tenantId_month:{tenantId:tid,month:input.month}}});
      const after=await preparePayrollMonth(this.db,tid,input.month,ctx.user.id);
      await audit(this.db,ctx,'PAYROLL_PREPARED','payroll',after.id,before,after);
      await this.db.notification.deleteMany({where:{tenantId:tid,title:{in:['Automatic payroll could not be prepared','Automatic payroll needs attendance review']},message:{contains:input.month}}}).catch(()=>{});
      return after;
    }

    if(action==='manual-salary'&&method==='POST')return updateManualSalary(this.db,ctx,id.parse(recordId),body);

    if(action==='calculate'||action==='prepare'){
      const before=await this.db.payrollRun.findFirst({where:{id:id.parse(recordId),tenantId:tid}});
      if(!before)throw new NotFoundException('Payroll run not found.');
      const after=await preparePayrollMonth(this.db,tid,before.month,ctx.user.id);
      await audit(this.db,ctx,'PAYROLL_PREPARED','payroll',recordId,before,after);
      return after;
    }
    if(action==='finalize'||action==='lock'||action==='approve'){
      const before=await this.db.payrollRun.findFirst({where:{id:id.parse(recordId),tenantId:tid}});
      if(!before)throw new NotFoundException('Payroll run not found.');
      const {run:after,changed}=await finalizePayrollMonth(this.db,tid,recordId,ctx.user.id);
      await audit(this.db,ctx,'PAYROLL_FINALIZED','payroll',recordId,before,after);
      if(changed){
        const finalNotice=await this.db.notification.create({data:{tenantId:tid,title:`Payroll ${after.month} finalized`,message:'Payroll is finalized. Payslips and payout data now use this locked payroll.'}});
        sendPush(this.db,{tenantId:tid,title:finalNotice.title,body:finalNotice.message,url:'/payroll',tag:'tcw-'+finalNotice.id}).catch(()=>{});
        const items=after.items??[];
        const linked=await this.db.user.findMany({where:{tenantId:tid,employeeId:{in:items.map((i:any)=>i.employeeId)},active:true},select:{id:true,employeeId:true}});
        const netByEmployee=new Map(items.map((i:any)=>[i.employeeId,i.net]));
        if(linked.length)await this.db.notification.createMany({data:linked.map(user=>({tenantId:tid,userId:user.id,title:`Payslip ready for ${after.month}`,message:`Your finalized net salary is ${(Number(netByEmployee.get(user.employeeId!)??0)/100).toLocaleString('en-IN',{style:'currency',currency:'INR'})}.`}))});
      }
      return after;
    }
    if(action==='reopen'||action==='unlock'){
      const before=await this.db.payrollRun.findFirst({where:{id:id.parse(recordId),tenantId:tid}});
      if(!before)throw new NotFoundException('Payroll run not found.');
      const after=await reopenPayrollMonth(this.db,tid,recordId,ctx.user.id);
      await audit(this.db,ctx,'PAYROLL_REOPENED','payroll',recordId,before,{...after,attendanceReopened:true});
      return after;
    }
    throw new BadRequestException('Unknown payroll action.');
  }
  async adjustment(ctx:Context,body:any){
    const tid=tenant(ctx);requirePermission(ctx,'payroll','MANAGE');
    const input=z.object({originalRunId:id,employeeId:id,targetMonth:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),amount:z.number().int().min(-1e9).max(1e9),reason:z.string().min(5).max(1000)}).strict().parse(body);
    await assertEmployee(this.db,ctx,input.employeeId);
    return this.db.$transaction(async tx=>{
      const original=await tx.payrollRun.findFirst({where:{tenantId:tid,id:input.originalRunId}});
      if(!original||input.targetMonth<=original.month)throw new BadRequestException('Select a locked original run and a later adjustment month.');
      // Acquire periods chronologically so two-period actions cannot deadlock each other.
      await lockPayrollPeriod(tx,tid,original.month);
      await lockPayrollPeriod(tx,tid,input.targetMonth);
      const lockedOriginal=await tx.payrollRun.findFirst({where:{tenantId:tid,id:input.originalRunId,status:'LOCKED'}});
      if(!lockedOriginal)throw new BadRequestException('Select a locked original run and a later adjustment month.');
      if(await tx.payrollRun.findFirst({where:{tenantId:tid,month:input.targetMonth,status:{not:'DRAFT'}}}))throw new BadRequestException('The target month is already under review or finalized.');
      const row=await tx.payrollAdjustment.create({data:{tenantId:tid,...input}});
      await audit(tx,ctx,'PAYROLL_ADJUSTMENT_CREATED','payroll',row.id,undefined,row);
      return row;
    },{timeout:30000});
  }
  async workforce(ctx:Context,method:string,body:any){
    const tid=tenant(ctx);requirePermission(ctx,'workforce',method==='GET'?'VIEW':'CREATE');
    if(method==='GET'){
      const scope=await employeeScope(this.db,ctx);
      const employees=await this.db.employee.findMany({where:{tenantId:tid,deletedAt:null,...(scope?{id:{in:scope}}:{})},select:{id:true,firstName:true,lastName:true,employeeCode:true,photo:true,departmentId:true,branchId:true,shiftId:true}});
      const employeeIds=employees.map(e=>e.id),since=new Date(Date.now()-36*3600000);
      const [events,punches,shifts]=await Promise.all([
        this.db.activityEvent.findMany({where:{tenantId:tid,eventTime:{gte:new Date(Date.now()-24*3600000)},...(scope?{employeeId:{in:scope}}:{})},orderBy:{eventTime:'desc'},take:5000}),
        employeeIds.length?this.db.attendancePunch.findMany({where:{tenantId:tid,employeeId:{in:employeeIds},punchTime:{gte:since}},orderBy:{punchTime:'asc'},select:{employeeId:true,punchTime:true,punchType:true,verificationType:true,rawPayload:true}}):[],
        this.db.shift.findMany({where:{tenantId:tid},select:{id:true,startMinute:true,endMinute:true,timezone:true,breakMinutes:true,punchDrivenBreaks:true,flexibleBreakAnytime:true,breakStartMinute:true,breakEndMinute:true}})
      ]),shiftById=new Map(shifts.map(s=>[s.id,s]));
      return {items:employees.map(e=>{
        const rawEmployeePunches=punches.filter(p=>p.employeeId===e.id),allEmployeePunches=attendanceCalculationPunches(rawEmployeePunches),latest=events.find(v=>v.employeeId===e.id),shift=e.shiftId?shiftById.get(e.shiftId):undefined,now=new Date();
        let employeePunches=allEmployeePunches,insideShift=false,activeBreakState:'BREAK'|'OVER_BREAK'|null=null,shiftStart:Date|null=null,shiftEnd:Date|null=null,breakWindow:ReturnType<typeof shiftBreakWindow>=null,flexibleBreakAnytime=false;
        if(shift){
          const workDay=attendanceWorkdayDate(now,shift.startMinute,shift.endMinute,shift.timezone),night=shift.endMinute<=shift.startMinute;
          shiftStart=zonedMinute(workDay,shift.startMinute,shift.timezone);shiftEnd=zonedMinute(workDay,night?1440+shift.endMinute:shift.endMinute,shift.timezone);breakWindow=shiftBreakWindow(workDay,shift);flexibleBreakAnytime=!!shift.punchDrivenBreaks&&!!shift.flexibleBreakAnytime;insideShift=now>=shiftStart&&now<shiftEnd;
          employeePunches=allEmployeePunches.filter(p=>attendanceWorkdayDate(p.punchTime,shift.startMinute,shift.endMinute,shift.timezone)===workDay);
        }
        let open:any=null,lastPunch:any=null;for(const p of employeePunches){lastPunch=p;if(p.punchType==='IN'){if(!open)open=p}else if(open)open=null}
        const punchBreaks=attendancePunchDrivenBreaks(shift??{},employeePunches);if(open){const automaticBreak=!!shift&&!punchBreaks&&insideShift&&!!breakWindow&&now>=breakWindow.start&&now<breakWindow.end,status=automaticBreak?'BREAK':'WORKING';return {...e,event:{eventTime:automaticBreak?breakWindow!.start:open.punchTime,source:open.verificationType==='FACE_SCAN'?'Mobile Face':'Attendance',status},status};}
        if(lastPunch?.punchType==='OUT'&&insideShift&&shift&&shiftStart&&shiftEnd){
          const allowedBreakSeconds=Math.max(0,Number(shift.breakMinutes??0))*60;let completedPunchBreak=false,usedScheduledBreakSeconds=0;
          for(let i=0;i<employeePunches.length-1;i++){const out=employeePunches[i],next=employeePunches[i+1];if(out.punchType!=='OUT'||next.punchType!=='IN')continue;const eligible=flexibleBreakAnytime?out.punchTime>=shiftStart&&out.punchTime<shiftEnd:!!breakWindow&&isScheduledBreakOut(out.punchTime,breakWindow.start,breakWindow.end);if(!eligible)continue;completedPunchBreak=true;if(flexibleBreakAnytime)break;const gapSeconds=Math.max(0,Math.floor((Math.min(next.punchTime.getTime(),shiftEnd.getTime())-out.punchTime.getTime())/1000));usedScheduledBreakSeconds+=allocateBreakUsageSeconds(gapSeconds,usedScheduledBreakSeconds,allowedBreakSeconds).breakSeconds;}
          if(!completedPunchBreak&&flexibleBreakAnytime&&lastPunch.punchTime>=shiftStart&&lastPunch.punchTime<shiftEnd){
            const currentGapSeconds=Math.max(0,Math.floor((Math.min(now.getTime(),shiftEnd.getTime())-lastPunch.punchTime.getTime())/1000)),state=flexibleBreakLiveState(0,allowedBreakSeconds,currentGapSeconds);if(state!=='OUT')activeBreakState=state;
          }else if(!flexibleBreakAnytime&&breakWindow&&isScheduledBreakOut(lastPunch.punchTime,breakWindow.start,breakWindow.end)){
            const currentGapSeconds=Math.max(0,Math.floor((Math.min(now.getTime(),shiftEnd.getTime())-lastPunch.punchTime.getTime())/1000));activeBreakState=punchBreaks?(currentGapSeconds>Math.max(0,allowedBreakSeconds-usedScheduledBreakSeconds)?'OVER_BREAK':'BREAK'):(Math.floor((now.getTime()-breakWindow.end.getTime())/1000)>0?'OVER_BREAK':'BREAK');
          }
        }
        if(lastPunch?.punchType==='OUT'&&insideShift&&activeBreakState)return {...e,event:{eventTime:lastPunch.punchTime,source:lastPunch.verificationType==='FACE_SCAN'?'Mobile Face':'Attendance',status:activeBreakState},status:activeBreakState};
        if(lastPunch?.punchType==='OUT'&&insideShift)return {...e,event:{eventTime:lastPunch.punchTime,source:lastPunch.verificationType==='FACE_SCAN'?'Mobile Face':'Attendance',status:'OUT'},status:'OUT'};
        return {...e,event:latest,status:latest&&Date.now()-+latest.eventTime<120000?latest.status:'OFFLINE'};
      }),events};
    }
    if(!ctx.user.employeeId)throw new BadRequestException('Link your user account to an employee before setting activity.');
    const input=z.object({status:z.enum(['WORKING','MEETING','BREAK','IDLE','OFFLINE']),sourceId:z.string().min(1).max(100)}).strict().parse(body);
    await assertEmployee(this.db,ctx,ctx.user.employeeId);
    const row=await this.db.activityEvent.upsert({where:{tenantId_sourceId:{tenantId:tid,sourceId:input.sourceId}},create:{tenantId:tid,employeeId:ctx.user.employeeId,status:input.status,sourceId:input.sourceId,eventTime:new Date(),source:'PORTAL'},update:{}});return row;
  }
  async exit(ctx:Context,recordId:string,body:any){
    const tid=tenant(ctx);requirePermission(ctx,'exit','APPROVE');
    const input=z.object({status:z.enum(['APPROVED','CLEARANCE','COMPLETED','REJECTED']),assetCleared:z.boolean(),payrollCleared:z.boolean()}).strict().parse(body);
    return this.db.$transaction(async tx=>{
      const before=await tx.employeeExit.findFirst({where:{id:id.parse(recordId),tenantId:tid}});if(!before)throw new NotFoundException();
      const allowed:Record<string,string[]>={REQUESTED:['APPROVED','REJECTED'],APPROVED:['CLEARANCE'],CLEARANCE:['CLEARANCE','COMPLETED'],COMPLETED:[],REJECTED:[]};
      if(!allowed[before.status]?.includes(input.status))throw new BadRequestException('Invalid exit transition.');
      if(input.status==='COMPLETED'&&(!input.assetCleared||!input.payrollCleared))throw new BadRequestException('Complete all clearances first.');
      if(input.assetCleared&&await tx.asset.count({where:{tenantId:tid,employeeId:before.employeeId,status:'ASSIGNED'}}))throw new BadRequestException('Return assigned assets before clearance.');
      const after=await tx.employeeExit.update({where:{id:recordId},data:input});
      if(input.status==='COMPLETED'){await tx.employee.update({where:{id:before.employeeId},data:{status:'INACTIVE'}});await tx.user.updateMany({where:{tenantId:tid,employeeId:before.employeeId},data:{active:false}});}
      await audit(tx,ctx,'EXIT_UPDATED','exit',recordId,before,after);return after;
    });
  }
}
