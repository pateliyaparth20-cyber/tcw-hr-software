import test from 'node:test';
import assert from 'node:assert/strict';
import {embeddedDatabase} from '../helpers/database';
import {resetQaUserPasswords,seed} from '../../prisma/seed';
import {resetAndSeedFullQa} from '../../prisma/qa-full-reset';
import {createApp} from '../../apps/api/src/app';

test('full HR Admin Employee month cycle is production-safe',async t=>{
  process.env.NODE_ENV='test';
  process.env.APP_ORIGINS='http://localhost:3000,http://localhost:3001,http://localhost:3002';
  const fixture=await embeddedDatabase();const db=fixture.db;
  const adminEmail='admin@example.test',adminPassword='test-admin-strong-password';
  const qaEmail='qa-owner@example.test',qaPassword='test-qa-owner-strong-password';
  const legacyEmail='legacy-owner@example.test',legacyPassword='test-legacy-owner-strong-password';
  await seed(db,{adminEmail,adminPassword,ownerEmail:legacyEmail,ownerPassword:legacyPassword,companyCode:'LEGACY-QA',demo:true});
  const legacyTenant=await db.tenant.findUniqueOrThrow({where:{code:'LEGACY-QA'}});
  const legacyPunchesBefore=await db.attendancePunch.count({where:{tenantId:legacyTenant.id}});
  assert(legacyPunchesBefore>0,'legacy workspace should include immutable punch evidence before reset');
  await db.auditLog.create({data:{tenantId:legacyTenant.id,action:'LEGACY_QA_AUDIT',entity:'workspace',entityId:legacyTenant.id}});
  const reset=await resetAndSeedFullQa(db,{qaEmail,qaPassword,qaCode:'TCW-QA',now:new Date('2026-10-01T06:30:00.000Z'),runKey:'integration-full-cycle',confirmation:'DELETE_AND_REBUILD_TCW_QA'});
  assert.equal(reset.skipped,false);assert.equal(reset.month,'2026-09');assert.equal(reset.archivedTenants,1);
  assert.deepEqual(reset.counts,{employees:8,users:6,attendanceDays:240,punches:330,leaveRequests:3,payrollItems:8,payrollPayouts:8,invoices:1,payments:1});
  assert.equal(reset.attendanceTotals.missingPunchDays,0);
  assert(reset.attendanceTotals.absentDays>=1);

  const tenant=await db.tenant.findUniqueOrThrow({where:{code:'TCW-QA'}});
  const paidLeave=await db.attendanceDaily.aggregate({where:{tenantId:tenant.id,dayType:'PAID_LEAVE'},_sum:{leaveUnits:true}});
  const unpaidLeave=await db.attendanceDaily.aggregate({where:{tenantId:tenant.id,dayType:'UNPAID_LEAVE'},_sum:{leaveUnits:true}});
  assert.equal(paidLeave._sum.leaveUnits,150);
  assert.equal(unpaidLeave._sum.leaveUnits,100);
  assert.equal(await db.tenant.count({where:{status:{not:'ARCHIVED'}}}),1);
  assert.equal(await db.tenant.count(),2);
  const archivedLegacy=await db.tenant.findUniqueOrThrow({where:{id:legacyTenant.id}});
  assert.equal(archivedLegacy.status,'ARCHIVED');assert.match(archivedLegacy.code,/^ARCH-/);
  assert.equal(await db.user.count({where:{tenantId:legacyTenant.id,active:true}}),0);
  assert.equal(await db.employee.count({where:{tenantId:legacyTenant.id,deletedAt:null}}),0);
  assert.equal(await db.attendancePunch.count({where:{tenantId:legacyTenant.id}}),legacyPunchesBefore);
  assert.equal(await db.auditLog.count({where:{tenantId:legacyTenant.id,action:'LEGACY_QA_AUDIT'}}),1);
  assert.equal(await db.lead.count(),2);
  assert.equal((await db.invoice.findFirstOrThrow({where:{tenantId:tenant.id}})).total,10000);
  assert.equal((await db.payment.findFirstOrThrow({where:{tenantId:tenant.id}})).amount,10000);
  const resetPassword='qa-reset-integration-password';
  const passwordReset=await resetQaUserPasswords(db,{companyCode:'TCW-QA',password:resetPassword});
  assert.deepEqual(passwordReset,{companyCode:'TCW-QA',users:6});
  const payroll=await db.payrollRun.findUniqueOrThrow({where:{tenantId_month:{tenantId:tenant.id,month:'2026-09'}},include:{items:true}});
  assert.equal(payroll.status,'LOCKED');assert.equal(payroll.items.length,8);
  assert.equal(await db.payrollPayout.count({where:{tenantId:tenant.id,runId:payroll.id,status:'PAID'}}),8);

  const {app,io}=await createApp(db);await app.listen(0,'127.0.0.1');
  const address=app.getHttpServer().address();const base=`http://127.0.0.1:${address.port}/api/`;
  type Auth={cookie:string;csrf:string;scope:'TENANT'|'PLATFORM'};
  async function call(path:string,method='GET',body?:any,auth?:Auth){
    const origin=auth?.scope==='PLATFORM'?'http://localhost:3001':'http://localhost:3000';
    const response=await fetch(base+path,{method,headers:{Origin:origin,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(auth?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf,'X-PeopleOS-Portal':auth.scope}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    const raw=await response.text();let data:any;try{data=JSON.parse(raw)}catch{data=raw}
    return {status:response.status,data,response};
  }
  async function login(email:string,password:string,companyCode?:string){
    const scope:'TENANT'|'PLATFORM'=companyCode?'TENANT':'PLATFORM';
    const r=await call('auth/login','POST',{email,password,...(companyCode?{companyCode}:{})});
    assert.equal(r.status,200,JSON.stringify(r.data));
    return {cookie:r.response.headers.get('set-cookie')!.split(';')[0],csrf:r.data.csrf,scope};
  }

  try{
    const platform=await login(adminEmail,adminPassword);
    const owner=await login(qaEmail,resetPassword,'TCW-QA');
    const employee=await login('aarav.shah.qa@example.test',resetPassword,'TCW-QA');

    await t.test('Super Admin sees clean company billing and automatic payment history',async()=>{
      const companies=await call('platform/companies','GET',undefined,platform);assert.equal(companies.status,200);assert.equal(companies.data.items.length,1);assert.equal(companies.data.items[0].code,'TCW-QA');
      const invoices=await call('platform/invoices','GET',undefined,platform);assert.equal(invoices.status,200);assert.equal(invoices.data.items.length,1);assert.equal(invoices.data.items[0].total,10000);assert.equal(invoices.data.items[0].status,'PAID');
      const payments=await call('platform/payments','GET',undefined,platform);assert.equal(payments.status,200);assert.equal(payments.data.items.length,1);assert.equal(payments.data.items[0].amount,10000);assert.equal(payments.data.items[0].pendingProof,undefined);
      const system=await call('system','GET',undefined,platform);assert.equal(system.status,200);assert.equal(system.data.database,'CONNECTED');
    });

    await t.test('platform support staff have least-privilege access and ticket assignment',async()=>{
      const created=await call('platform/users','POST',{name:'Support Agent QA',email:'support.agent.qa@example.test',loginId:'TCW-SUPPORT-QA',password:'Support@2026-QA!',role:'SUPPORT_AGENT',active:true},platform);
      assert.equal(created.status,200,JSON.stringify(created.data));assert.equal(created.data.roleCode,'SUPPORT_AGENT');
      const supportAgent=await login('support.agent.qa@example.test','Support@2026-QA!');
      const team=await call('platform/users','GET',undefined,platform);assert.equal(team.status,200);assert(team.data.items.some((row:any)=>row.id===created.data.id&&row.roleCode==='SUPPORT_AGENT'));
      const queue=await call('platform/support','GET',undefined,supportAgent);assert.equal(queue.status,200,JSON.stringify(queue.data));assert(queue.data.items.length>=1);
      const forbidden=await call('platform/companies','GET',undefined,supportAgent);assert.equal(forbidden.status,403);
      const ticket=queue.data.items[0];
      const assigned=await call(`platform/support/${ticket.id}`,'PATCH',{status:'IN_PROGRESS',assignedTo:created.data.id,response:'Assigned to QA support agent.'},supportAgent);
      assert.equal(assigned.status,200,JSON.stringify(assigned.data));assert.equal(assigned.data.assignedTo,created.data.id);assert.equal(assigned.data.assignedUser.name,'Support Agent QA');
    });

    await t.test('HR owner can read every core real-HR workspace without broken endpoints',async()=>{
      for(const path of [
        'dashboard','employees?pageSize=500','branches?pageSize=500','departments?pageSize=500','designations?pageSize=500','teams?pageSize=500','locations?pageSize=500','cost-centers?pageSize=500',
        'shifts?pageSize=500','devices?pageSize=500','leave-types','leave?pageSize=500','attendance/summary?month=2026-09','payroll','jobs?pageSize=500','candidates?pageSize=500',
        'goals?pageSize=500','courses?pageSize=500','assets?pageSize=500','expenses?pageSize=500','travel?pageSize=500','exit?pageSize=500','workforce','notifications','support?pageSize=500'
      ]){
        const r=await call(path,'GET',undefined,owner);assert.equal(r.status,200,`${path}: ${JSON.stringify(r.data)}`);
      }
      const employees=await call('employees?pageSize=500','GET',undefined,owner);assert.equal(employees.data.total,8);assert(employees.data.items.every((row:any)=>typeof row.monthlySalary==='number'));
      const attendance=await call('attendance/summary?month=2026-09','GET',undefined,owner);assert.equal(attendance.data.totals.employees,8);assert.equal(attendance.data.totals.missingPunchDays,0);assert.equal(attendance.data.lock.status,'LOCKED');
      const runs=await call('payroll','GET',undefined,owner);assert.equal(runs.data.items[0].status,'LOCKED');assert.equal(runs.data.items[0].items.length,8);
      const payouts=await call(`payroll/${payroll.id}/payouts`,'GET',undefined,owner);assert.equal(payouts.status,200);assert.equal(payouts.data.items.length,8);assert(payouts.data.items.every((row:any)=>row.status==='PAID'));
      const bank=await call(`reports/bank-payout?runId=${payroll.id}`,'GET',undefined,owner);assert.equal(bank.status,200);const csv=String(bank.data);assert(csv.includes('QA002'));assert(csv.includes('HDFC0000001'));
    });

    await t.test('Employee is self-scoped and sees finalized salary/payslip only for self',async()=>{
      const people=await call('employees?pageSize=500','GET',undefined,employee);assert.equal(people.status,200);assert.equal(people.data.total,1);assert.equal(people.data.items[0].employeeCode,'QA002');
      const salary=await call('payroll','GET',undefined,employee);assert.equal(salary.status,200);assert.equal(salary.data.items.length,1);assert.equal(salary.data.items[0].employeeCode,'QA002');assert.equal(salary.data.items[0].run.status,'LOCKED');
      const attendance=await call('attendance/summary?month=2026-09','GET',undefined,employee);assert.equal(attendance.status,200);assert.equal(attendance.data.items.length,1);assert.equal(attendance.data.items[0].employeeCode,'QA002');
      const forbidden=await call('employees','POST',{employeeCode:'BAD01',firstName:'No',lastName:'Access',email:'no.access@example.test',joiningDate:'2026-10-01',monthlySalary:10000},employee);assert.equal(forbidden.status,403);
      const own=people.data.items[0];const annual=await db.leaveType.findUniqueOrThrow({where:{tenantId_name:{tenantId:tenant.id,name:'Annual leave'}}});
      const leave=await call('leave','POST',{employeeId:own.id,leaveTypeId:annual.id,startDate:'2026-10-05',endDate:'2026-10-05',reason:'Employee self-service QA request',requestKey:'full-cycle-employee-leave'},employee);assert.equal(leave.status,200,JSON.stringify(leave.data));assert.equal(leave.data.status,'PENDING');
      const reviewed=await call(`leave/${leave.data.id}/review`,'POST',{decision:'APPROVED',note:'Approved by HR QA'},owner);assert.equal(reviewed.status,200,JSON.stringify(reviewed.data));assert.equal(reviewed.data.status,'APPROVED');
      const expense=await call('expenses','POST',{employeeId:own.id,title:'QA employee meal',category:'Meals',amount:95000,date:'2026-10-01',notes:'Self-service expense'},employee);assert.equal(expense.status,200,JSON.stringify(expense.data));assert.equal(expense.data.status,'PENDING');
      const expApproved=await call(`expenses/${expense.data.id}/review`,'POST',{decision:'APPROVED',note:'QA approve'},owner);assert.equal(expApproved.status,200);assert.equal(expApproved.data.status,'APPROVED');
      const travel=await call('travel','POST',{employeeId:own.id,destination:'Vadodara',purpose:'QA customer visit',startDate:'2026-10-08',endDate:'2026-10-09',budget:500000},employee);assert.equal(travel.status,200,JSON.stringify(travel.data));assert.equal(travel.data.status,'PENDING');
      const tripApproved=await call(`travel/${travel.data.id}/review`,'POST',{decision:'APPROVED',note:'QA approve'},owner);assert.equal(tripApproved.status,200);assert.equal(tripApproved.data.status,'APPROVED');
    });

    await t.test('current month payroll cannot create future-day salary loss',async()=>{
      const r=await call('payroll','POST',{month:'2026-10'},owner);assert.equal(r.status,400);assert.match(String(r.data?.message??r.data),/completed month|current month/i);
    });

    await t.test('full reset is deployment-idempotent',async()=>{
      const before={tenants:await db.tenant.count(),employees:await db.employee.count(),payments:await db.payment.count()};
      const again=await resetAndSeedFullQa(db,{qaEmail,qaPassword,qaCode:'TCW-QA',now:new Date('2026-10-01T06:30:00.000Z'),runKey:'integration-full-cycle',confirmation:'DELETE_AND_REBUILD_TCW_QA'});
      assert.equal(again.skipped,true);
      assert.deepEqual({tenants:await db.tenant.count(),employees:await db.employee.count(),payments:await db.payment.count()},before);
    });
  }finally{io.close();await app.close();await fixture.close()}
});
