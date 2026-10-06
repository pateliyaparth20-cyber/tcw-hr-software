import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {roleDefinitions} from '../../packages/permissions';
import {hashPassword} from '../../packages/auth';
import {totp} from '../../packages/auth/totp';
import {twoFactor,verifySecondFactor} from '../../apps/api/src/two-factor';
import {SalaryOperations} from '../../apps/api/src/salary-operations';
import {PeopleOperations} from '../../apps/api/src/people-operations';
import {Workflows} from '../../apps/api/src/workflows';
import {DataService} from '../../apps/api/src/data';
import {preparePayrollMonth} from '../../apps/api/src/payroll-service';
import type {Context} from '../../apps/api/src/context';

test('HR operations serialize concurrent salary, enrollment, approval and authenticator changes',async t=>{
  const value=process.env.PAYROLL_TEST_DATABASE_URL;if(!value)throw new Error('An isolated concurrency database is required.');const url=new URL(value);
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.pathname!=='/tcw_payroll_test')throw new Error('Only the local tcw_payroll_test database is allowed.');
  const db=new PrismaClient({datasources:{db:{url:value}}});
  const previous=process.env.CONFIG_ENCRYPTION_KEY;process.env.CONFIG_ENCRYPTION_KEY='isolated-concurrency-authenticator-key-32chars';
  try{
    const tid=(await db.tenant.create({data:{name:'Synthetic operations concurrency',code:'OPS-CONCURRENT-'+randomUUID()}})).id;
    const role=roleDefinitions.find(r=>r.code==='COMPANY_OWNER')!,actorId=randomUUID();const ctx:Context={tenantId:tid,user:{id:actorId,role},session:{id:randomUUID()},ip:'127.0.0.1'};
    const shift=await db.shift.create({data:{tenantId:tid,name:'Concurrency shift',startMinute:540,endMinute:1080}});
    const employee=await db.employee.create({data:{tenantId:tid,employeeCode:'C-01',firstName:'Concurrent',lastName:'Employee',email:'concurrent@example.test',joiningDate:new Date('2020-01-01'),monthlySalary:100000,shiftId:shift.id}});
    const second=await db.employee.create({data:{tenantId:tid,employeeCode:'C-02',firstName:'Second',lastName:'Employee',email:'second-concurrent@example.test',joiningDate:new Date('2020-01-01')}});
    await t.test('salary revision and payroll preparation resolve to one consistent salary',async()=>{
      await db.attendancePeriodLock.create({data:{tenantId:tid,month:'2024-03',status:'LOCKED',lockedAt:new Date()}});
      await db.attendanceDaily.create({data:{tenantId:tid,employeeId:employee.id,shiftId:shift.id,date:new Date('2024-03-05'),status:'PRESENT',workMinutes:480,scheduledMinutes:480,payableUnits:100,syncedAt:new Date(),lockedAt:new Date()}});
      const results=await Promise.allSettled([preparePayrollMonth(db,tid,'2024-03',actorId),new SalaryOperations(db).versions(ctx,employee.id,'POST',{effectiveMonth:'2024-03',basic:200000,hra:0,allowances:0,overtimeHourly:0,reason:'Concurrent salary revision',expectedUpdatedAt:employee.updatedAt.toISOString()})]);
      assert.equal(results[0].status,'fulfilled');const item=await db.payrollItem.findFirstOrThrow({where:{tenantId:tid,employeeId:employee.id}});
      assert.equal(item.net,results[1].status==='fulfilled'?200000:100000);
      const versions=await db.salaryVersion.findMany({where:{tenantId:tid,employeeId:employee.id,effectiveMonth:'2024-03'}});assert.equal(versions.length,results[1].status==='fulfilled'?1:0);
    });
    await t.test('two simultaneous enrollments cannot exceed capacity',async()=>{
      const course=await db.course.create({data:{tenantId:tid,title:'One seat',trainer:'QA',date:new Date('2024-03-01'),description:'Synthetic',capacity:1}}),service=new PeopleOperations(db);
      const results=await Promise.allSettled([service.enrollments(ctx,course.id,'POST',{employeeId:employee.id}),service.enrollments(ctx,course.id,'POST',{employeeId:second.id})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(await db.courseEnrollment.count({where:{tenantId:tid,courseId:course.id}}),1);
    });
    await t.test('duplicate manager approvals cannot advance both stages',async()=>{
      await db.employee.update({where:{id:employee.id},data:{managerId:second.id}});await db.approvalPolicy.create({data:{tenantId:tid,resource:'expenses',mode:'MANAGER_HR'}});
      const row:any=await new DataService(db).resource(ctx,'expenses','POST',undefined,{employeeId:employee.id,title:'Concurrent expense',category:'Office',amount:1000,date:'2024-03-01'});
      const manager:Context={...ctx,user:{id:randomUUID(),employeeId:second.id,role:roleDefinitions.find(r=>r.code==='MANAGER')!}},flows=new Workflows(db);
      const results=await Promise.allSettled([flows.review(manager,'expenses',row.id,{decision:'APPROVED',note:'Manager review'}),flows.review(manager,'expenses',row.id,{decision:'APPROVED',note:'Duplicate review'})]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await db.expenseClaim.findUniqueOrThrow({where:{id:row.id}})).status,'PENDING');assert.equal((await db.approvalRequest.findFirstOrThrow({where:{requestId:row.id}})).stage,'HR');
      assert.equal((await flows.review(ctx,'expenses',row.id,{decision:'APPROVED',note:'Separate final reviewer'})).status,'APPROVED');
    });
    await t.test('a recovery code cannot establish two concurrent authenticator verifications',async()=>{
      const roleRow=await db.role.upsert({where:{code:'OPS_TEST_MFA'},create:{code:'OPS_TEST_MFA',name:'Synthetic MFA role',scope:'TENANT',permissions:[]},update:{}});
      const user=await db.user.create({data:{tenantId:tid,name:'Synthetic MFA',email:'mfa-concurrency@example.test',passwordHash:await hashPassword('SyntheticMfa!2026'),roleId:roleRow.id}}),authCtx:Context={...ctx,user:{...user,role},session:{id:randomUUID()}};
      const setup:any=await twoFactor(db,authCtx,'POST','setup',{currentPassword:'SyntheticMfa!2026'}),enabled:any=await twoFactor(db,authCtx,'POST','enable',{currentPassword:'SyntheticMfa!2026',code:totp(setup.secret)});
      const results=await Promise.allSettled([verifySecondFactor(db,user.id,enabled.recoveryCodes[0]),verifySecondFactor(db,user.id,enabled.recoveryCodes[0])]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await db.userSecurity.findUniqueOrThrow({where:{userId:user.id}})).recoveryHashes instanceof Array,true);assert.equal(((await db.userSecurity.findUniqueOrThrow({where:{userId:user.id}})).recoveryHashes as any[]).length,9);
    });
  }finally{await db.$disconnect();if(previous===undefined)delete process.env.CONFIG_ENCRYPTION_KEY;else process.env.CONFIG_ENCRYPTION_KEY=previous;}
});
