import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from '../../packages/auth';
import {createApp} from '../../apps/api/src/app';
import {randomUUID} from 'node:crypto';
import {embeddedDatabase} from '../helpers/database';
import {roleDefinitions} from '../../packages/permissions';
import {FieldWork,cleanFieldWork,closeFieldSessions} from '../../apps/api/src/field-work';
import {createFaceChallenge,faceProfileStatus,reviewEmployeeFace,enrollEmployeeFace} from '../../apps/api/src/face-profile';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

test('field work isolates company/team data, requires duty and consent, and closes visits safely',async()=>{
 const fixture=await embeddedDatabase(),db=fixture.db;const originalKey=process.env.CONFIG_ENCRYPTION_KEY;process.env.CONFIG_ENCRYPTION_KEY='synthetic-face-key-at-least-32-characters';
 try{
  const role=async(code:string)=>db.role.create({data:roleDefinitions.find(r=>r.code===code)!});const hrRole=await role('HR_ADMIN'),empRole=await role('EMPLOYEE'),managerRole=await role('MANAGER');
  const company=await db.tenant.create({data:{name:'Field test',code:'FIELD-TEST'}}),other=await db.tenant.create({data:{name:'Foreign',code:'FOREIGN-FIELD'}});
  const employee=async(tid:string,code:string,managerId?:string)=>db.employee.create({data:{tenantId:tid,employeeCode:code,email:code+'@example.test',firstName:code,lastName:'Field',joiningDate:new Date('2020-01-01'),managerId}});
  const manager=await employee(company.id,'MANAGER'),own=await employee(company.id,'OWN',manager.id),peer=await employee(company.id,'PEER'),foreign=await employee(other.id,'FOREIGN');
  const context=async(tid:string,role:any,eid?:string)=>{const user=await db.user.create({data:{tenantId:tid,roleId:role.id,name:'Fixture',email:randomUUID()+'@example.test',passwordHash:'synthetic',employeeId:eid}}),session=await db.session.create({data:{tenantId:tid,userId:user.id,tokenHash:digest('synthetic-'+user.id),csrf:'synthetic',expiresAt:new Date(Date.now()+3600000),userAgent:'fixture',ip:'127.0.0.1'}});return {tenantId:tid,user:{...user,role},session,ip:'127.0.0.1'};};
  const hr=await context(company.id,hrRole),self=await context(company.id,empRole,own.id),leader=await context(company.id,managerRole,manager.id),fctx=await context(other.id,empRole,foreign.id),service=new FieldWork(db);const call=(...args:Parameters<FieldWork["handle"]>):Promise<any>=>service.handle(...args);
  const point=()=>({latitude:23.0225,longitude:72.5714,accuracy:10,capturedAt:new Date().toISOString()});const settings={enabled:true,intervalSeconds:15,maxAccuracyMeters:100,maxSessionHours:10,employeeIds:[own.id]};
  await assert.rejects(call(self,'PUT',settings,{},'settings'),/permission/);await assert.rejects(call(hr,'PUT',{...settings,employeeIds:[foreign.id]},{},'settings'),/not found/);await call(hr,'PUT',settings,{},'settings');
  await assert.rejects(call(self,'POST',{consent:false,point:point()},{},'session'));await assert.rejects(call(self,'POST',{consent:true,point:point()},{},'session'),/Check in/);
  await db.attendancePunch.create({data:{tenantId:company.id,employeeId:own.id,sourceId:randomUUID(),punchType:'IN',punchTime:new Date(Date.now()-60000),verificationType:'MANUAL',rawPayload:{source:'fixture'}}});
  const started:any=await call(self,'POST',{consent:true,point:point()},{},'session');assert(started.session.id);const repeated:any=await call(self,'POST',{consent:true,point:point()},{},'session');assert.equal(repeated.session.id,started.session.id);await db.fieldLocationPoint.create({data:{tenantId:company.id,employeeId:own.id,sessionId:started.session.id,latitude:23,longitude:72,accuracy:10,capturedAt:new Date('2026-01-01T20:00:00Z'),receivedAt:new Date('2026-01-01T20:00:00Z')}});const localHistory=await call(self,'GET',undefined,{employeeId:own.id,date:'2026-01-02'},'history');assert.equal(localHistory.items.length,1);assert.equal(localHistory.timezone,'Asia/Kolkata');
  assert.equal((await call(self,'GET',undefined,{}))!.items.length,1);assert.equal((await call(leader,'GET',undefined,{}))!.items.length,2);assert(!(await call(leader,'GET',undefined,{}))!.items.some((e:any)=>e.id===peer.id));
  await assert.rejects(call(hr,'GET',undefined,{employeeId:foreign.id,date:'2026-10-07'},'history'),/not found/);await assert.rejects(call(self,'GET',undefined,{employeeId:peer.id,date:'2026-10-07'},'history'),/not found/);
  await assert.rejects(call(self,'POST',{sessionId:started.session.id,point:{...point(),accuracy:101}},{},'point'),/accuracy/);await assert.rejects(call(self,'POST',{sessionId:started.session.id,point:{...point(),capturedAt:new Date(Date.now()-61000).toISOString()}},{},'point'),/stale/);
  const visit:any=await call(hr,'POST',{employeeId:own.id,title:'Site inspection',latitude:23.0225,longitude:72.5714,radiusMeters:100},{},'visits');
  await assert.rejects(call(fctx,'POST',{point:point()},{},visit.id,'start'),/not found/);await assert.rejects(call(self,'POST',{point:{...point(),latitude:24}},{},visit.id,'start'),/outside/);
  const active:any=await call(self,'POST',{point:point()},{},visit.id,'start');assert.equal(active.status,'ACTIVE');await assert.rejects(call(self,'POST',{point:point(),outcome:''},{},visit.id,'complete'),/outcome/);
  const complete:any=await call(self,'POST',{point:point(),outcome:'Inspection finished'},{},visit.id,'complete');assert.equal(complete.status,'COMPLETED');assert(complete.checkOut);
  const v2:any=await call(self,'POST',{title:'Follow-up'},{},'visits');await call(self,'POST',{point:point()},{},v2.id,'start');await call(self,'DELETE',{}, {},'session');assert.equal((await db.fieldVisit.findUniqueOrThrow({where:{id:v2.id}})).status,'INCOMPLETE');await assert.rejects(call(self,'POST',{sessionId:started.session.id,point:point()},{},'point'),/Start a new/);
  const next:any=await call(self,'POST',{consent:true,point:point()},{},'session');await call(hr,'PUT',{...settings,enabled:false},{},'settings');assert.equal((await db.fieldWorkSession.findUniqueOrThrow({where:{id:next.session.id}})).endReason,'POLICY_DISABLED');
  await call(hr,'PUT',settings,{},'settings');const expired:any=await call(self,'POST',{consent:true,point:point()},{},'session');await db.fieldWorkSession.update({where:{id:expired.session.id},data:{expiresAt:new Date(Date.now()-1)}});await cleanFieldWork(db);assert.equal((await db.fieldWorkSession.findUniqueOrThrow({where:{id:expired.session.id}})).endReason,'SESSION_EXPIRED');
  const current:any=await call(self,'POST',{consent:true,point:point()},{},'session');await db.attendancePunch.create({data:{tenantId:company.id,employeeId:own.id,sourceId:randomUUID(),punchType:'OUT',punchTime:new Date(),verificationType:'MANUAL',rawPayload:{source:'fixture'}}});await assert.rejects(call(self,'POST',{sessionId:current.session.id,point:point()},{},'point'),/open attendance IN/);assert.equal((await call(self,'GET',undefined,{},'session'))!.session,null);await cleanFieldWork(db);assert.equal((await db.fieldWorkSession.findUniqueOrThrow({where:{id:current.session.id}})).endReason,'ATTENDANCE_CHECKOUT');
  // Legacy vectors cannot authorize new attendance, and challenges are session-bound and one-use even on failure.
  assert.equal((await faceProfileStatus(db,self)).enrolled,false);await assert.rejects(createFaceChallenge(db,self,{purpose:'PUNCH'}),/HR approval/);await assert.rejects(createFaceChallenge(db,hr,{purpose:'ENROLL'}),/Employee account/);
  const challenge=await createFaceChallenge(db,self,{purpose:'ENROLL'});const sample=await readFile(path.join(path.dirname(require.resolve('@vladmandic/face-api/package.json')),'demo/sample1.jpg'));const frame='data:image/jpeg;base64,'+sample.toString('base64');await assert.rejects(enrollEmployeeFace(db,self,{challengeId:challenge.challengeId,frames:[frame,frame,frame]}),/More than one face/);await assert.rejects(enrollEmployeeFace(db,self,{challengeId:challenge.challengeId,frames:[frame,frame,frame]}),/already used/);assert.equal(await db.employeeFaceProfile.count(),0);
  const pending=await db.employeeFaceProfile.create({data:{tenantId:company.id,employeeId:own.id,templateCiphertext:'synthetic-not-a-real-face',templateVersion:'server-face-api-1.7.15-v3',status:'PENDING'}});
  await assert.rejects(reviewEmployeeFace(db,self,'POST',{profileId:pending.id,decision:'APPROVE',expectedUpdatedAt:pending.updatedAt.toISOString(),identityConfirmed:true}),/permission/);await assert.rejects(reviewEmployeeFace(db,hr,'POST',{profileId:pending.id,decision:'APPROVE',expectedUpdatedAt:pending.updatedAt.toISOString(),identityConfirmed:false}));
  await reviewEmployeeFace(db,hr,'POST',{profileId:pending.id,decision:'APPROVE',expectedUpdatedAt:pending.updatedAt.toISOString(),identityConfirmed:true});await assert.rejects(reviewEmployeeFace(db,hr,'POST',{profileId:pending.id,decision:'REJECT',expectedUpdatedAt:pending.updatedAt.toISOString(),identityConfirmed:true}),/already reviewed/);assert.equal((await faceProfileStatus(db,self)).attendanceReady,true);
  assert.equal(await db.attendancePunch.count({where:{verificationType:'FACE_SCAN'}}),0);
  process.env.NODE_ENV='test';process.env.APP_ORIGINS='http://localhost:3000';const {app,io}=await createApp(db);await app.listen(0,'127.0.0.1');
  try{const base=`http://127.0.0.1:${app.getHttpServer().address().port}/api/`,headers={'Cookie':'tcw_hr_session_v2=synthetic-'+self.user.id,'X-PeopleOS-Portal':'TENANT','X-CSRF-Token':self.session.csrf,'Content-Type':'application/json',Origin:'http://localhost:3000'};
   const live=await fetch(base+'field-work',{headers});assert.equal(live.status,200);assert.equal((await live.json()).items.length,1);
   assert.equal((await fetch(base+'field-work/history?employeeId='+foreign.id+'&date=2026-10-07',{headers})).status,404);
   assert.equal((await fetch(base+'attendance/face-scan',{method:'POST',headers,body:JSON.stringify({frame,descriptor:Array(128).fill(.1),clientNonce:randomUUID()})})).status,400);
   assert.equal((await fetch(base+'field-work/session',{method:'DELETE',headers:{...headers,'X-CSRF-Token':'wrong'},body:'{}'})).status,403);
  }finally{await io.close();await app.close();}

 }finally{if(originalKey===undefined)delete process.env.CONFIG_ENCRYPTION_KEY;else process.env.CONFIG_ENCRYPTION_KEY=originalKey;await fixture.close();}
});
