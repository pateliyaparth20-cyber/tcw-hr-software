import {BadRequestException,ForbiddenException,NotFoundException,ConflictException} from '@nestjs/common';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import type {Database} from '../../../packages/database';
import {id,date,leaveSchema} from '../../../packages/validation';
import {attendancePayableUnits,calculateAttendance,localDate,monthBounds,workingDaySet,zonedMinute} from '../../../packages/attendance-engine';
import {hasPermission} from '../../../packages/permissions';
import {audit,assertEmployee,employeeScope,requirePermission,tenant,Context} from './context';
import {assertAttendanceUnlocked,attendanceMonthSummary,employeeShift,lockAttendanceMonth,reconcileAttendanceMonth,unlockAttendanceMonth} from './attendance-automation';
import {sendPush} from './push';
import {enrollEmployeeFace,faceProfileStatus,verifyEmployeeFace} from './face-profile';
import {finalizePayrollMonth,preparePayrollMonth,reopenPayrollMonth} from './payroll-service';

const monthsCovered=(start:Date,end:Date)=>{const out:string[]=[];let y=start.getUTCFullYear(),m=start.getUTCMonth();const ey=end.getUTCFullYear(),em=end.getUTCMonth();while(y<ey||(y===ey&&m<=em)){out.push(`${y}-${String(m+1).padStart(2,'0')}`);m++;if(m>11){m=0;y++;}}return out;};
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
      const shift=await employeeShift(this.db,tid,employeeId);let day=localDate(punchTime,shift.timezone);const night=shift.endMinute<=shift.startMinute;
      if(night&&punchTime<zonedMinute(day,shift.endMinute,shift.timezone))day=new Date(Date.parse(day)-86400000).toISOString().slice(0,10);
      const start=zonedMinute(day,shift.startMinute-240,shift.timezone),end=zonedMinute(day,(night?1440+shift.endMinute:shift.endMinute)+240,shift.timezone);
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
        const last=await tx.attendancePunch.findFirst({where:{tenantId:tid,employeeId,punchTime:{gte:start,lt:end}},orderBy:{punchTime:'desc'}});
        if(last&&punchTime.getTime()-last.punchTime.getTime()<45000)throw new ConflictException('A Face Scan punch was just recorded. Wait a few seconds before scanning again.');
        let punchType:'IN'|'OUT';if(input.intent==='IN'){if(last?.punchType==='IN')throw new ConflictException('You are already checked in. Check out before starting another IN.');punchType='IN';}else if(input.intent==='OUT'){if(!last||last.punchType!=='IN')throw new ConflictException('You are not currently checked in. Check in before checking out.');punchType='OUT';}else punchType=last?.punchType==='IN'?'OUT':'IN';
        const row=await tx.attendancePunch.create({data:{tenantId:tid,employeeId,deviceId:mobileDevice.id,sourceId,punchTime,punchType,verificationType:'FACE_SCAN',rawPayload:{source:'FACE_SCAN',app:'TCW_EMPLOYEE',actorId:ctx.user.id,faceCaptureHash:faceHash,captureBytes:bytes.length,rawImageStored:false,faceMatched:true,faceDistance:match.distance,faceThreshold:match.threshold}}});
        const punches=await tx.attendancePunch.findMany({where:{tenantId:tid,employeeId,punchTime:{gte:start,lt:end}},orderBy:{punchTime:'asc'}});
        const shiftEnd=zonedMinute(day,night?1440+shift.endMinute:shift.endMinute,shift.timezone);
        const calculated=calculateAttendance(punches.map(p=>({time:p.punchTime,type:p.punchType as 'IN'|'OUT'})),{shiftStart:zonedMinute(day,shift.startMinute,shift.timezone),shiftEnd,graceMinutes:shift.graceMinutes,earlyOutGraceMinutes:shift.earlyOutGraceMinutes,fullDayMinutes:shift.fullDayMinutes,halfDayMinutes:shift.halfDayMinutes,overtimeAfterMinutes:shift.overtimeAfterMinutes});
        const reportDate=new Date(day),payableUnits=attendancePayableUnits(calculated.status);
        await tx.attendanceDaily.upsert({where:{tenantId_employeeId_date:{tenantId:tid,employeeId,date:reportDate}},create:{tenantId:tid,employeeId,date:reportDate,shiftId:shift.id,scheduledMinutes:shift.fullDayMinutes,payableUnits,leaveUnits:0,dayType:'WORKING',exceptionCode:calculated.status==='MISSING_PUNCH'?'MISSING_PUNCH':'',...calculated},update:{shiftId:shift.id,scheduledMinutes:shift.fullDayMinutes,payableUnits,exceptionCode:calculated.status==='MISSING_PUNCH'?'MISSING_PUNCH':'',correctionNote:'',...calculated}});
        await tx.attendancePunch.updateMany({where:{tenantId:tid,id:{in:punches.map(p=>p.id)}},data:{processedAt:new Date()}});
        await tx.deviceSyncLog.create({data:{tenantId:tid,deviceId:mobileDevice.id,action:'FACE_SCAN_PUNCH',message:`Employee Face Scan ${punchType} recorded.`,details:{employeeId,punchType,punchTime,verificationType:'FACE_SCAN'}}});
        await audit(tx,ctx,'FACE_PUNCH_RECORDED','attendance',row.id,undefined,{employeeId,punchTime,punchType,verificationType:'FACE_SCAN',faceCaptureHash:faceHash,rawImageStored:false,faceMatched:true,faceDistance:match.distance});
        return {ok:true,punchType,punchTime,status:calculated.status,workMinutes:calculated.workMinutes,firstIn:calculated.firstIn,lastOut:calculated.lastOut};
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
      const start=zonedMinute(day,night?shift.startMinute-120:0,shift.timezone);
      const end=zonedMinute(day,night?1440+shift.endMinute+120:1440,shift.timezone);
      return this.db.$transaction(async tx=>{
        const rawPunchesRetained=await tx.attendancePunch.count({where:{tenantId:tid,employeeId:before.employeeId,punchTime:{gte:start,lt:end}}});
        const after=await tx.attendanceDaily.update({where:{id:before.id},data:{status:'VOID',dayType:'VOID',scheduledMinutes:0,payableUnits:0,leaveUnits:0,workMinutes:0,lateMinutes:0,earlyOutMinutes:0,overtimeMinutes:0,exceptionCode:'',correctionNote:`VOIDED_BY_HR:${ctx.user.id}`}});
        await audit(tx,ctx,'ATTENDANCE_VOIDED','attendance',before.id,before,{rawPunchesRetained});
        return {ok:true,deleted:true,voided:true,rawPunchesRetained,record:after};
      });
    }
    if(recordId&&action==='correct'&&method==='POST'){
      requirePermission(ctx,'attendance','MANAGE');const input=z.object({status:z.enum(['PRESENT','HALF_DAY','ABSENT']),workMinutes:z.number().int().min(0).max(1440).optional(),note:z.string().trim().min(5).max(1000)}).strict().parse(body);
      const before=await this.db.attendanceDaily.findFirst({where:{tenantId:tid,id:id.parse(recordId)}});if(!before)throw new NotFoundException();await assertAttendanceUnlocked(this.db,tid,before.date);
      const after=await this.db.attendanceDaily.update({where:{id:before.id},data:{status:input.status,workMinutes:input.workMinutes??before.workMinutes,payableUnits:attendancePayableUnits(input.status),exceptionCode:'',correctionNote:input.note}});
      await audit(this.db,ctx,'ATTENDANCE_CORRECTED','attendance',before.id,before,after);return after;
    }
    requirePermission(ctx,'attendance',method==='GET'?'VIEW':'CREATE');
    if(method==='GET'){
      const start=query.from?date.parse(query.from):new Date(Date.now()-31*86400000);const end=query.to?date.parse(query.to):new Date();
      const visibleEmployeeIds=scope??(await this.db.employee.findMany({where:{tenantId:tid,deletedAt:null},select:{id:true}})).map(e=>e.id);
      const items=await this.db.attendanceDaily.findMany({where:{tenantId:tid,date:{gte:start,lte:end},employeeId:{in:visibleEmployeeIds},status:{not:'VOID'}},orderBy:{date:'desc'},take:1000});
      const [punchRows,shifts]=await Promise.all([this.db.attendancePunch.findMany({where:{tenantId:tid,employeeId:{in:visibleEmployeeIds},punchTime:{gte:new Date(+start-86400000),lte:new Date(+end+2*86400000)}},orderBy:{punchTime:'asc'},select:{employeeId:true,punchTime:true,punchType:true,verificationType:true}}),this.db.shift.findMany({where:{tenantId:tid},select:{id:true,name:true,breakMinutes:true}})]);const shiftById=new Map(shifts.map(s=>[s.id,s]));
      return {items:items.map(row=>{const shiftRule=row.shiftId?shiftById.get(row.shiftId):undefined;const rowPunches=punchRows.filter(p=>p.employeeId===row.employeeId&&((row.firstIn&&p.punchTime>=row.firstIn)&&(!row.lastOut||p.punchTime<=row.lastOut))).sort((a,b)=>+a.punchTime-+b.punchTime);const verificationTypes=[...new Set(rowPunches.map(p=>p.verificationType))];const attendanceSource=verificationTypes.includes('FACE_SCAN')?'Mobile Face':verificationTypes.includes('FACE_DEVICE')?'Device Face':verificationTypes.includes('FINGERPRINT_DEVICE')?'Fingerprint':verificationTypes.includes('CARD_DEVICE')?'Card':verificationTypes.includes('MANUAL')?'Manual':verificationTypes.length?verificationTypes.join(', '):'—';let breakMinutes=0;for(let i=0;i<rowPunches.length-1;i++)if(rowPunches[i].punchType==='OUT'&&rowPunches[i+1].punchType==='IN')breakMinutes+=Math.max(0,Math.floor((+rowPunches[i+1].punchTime-+rowPunches[i].punchTime)/60000));const allowedBreakMinutes=Math.max(0,Number(shiftRule?.breakMinutes??0)),overBreakMinutes=Math.max(0,breakMinutes-allowedBreakMinutes),common={attendanceSource,shiftName:shiftRule?.name??'—',inTime:row.firstIn,outTime:row.lastOut,workedMinutes:row.workMinutes,breakMinutes,allowedBreakMinutes,overBreakMinutes};const fullDayLeave=['PAID_LEAVE','UNPAID_LEAVE'].includes(row.dayType)&&row.leaveUnits>=100;if(!fullDayLeave)return {...row,...common};return {...row,...common,status:row.dayType,exceptionCode:'',lateMinutes:0,earlyOutMinutes:0,overtimeMinutes:0};})};
    }
    const input=z.object({employeeId:id,punchTime:z.iso.datetime().transform(v=>new Date(v)),punchType:z.enum(['IN','OUT']),sourceId:z.string().min(1).max(100),shiftId:id.optional()}).strict().parse(body);
    await assertEmployee(this.db,ctx,input.employeeId);await assertAttendanceUnlocked(this.db,tid,input.punchTime);
    if(input.punchTime.getTime()>Date.now()+300000||input.punchTime.getTime()<Date.now()-366*86400000)throw new BadRequestException('Punch time must be within the last year and not in the future.');
    const shift=await employeeShift(this.db,tid,input.employeeId,input.shiftId);let day=localDate(input.punchTime,shift.timezone);const night=shift.endMinute<=shift.startMinute;
    if(night&&input.punchTime<zonedMinute(day,shift.endMinute,shift.timezone))day=new Date(Date.parse(day)-86400000).toISOString().slice(0,10);
    const start=zonedMinute(day,night?shift.startMinute-120:0,shift.timezone);const end=zonedMinute(day,night?1440+shift.endMinute+120:1440,shift.timezone);
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${input.employeeId}::uuid AND tenant_id = ${tid}::uuid FOR UPDATE`;
      const existing=await tx.attendancePunch.findUnique({where:{tenantId_sourceId:{tenantId:tid,sourceId:input.sourceId}}});
      if(existing){if(existing.employeeId!==input.employeeId||existing.punchType!==input.punchType||+existing.punchTime!==+input.punchTime)throw new ConflictException('Source ID already belongs to another punch.');return {ok:true,duplicate:true};}
      const row=await tx.attendancePunch.create({data:{tenantId:tid,employeeId:input.employeeId,sourceId:input.sourceId,punchTime:input.punchTime,punchType:input.punchType,verificationType:'MANUAL',rawPayload:{...body,source:'MANUAL',actorId:ctx.user.id}}});
      const punches=await tx.attendancePunch.findMany({where:{tenantId:tid,employeeId:input.employeeId,punchTime:{gte:start,lt:end}},orderBy:{punchTime:'asc'}});
      const shiftEnd=zonedMinute(day,night?1440+shift.endMinute:shift.endMinute,shift.timezone);
      const calculated=calculateAttendance(punches.map(p=>({time:p.punchTime,type:p.punchType as 'IN'|'OUT'})),{shiftStart:zonedMinute(day,shift.startMinute,shift.timezone),shiftEnd,graceMinutes:shift.graceMinutes,earlyOutGraceMinutes:shift.earlyOutGraceMinutes,fullDayMinutes:shift.fullDayMinutes,halfDayMinutes:shift.halfDayMinutes,overtimeAfterMinutes:shift.overtimeAfterMinutes});
      const reportDate=new Date(day),payableUnits=attendancePayableUnits(calculated.status);
      await tx.attendanceDaily.upsert({where:{tenantId_employeeId_date:{tenantId:tid,employeeId:input.employeeId,date:reportDate}},create:{tenantId:tid,employeeId:input.employeeId,date:reportDate,shiftId:shift.id,scheduledMinutes:shift.fullDayMinutes,payableUnits,leaveUnits:0,dayType:'WORKING',exceptionCode:calculated.status==='MISSING_PUNCH'?'MISSING_PUNCH':'',...calculated},update:{shiftId:shift.id,scheduledMinutes:shift.fullDayMinutes,payableUnits,exceptionCode:calculated.status==='MISSING_PUNCH'?'MISSING_PUNCH':'',correctionNote:'',...calculated}});
      await tx.attendancePunch.updateMany({where:{tenantId:tid,id:{in:punches.map(p=>p.id)}},data:{processedAt:new Date()}});await audit(tx,ctx,'PUNCH_RECORDED','attendance',row.id,undefined,{employeeId:input.employeeId,punchTime:input.punchTime,punchType:input.punchType});return calculated;
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
  async leave(ctx:Context,method:string,body:any){
    const tid=tenant(ctx);requirePermission(ctx,'leave',method==='GET'?'VIEW':'CREATE');
    const scope=await employeeScope(this.db,ctx);
    if(method==='GET'){const visibleEmployeeIds=scope??(await this.db.employee.findMany({where:{tenantId:tid,deletedAt:null},select:{id:true}})).map(e=>e.id);return {items:await this.db.leaveRequest.findMany({where:{tenantId:tid,employeeId:{in:visibleEmployeeIds}},orderBy:{createdAt:'desc'},take:500})};}
    const input=leaveSchema.parse(body);await assertEmployee(this.db,ctx,input.employeeId);
    const autoApprove=['COMPANY_OWNER','HR_ADMIN','HR_EXECUTIVE'].includes(ctx.user.role.code)&&input.employeeId!==ctx.user.employeeId;
    const after=await this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${input.employeeId}::uuid AND tenant_id = ${tid}::uuid FOR UPDATE`;
      if(input.requestKey){const existing=await tx.leaveRequest.findFirst({where:{tenantId:tid,requestKey:input.requestKey}});if(existing)return existing;}
      const leaveType=await tx.leaveType.findFirst({where:{id:input.leaveTypeId,tenantId:tid}});if(!leaveType)throw new BadRequestException('Leave type not found.');
      const locked=await tx.attendancePeriodLock.findFirst({where:{tenantId:tid,month:{in:monthsCovered(input.startDate,input.endDate)},status:'LOCKED'}});if(locked)throw new ConflictException(`Attendance for ${locked.month} is locked. Unlock it before creating leave that changes payroll.`);
      const overlap=await tx.leaveRequest.count({where:{tenantId:tid,employeeId:input.employeeId,status:{in:['PENDING','APPROVED']},startDate:{lte:input.endDate},endDate:{gte:input.startDate}}});
      if(overlap)throw new ConflictException('This employee already has leave requested for these dates.');
      const employee=await tx.employee.findFirst({where:{tenantId:tid,id:input.employeeId},select:{shiftId:true}}),shift=employee?.shiftId?await tx.shift.findFirst({where:{tenantId:tid,id:employee.shiftId}}):await tx.shift.findFirst({where:{tenantId:tid},orderBy:{createdAt:'asc'}});
      if(!shift)throw new BadRequestException('Create a shift before requesting leave.');const workDays=workingDaySet(shift.workingDays);
      const holidays=await tx.calendarEvent.findMany({where:{tenantId:tid,kind:'HOLIDAY',date:{lte:input.endDate},OR:[{endDate:null},{endDate:{gte:input.startDate}}]}});const excluded=new Set<string>();
      for(const h of holidays){const end=h.endDate??h.date;for(let t=Math.max(+input.startDate,+h.date);t<=Math.min(+input.endDate,+end);t+=86400000)excluded.add(new Date(t).toISOString().slice(0,10));}let days=0;
      for(let t=+input.startDate;t<=+input.endDate;t+=86400000){const day=new Date(t);if(workDays.has(day.getUTCDay())&&!excluded.has(day.toISOString().slice(0,10)))days++;}
      if(input.halfDay)days=days?0.5:0;
      if(!days)throw new BadRequestException('There are no working days in the requested period.');
      const year=input.startDate.getUTCFullYear();
      const used=await tx.leaveRequest.aggregate({where:{tenantId:tid,employeeId:input.employeeId,leaveTypeId:input.leaveTypeId,status:{in:['PENDING','APPROVED']},startDate:{gte:new Date(`${year}-01-01`),lt:new Date(`${year+1}-01-01`)}},_sum:{days:true}});
      if(Number(used._sum.days??0)+days>Number(leaveType.annualDays))throw new BadRequestException('The request exceeds the annual leave allowance.');
      const {halfDay,...values}=input;
      const created=await tx.leaveRequest.create({data:{tenantId:tid,...values,days,...(autoApprove?{status:'APPROVED',reviewerId:ctx.user.id,reviewNote:'Assigned by HR'}:{})}});
      await audit(tx,ctx,autoApprove?'LEAVE_ASSIGNED':'LEAVE_REQUESTED','leave',created.id,undefined,created);return created;
    });
    await this.notifyLeaveReporting(ctx,after,autoApprove);
    if(autoApprove&&after.status==='APPROVED'){
      await this.closeOpenWorkForApprovedFullDayLeave(ctx,after);
      for(const month of monthsCovered(after.startDate,after.endDate))await reconcileAttendanceMonth(this.db,tid,month);
      const user=await this.db.user.findFirst({where:{tenantId:tid,employeeId:after.employeeId}});
      if(user){const notice=await this.db.notification.create({data:{tenantId:tid,userId:user.id,title:'Leave assigned',message:'HR assigned approved leave to your schedule.'}});sendPush(this.db,{tenantId:tid,userId:user.id,title:notice.title,body:notice.message,url:'/leave',tag:'tcw-'+notice.id}).catch(()=>{});}
    }
    return after;
  }
  async review(ctx:Context,type:string,recordId:string,body:any){
    const models:Record<string,string>={leave:'leaveRequest',expenses:'expenseClaim',travel:'travelRequest'};const model=models[type];if(!model)throw new NotFoundException();const tid=tenant(ctx);
    const input=z.object({decision:z.enum(['APPROVED','REJECTED']),note:z.string().max(1000).default('')}).strict().parse(body);requirePermission(ctx,type,input.decision==='APPROVED'?'APPROVE':'REJECT');let affectedMonths:string[]=[];
    const reviewed=await this.db.$transaction(async tx=>{
      const table=(tx as any)[model];const before=await table.findFirst({where:{id:id.parse(recordId),tenantId:tid}});if(!before)throw new NotFoundException();await assertEmployee(tx,ctx,before.employeeId);
      if(before.employeeId===ctx.user.employeeId)throw new ForbiddenException('You cannot approve your own request.');
      if(type==='leave'){affectedMonths=monthsCovered(before.startDate,before.endDate);const locked=await tx.attendancePeriodLock.findFirst({where:{tenantId:tid,month:{in:affectedMonths},status:'LOCKED'}});if(locked)throw new ConflictException(`Attendance for ${locked.month} is locked. Unlock it before reviewing this leave.`);}
      const data=type==='leave'?{status:input.decision,reviewerId:ctx.user.id,reviewNote:input.note}:{status:input.decision,reviewedBy:ctx.user.id};
      const result=await table.updateMany({where:{id:recordId,tenantId:tid,status:'PENDING'},data});if(result.count!==1)throw new ConflictException('This request has already been reviewed.');
      await audit(tx,ctx,`${type.toUpperCase()}_${input.decision}`,type,recordId,before,data);const user=await tx.user.findFirst({where:{tenantId:tid,employeeId:before.employeeId}});if(user){const notice=await tx.notification.create({data:{tenantId:tid,userId:user.id,title:`${type} ${input.decision.toLowerCase()}`,message:'Your request has been reviewed.'}});sendPush(this.db,{tenantId:tid,userId:user.id,title:notice.title,body:notice.message,url:type==='leave'?'/leave':'/notifications',tag:'tcw-'+notice.id}).catch(()=>{});}return table.findUnique({where:{id:recordId}});
    });
    if(type==='leave'&&input.decision==='APPROVED'){
      await this.closeOpenWorkForApprovedFullDayLeave(ctx,reviewed);
      for(const month of affectedMonths)await reconcileAttendanceMonth(this.db,tid,month);
    }
    return reviewed;
  }
  async payroll(ctx:Context,method:string,recordId?:string,action?:string,body:any={}){
    const tid=tenant(ctx);
    const permission=method==='GET'?'VIEW':action==='finalize'||action==='lock'||action==='approve'||action==='reopen'||action==='unlock'?'APPROVE':'CREATE';
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
        await tx.$queryRaw`SELECT id FROM payroll_runs WHERE id = ${id.parse(recordId)}::uuid AND tenant_id = ${tid}::uuid FOR UPDATE`;
        const run=await tx.payrollRun.findFirst({where:{id:recordId,tenantId:tid}});
        if(!run)throw new NotFoundException('Payroll run not found.');
        if(await tx.payrollPayout.count({where:{tenantId:tid,runId:recordId}}))throw new ConflictException('Payroll with payout records cannot be deleted.');
        if(!['DRAFT','REVIEW'].includes(run.status)||run.approvedBy||run.lockedAt)throw new ConflictException('Only an unfinalized payroll can be deleted. Reopen finalized payroll first.');
        await tx.payrollAdjustment.updateMany({where:{tenantId:tid,appliedRunId:recordId},data:{appliedRunId:null}});
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
      const after=await finalizePayrollMonth(this.db,tid,recordId,ctx.user.id);
      await audit(this.db,ctx,'PAYROLL_FINALIZED','payroll',recordId,before,after);
      if(before.status!=='LOCKED'){
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
    const original=await this.db.payrollRun.findFirst({where:{tenantId:tid,id:input.originalRunId,status:'LOCKED'}});
    if(!original||input.targetMonth<=original.month)throw new BadRequestException('Select a locked original run and a later adjustment month.');
    if(await this.db.payrollRun.findFirst({where:{tenantId:tid,month:input.targetMonth,status:{not:'DRAFT'}}}))throw new BadRequestException('The target month is already under review or finalized.');
    return this.db.$transaction(async tx=>{const row=await tx.payrollAdjustment.create({data:{tenantId:tid,...input}});await audit(tx,ctx,'PAYROLL_ADJUSTMENT_CREATED','payroll',row.id,undefined,row);return row;});
  }
  async workforce(ctx:Context,method:string,body:any){
    const tid=tenant(ctx);requirePermission(ctx,'workforce',method==='GET'?'VIEW':'CREATE');
    if(method==='GET'){
      const scope=await employeeScope(this.db,ctx);
      const employees=await this.db.employee.findMany({where:{tenantId:tid,deletedAt:null,...(scope?{id:{in:scope}}:{})},select:{id:true,firstName:true,lastName:true,departmentId:true}});
      const events=await this.db.activityEvent.findMany({where:{tenantId:tid,eventTime:{gte:new Date(Date.now()-24*3600000)},...(scope?{employeeId:{in:scope}}:{})},orderBy:{eventTime:'desc'},take:5000});
      return {items:employees.map(e=>{const latest=events.find(v=>v.employeeId===e.id);return {...e,event:latest,status:latest&&Date.now()-+latest.eventTime<120000?latest.status:'OFFLINE'};}),events};
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
