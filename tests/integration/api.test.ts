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
   await t.test('attendance shows live Working Out Break states across repeated sessions and finalizes after shift end',async()=>{
    const shift=await db.shift.findFirstOrThrow({where:{tenantId:alphaTenant}}),now=new Date(),minute=now.getUTCHours()*60+now.getUTCMinutes(),startMinute=(minute+1350)%1440,endMinute=(minute+90)%1440;
    await db.shift.update({where:{id:shift.id},data:{timezone:'UTC',startMinute,endMinute,workingDays:'0,1,2,3,4,5,6',graceMinutes:0,earlyOutGraceMinutes:0,fullDayMinutes:80,halfDayMinutes:30,overtimeAfterMinutes:80,breakMinutes:30,breakStartMinute:null,breakEndMinute:null,punchDrivenBreaks:true,flexibleBreakAnytime:false}});
    await db.employee.update({where:{id:a.data.id},data:{shiftId:shift.id}});
    const p1=new Date(now.getTime()-50*60000),p2=new Date(now.getTime()-30*60000),p3=new Date(now.getTime()-20*60000),p4=new Date(now.getTime()-10*60000),workDay=attendanceWorkdayDate(p1,startMinute,endMinute,'UTC'),month=workDay.slice(0,7),reportDate=new Date(`${workDay}T00:00:00.000Z`);
    const punch=async(punchTime:Date,punchType:'IN'|'OUT',sourceId=randomUUID())=>call('attendance','POST',{employeeId:a.data.id,punchTime:punchTime.toISOString(),punchType,sourceId,shiftId:shift.id},alpha);
    const live=async()=>{const response=await call(`attendance?from=${workDay}&to=${workDay}`,'GET',undefined,alpha);assert.equal(response.status,200,JSON.stringify(response.data));return response.data.items.find((item:any)=>item.employeeId===a.data.id)};
    let r=await punch(p1,'IN');assert.equal(r.status,200,JSON.stringify(r.data));let row=await live();assert.equal(row.liveState,'WORKING');
    r=await punch(p2,'OUT');assert.equal(r.status,200,JSON.stringify(r.data));row=await live();assert.equal(row.liveState,'OUT');let workforce=await call('workforce','GET',undefined,alpha);assert.equal(workforce.status,200,JSON.stringify(workforce.data));assert.equal(workforce.data.items.find((item:any)=>item.id===a.data.id)?.status,'OUT');
    r=await punch(p3,'IN');assert.equal(r.status,200,JSON.stringify(r.data));row=await live();assert.equal(row.liveState,'WORKING');
    const breakStart=(minute+1425)%1440,breakEnd=(minute+25)%1440;await db.shift.update({where:{id:shift.id},data:{breakStartMinute:breakStart,breakEndMinute:breakEnd}});
    r=await punch(p4,'OUT');assert.equal(r.status,200,JSON.stringify(r.data));row=await live();assert.equal(row.liveState,'BREAK');assert(Number(row.liveBreakSeconds)>=9*60&&Number(row.liveBreakSeconds)<12*60,'scheduled break must start at zero from the OUT punch');assert.equal(row.inCount,2);assert.equal(row.outCount,2);workforce=await call('workforce','GET',undefined,alpha);assert.equal(workforce.status,200,JSON.stringify(workforce.data));assert.equal(workforce.data.items.find((item:any)=>item.id===a.data.id)?.status,'BREAK');
    const sourceId=randomUUID();r=await punch(new Date(now.getTime()-5*60000),'IN',sourceId);assert.equal(r.status,200,JSON.stringify(r.data));row=await live();assert.equal(row.liveState,'WORKING');
    const sourcePunch=await db.attendancePunch.findFirstOrThrow({where:{sourceId}});await assert.rejects(()=>db.attendancePunch.update({where:{id:sourcePunch.id},data:{punchType:'OUT'}}));await assert.rejects(()=>db.attendancePunch.delete({where:{id:sourcePunch.id}}));
    r=await punch(now,'OUT');assert.equal(r.status,200,JSON.stringify(r.data));
    const reconciled=await call('attendance/reconcile','POST',{month},alpha);assert.equal(reconciled.status,200,JSON.stringify(reconciled.data));let daily=await db.attendanceDaily.findUniqueOrThrow({where:{tenantId_employeeId_date:{tenantId:alphaTenant,employeeId:a.data.id,date:reportDate}}});assert.equal(daily.status,'PRESENT');assert.equal(daily.syncedAt,null);
    await db.attendanceDaily.update({where:{id:daily.id},data:{status:'HALF_DAY',syncedAt:now}});await refreshTenantCurrentNoPunchAttendance(db,alphaTenant,new Date(now.getTime()+1000),0);daily=await db.attendanceDaily.findUniqueOrThrow({where:{id:daily.id}});assert.equal(daily.status,'PRESENT');
    const night=endMinute<=startMinute,shiftEnd=zonedMinute(workDay,night?1440+endMinute:endMinute,'UTC');await refreshTenantCurrentNoPunchAttendance(db,alphaTenant,new Date(shiftEnd.getTime()+60000),0);daily=await db.attendanceDaily.findUniqueOrThrow({where:{id:daily.id}});assert.equal(daily.status,'HALF_DAY');assert(daily.syncedAt&&daily.syncedAt.getTime()>=shiftEnd.getTime());
    await db.attendancePeriodLock.upsert({where:{tenantId_month:{tenantId:alphaTenant,month}},create:{tenantId:alphaTenant,month,status:'UNLOCKED'},update:{status:'UNLOCKED'}});const reset=await call('attendance/reset-month','DELETE',{month},alpha);assert.equal(reset.status,200,JSON.stringify(reset.data));assert.equal(reset.data.permanent,true);assert(reset.data.deletedPunches>=6);assert.equal(await db.attendancePunch.count({where:{tenantId:alphaTenant,sourceId}}),0);
   });
  await t.test('invoice payments cannot overpay and references are unique',async()=>{
   const invoice=await call('platform/invoices','POST',{tenantId:betaTenant!,number:'TEST-001',amount:100000,tax:18000,dueDate:'2026-10-01'},root);assert.equal(invoice.status,200,JSON.stringify(invoice.data));
   const payment={invoiceId:invoice.data.id,amount:118000,reference:'BANK-001',date:'2026-09-25'};
   assert.equal((await call('platform/payments','POST',payment,root)).status,200);assert.equal((await call('platform/payments','POST',{...payment,reference:'BANK-002'},root)).status,400);
  });
  await t.test('manual super-admin activation stays active while overdue payment is outstanding',async()=>{
   const invoice=await call('platform/invoices','POST',{tenantId:betaTenant!,number:'TEST-MANUAL-ACTIVE',amount:364000,tax:0,dueDate:'2020-01-01'},root);assert.equal(invoice.status,200,JSON.stringify(invoice.data));
   const suspendedList=await call('platform/companies','GET',undefined,root);assert.equal(suspendedList.status,200,JSON.stringify(suspendedList.data));
   const suspended=suspendedList.data.items.find((row:any)=>row.id===betaTenant);assert.equal(suspended.status,'SUSPENDED');assert.equal(suspended.suspensionReason,'BILLING');
   const before=await db.tenant.findUniqueOrThrow({where:{id:betaTenant!}});
   const activated=await call(`platform/companies/${betaTenant}`,'PATCH',{status:'ACTIVE',plan:before.plan,employeeLimit:before.employeeLimit,expiresAt:before.expiresAt?.toISOString().slice(0,10)??null},root);assert.equal(activated.status,200,JSON.stringify(activated.data));
   const refreshed=await call('platform/companies','GET',undefined,root);assert.equal(refreshed.status,200,JSON.stringify(refreshed.data));
   const active=refreshed.data.items.find((row:any)=>row.id===betaTenant);assert.equal(active.status,'ACTIVE');assert.equal(active.suspensionReason,null);
   const stored=await db.tenant.findUniqueOrThrow({where:{id:betaTenant!}});assert.equal((stored.profile as any)?.billingManualActive,true);
   beta=await login('owner@example.test','BetaStrong!2026',betaCode!);
   assert.equal((await call(`platform/invoices/${invoice.data.id}`,'DELETE',undefined,root)).status,200);
   assert.equal((await call('platform/companies','GET',undefined,root)).status,200);
   const cleaned=await db.tenant.findUniqueOrThrow({where:{id:betaTenant!}});assert.equal((cleaned.profile as any)?.billingManualActive,undefined);
  });
  await t.test('tenant suspension invalidates existing sessions',async()=>{await db.tenant.update({where:{id:betaTenant!},data:{status:'SUSPENDED'}});assert.equal((await call('employees','GET',undefined,beta)).status,403)});
  await t.test('company delete permanently purges paid and unpaid billing plus all company data',async()=>{
   await db.shift.create({data:{tenantId:betaTenant!,name:'Delete me shift',startMinute:540,endMinute:1080}});
   const companyDeleteSourceId=randomUUID();await db.attendancePunch.create({data:{tenantId:betaTenant!,employeeId:b.data.id,sourceId:companyDeleteSourceId,punchTime:new Date(),punchType:'IN',verificationType:'MANUAL',rawPayload:{test:true}}});
   const unpaid=await call('platform/invoices','POST',{tenantId:betaTenant!,number:'TEST-DELETE-UNPAID',amount:50000,tax:9000,dueDate:'2026-12-01'},root);assert.equal(unpaid.status,200,JSON.stringify(unpaid.data));
   assert((await db.invoice.count({where:{tenantId:betaTenant!}}))>=2);
   assert((await db.payment.count({where:{tenantId:betaTenant!}}))>=1);
   assert.equal(await db.attendancePunch.count({where:{tenantId:betaTenant!,sourceId:companyDeleteSourceId}}),1);
   assert((await db.auditLog.count({where:{tenantId:betaTenant!}}))>=1);
   assert((await db.lead.count({where:{notes:{contains:betaCode!}}}))>=1);
   const deleted=await call(`platform/companies/${betaTenant}`,'DELETE',undefined,root);assert.equal(deleted.status,200,JSON.stringify(deleted.data));assert.equal(deleted.data.deleted,true);
   const tenantModels=['user','session','pushSubscription','passwordReset','auditLog','outbox','branch','department','designation','team','location','costCenter','employee','employeeFaceProfile','shift','attendanceDevice','deviceEmployeeMap','deviceSyncLog','attendancePunch','attendanceDaily','attendancePeriodLock','leaveType','leaveRequest','calendarEvent','payrollRun','payrollItem','payrollPayout','payrollAdjustment','salaryRule','job','candidate','goal','course','asset','expenseClaim','travelRequest','employeeExit','document','activityEvent','productivityRule','notification','invoice','payment','supportTicket','supportTicketMessage','meghnaConversation'];
   for(const model of tenantModels)assert.equal(await (db as any)[model].count({where:{tenantId:betaTenant!}}),0,model+' still has company rows');
   assert.equal(await db.tenant.count({where:{id:betaTenant!}}),0);
   assert.equal(await db.lead.count({where:{notes:{contains:betaCode!}}}),0);
   const companies=await call('platform/companies','GET',undefined,root);assert.equal(companies.status,200,JSON.stringify(companies.data));assert.equal(companies.data.items.some((row:any)=>row.id===betaTenant),false);
   assert.notEqual((await call('auth/login','POST',{email:'owner@example.test',password:'BetaStrong!2026',companyCode:betaCode!})).status,200);
  });
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
