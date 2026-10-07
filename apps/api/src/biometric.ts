import {BadRequestException,ConflictException,ForbiddenException,NotFoundException} from '@nestjs/common';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {createConnection} from 'node:net';
import {z} from 'zod';
import type {Database} from '../../../packages/database';
import {attendancePayableUnits,attendancePunchDrivenBreaks,attendanceWorkdayDate,calculateAttendance,zonedMinute} from '../../../packages/attendance-engine';
import {normalizeZkAttLog,zkPushOptions} from '../../../packages/device-connectors/biomax';
import {audit,requirePermission,tenant,Context} from './context';
import {employeeShift} from './attendance-automation';

const mapInput=z.object({deviceUserId:z.string().trim().min(1).max(100),employeeId:z.string().uuid(),active:z.boolean().default(true)}).strict();
const pushEvent=z.object({
  eventId:z.string().trim().min(1).max(160),
  userId:z.string().trim().min(1).max(100),
  timestamp:z.iso.datetime().transform(v=>new Date(v)),
  type:z.enum(['IN','OUT','AUTO']).default('AUTO'),
  verification:z.enum(['FACE','FINGERPRINT','CARD','PIN','UNKNOWN']).default('UNKNOWN'),
  raw:z.unknown().optional()
}).strict();
const pushBody=z.union([z.array(pushEvent).min(1).max(500),z.object({punches:z.array(pushEvent).min(1).max(500)}).strict()]).transform(v=>Array.isArray(v)?v:v.punches);
type PunchEvent=z.infer<typeof pushEvent>;

const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const sameHash=(a:string,b:string)=>{const x=Buffer.from(a,'hex'),y=Buffer.from(b,'hex');return x.length===y.length&&timingSafeEqual(x,y);};
const cleanIp=(value?:string)=>String(value??'').replace(/^::ffff:/,'');
const shiftBreakWindow=(day:string,shift:any)=>{if(shift?.breakStartMinute==null||shift?.breakEndMinute==null)return null;const night=shift.endMinute<=shift.startMinute;let startMinute=Number(shift.breakStartMinute),endMinute=Number(shift.breakEndMinute);if(night&&startMinute<shift.startMinute)startMinute+=1440;if(night&&endMinute<shift.startMinute)endMinute+=1440;if(endMinute<=startMinute)endMinute+=1440;const shiftStart=zonedMinute(day,shift.startMinute,shift.timezone),shiftEnd=zonedMinute(day,night?1440+shift.endMinute:shift.endMinute,shift.timezone),start=new Date(Math.max(+shiftStart,+zonedMinute(day,startMinute,shift.timezone))),end=new Date(Math.min(+shiftEnd,+zonedMinute(day,endMinute,shift.timezone)));return end>start?{start,end}:null;};
const shiftForOpenPunch=async(tx:any,tenantId:string,employeeId:string,openPunch:any,fallback:any)=>{const attendance=await tx.attendanceDaily.findFirst({where:{tenantId,employeeId,firstIn:openPunch.punchTime,shiftId:{not:null}},select:{shiftId:true,date:true}});if(!attendance?.shiftId)return {shift:fallback,day:null};const historical=await tx.shift.findFirst({where:{tenantId,id:attendance.shiftId}});return historical?{shift:historical,day:attendance.date.toISOString().slice(0,10)}:{shift:fallback,day:null};};

export class BiometricService{
  constructor(public db:Database){}
  newSecret(){const secret=randomBytes(24).toString('base64url');return {secret,hash:digest(secret),hint:secret.slice(-6)};}

  async rotateSecret(ctx:Context,deviceId:string){
    const tid=tenant(ctx);requirePermission(ctx,'devices','MANAGE');
    const device=await this.db.attendanceDevice.findFirst({where:{id:deviceId,tenantId:tid}});if(!device)throw new NotFoundException('Device not found.');
    if(device.connectionMode==='EMPLOYEE_APP')throw new BadRequestException('Employee Mobile App uses account authentication and does not need a gateway key.');
    const key=this.newSecret();
    const after=await this.db.attendanceDevice.update({where:{id:device.id},data:{apiSecretHash:key.hash,apiSecretHint:key.hint,status:'AWAITING_CONNECTION',lastError:null}});
    await this.db.deviceSyncLog.create({data:{tenantId:tid,deviceId:device.id,action:'SECRET_ROTATED',message:'TCW gateway push secret was rotated.'}});
    await audit(this.db,ctx,'DEVICE_SECRET_ROTATED','devices',device.id,undefined,{serialNumber:device.serialNumber});
    return {device:this.safeDevice(after),pushSecret:key.secret,pushPath:'/api/biometric/push',legacyPushPath:'/api/biometric/biomax/push'};
  }

  safeDevice<T extends Record<string,any>>(row:T){const{apiSecretHash,...safe}=row;return safe;}

  async setup(ctx:Context,deviceId:string){
    const tid=tenant(ctx);requirePermission(ctx,'devices','VIEW');
    const device=await this.db.attendanceDevice.findFirst({where:{id:deviceId,tenantId:tid}});if(!device)throw new NotFoundException('Device not found.');
    const configured=(process.env.BIOMETRIC_PUBLIC_URL??'').trim();
    let serverAddress='',serverPort:number|null=null,secure=false;
    if(configured){
      try{const url=new URL(configured);serverAddress=url.hostname;serverPort=Number(url.port||((secure=url.protocol==='https:')?443:80));secure=url.protocol==='https:';}catch{throw new BadRequestException('BIOMETRIC_PUBLIC_URL is invalid.');}
    }
    return {
      device:this.safeDevice(device),
      protocol:'ZKTeco PUSH / ADMS compatible',
      serverUrl:configured||null,
      serverAddress:serverAddress||null,
      serverPort,
      secure,
      deviceSettings:{communicationProtocol:'PUSH Protocol',deviceType:'T&A PUSH',serverAddress:serverAddress||'Set BIOMETRIC_PUBLIC_URL in .env',serverPort:serverPort??'Set BIOMETRIC_PUBLIC_URL in .env'},
      endpoints:{register:'/iclock/cdata',attendance:'/iclock/cdata?table=ATTLOG',poll:'/iclock/getrequest',ack:'/iclock/devicecmd'},
      note:'Direct PUSH identifies a pre-registered device by its hardware serial number. Keep the endpoint behind HTTPS/firewall/VPN for internet deployments.'
    };
  }

  async mappings(ctx:Context,deviceId:string,body?:unknown){
    const tid=tenant(ctx);requirePermission(ctx,'devices',body?'MANAGE':'VIEW');
    const device=await this.db.attendanceDevice.findFirst({where:{id:deviceId,tenantId:tid}});if(!device)throw new NotFoundException('Device not found.');
    if(!body){
      const maps=await this.db.deviceEmployeeMap.findMany({where:{tenantId:tid,deviceId},orderBy:{createdAt:'desc'}});
      const ids=[...new Set(maps.map(m=>m.employeeId))];
      const employees=await this.db.employee.findMany({where:{tenantId:tid,id:{in:ids}},select:{id:true,employeeCode:true,firstName:true,lastName:true,status:true}});
      const byId=new Map(employees.map(e=>[e.id,e]));
      return {items:maps.map(m=>({...m,employee:byId.get(m.employeeId)??null}))};
    }
    const raw=body as any;
    if(raw?.operation==='REMOVE'){
      const mappingId=z.string().uuid().parse(raw.mappingId);
      const before=await this.db.deviceEmployeeMap.findFirst({where:{id:mappingId,tenantId:tid,deviceId}});if(!before)throw new NotFoundException('Mapping not found.');
      await this.db.deviceEmployeeMap.delete({where:{id:before.id}});await audit(this.db,ctx,'DEVICE_MAPPING_REMOVED','devices',deviceId,before);return {ok:true};
    }
    const input=mapInput.parse(body);
    const row=await this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM attendance_devices WHERE id = ${deviceId}::uuid AND tenant_id = ${tid}::uuid FOR UPDATE`;
      const employee=await tx.employee.findFirst({where:{id:input.employeeId,tenantId:tid,deletedAt:null}});if(!employee)throw new BadRequestException('Employee not found.');
      const duplicate=await tx.deviceEmployeeMap.findFirst({where:{tenantId:tid,deviceId,deviceUserId:input.deviceUserId,employeeId:{not:input.employeeId}}});if(duplicate)throw new ConflictException('This device user ID is already linked to another employee. Remove or update that mapping first.');
      return tx.deviceEmployeeMap.upsert({where:{tenantId_deviceId_employeeId:{tenantId:tid,deviceId,employeeId:input.employeeId}},create:{tenantId:tid,deviceId,employeeId:input.employeeId,deviceUserId:input.deviceUserId,active:input.active},update:{deviceUserId:input.deviceUserId,active:input.active,lastSyncedAt:new Date()}});
    });
    await audit(this.db,ctx,'DEVICE_MAPPING_SAVED','devices',deviceId,undefined,{employeeId:input.employeeId,deviceUserId:input.deviceUserId});return row;
  }

  async logs(ctx:Context,deviceId:string){
    const tid=tenant(ctx);requirePermission(ctx,'devices','VIEW');
    if(!await this.db.attendanceDevice.findFirst({where:{id:deviceId,tenantId:tid}}))throw new NotFoundException('Device not found.');
    return {items:await this.db.deviceSyncLog.findMany({where:{tenantId:tid,deviceId},orderBy:{createdAt:'desc'},take:150})};
  }

  async punches(ctx:Context,deviceId:string){
    const tid=tenant(ctx);requirePermission(ctx,'devices','VIEW');
    if(!await this.db.attendanceDevice.findFirst({where:{id:deviceId,tenantId:tid}}))throw new NotFoundException('Device not found.');
    const rows=await this.db.attendancePunch.findMany({where:{tenantId:tid,deviceId},orderBy:{punchTime:'desc'},take:100});
    const employeeIds=[...new Set(rows.map(r=>r.employeeId))];
    const employees=await this.db.employee.findMany({where:{tenantId:tid,id:{in:employeeIds}},select:{id:true,employeeCode:true,firstName:true,lastName:true}});
    const byId=new Map(employees.map(e=>[e.id,e]));
    return {items:rows.map(row=>({...row,employee:byId.get(row.employeeId)??null}))};
  }

  async test(ctx:Context,deviceId:string){
    const tid=tenant(ctx);requirePermission(ctx,'devices','MANAGE');
    const row=await this.db.attendanceDevice.findFirst({where:{id:deviceId,tenantId:tid}});if(!row)throw new NotFoundException('Device not found.');
    const recordStatus=async(status:string,message:string)=>{await this.db.attendanceDevice.update({where:{id:row.id},data:{status}});await this.db.deviceSyncLog.create({data:{tenantId:tid,deviceId:row.id,action:'CONNECTION_TEST',level:status==='AWAITING_CONNECTION'?'WARN':'INFO',message}});};
    if(row.connectionMode==='EMPLOYEE_APP'){
      const seen=row.lastSeenAt&&Date.now()-+row.lastSeenAt<24*60*60_000;
      const status=seen?'ONLINE':'READY',message=seen?'Employee Mobile App Face Scan was used recently.':'Employee Mobile App Face Scan is enabled and ready for employees.';await recordStatus(status,message);return {online:true,status,message,lastSeenAt:row.lastSeenAt};
    }
    if(['CLOUD_PUSH','NATIVE_PUSH','MIDDLEWARE'].includes(row.connectionMode)){
      const seen=row.lastSeenAt&&Date.now()-+row.lastSeenAt<10*60_000;
      const status=seen?'ONLINE':'AWAITING_CONNECTION',message=seen?'Recent biometric heartbeat/punch received.':'Push receiver is ready; waiting for the device to connect.';await recordStatus(status,message);return {online:!!seen,status,message,lastSeenAt:row.lastSeenAt};
    }
    if(!row.host)throw new BadRequestException('LAN/Wi-Fi mode requires the device IP/hostname.');
    const online=await new Promise<boolean>(resolve=>{const sock=createConnection({host:row.host,port:row.port});const finish=(v:boolean)=>{sock.destroy();resolve(v)};sock.setTimeout(2500);sock.once('connect',()=>finish(true));sock.once('timeout',()=>finish(false));sock.once('error',()=>finish(false));});
    await this.db.attendanceDevice.update({where:{id:row.id},data:{status:online?'ONLINE':'OFFLINE',lastError:online?null:'TCP connection failed.'}});
    await this.db.deviceSyncLog.create({data:{tenantId:tid,deviceId:row.id,level:online?'INFO':'WARN',action:'CONNECTION_TEST',message:online?'Device TCP port is reachable.':'Device TCP port is not reachable.'}});
    return {online,status:online?'ONLINE':'OFFLINE',message:online?'LAN/Wi-Fi connection reachable.':'Could not reach the device. Check IP, port, firewall and network.'};
  }

  /** Vendor-neutral secure TCW gateway endpoint for middleware/custom REST integrations. */
  async genericPush(headers:Record<string,any>,body:unknown){
    const serial=String(headers['x-tcw-device-serial']??headers['x-device-serial']??'').trim();
    const secret=String(headers['x-tcw-device-key']??headers['x-device-key']??'').trim();
    if(!serial||!secret)throw new ForbiddenException('Device serial and push key are required.');
    const devices=await this.db.attendanceDevice.findMany({where:{serialNumber:serial},take:2});
    const device=devices.length===1?devices[0]:null;
    if(!device||!device.apiSecretHash||!sameHash(device.apiSecretHash,digest(secret)))throw new ForbiddenException('Invalid device credentials.');
    await this.assertCompanyActive(device.tenantId);
    const events=pushBody.parse(body);
    return this.ingestEvents(device,events,'GENERIC_GATEWAY');
  }

  /** Backward-compatible BioMax-specific TCW gateway endpoint. */
  async biomaxPush(headers:Record<string,any>,body:unknown){
    const serial=String(headers['x-tcw-device-serial']??headers['x-device-serial']??'').trim();
    const secret=String(headers['x-tcw-device-key']??headers['x-device-key']??'').trim();
    if(!serial||!secret)throw new ForbiddenException('Device serial and push key are required.');
    const devices=await this.db.attendanceDevice.findMany({where:{serialNumber:serial,vendor:'BIOMAX'},take:2});
    const device=devices.length===1?devices[0]:null;
    if(!device||!device.apiSecretHash||!sameHash(device.apiSecretHash,digest(secret)))throw new ForbiddenException('Invalid device credentials.');
    await this.assertCompanyActive(device.tenantId);
    const events=pushBody.parse(body);
    return this.ingestEvents(device,events,'TCW_GATEWAY');
  }

  /** Common ZKTeco PUSH / ADMS registration call used by BioMax Push Data devices. */
  async nativeOptions(serial:string,ip?:string){
    const device=await this.nativeDevice(serial,ip,'REGISTER');
    return {text:zkPushOptions(device.serialNumber),tenantId:device.tenantId,deviceId:device.id};
  }

  async nativeCdata(serial:string,table:string|undefined,body:string,ip?:string){
    const device=await this.nativeDevice(serial,ip,'CDATA');
    const normalizedTable=String(table??'').toUpperCase();
    if(normalizedTable==='ATTLOG'){
      const events=normalizeZkAttLog(device.serialNumber,body,device.timezone).map(event=>pushEvent.parse(event));
      if(body.trim()&&!events.length)throw new BadRequestException('BioMax attendance payload could not be parsed; the device will retry.');
      const result=events.length?await this.ingestEvents(device,events,'ZK_PUSH'):{received:0,accepted:0,duplicates:0,unmapped:0,failed:0};
      return {text:`OK: ${events.length}`,tenantId:device.tenantId,deviceId:device.id,result};
    }
    const count=body.trim()?body.trim().split(/\r?\n/).filter(Boolean).length:0;
    await this.db.deviceSyncLog.create({data:{tenantId:device.tenantId,deviceId:device.id,level:'INFO',action:`NATIVE_${normalizedTable||'DATA'}`,message:`Received ${count} ${normalizedTable||'device'} record(s).`,details:{protocol:'ZK_PUSH',bytes:Buffer.byteLength(body,'utf8')}}});
    return {text:`OK: ${count}`,tenantId:device.tenantId,deviceId:device.id};
  }

  async nativePoll(serial:string,ip?:string){
    const device=await this.nativeDevice(serial,ip,'POLL');
    return {text:'OK',tenantId:device.tenantId,deviceId:device.id};
  }

  async nativeCommandAck(serial:string,body:string,ip?:string){
    const device=await this.nativeDevice(serial,ip,'COMMAND_ACK');
    await this.db.deviceSyncLog.create({data:{tenantId:device.tenantId,deviceId:device.id,action:'DEVICE_COMMAND_ACK',message:'Device command acknowledgement received.',details:{bytes:Buffer.byteLength(body,'utf8')}}});
    return {text:'OK',tenantId:device.tenantId,deviceId:device.id};
  }

  async nativeRegistry(serial:string,body:string,ip?:string){
    const device=await this.nativeDevice(serial,ip,'REGISTRY');
    await this.db.deviceSyncLog.create({data:{tenantId:device.tenantId,deviceId:device.id,action:'NATIVE_REGISTRY',message:'Device capability/registry payload received.',details:{bytes:Buffer.byteLength(body,'utf8')}}});
    return {text:'OK',tenantId:device.tenantId,deviceId:device.id};
  }

  async nativePing(serial:string,ip?:string){
    const device=await this.nativeDevice(serial,ip,'PING');
    return {text:'OK',tenantId:device.tenantId,deviceId:device.id};
  }

  private async nativeDevice(serial:string,ip:string|undefined,action:string){
    serial=String(serial??'').trim();if(!serial||serial.length>200)throw new BadRequestException('Device serial is required.');
    const matches=await this.db.attendanceDevice.findMany({where:{serialNumber:serial,vendor:'BIOMAX'},take:2});
    if(!matches.length)throw new NotFoundException('This BioMax serial is not registered in TCW HR Software.');
    if(matches.length>1)throw new ConflictException('This BioMax serial is registered to more than one company. Resolve the duplicate before enabling direct PUSH.');
    const device=matches[0];
    if(!['NATIVE_PUSH','CLOUD_PUSH'].includes(device.connectionMode))throw new ForbiddenException('This device is not enabled for direct PUSH mode.');
    await this.assertCompanyActive(device.tenantId);
    const sourceIp=cleanIp(ip);
    if(process.env.BIOMAX_ENFORCE_SOURCE_IP==='true'&&device.host&&cleanIp(device.host)!==sourceIp)throw new ForbiddenException('Device source IP does not match its registered host.');
    const now=new Date(),wasOnline=device.lastSeenAt&&Date.now()-+device.lastSeenAt<10*60_000,wasOffline=device.status==='OFFLINE';
    await this.db.attendanceDevice.update({where:{id:device.id},data:{status:'ONLINE',lastSeenAt:now,lastError:null}});
    if(!wasOnline||action==='REGISTER')await this.db.deviceSyncLog.create({data:{tenantId:device.tenantId,deviceId:device.id,action:action==='REGISTER'?'NATIVE_REGISTER':'DEVICE_ONLINE',message:`BioMax direct PUSH ${action.toLowerCase()} received${sourceIp?` from ${sourceIp}`:''}.`,details:{protocol:'ZK_PUSH',sourceIp}}});
    if(wasOffline)await this.db.notification.create({data:{tenantId:device.tenantId,title:'Attendance device back online',message:`${device.name} (${device.serialNumber}) reconnected successfully. Pending device logs can now sync.`}}).catch(()=>{});
    return device;
  }

  private async assertCompanyActive(tenantId:string){
    const company=await this.db.tenant.findUnique({where:{id:tenantId}});
    if(!company||!['ACTIVE','TRIAL'].includes(company.status)||!!(company.expiresAt&&company.expiresAt<new Date()))throw new ForbiddenException('Company access is not active.');
  }

  private async mappingFor(device:any,userId:string){
    let mapping=await this.db.deviceEmployeeMap.findFirst({where:{tenantId:device.tenantId,deviceId:device.id,deviceUserId:userId,active:true}});
    if(mapping||process.env.BIOMAX_AUTO_MAP_EMPLOYEE_CODE==='false')return mapping;
    const employee=await this.db.employee.findFirst({where:{tenantId:device.tenantId,employeeCode:{equals:userId,mode:'insensitive'},deletedAt:null}});
    if(!employee)return null;
    try{
      mapping=await this.db.deviceEmployeeMap.create({data:{tenantId:device.tenantId,deviceId:device.id,employeeId:employee.id,deviceUserId:userId,active:true,lastSyncedAt:new Date()}});
      await this.db.deviceSyncLog.create({data:{tenantId:device.tenantId,deviceId:device.id,action:'AUTO_MAPPING',message:`Auto-mapped device user ${userId} to employee ${employee.employeeCode}.`,details:{employeeId:employee.id}}});
      return mapping;
    }catch{return this.db.deviceEmployeeMap.findFirst({where:{tenantId:device.tenantId,deviceId:device.id,deviceUserId:userId,active:true}});}
  }

  private async ingestEvents(device:any,events:PunchEvent[],source:string){
    let accepted=0,duplicates=0,unmapped=0,failed=0;
    for(const event of events){
      try{
        const mapping=await this.mappingFor(device,event.userId);
        if(!mapping){unmapped++;await this.db.deviceSyncLog.create({data:{tenantId:device.tenantId,deviceId:device.id,level:'WARN',action:'UNMAPPED_PUNCH',message:`No employee mapping for device user ${event.userId}.`,details:{source,eventId:event.eventId,deviceUserId:event.userId,timestamp:event.timestamp.toISOString()}}});continue;}
        const result=await this.processPunch(device,mapping.employeeId,event,source);
        if(result.duplicate)duplicates++;else accepted++;
      }catch(error:any){failed++;await this.db.deviceSyncLog.create({data:{tenantId:device.tenantId,deviceId:device.id,level:'ERROR',action:'PUNCH_FAILED',message:String(error?.message??'Punch processing failed').slice(0,500),details:{source,eventId:event.eventId,deviceUserId:event.userId}}});}
    }
    const now=new Date();await this.db.attendanceDevice.update({where:{id:device.id},data:{status:failed?'DEGRADED':'ONLINE',lastSeenAt:now,lastSync:now,lastError:failed?`${failed} event(s) failed.`:null}});
    await this.db.deviceSyncLog.create({data:{tenantId:device.tenantId,deviceId:device.id,level:failed?'WARN':'INFO',action:source==='ZK_PUSH'?'NATIVE_ATTLOG':'PUSH_BATCH',message:`Received ${events.length} event(s): ${accepted} accepted, ${duplicates} duplicate, ${unmapped} unmapped, ${failed} failed.`,details:{source}}});
    return {ok:true,received:events.length,accepted,duplicates,unmapped,failed};
  }

  private async processPunch(device:any,employeeId:string,event:PunchEvent,source='BIOMAX_GATEWAY'){
    if(event.timestamp.getTime()>Date.now()+300000||event.timestamp.getTime()<Date.now()-366*86400000)throw new BadRequestException('Punch timestamp is outside the accepted range.');
    const tid=device.tenantId;const sourceId=`BIOMAX:${device.serialNumber}:${event.eventId}`;
    const existing=await this.db.attendancePunch.findUnique({where:{tenantId_sourceId:{tenantId:tid,sourceId}}});if(existing)return {duplicate:true};
    let shift=await employeeShift(this.db,tid,employeeId);let day=attendanceWorkdayDate(event.timestamp,shift.startMinute,shift.endMinute,shift.timezone);let night=shift.endMinute<=shift.startMinute;
    let start=zonedMinute(day,night?shift.startMinute-240:0,shift.timezone),end=zonedMinute(day,night?1440+shift.startMinute-240:1440,shift.timezone);
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${employeeId}::uuid AND tenant_id = ${tid}::uuid FOR UPDATE`;
      const statePunches=(await tx.attendancePunch.findMany({where:{tenantId:tid,employeeId,punchTime:{lte:event.timestamp}},orderBy:{punchTime:'desc'},take:200})).reverse(),validState=statePunches.filter(p=>p.verificationType!=='FACE_SCAN'||['IN','OUT'].includes(String((p.rawPayload as any)?.intent??'')));let open:any=null;for(const p of validState){if(p.punchType==='IN'){if(!open)open=p}else if(open)open=null}
      const inferred=event.type==='AUTO'?(open?'OUT':'IN'):event.type;
      if(inferred==='OUT'&&open){const resolved=await shiftForOpenPunch(tx,tid,employeeId,open,shift);shift=resolved.shift;day=resolved.day??attendanceWorkdayDate(open.punchTime,shift.startMinute,shift.endMinute,shift.timezone);night=shift.endMinute<=shift.startMinute;const scheduledStart=zonedMinute(day,night?shift.startMinute-240:0,shift.timezone);start=new Date(Math.min(+scheduledStart,+open.punchTime-60000));const scheduledEnd=zonedMinute(day,night?1440+shift.startMinute-240:1440,shift.timezone);end=new Date(Math.max(+scheduledEnd,event.timestamp.getTime()+300000));}
      const reportDate=new Date(day),targetAttendance=await tx.attendanceDaily.findUnique({where:{tenantId_employeeId_date:{tenantId:tid,employeeId,date:reportDate}}});if(targetAttendance?.shiftId===shift.id&&targetAttendance.firstIn)start=new Date(targetAttendance.firstIn.getTime()-60000);else if(inferred==='IN')start=new Date(event.timestamp.getTime()-60000);
      const recent=await tx.attendancePunch.findMany({where:{tenantId:tid,employeeId,punchTime:{gte:start,lt:end}},orderBy:{punchTime:'asc'}});
      const month=day.slice(0,7),period=await tx.attendancePeriodLock.findUnique({where:{tenantId_month:{tenantId:tid,month}}});
      const row=await tx.attendancePunch.create({data:{tenantId:tid,employeeId,deviceId:device.id,sourceId,punchTime:event.timestamp,punchType:inferred,verificationType:event.verification==='FACE'?'FACE_DEVICE':event.verification==='FINGERPRINT'?'FINGERPRINT_DEVICE':event.verification==='CARD'?'CARD_DEVICE':event.verification==='PIN'?'PIN_DEVICE':'BIOMETRIC_DEVICE',processedAt:period?.status==='LOCKED'?new Date():null,rawPayload:{source,eventId:event.eventId,deviceUserId:event.userId,attendanceLocked:period?.status==='LOCKED',raw:event.raw??null}}});
      if(period?.status==='LOCKED'){
        await tx.deviceSyncLog.create({data:{tenantId:tid,deviceId:device.id,level:'WARN',action:'LOCKED_PERIOD_PUNCH',message:`Punch retained but ${month} attendance is locked. Unlock and reconcile to apply it.`,details:{employeeId,eventId:event.eventId,timestamp:event.timestamp.toISOString()}}});
        return {duplicate:false,locked:true};
      }
      const punches=[...recent,row].sort((a,b)=>+a.punchTime-+b.punchTime),shiftEnd=zonedMinute(day,night?1440+shift.endMinute:shift.endMinute,shift.timezone),breakWindow=shiftBreakWindow(day,shift);
      const calculated=calculateAttendance(punches.map(p=>({time:p.punchTime,type:p.punchType as 'IN'|'OUT'})),{shiftStart:zonedMinute(day,shift.startMinute,shift.timezone),shiftEnd,breakStart:attendancePunchDrivenBreaks(shift,punches)?undefined:breakWindow?.start,breakEnd:attendancePunchDrivenBreaks(shift,punches)?undefined:breakWindow?.end,graceMinutes:shift.graceMinutes,earlyOutGraceMinutes:shift.earlyOutGraceMinutes,fullDayMinutes:shift.fullDayMinutes,halfDayMinutes:shift.halfDayMinutes,overtimeAfterMinutes:shift.overtimeAfterMinutes});
      const payableUnits=attendancePayableUnits(calculated.status);
      await tx.attendanceDaily.upsert({where:{tenantId_employeeId_date:{tenantId:tid,employeeId,date:reportDate}},create:{tenantId:tid,employeeId,date:reportDate,shiftId:shift.id,scheduledMinutes:shift.fullDayMinutes,payableUnits,leaveUnits:0,dayType:'WORKING',exceptionCode:calculated.status==='MISSING_PUNCH'?'MISSING_PUNCH':'',...calculated},update:{shiftId:shift.id,scheduledMinutes:shift.fullDayMinutes,payableUnits,exceptionCode:calculated.status==='MISSING_PUNCH'?'MISSING_PUNCH':'',correctionNote:'',...calculated}});
      await tx.attendancePunch.updateMany({where:{tenantId:tid,id:{in:punches.map(p=>p.id)}},data:{processedAt:new Date()}});return {duplicate:false};
    });
  }
}

