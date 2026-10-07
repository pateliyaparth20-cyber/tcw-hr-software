import {BadRequestException,ConflictException,ForbiddenException,NotFoundException} from '@nestjs/common';
import {z} from 'zod';
import {Prisma} from '@prisma/client';
import type {Database} from '../../../packages/database';
import {attendanceCalculationPunches} from '../../../packages/attendance-engine';
import {assertEmployee,audit,Context,employeeScope,requirePermission,tenant} from './context';
export const fieldPolicySchema=z.object({enabled:z.boolean(),intervalSeconds:z.number().int().min(15).max(300),maxAccuracyMeters:z.number().int().min(20).max(500),maxSessionHours:z.number().int().min(1).max(12),employeeIds:z.array(z.string().uuid()).max(500)}).strict();
export const fieldPointSchema=z.object({latitude:z.number().finite().min(-90).max(90),longitude:z.number().finite().min(-180).max(180),accuracy:z.number().finite().positive().max(5000),capturedAt:z.string().datetime()}).strict();
type Point=z.infer<typeof fieldPointSchema>;
const defaults={enabled:false,intervalSeconds:30,maxAccuracyMeters:100,maxSessionHours:10,employeeIds:[] as string[]};
export function metersBetween(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}){const rad=(v:number)=>v*Math.PI/180,dlat=rad(b.latitude-a.latitude),dlon=rad(b.longitude-a.longitude),h=Math.sin(dlat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dlon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
function openDutyPunch(punches:any[],now=new Date()){
 let open:any=null;for(const p of attendanceCalculationPunches(punches)){if(p.punchType==='IN'){if(!open)open=p;}else if(p.punchType==='OUT'&&open)open=null;}
 return open&&+now-+open.punchTime<=24*3600000?open:null;
}
function validatePoint(point:Point,policy:typeof defaults,now=new Date()){const age=+now-Date.parse(point.capturedAt);if(age>60000||age< -10000)throw new BadRequestException('Location is stale. Capture a fresh GPS position.');if(point.accuracy>policy.maxAccuracyMeters)throw new BadRequestException(`GPS accuracy must be within ${policy.maxAccuracyMeters} metres. Enable precise location, move outside and retry.`);}
export async function closeFieldSessions(db:any,tid:string,employeeId:string,reason:string){const now=new Date();await db.fieldVisit.updateMany({where:{tenantId:tid,employeeId,status:'ACTIVE'},data:{status:'INCOMPLETE',completedAt:now,outcome:reason}});await db.fieldWorkSession.updateMany({where:{tenantId:tid,employeeId,endedAt:null},data:{endedAt:now,endReason:reason}});}
export async function cleanFieldWork(db:Database){
 const now=new Date(),sessions=await db.fieldWorkSession.findMany({where:{endedAt:null},take:1000});
 for(const s of sessions)await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM employees WHERE tenant_id=${s.tenantId}::uuid AND id=${s.employeeId}::uuid FOR UPDATE`;
  const current=await tx.fieldWorkSession.findFirst({where:{id:s.id,endedAt:null}});if(!current)return;
  let reason=current.expiresAt<=now?'SESSION_EXPIRED':'';
  if(!reason){const policy=await tx.fieldWorkPolicy.findUnique({where:{tenantId:s.tenantId}});if(!policy?.enabled||(policy.employeeIds.length&&!policy.employeeIds.includes(s.employeeId)))reason='POLICY_DISABLED';}
  if(!reason){const punches=(await tx.attendancePunch.findMany({where:{tenantId:s.tenantId,employeeId:s.employeeId,punchTime:{lte:now}},orderBy:{punchTime:'desc'},take:200})).reverse();const latest=openDutyPunch(punches,now);if(!latest||latest.punchType!=='IN'||latest.id!==current.attendanceInId||+now-+latest.punchTime>24*3600000)reason='ATTENDANCE_CHECKOUT';}
  if(reason)await closeFieldSessions(tx,s.tenantId,s.employeeId,reason);
 });
 const cutoff=new Date(+now-30*86400000);await db.fieldLocationPoint.deleteMany({where:{receivedAt:{lt:cutoff}}});await db.fieldVisit.deleteMany({where:{createdAt:{lt:cutoff},status:{in:['COMPLETED','CANCELLED','INCOMPLETE']}}});await db.fieldWorkSession.deleteMany({where:{startedAt:{lt:cutoff},endedAt:{not:null}}});await db.faceCaptureChallenge.deleteMany({where:{createdAt:{lt:new Date(+now-86400000)}}});
 // Pending biometric review images also expire; the employee can submit fresh setup.
 await db.employeeFaceProfile.updateMany({where:{status:'PENDING',enrolledAt:{lt:cutoff}},data:{status:'REJECTED',reviewCiphertext:null}});
}
export class FieldWork {
 constructor(private db:Database){}
 private own(ctx:Context){if(ctx.user.role.code!=='EMPLOYEE'||!ctx.user.employeeId)throw new ForbiddenException('Use your linked Employee account for field check-ins.');return ctx.user.employeeId as string;}
 async policy(ctx:Context){return await this.db.fieldWorkPolicy.findUnique({where:{tenantId:tenant(ctx)}})??defaults;}
 private async duty(db:any,tid:string,eid:string){const punches=(await db.attendancePunch.findMany({where:{tenantId:tid,employeeId:eid,punchTime:{lte:new Date()}},orderBy:{punchTime:'desc'},take:200})).reverse();return openDutyPunch(punches);}
 private allowed(policy:typeof defaults,eid:string){if(!policy.enabled||(policy.employeeIds.length&&!policy.employeeIds.includes(eid)))throw new ForbiddenException('Field work is not enabled for this employee. Ask HR to review company field settings.');}
 private async active(tx:any,ctx:Context,policy:typeof defaults){const tid=tenant(ctx),eid=this.own(ctx);policy=await tx.fieldWorkPolicy.findUnique({where:{tenantId:tid}})??defaults;const session=await tx.fieldWorkSession.findFirst({where:{tenantId:tid,employeeId:eid,endedAt:null}});if(!session||session.expiresAt<=new Date())throw new ConflictException('Start a new field session before sharing a location or checking in.');this.allowed(policy,eid);if((await this.duty(tx,tid,eid))?.id!==session.attendanceInId)throw new ConflictException('Field tracking requires an open attendance IN. Check in before continuing.');return session;}
 private async lock(tx:any,tid:string,eid:string){await tx.$queryRaw`SELECT tenant_id FROM field_work_policies WHERE tenant_id=${tid}::uuid FOR UPDATE`;await tx.$queryRaw`SELECT id FROM employees WHERE tenant_id=${tid}::uuid AND id=${eid}::uuid FOR UPDATE`;}
 async handle(ctx:Context,method:string,body:any,query:any,key?:string,action?:string){
  const tid=tenant(ctx);requirePermission(ctx,'workforce','VIEW');const policy=await this.policy(ctx);
  if(key==='settings'){
   if(method==='GET')return {policy,retentionDays:30};
   if(method==='PUT'){requirePermission(ctx,'company','EDIT');const input=fieldPolicySchema.parse(body);if(new Set(input.employeeIds).size!==input.employeeIds.length)throw new BadRequestException('Select each employee only once.');for(const eid of input.employeeIds)await assertEmployee(this.db,ctx,eid);
    return this.db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tid}::uuid FOR UPDATE`;const row=await tx.fieldWorkPolicy.upsert({where:{tenantId:tid},create:{tenantId:tid,...input},update:input});const sessions=await tx.fieldWorkSession.findMany({where:{tenantId:tid,endedAt:null}});for(const s of sessions)if(!input.enabled||(input.employeeIds.length&&!input.employeeIds.includes(s.employeeId)))await closeFieldSessions(tx,tid,s.employeeId,'POLICY_DISABLED');await audit(tx,ctx,'FIELD_POLICY_UPDATED','field-work',tid,policy,input);return {policy:row,retentionDays:30};});
   }
  }
  if(key==='session'){
   const eid=this.own(ctx);await assertEmployee(this.db,ctx,eid);
   if(method==='GET'){const session=await this.db.fieldWorkSession.findFirst({where:{tenantId:tid,employeeId:eid,endedAt:null,expiresAt:{gt:new Date()}}});return {session:session&&(await this.duty(this.db,tid,eid))?.id===session.attendanceInId?session:null,policy,eligible:policy.enabled&&(!policy.employeeIds.length||policy.employeeIds.includes(eid))};}
   if(method==='POST'){
    const input=z.object({consent:z.literal(true),point:fieldPointSchema}).strict().parse(body);this.allowed(policy,eid);validatePoint(input.point,policy);
    return this.db.$transaction(async tx=>{await this.lock(tx,tid,eid);await tx.$queryRaw`SELECT tenant_id FROM field_work_policies WHERE tenant_id=${tid}::uuid FOR UPDATE`;const lockedPolicy=await tx.fieldWorkPolicy.findUnique({where:{tenantId:tid}})??defaults;this.allowed(lockedPolicy,eid);validatePoint(input.point,lockedPolicy);const duty=await this.duty(tx,tid,eid);if(!duty)throw new ConflictException('Check in to attendance before starting field work.');const prior=await tx.fieldWorkSession.findFirst({where:{tenantId:tid,employeeId:eid,endedAt:null}});if(prior&&prior.expiresAt>new Date()&&prior.attendanceInId===duty.id)return {session:prior};if(prior)await closeFieldSessions(tx,tid,eid,prior.expiresAt<=new Date()?'SESSION_EXPIRED':'ATTENDANCE_CHECKOUT');const session=await tx.fieldWorkSession.create({data:{tenantId:tid,employeeId:eid,attendanceInId:duty.id,expiresAt:new Date(Date.now()+lockedPolicy.maxSessionHours*3600000)}});await tx.fieldLocationPoint.create({data:{tenantId:tid,employeeId:eid,sessionId:session.id,...input.point,capturedAt:new Date(input.point.capturedAt)}});await audit(tx,ctx,'FIELD_SHARING_STARTED','field-work',session.id,undefined,{employeeId:eid,consent:true,expiresAt:session.expiresAt});return {session};});
   }
   if(method==='DELETE')return this.db.$transaction(async tx=>{await this.lock(tx,tid,eid);await closeFieldSessions(tx,tid,eid,'EMPLOYEE_STOPPED');await audit(tx,ctx,'FIELD_SHARING_STOPPED','field-work',eid);return {ok:true};});
  }
  if(key==='point'&&method==='POST'){
   const eid=this.own(ctx),input=z.object({sessionId:z.string().uuid(),point:fieldPointSchema}).strict().parse(body);validatePoint(input.point,policy);await assertEmployee(this.db,ctx,eid);
   return this.db.$transaction(async tx=>{await this.lock(tx,tid,eid);const lockedPolicy=await tx.fieldWorkPolicy.findUnique({where:{tenantId:tid}})??defaults;validatePoint(input.point,lockedPolicy);const s=await this.active(tx,ctx,lockedPolicy);if(s.id!==input.sessionId)throw new ConflictException('This field session is no longer active.');const latest=await tx.fieldLocationPoint.findFirst({where:{tenantId:tid,sessionId:s.id},orderBy:{capturedAt:'desc'}});if(latest&&Date.parse(input.point.capturedAt)<=+latest.capturedAt)return {ok:true,duplicate:true};if(latest&&Date.now()-+latest.receivedAt<lockedPolicy.intervalSeconds*1000-1000)return {ok:true,throttled:true};await tx.fieldLocationPoint.create({data:{tenantId:tid,employeeId:eid,sessionId:s.id,...input.point,capturedAt:new Date(input.point.capturedAt)}});return {ok:true};});
  }
  const scope=await employeeScope(this.db,ctx),eid=query.employeeId?z.string().uuid().parse(query.employeeId):undefined;if(eid)await assertEmployee(this.db,ctx,eid);const employeeWhere={tenantId:tid,deletedAt:null,...(eid?{id:eid}:scope?{id:{in:scope}}:{})};
  if(!key&&method==='GET'){
   const employees=await this.db.employee.findMany({where:employeeWhere,select:{id:true,firstName:true,lastName:true,employeeCode:true},orderBy:{employeeCode:'asc'},take:500}),now=new Date();
   const sessions=await this.db.fieldWorkSession.findMany({where:{tenantId:tid,employeeId:{in:employees.map(e=>e.id)},endedAt:null,expiresAt:{gt:now}}});
   const sessionByEmployee=new Map(sessions.map(s=>[s.employeeId,s])),points=new Map<string,any>(),duties=new Map<string,any>();
   if(sessions.length){
    const sessionIds=Prisma.join(sessions.map(s=>Prisma.sql`${s.id}::uuid`)),employeeIds=Prisma.join(sessions.map(s=>Prisma.sql`${s.employeeId}::uuid`));
    const lastPoints=await this.db.$queryRaw<any[]>`SELECT DISTINCT ON(session_id) id, session_id AS "sessionId", latitude, longitude, accuracy, captured_at AS "capturedAt", received_at AS "receivedAt" FROM field_location_points WHERE tenant_id=${tid}::uuid AND session_id IN (${sessionIds}) ORDER BY session_id, received_at DESC`;
    for(const p of lastPoints)points.set(p.sessionId,p);
    const punches=await this.db.$queryRaw<any[]>`SELECT id, "employeeId" AS "employeeId", "punchTime" AS "punchTime", "punchType" AS "punchType", "verificationType" AS "verificationType", "rawPayload" AS "rawPayload" FROM (SELECT id,"employeeId","punchTime","punchType","verificationType","rawPayload",ROW_NUMBER() OVER(PARTITION BY "employeeId" ORDER BY "punchTime" DESC) AS rank FROM attendance_punches WHERE tenant_id=${tid}::uuid AND "employeeId" IN (${employeeIds}) AND "punchTime" BETWEEN ${new Date(+now-24*3600000)} AND ${now}) AS recent WHERE rank<=200 ORDER BY "punchTime" ASC`;
    for(const s of sessions)duties.set(s.employeeId,openDutyPunch(punches.filter(p=>p.employeeId===s.employeeId),now));
   }
   const items=employees.map(e=>{const s=sessionByEmployee.get(e.id),working=!!s&&duties.get(e.id)?.id===s.attendanceInId,p=s?points.get(s.id):null;const state=!s||!working?'STOPPED':!p||+now-+new Date(p.receivedAt)>Math.max(90000,policy.intervalSeconds*3000)?'STALE':'LIVE';return {...e,session:working?s:null,point:working?p:null,state};});
   return {items,policy,limit:500};
  }
  if(key==='history'&&method==='GET'){
   if(!eid)throw new BadRequestException('Select an employee.');const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(query.date),start=new Date(day+'T00:00:00Z');if(!Number.isFinite(+start)||start.toISOString().slice(0,10)!==day)throw new BadRequestException('Choose a valid date.');const end=new Date(+start+86400000),items=await this.db.fieldLocationPoint.findMany({where:{tenantId:tid,employeeId:eid,receivedAt:{gte:start,lt:end}},orderBy:{receivedAt:'asc'},take:1001});return {items:items.slice(0,1000),truncated:items.length>1000,date:day,timezone:'UTC'};
  }
  if(key==='visits'){
   if(method==='GET')return {items:await this.db.fieldVisit.findMany({where:{tenantId:tid,...(eid?{employeeId:eid}:scope?{employeeId:{in:scope}}:{})},orderBy:{createdAt:'desc'},take:200})};
   if(method==='POST'&&!action){
    requirePermission(ctx,'workforce','CREATE');const input=z.object({employeeId:z.string().uuid().optional(),title:z.string().trim().min(1).max(120),customer:z.string().trim().max(120).default(''),notes:z.string().trim().max(1000).default(''),scheduledAt:z.string().datetime().optional(),latitude:z.number().min(-90).max(90).optional(),longitude:z.number().min(-180).max(180).optional(),radiusMeters:z.number().int().min(50).max(1000).default(200)}).strict().parse(body);const target=ctx.user.role.code==='EMPLOYEE'?this.own(ctx):input.employeeId;if(!target)throw new BadRequestException('Select an employee.');if(ctx.user.role.code==='EMPLOYEE'&&input.employeeId&&input.employeeId!==target)throw new ForbiddenException();await assertEmployee(this.db,ctx,target);this.allowed(policy,target);if((input.latitude===undefined)!==(input.longitude===undefined))throw new BadRequestException('Provide both site coordinates.');const row=await this.db.fieldVisit.create({data:{...input,tenantId:tid,employeeId:target,scheduledAt:input.scheduledAt?new Date(input.scheduledAt):undefined}});await audit(this.db,ctx,'FIELD_VISIT_PLANNED','field-visit',row.id,undefined,{employeeId:target,title:row.title});return row;
   }
  }
  // Visit actions use /field-work/:visitId/start|complete|cancel.
  if(key&&action&&method==='POST'){
   const visitId=z.string().uuid().parse(key),eid=this.own(ctx);await assertEmployee(this.db,ctx,eid);
   return this.db.$transaction(async tx=>{await this.lock(tx,tid,eid);const visit=await tx.fieldVisit.findFirst({where:{tenantId:tid,employeeId:eid,id:visitId}});if(!visit)throw new NotFoundException('Visit not found.');
    if(action==='cancel'){if(visit.status!=='PLANNED')throw new ConflictException('Only planned visits can be cancelled.');const result=await tx.fieldVisit.update({where:{id:visit.id},data:{status:'CANCELLED'}});await audit(tx,ctx,'FIELD_VISIT_CANCELLED','field-visit',visit.id);return result;}
    const input=z.object({point:fieldPointSchema,outcome:z.string().trim().max(1000).default('')}).strict().parse(body);const lockedPolicy=await tx.fieldWorkPolicy.findUnique({where:{tenantId:tid}})??defaults;validatePoint(input.point,lockedPolicy);const session=await this.active(tx,ctx,lockedPolicy);const point={...input.point,receivedAt:new Date().toISOString()};
    if(action==='start'){if(visit.status!=='PLANNED')throw new ConflictException('This visit has already started or closed.');if(await tx.fieldVisit.findFirst({where:{tenantId:tid,employeeId:eid,status:'ACTIVE'}}))throw new ConflictException('Complete your current visit first.');if(visit.latitude!==null&&visit.longitude!==null&&metersBetween(input.point,{latitude:visit.latitude,longitude:visit.longitude})+input.point.accuracy>visit.radiusMeters)throw new ConflictException('You are outside the visit radius, or GPS accuracy is insufficient.');const result=await tx.fieldVisit.update({where:{id:visit.id},data:{status:'ACTIVE',sessionId:session.id,startedAt:new Date(),checkIn:point}});await audit(tx,ctx,'FIELD_VISIT_STARTED','field-visit',visit.id);return result;}
    if(action==='complete'){if(visit.status!=='ACTIVE'||visit.sessionId!==session.id)throw new ConflictException('This visit is not active in your field session.');if(!input.outcome)throw new BadRequestException('Add a visit outcome before completing.');const result=await tx.fieldVisit.update({where:{id:visit.id},data:{status:'COMPLETED',completedAt:new Date(),checkOut:point,outcome:input.outcome}});await audit(tx,ctx,'FIELD_VISIT_COMPLETED','field-visit',visit.id);return result;}
    throw new BadRequestException('Unsupported visit action.');
   });
  }
  throw new BadRequestException('Unsupported field-work operation.');
 }
}
