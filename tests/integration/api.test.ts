import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {embeddedDatabase} from '../helpers/database';
import {seed} from '../../prisma/seed';
import {createApp} from '../../apps/api/src/app';
import {hashPassword} from '../../packages/auth';
import {attendanceWorkdayDate,zonedMinute} from '../../packages/attendance-engine';
import {refreshTenantCurrentNoPunchAttendance} from '../../apps/api/src/attendance-automation';
test('API workflows and tenant isolation against embedded PostgreSQL',async t=>{
 process.env.NODE_ENV='test';process.env.APP_ORIGINS='http://localhost:3000,http://localhost:3001';
 const fixture=await embeddedDatabase();const db=fixture.db;
 await seed(db,{adminEmail:'admin@example.test',adminPassword:'test-admin-strong-password',ownerEmail:'owner@example.test',ownerPassword:'test-owner-strong-password',companyCode:'ALPHA'});
 const {app,io}=await createApp(db);await app.listen(0,'127.0.0.1');const address=app.getHttpServer().address();const base=`http://127.0.0.1:${address.port}/api/`;
  type Auth={cookie:string;csrf:string;scope:'TENANT'|'PLATFORM'};
  async function call(path:string,method='GET',body?:any,auth?:Auth){const origin=auth?.scope==='PLATFORM'?'http://localhost:3001':'http://localhost:3000';const response=await fetch(base+path,{method,headers:{Origin:origin,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(auth?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf,'X-PeopleOS-Portal':auth.scope}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});const text=await response.text();let data:any;try{data=JSON.parse(text)}catch{data=text}return {status:response.status,data,response};}
  async function login(email:string,password:string,companyCode?:string){const scope:'TENANT'|'PLATFORM'=companyCode?'TENANT':'PLATFORM';const r=await call('auth/login','POST',{email,password,...(companyCode?{companyCode}:{})});assert.equal(r.status,200,JSON.stringify(r.data));return {cookie:r.response.headers.get('set-cookie')!.split(';')[0],csrf:r.data.csrf,scope};}
 try{
  const root=await login('admin@example.test','test-admin-strong-password');const alpha=await login('owner@example.test','test-owner-strong-password','ALPHA');
  await t.test('anonymous requests and missing CSRF are rejected',async()=>{assert.equal((await call('employees')).status,401);assert.equal((await call('employees','POST',{}, {...alpha,csrf:''})).status,403)});
  let betaTenant:string,betaCode:string,betaTempPassword:string;
  await t.test('platform provisions tenant owner atomically with generated credentials',async()=>{
   const r=await call('platform/companies','POST',{name:'Beta',ownerName:'Beta owner',ownerEmail:'owner@example.test'},root);
   assert.equal(r.status,200,JSON.stringify(r.data));
   betaTenant=r.data.company.id;betaCode=r.data.credentials.companyCode;betaTempPassword=r.data.credentials.tempPassword;
   assert.match(betaCode,/^TCW-/);assert.equal(betaTempPassword.length,8);assert.equal(r.data.credentials.loginId.length,7);
   assert.equal((await call('platform/companies','GET',undefined,alpha)).status,403);
  });
  let beta=await login('owner@example.test',betaTempPassword!,betaCode!);
  const changed=await call('auth/change-password','POST',{currentPassword:betaTempPassword!,password:'BetaStrong!2026'},beta);assert.equal(changed.status,200,JSON.stringify(changed.data));
  beta=await login('owner@example.test','BetaStrong!2026',betaCode!);
  const depA=await call('departments','POST',{name:'Engineering',code:'ENG'},alpha);assert.equal(depA.status,200,JSON.stringify(depA.data));
  const depB=await call('departments','POST',{name:'Finance',code:'FIN'},beta);assert.equal(depB.status,200,JSON.stringify(depB.data));
  const employeeInput={employeeCode:'A01',firstName:'Test',lastName:'Employee',email:'employee@example.test',phone:'9876543210',departmentId:depA.data.id,joiningDate:'2025-01-01',monthlySalary:5000000};
  const a=await call('employees','POST',employeeInput,alpha);assert.equal(a.status,200,JSON.stringify(a.data));
  const b=await call('employees','POST',{...employeeInput,employeeCode:'B01',departmentId:depB.data.id},beta);assert.equal(b.status,200,JSON.stringify(b.data));
  await t.test('cross-tenant reads updates and references fail',async()=>{
   const own=await call('employees','GET',undefined,alpha);assert.equal(own.data.total,1);assert.equal(own.data.items[0].id,a.data.id);
   assert.equal((await call('employees/'+b.data.id,'GET',undefined,alpha)).status,404);
   assert.equal((await call('employees/'+b.data.id,'PATCH',employeeInput,alpha)).status,404);
   assert.equal((await call('employees','POST',{...employeeInput,email:'other@example.test',employeeCode:'A02',departmentId:depB.data.id},alpha)).status,400);
   await assert.rejects(()=>db.employee.update({where:{id:a.data.id},data:{departmentId:depB.data.id}}));
  });
  const alphaTenant=(await db.tenant.findUniqueOrThrow({where:{code:'ALPHA'}})).id;
  const employeeRole=await db.role.findUniqueOrThrow({where:{code:'EMPLOYEE'}});
  await db.user.create({data:{tenantId:alphaTenant,name:'Test Employee',email:'employee-login@example.test',passwordHash:await hashPassword('test-employee-password'),employeeId:a.data.id,roleId:employeeRole.id}});
  const self=await login('employee-login@example.test','test-employee-password','ALPHA');
  await t.test('employee permissions and personal scope are enforced',async()=>{assert.equal((await call('employees','POST',employeeInput,self)).status,403);assert.equal((await call('payroll','POST',{month:'2026-08'},self)).status,403);const rows=await call('employees','GET',undefined,self);assert.equal(rows.data.items.length,1);assert.equal(rows.data.items[0].id,a.data.id);assert.equal((await call('users','GET',undefined,self)).status,403)});
  await t.test('payroll prepare, reopen and finalization use one safe workflow',async()=>{
   assert.equal((await call('payroll','POST',{month:'2026-10'},alpha)).status,400);
   const prepared=await call('payroll','POST',{month:'2026-08'},alpha);assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.equal(prepared.data.status,'REVIEW');assert(prepared.data.items.length>0);
   const attendanceLock=await db.attendancePeriodLock.findUniqueOrThrow({where:{tenantId_month:{tenantId:alphaTenant,month:'2026-08'}}});assert.equal(attendanceLock.status,'LOCKED');
   const reopened=await call(`payroll/${prepared.data.id}/reopen`,'POST',{},alpha);assert.equal(reopened.status,200,JSON.stringify(reopened.data));assert.equal(reopened.data.status,'DRAFT');
   const reopenedAttendance=await db.attendancePeriodLock.findUniqueOrThrow({where:{tenantId_month:{tenantId:alphaTenant,month:'2026-08'}}});assert.equal(reopenedAttendance.status,'UNLOCKED');assert.equal(await db.payrollItem.count({where:{runId:prepared.data.id}}),0);
   const recalculated=await call('payroll','POST',{month:'2026-08'},alpha);assert.equal(recalculated.status,200,JSON.stringify(recalculated.data));assert.equal(recalculated.data.status,'REVIEW');
   const finalized=await call(`payroll/${prepared.data.id}/finalize`,'POST',{},alpha);assert.equal(finalized.status,200,JSON.stringify(finalized.data));assert.equal(finalized.data.status,'LOCKED');
   await assert.rejects(()=>db.payrollRun.update({where:{id:prepared.data.id},data:{totalNet:1}}));
   const item=await db.payrollItem.findFirstOrThrow({where:{runId:prepared.data.id}});await assert.rejects(()=>db.payrollItem.update({where:{id:item.id},data:{net:1}}));
   const slips=await call('payroll','GET',undefined,self);assert.equal(slips.data.items.length,1);assert.equal(slips.data.items[0].employeeId,a.data.id);
  });
  await t.test('leave overlap, review transitions, and self-approval controls',async()=>{
   const type=await db.leaveType.findFirstOrThrow({where:{tenantId:alphaTenant,paid:true}});
   const input={employeeId:a.data.id,leaveTypeId:type.id,startDate:'2026-10-05',endDate:'2026-10-06',reason:'Test leave'};
   const row=await call('leave','POST',input,self);assert.equal(row.status,200,JSON.stringify(row.data));
   assert.equal((await call('leave','POST',input,self)).status,409);
   assert.equal((await call(`leave/${row.data.id}/review`,'POST',{decision:'APPROVED'},self)).status,403);
   assert.equal((await call(`leave/${row.data.id}/review`,'POST',{decision:'APPROVED'},beta)).status,404);
   assert.equal((await call(`leave/${row.data.id}/review`,'POST',{decision:'APPROVED'},alpha)).status,200);
   assert.equal((await call(`leave/${row.data.id}/review`,'POST',{decision:'REJECTED'},alpha)).status,409);
  });
  await t.test('attendance stays present during an active shift across punches and reconcile, then finalizes after shift end',async()=>{
   const sourceId=randomUUID(),outSourceId=randomUUID(),shift=await db.shift.findFirstOrThrow({where:{tenantId:alphaTenant}}),now=new Date(),nowMinute=now.getUTCHours()*60+now.getUTCMinutes(),startMinute=(nowMinute+1320)%1440,endMinute=(nowMinute+120)%1440;
   await db.shift.update({where:{id:shift.id},data:{timezone:'UTC',startMinute,endMinute,workingDays:'0,1,2,3,4,5,6',graceMinutes:0,earlyOutGraceMinutes:0,fullDayMinutes:180,halfDayMinutes:90,overtimeAfterMinutes:180}});
   const punchIn=new Date(now.getTime()-40*60000),punchOut=new Date(now.getTime()-10*60000),body={employeeId:a.data.id,punchTime:punchIn.toISOString(),punchType:'IN',sourceId,shiftId:shift.id};
   const r=await call('attendance','POST',body,alpha);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.status,'PRESENT');assert.equal((await call('attendance','POST',body,alpha)).data.duplicate,true);
   const out=await call('attendance','POST',{...body,punchTime:punchOut.toISOString(),punchType:'OUT',sourceId:outSourceId},alpha);assert.equal(out.status,200,JSON.stringify(out.data));assert.equal(out.data.status,'PRESENT');
   assert.equal(await db.attendancePunch.count({where:{tenantId:alphaTenant,sourceId}}),1);
   const punch=await db.attendancePunch.findFirstOrThrow({where:{sourceId}});await assert.rejects(()=>db.attendancePunch.update({where:{id:punch.id},data:{punchType:'OUT'}}));await assert.rejects(()=>db.attendancePunch.delete({where:{id:punch.id}}));
   const workDay=attendanceWorkdayDate(punchIn,startMinute,endMinute,'UTC'),month=workDay.slice(0,7),reportDate=new Date(`${workDay}T00:00:00.000Z`),reconciled=await call('attendance/reconcile','POST',{month},alpha);assert.equal(reconciled.status,200,JSON.stringify(reconciled.data));
   let daily=await db.attendanceDaily.findUniqueOrThrow({where:{tenantId_employeeId_date:{tenantId:alphaTenant,employeeId:a.data.id,date:reportDate}}});assert.equal(daily.status,'PRESENT');assert.equal(daily.syncedAt,null);
   await db.attendanceDaily.update({where:{id:daily.id},data:{status:'HALF_DAY',syncedAt:now}});
   await refreshTenantCurrentNoPunchAttendance(db,alphaTenant,new Date(now.getTime()+1000),0);daily=await db.attendanceDaily.findUniqueOrThrow({where:{id:daily.id}});assert.equal(daily.status,'PRESENT');
   const night=endMinute<=startMinute,shiftEnd=zonedMinute(workDay,night?1440+endMinute:endMinute,'UTC'),afterEnd=new Date(shiftEnd.getTime()+60000);await refreshTenantCurrentNoPunchAttendance(db,alphaTenant,afterEnd,0);
   daily=await db.attendanceDaily.findUniqueOrThrow({where:{id:daily.id}});assert.equal(daily.status,'ABSENT');assert(daily.syncedAt&&daily.syncedAt.getTime()>=shiftEnd.getTime());
   await db.attendancePeriodLock.upsert({where:{tenantId_month:{tenantId:alphaTenant,month}},create:{tenantId:alphaTenant,month,status:'UNLOCKED'},update:{status:'UNLOCKED'}});
   const reset=await call('attendance/reset-month','DELETE',{month},alpha);assert.equal(reset.status,200,JSON.stringify(reset.data));assert.equal(reset.data.permanent,true);assert(reset.data.deletedPunches>=2);
   assert.equal(await db.attendancePunch.count({where:{tenantId:alphaTenant,sourceId}}),0);assert.equal(await db.attendancePeriodLock.count({where:{tenantId:alphaTenant,month}}),0);
  });
  await t.test('invoice payments cannot overpay and references are unique',async()=>{
   const invoice=await call('platform/invoices','POST',{tenantId:betaTenant!,number:'TEST-001',amount:100000,tax:18000,dueDate:'2026-10-01'},root);assert.equal(invoice.status,200,JSON.stringify(invoice.data));
   const payment={invoiceId:invoice.data.id,amount:118000,reference:'BANK-001',date:'2026-09-25'};
   assert.equal((await call('platform/payments','POST',payment,root)).status,200);assert.equal((await call('platform/payments','POST',{...payment,reference:'BANK-002'},root)).status,400);
  });
  await t.test('tenant suspension invalidates existing sessions',async()=>{await db.tenant.update({where:{id:betaTenant!},data:{status:'SUSPENDED'}});assert.equal((await call('employees','GET',undefined,beta)).status,403)});
  await t.test('password resets are single-use and revoke existing sessions',async()=>{
   assert.equal((await call('auth/forgot-password','POST',{email:'owner@example.test',companyCode:'ALPHA'})).status,200);
   const mail=await db.outbox.findFirstOrThrow({where:{tenantId:alphaTenant},orderBy:{createdAt:'desc'}});const text=(mail.payload as any).text as string;const raw=new URL(text.match(/http[^ ]+/)![0].replace(/\.$/,'')).searchParams.get('token');
   const claim=await call('auth/reset-password/claim','POST',{token:raw});assert.equal(claim.status,200,JSON.stringify(claim.data));
   const claimCookie=claim.response.headers.get('set-cookie')!.split(';')[0];
   assert.equal((await call('auth/reset-password','POST',{password:'OwnerChanged!2026'},{cookie:claimCookie,csrf:'',scope:'TENANT'})).status,200);
   assert.equal((await call('employees','GET',undefined,alpha)).status,401);
   assert.equal((await call('auth/reset-password','POST',{password:'OwnerAgain!2026'},{cookie:claimCookie,csrf:'',scope:'TENANT'})).status,400);
  });
 }finally{io.close();await app.close();await fixture.close()}
});
