import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {embeddedDatabase} from '../helpers/database';
import {seed} from '../../prisma/seed';
import {createApp} from '../../apps/api/src/app';
import {hashPassword} from '../../packages/auth';
import {totp} from '../../packages/auth/totp';
import {toCsv,toXlsx} from '../../packages/reporting-engine';
import {preparePayrollMonth,finalizePayrollMonth,reopenPayrollMonth} from '../../apps/api/src/payroll-service';

test('HR operations work through authenticated APIs with tenant isolation',async t=>{
  process.env.NODE_ENV='test';process.env.REPORTS_MAINTENANCE='false';process.env.APP_ORIGINS='http://localhost:3000';
  const previousKey=process.env.CONFIG_ENCRYPTION_KEY;process.env.CONFIG_ENCRYPTION_KEY='synthetic-test-key-for-authenticator-32chars';
  const fixture=await embeddedDatabase(),db=fixture.db;
  await seed(db,{adminEmail:'ops-admin@example.test',adminPassword:'SyntheticAdmin!2026',ownerEmail:'ops-owner@example.test',ownerPassword:'SyntheticOwner!2026',companyCode:'OPS'});
  const {app,io}=await createApp(db);await app.listen(0,'127.0.0.1');const base=`http://127.0.0.1:${app.getHttpServer().address().port}/api/`;
  type Auth={cookie:string;csrf:string};
  async function call(path:string,method='GET',body?:any,auth?:Auth){const response=await fetch(base+path,{method,headers:{Origin:'http://localhost:3000','X-PeopleOS-Portal':'TENANT',...(body!==undefined?{'Content-Type':'application/json'}:{}),...(auth?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});const text=await response.text();let data:any;try{data=JSON.parse(text)}catch{data=text}return {status:response.status,data,response};}
  async function login(email:string,password:string,twoFactorCode?:string){const r=await call('auth/login','POST',{email,password,companyCode:'OPS',...(twoFactorCode?{twoFactorCode}:{})});assert.equal(r.status,200,JSON.stringify(r.data));return {cookie:r.response.headers.get('set-cookie')!.split(';')[0],csrf:r.data.csrf};}
  try{
    let owner=await login('ops-owner@example.test','SyntheticOwner!2026');const company=await db.tenant.findUniqueOrThrow({where:{code:'OPS'}}),tid=company.id,user=await db.user.findFirstOrThrow({where:{tenantId:tid,email:'ops-owner@example.test'}});
    const shift=await db.shift.create({data:{tenantId:tid,name:'Operations shift',startMinute:540,endMinute:1080}});
    const department=await db.department.create({data:{tenantId:tid,name:'Engineering',code:'ENG'}});
    const input={employeeCode:'OPS-001',firstName:'Salary',lastName:'Employee',email:'salary-ops@example.test',phone:'9000000000',joiningDate:'2020-01-01',monthlySalary:100000,shiftId:shift.id,departmentId:department.id,personal:{bankName:'Synthetic bank',accountNumber:'0000000000'}};
    let employee=(await call('employees','POST',input,owner)).data;
    await t.test('salary versions retain an opening baseline and reject stale edits and unauthorized access',async()=>{
      const payload={effectiveMonth:'2024-03',basic:80000,hra:20000,allowances:10000,overtimeHourly:5000,reason:'Synthetic salary structure',expectedUpdatedAt:employee.updatedAt};
      const r=await call('salary-versions/'+employee.id,'POST',payload,owner);assert.equal(r.status,200,JSON.stringify(r.data));
      const history=await call('salary-versions/'+employee.id,'GET',undefined,owner);assert.equal(history.data.items.length,2);assert.equal(history.data.items[1].basic,100000);assert.equal(history.data.employee.monthlySalary,110000);
      assert.equal((await call('salary-versions/'+employee.id,'POST',{...payload,effectiveMonth:'2024-04'},owner)).status,409);
      assert.equal((await call('salary-versions/'+randomUUID(),'GET',undefined,owner)).status,404);
      assert.equal((await call('employees/'+employee.id,'PATCH',{...input,monthlySalary:120000},owner)).status,409);
      employee=(await call('employees/'+employee.id,'GET',undefined,owner)).data;
    });
    let loanId:string,runId:string;
    await t.test('loan installments, overtime and breakdown reconcile exactly through recalculate finalize and reopen',async()=>{
      const loan=await call('payroll-loans','POST',{employeeId:employee.id,principal:25000,installment:10000,startMonth:'2024-03',reason:'Existing synthetic advance recovery'},owner);assert.equal(loan.status,200,JSON.stringify(loan.data));loanId=loan.data.id;
      const schedule=await db.loanInstallment.findMany({where:{loanId},orderBy:{month:'asc'}});assert.deepEqual(schedule.map(i=>i.amount),[10000,10000,5000]);
      await db.attendancePeriodLock.create({data:{tenantId:tid,month:'2024-03',status:'LOCKED',lockedBy:user.id,lockedAt:new Date()}});
      await db.attendanceDaily.create({data:{tenantId:tid,employeeId:employee.id,shiftId:shift.id,date:new Date('2024-03-05'),status:'PRESENT',workMinutes:540,overtimeMinutes:60,scheduledMinutes:480,payableUnits:100,syncedAt:new Date(),lockedAt:new Date()}});
      let run=await preparePayrollMonth(db,tid,'2024-03',user.id);runId=run.id;assert.equal(run.items[0].gross,115000);assert.equal(run.items[0].deductions,10000);assert.equal(run.items[0].net,105000);
      const amounts=(run.items[0].components as any[]).filter(c=>c.type==='EARNING');assert.equal(amounts.reduce((n,c)=>n+c.amount,0),115000);
      run=await preparePayrollMonth(db,tid,'2024-03',user.id);assert.equal(run.items[0].net,105000);assert.equal(await db.loanInstallment.count({where:{appliedRunId:run.id}}),1);
      await finalizePayrollMonth(db,tid,run.id,user.id);assert.equal((await call('payroll-loans','GET',undefined,owner)).data.items[0].recovered,10000);
      assert.equal((await call('salary-versions/'+employee.id,'POST',{effectiveMonth:'2024-02',basic:1,hra:0,allowances:0,overtimeHourly:0,reason:'Must not alter finalized pay',expectedUpdatedAt:employee.updatedAt},owner)).status,409);
      await reopenPayrollMonth(db,tid,run.id,user.id);assert.equal(await db.loanInstallment.count({where:{appliedRunId:run.id}}),0);
      assert.equal((await call('payroll-loans/'+loanId,'DELETE',{},owner)).status,200);assert.equal(await db.loanInstallment.count({where:{loanId,cancelled:true}}),3);
    });
    await t.test('Excel import previews errors, commits atomically and never overwrites private fields',async()=>{
      const row={employeeCode:'IMP-01',firstName:'Imported',lastName:'Employee',email:'imported@example.test',phone:'09000000000',joiningDate:'2024-01-01',departmentCode:'ENG',monthlySalary:'25000.50'};
      const body={fileName:'employees.xlsx',content:toXlsx([row]).toString('base64'),mode:'CREATE'};
      const preview=await call('employees/import/preview','POST',body,owner);assert.equal(preview.status,200);assert.equal(preview.data.valid,true);assert.equal(await db.employee.count({where:{tenantId:tid,employeeCode:'IMP-01'}}),0);
      const committed=await call('employees/import/commit','POST',{...body,expectedDigest:preview.data.digest},owner);assert.equal(committed.status,200,JSON.stringify(committed.data));assert.equal(committed.data.count,1);
      const imported=await db.employee.findFirstOrThrow({where:{tenantId:tid,employeeCode:'IMP-01'}});assert.equal(imported.monthlySalary,2500050);assert.equal(imported.phone,'09000000000');assert.equal(imported.departmentId,department.id);
      const bad={...body,fileName:'bad.csv',content:Buffer.from(toCsv([{...row,employeeCode:'NEW-02'},{...row,employeeCode:'NEW-03',email:'different@example.test',departmentCode:'UNKNOWN'}])).toString('base64')};
      const errors=await call('employees/import/preview','POST',bad,owner);assert.equal(errors.data.valid,false);assert.equal((await call('employees/import/commit','POST',{...bad,expectedDigest:errors.data.digest},owner)).status,400);assert.equal(await db.employee.count({where:{tenantId:tid,employeeCode:'NEW-02'}}),0);
      const update={fileName:'update.csv',mode:'UPDATE',content:Buffer.from(toCsv([{employeeCode:employee.employeeCode,firstName:'Updated',lastName:'Employee',email:employee.email,phone:'9000000000',joiningDate:'2020-01-01'}])).toString('base64')};
      const check=await call('employees/import/preview','POST',update,owner);assert.equal(check.data.valid,true);
      assert.equal((await call('employees/import/commit','POST',{...update,expectedDigest:check.data.digest},owner)).status,200);
      assert.equal((await db.employee.findUniqueOrThrow({where:{id:employee.id}})).personal&&((await db.employee.findUniqueOrThrow({where:{id:employee.id}})).personal as any).accountNumber,'0000000000');
      const stale=await call('employees/import/preview','POST',update,owner);await db.employee.update({where:{id:employee.id},data:{designation:'Changed after preview'}});
      assert.equal((await call('employees/import/commit','POST',{...update,expectedDigest:stale.data.digest},owner)).status,409);
    });
    const managerEmployee=await db.employee.create({data:{tenantId:tid,employeeCode:'MGR',firstName:'Reporting',lastName:'Manager',email:'manager-employee@example.test',joiningDate:new Date('2020-01-01')}});
    await db.employee.update({where:{id:employee.id},data:{managerId:managerEmployee.id}});
    const managerRole=await db.role.findUniqueOrThrow({where:{code:'MANAGER'}}),employeeRole=await db.role.findUniqueOrThrow({where:{code:'EMPLOYEE'}});
    await db.user.create({data:{tenantId:tid,employeeId:managerEmployee.id,name:'Manager',email:'manager-login@example.test',passwordHash:await hashPassword('SyntheticManager!2026'),roleId:managerRole.id}});
    await db.user.create({data:{tenantId:tid,employeeId:employee.id,name:'Employee',email:'employee-login@example.test',passwordHash:await hashPassword('SyntheticEmployee!2026'),roleId:employeeRole.id}});
    const manager=await login('manager-login@example.test','SyntheticManager!2026'),self=await login('employee-login@example.test','SyntheticEmployee!2026');
    await t.test('two-stage approval preserves the submitted policy and requires manager then a separate final reviewer',async()=>{
      assert.equal((await call('approval-policies','POST',{resource:'expenses',mode:'MANAGER_HR'},owner)).status,200);
      const expense=await call('expenses','POST',{employeeId:employee.id,title:'Synthetic travel claim',category:'Travel',amount:10000,date:'2024-03-01'},self);assert.equal(expense.status,200);
      assert.equal((await call('expenses/'+expense.data.id+'/review','POST',{decision:'APPROVED',note:''},owner)).status,403);
      assert.equal((await call('expenses/'+expense.data.id+'/review','POST',{decision:'APPROVED',note:''},self)).status,403);
      const stage=await call('expenses/'+expense.data.id+'/review','POST',{decision:'APPROVED',note:'Manager verified'},manager);assert.equal(stage.status,200,JSON.stringify(stage.data));assert.equal(stage.data.status,'PENDING');
      await call('approval-policies','POST',{resource:'expenses',mode:'SINGLE'},owner);
      assert.equal((await call('expenses/'+expense.data.id+'/review','POST',{decision:'APPROVED',note:''},manager)).status,403);
      const final=await call('expenses/'+expense.data.id+'/review','POST',{decision:'APPROVED',note:'HR verified'},owner);assert.equal(final.status,200);assert.equal(final.data.status,'APPROVED');
      const history=await db.approvalRequest.findFirstOrThrow({where:{requestId:expense.data.id}});assert.equal(history.stage,'APPROVED');assert.notEqual(history.managerReviewerId,history.finalReviewerId);
      assert.equal((await call('expenses/'+expense.data.id+'/review','POST',{decision:'REJECTED',note:'Already reviewed'},owner)).status,409);
      assert.equal((await call('salary-versions/'+employee.id,'GET',undefined,manager)).status,403);
      assert.equal((await call('payroll-loans','GET',undefined,self)).status,403);
    });
    await t.test('joining and exit checklists are idempotent, audited and protect stale edits',async()=>{
      await call('employees/'+employee.id+'/tasks','POST',{kind:'JOINING'},owner);await call('employees/'+employee.id+'/tasks','POST',{kind:'JOINING'},owner);
      const tasks=await call('employees/'+employee.id+'/tasks','GET',undefined,owner);assert.equal(tasks.data.items.length,5);const first=tasks.data.items[0];
      const changed=await call('employees/'+employee.id+'/tasks','PATCH',{taskId:first.id,completed:true,expectedUpdatedAt:first.updatedAt},owner);assert.equal(changed.status,200);assert.equal(changed.data.completedBy,user.id);
      assert.equal((await call('employees/'+employee.id+'/tasks','PATCH',{taskId:first.id,completed:false,expectedUpdatedAt:first.updatedAt},owner)).status,409);
      assert.equal((await call('employees/'+employee.id+'/tasks','GET',undefined,self)).status,403);
      const letter=await call('employees/'+employee.id+'/letter?kind=appointment','GET',undefined,owner);assert.equal(letter.status,200);assert.ok(letter.data.startsWith('%PDF-'));
      assert.equal((await call('employees/'+employee.id+'/letter?kind=experience','GET',undefined,owner)).status,409);
    });
    await t.test('training enforces capacity, records completion and protects certificates',async()=>{
      const course=await call('courses','POST',{title:'Synthetic security training',trainer:'QA trainer',date:'2024-03-01',capacity:1},owner);assert.equal(course.status,200);
      const enrolled=await call('courses/'+course.data.id+'/enrollments','POST',{employeeId:employee.id},owner);assert.equal(enrolled.status,200);
      assert.equal((await call('training-certificates/'+enrolled.data.id,'GET',undefined,owner)).status,404);
      assert.equal((await call('courses/'+course.data.id+'/enrollments','POST',{employeeId:managerEmployee.id},owner)).status,409);
      const updated=await call('courses/'+course.data.id+'/enrollments','PATCH',{enrollmentId:enrolled.data.id,status:'COMPLETED',score:95,expectedUpdatedAt:enrolled.data.updatedAt},owner);assert.equal(updated.status,200,JSON.stringify(updated.data));
      const certificate=await call('training-certificates/'+enrolled.data.id,'GET',undefined,owner);assert.equal(certificate.status,200);assert.ok(certificate.data.startsWith('%PDF-'));
      assert.equal((await call('courses/'+course.data.id,'DELETE',{},owner)).status,409);
    });
    await t.test('asset events retain assignment and return history independently of current assignment',async()=>{
      const body={name:'Synthetic laptop',assetTag:'SYN-LAPTOP',category:'Laptop',status:'AVAILABLE',value:100000};const asset=await call('assets','POST',body,owner);assert.equal(asset.status,200);
      await call('assets/'+asset.data.id,'PATCH',{...body,employeeId:employee.id,status:'ASSIGNED'},owner);const returned=await call('assets/'+asset.data.id,'PATCH',{...body,employeeId:null},owner);assert.equal(returned.status,200,JSON.stringify(returned.data));
      const history=await call('assets/'+asset.data.id+'/history','GET',undefined,owner);assert.equal(history.status,200);assert.ok(history.data.items.some((r:any)=>r.kind==='ASSIGNED'&&r.employeeName==='Updated Employee'));assert.ok(history.data.items.some((r:any)=>r.kind==='RETURNED'));
      assert.equal((await call('assets/'+asset.data.id+'/history','GET',undefined,self)).status,403);
    });
    await t.test('report previews and exports use the same scoped date and department filters',async()=>{
      await db.expenseClaim.create({data:{tenantId:tid,employeeId:managerEmployee.id,title:'Outside department',category:'Office',amount:500,date:new Date('2024-03-01')}});
      const query='from=2024-03-01&to=2024-03-31&departmentId='+department.id;
      const preview=await call('reports/expenses?preview=true&'+query,'GET',undefined,owner);assert.equal(preview.status,200);assert.equal(preview.data.total,1);assert.equal(preview.data.items[0].employeeName,'Updated Employee');
      const exportFile=await call('reports/expenses?format=csv&'+query,'GET',undefined,owner);assert.equal(exportFile.status,200);assert.match(exportFile.data,/Synthetic travel claim/);assert.doesNotMatch(exportFile.data,/Outside department/);
      assert.equal((await call('reports/expenses?preview=true&from=2024-04-01&to=2024-03-01','GET',undefined,owner)).status,400);
      assert.equal((await call('reports/payroll-items?preview=true','GET',undefined,self)).status,403);
      const beta=await db.tenant.create({data:{name:'Foreign',code:'OPS-FOREIGN'}}),foreign=await db.employee.create({data:{tenantId:beta.id,employeeCode:'FOREIGN',firstName:'Foreign',lastName:'Employee',email:'foreign@example.test',joiningDate:new Date('2020-01-01')}});
      assert.equal((await call('salary-versions/'+foreign.id,'GET',undefined,owner)).status,404);assert.equal((await call('employees/'+foreign.id+'/tasks','GET',undefined,owner)).status,404);
    });
    await t.test('reports maintenance blocks existing and newly created accounts including direct exports',async()=>{
      const keys=['REPORTS_MAINTENANCE','REPORTS_PREVIEW_USER_IDS','REPORTS_PREVIEW_LOGIN','REPORTS_PREVIEW_COMPANY_CODE','REPORTS_PREVIEW_CREATED_BEFORE'];
      const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
      try{
        for(const key of keys)delete process.env[key];
        process.env.REPORTS_MAINTENANCE='true';process.env.REPORTS_PREVIEW_USER_IDS=user.id;
        assert.deepEqual((await call('reports/access','GET',undefined,owner)).data,{available:true,maintenance:true});
        assert.equal((await call('reports/employees?preview=true','GET',undefined,owner)).status,200);
        assert.deepEqual((await call('reports/access','GET',undefined,manager)).data,{available:false,maintenance:true});
        const created=await db.user.create({data:{tenantId:tid,name:'New owner',email:'new-owner@example.test',passwordHash:await hashPassword('SyntheticNewOwner!2026'),roleId:user.roleId}});
        const newOwner=await login(created.email,'SyntheticNewOwner!2026');
        assert.deepEqual((await call('reports/access','GET',undefined,newOwner)).data,{available:false,maintenance:true});
        for(const auth of [manager,newOwner])for(const path of ['reports/employees?preview=true','reports/employees?format=csv','reports/payroll-items?format=xlsx','reports/payroll?format=pdf','reports/bank-payout?format=csv','reports/attendance-summary?month=2024-03']){
          const r=await call(path,'GET',undefined,auth);assert.equal(r.status,403,path);assert.match(r.data.message,/Under Maintenance/);assert.equal(r.data.items,undefined);assert.equal(r.response.headers.get('content-disposition'),null);
        }
        delete process.env.REPORTS_PREVIEW_USER_IDS;
        assert.equal((await call('reports/employees?preview=true','GET',undefined,owner)).status,403);
        process.env.REPORTS_PREVIEW_LOGIN=user.email;process.env.REPORTS_PREVIEW_COMPANY_CODE='OPS';process.env.REPORTS_PREVIEW_CREATED_BEFORE=user.createdAt.toISOString();
        assert.equal((await call('reports/employees?preview=true','GET',undefined,owner)).status,200);
        process.env.REPORTS_PREVIEW_COMPANY_CODE='OTHER';assert.equal((await call('reports/employees?preview=true','GET',undefined,owner)).status,403);
      }finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
    });
    await t.test('2FA blocks password-only sessions, rejects replay, consumes recovery codes once and disables securely',async()=>{
      const setup=await call('auth/two-factor/setup','POST',{currentPassword:'SyntheticOwner!2026'},owner);assert.equal(setup.status,200,JSON.stringify(setup.data));assert.ok(setup.data.uri.startsWith('otpauth://'));
      const stored=await db.userSecurity.findUniqueOrThrow({where:{userId:user.id}});assert.ok(!stored.pendingSecret?.includes(setup.data.secret));
      const code=totp(setup.data.secret);const enabled=await call('auth/two-factor/enable','POST',{currentPassword:'SyntheticOwner!2026',code},owner);assert.equal(enabled.status,200);assert.equal(enabled.data.recoveryCodes.length,10);
      const challenge=await call('auth/login','POST',{email:'ops-owner@example.test',password:'SyntheticOwner!2026',companyCode:'OPS'});assert.equal(challenge.data.twoFactorRequired,true);assert.equal(challenge.response.headers.get('set-cookie'),null);
      assert.equal((await call('auth/login','POST',{email:'ops-owner@example.test',password:'SyntheticOwner!2026',companyCode:'OPS',twoFactorCode:code})).status,401);
      owner=await login('ops-owner@example.test','SyntheticOwner!2026',enabled.data.recoveryCodes[0]);
      assert.equal((await call('auth/login','POST',{email:'ops-owner@example.test',password:'SyntheticOwner!2026',companyCode:'OPS',twoFactorCode:enabled.data.recoveryCodes[0]})).status,401);
      assert.equal((await call('auth/two-factor','GET',undefined,owner)).data.recoveryCodesRemaining,9);
      assert.equal((await call('auth/two-factor/disable','POST',{currentPassword:'SyntheticOwner!2026',code:enabled.data.recoveryCodes[1]},owner)).status,200);
      assert.equal((await call('auth/two-factor','GET',undefined,owner)).data.enabled,false);
      await login('ops-owner@example.test','SyntheticOwner!2026');
    });
  }finally{io.close();await app.close();await fixture.close();if(previousKey===undefined)delete process.env.CONFIG_ENCRYPTION_KEY;else process.env.CONFIG_ENCRYPTION_KEY=previousKey;}
});
