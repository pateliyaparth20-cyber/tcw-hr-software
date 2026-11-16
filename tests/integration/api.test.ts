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
 process.env.NODE_ENV='test';process.env.REPORTS_MAINTENANCE='false';process.env.APP_ORIGINS='http://localhost:3000,http://localhost:3001';
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
  await t.test('people summaries span all pages and filters while facets and profiles stay tenant scoped',async()=>{
   const branch=await db.branch.create({data:{tenantId:alphaTenant,name:'Directory branch',code:'DIR'}});
   const shift=await db.shift.create({data:{tenantId:alphaTenant,name:'Directory shift',startMinute:540,endMinute:1020}});
   const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit'}).formatToParts(new Date()),year=parts.find(p=>p.type==='year')!.value,month=parts.find(p=>p.type==='month')!.value;
   const people=await Promise.all(['Zulu','Aaron','Mira'].map((name,i)=>db.employee.create({data:{tenantId:alphaTenant,employeeCode:'DIRECTORY-'+i,firstName:name,lastName:'Directory',email:'directory-'+i+'@example.test',joiningDate:new Date(`${year}-${month}-01`),status:i===1?'PROBATION':'ACTIVE',departmentId:depA.data.id,branchId:branch.id,shiftId:shift.id,managerId:a.data.id}})));
   try{
    const first=await call('employees?includeSummary=true&sort=name&pageSize=1&page=1&q=Directory','GET',undefined,alpha);
    assert.equal(first.status,200,JSON.stringify(first.data));assert.equal(first.data.items[0].firstName,'Aaron');assert.equal(first.data.total,3);assert.equal(first.data.summary.total,4);assert.equal(first.data.summary.active,3);assert.equal(first.data.summary.probation,1);assert.equal(first.data.summary.joining,3);assert.equal(first.data.filters.branches[0].name,branch.name);
    const second=await call('employees?includeSummary=true&sort=name&pageSize=1&page=2&q=Directory','GET',undefined,alpha);assert.equal(second.data.items[0].firstName,'Mira');assert.deepEqual(first.data.summary,second.data.summary);
    const filtered=await call(`employees?includeSummary=true&status=PROBATION&departmentId=${depA.data.id}&branchId=${branch.id}&shiftId=${shift.id}`,'GET',undefined,alpha);assert.equal(filtered.data.total,1);assert.equal(filtered.data.summary.total,4);
    const scoped=await call('employees?includeSummary=true','GET',undefined,self);assert.equal(scoped.data.summary.total,1);assert.equal(scoped.data.filters.branches.length,0);assert.equal(scoped.data.items[0].id,a.data.id);
    const foreign=await call('employees?includeSummary=true','GET',undefined,beta);assert.equal(foreign.data.summary.total,1);assert(!foreign.data.filters.departments.some((d:any)=>d.id===depA.data.id));
    const detail=await call('employees/'+people[0].id,'GET',undefined,alpha);assert.equal(detail.data.managerName,'Test Employee');assert.equal(detail.data.shiftName,shift.name);assert.equal(detail.data.branchName,branch.name);assert.equal(detail.data.departmentName,'Engineering');
   }finally{await db.employee.deleteMany({where:{id:{in:people.map(p=>p.id)}}});await db.shift.delete({where:{id:shift.id}});await db.branch.delete({where:{id:branch.id}});}
  });
  await t.test('employee profile saves reject stale snapshots without overwriting newer details',async()=>{
   const profile=(await call('employees/'+a.data.id,'GET',undefined,alpha)).data;
   await db.employee.update({where:{id:a.data.id},data:{personal:{city:'Newer city'},updatedAt:new Date(Date.now()+1000)}});
   const stale=await call('employees/'+a.data.id,'PATCH',{...employeeInput,personal:{city:'Stale city'},expectedUpdatedAt:profile.updatedAt},alpha);assert.equal(stale.status,409);assert.equal(((await db.employee.findUniqueOrThrow({where:{id:a.data.id}})).personal as any).city,'Newer city');
   const current=(await call('employees/'+a.data.id,'GET',undefined,alpha)).data;
   const saved=await call('employees/'+a.data.id,'PATCH',{...employeeInput,personal:{city:'Confirmed city'},expectedUpdatedAt:current.updatedAt},alpha);assert.equal(saved.status,200,JSON.stringify(saved.data));assert.equal(saved.data.personal.city,'Confirmed city');
  });
  await t.test('organization sorting is stable across pages and branch descriptions persist within the tenant',async()=>{
   const b1=await call('branches','POST',{name:'Zulu office',code:'SORT-Z',location:'Test area',description:'Synthetic branch notes'},alpha);assert.equal(b1.status,200);assert.equal(b1.data.description,'Synthetic branch notes');
   const b2=await call('branches','POST',{name:'Alpha office',code:'SORT-A',location:'Test area'},alpha);assert.equal(b2.status,200);
   const first=await call('branches?sort=name&pageSize=1&page=1','GET',undefined,alpha),second=await call('branches?sort=name&pageSize=1&page=2','GET',undefined,alpha);assert.equal(first.data.items[0].name,'Alpha office');assert.equal(second.data.items[0].name,'Zulu office');assert.equal(first.data.total,2);
   assert.equal((await call('branches?sort=name','GET',undefined,beta)).data.total,0);
   await call('branches/'+b1.data.id,'DELETE',undefined,alpha);await call('branches/'+b2.data.id,'DELETE',undefined,alpha);
  });
  await t.test('organization chart is tenant-scoped and excludes confidential fields',async()=>{
   const child=await db.employee.create({data:{tenantId:alphaTenant,employeeCode:'CHART-CHILD',firstName:'Chart',lastName:'Child',email:'chart@example.test',joiningDate:new Date('2099-01-01'),managerId:a.data.id,departmentId:depA.data.id}});
   const chart=await call('organization-chart','GET',undefined,alpha);assert.equal(chart.status,200);
   assert.equal(chart.data.items.length,2);assert(!chart.data.items.some((p:any)=>p.id===b.data.id));
   const item=chart.data.items.find((p:any)=>p.id===child.id);assert.equal(item.managerId,a.data.id);assert.equal(item.departmentName,'Engineering');
   for(const item of chart.data.items)for(const key of ['email','phone','monthlySalary','personal','photo'])assert(!Object.hasOwn(item,key));
   assert.equal((await call('organization-chart','GET',undefined,self)).status,403);
   await db.employee.update({where:{id:child.id},data:{deletedAt:new Date()}});
   assert.equal((await call('organization-chart','GET',undefined,alpha)).data.items.length,1);
   await db.employee.delete({where:{id:child.id}});
  });
  await t.test('HR profile edits preserve hidden bank details and cannot overwrite them',async()=>{
   const bank={bankName:'Test Bank',accountHolder:'Test Employee',accountNumber:'1234567890',ifsc:'TEST0000001',bankBranch:'Test Branch'};
   await db.employee.update({where:{id:a.data.id},data:{personal:{...bank,city:'Old city'}}});
   const role=await db.role.findUniqueOrThrow({where:{code:'HR_EXECUTIVE'}});
   await db.user.create({data:{tenantId:alphaTenant,name:'HR editor',email:'hr-editor@example.test',passwordHash:await hashPassword('test-hr-editor-password'),roleId:role.id}});
   const editor=await login('hr-editor@example.test','test-hr-editor-password','ALPHA');
   const {monthlySalary,...editable}=employeeInput;
   const updated=await call('employees/'+a.data.id,'PATCH',{...editable,personal:{city:'New city'}},editor);
   assert.equal(updated.status,200,JSON.stringify(updated.data));assert.equal(updated.data.personal.city,'New city');assert.equal(updated.data.personal.accountNumber,undefined);
   const stored=await db.employee.findUniqueOrThrow({where:{id:a.data.id}});
   assert.deepEqual(stored.personal,{...bank,city:'New city'});assert.equal(stored.monthlySalary,monthlySalary);
   assert.equal((await call('employees/'+a.data.id,'PATCH',{...editable,personal:{accountNumber:'999'}},editor)).status,403);
  });
  await t.test('employees cannot read company payout records or sync provider payments',async()=>{
   const run=await db.payrollRun.create({data:{tenantId:alphaTenant,month:'2025-12'}});
   await db.payrollPayout.create({data:{tenantId:alphaTenant,runId:run.id,employeeId:a.data.id,employeeName:'Private salary',employeeCode:'A01',amount:500000,provider:'TEST',reference:'privacy-regression'}});
   assert.equal((await call(`payroll/${run.id}/payouts`,'GET',undefined,self)).status,403);
   assert.equal((await call(`payroll/${run.id}/payout-sync`,'POST',{},self)).status,403);
   assert.equal((await call(`payroll/${run.id}/payouts`,'GET',undefined,alpha)).data.items.length,1);
   assert.equal((await call(`payroll/${run.id}/payouts`,'GET',undefined,beta)).data.items.length,0);
   await db.payrollPayout.deleteMany({where:{runId:run.id}});await db.payrollRun.delete({where:{id:run.id}});
  });
  await t.test('employee reports include every matching page and preserve filters',async()=>{
   await db.employee.createMany({data:Array.from({length:501},(_,i)=>({tenantId:alphaTenant,employeeCode:'EXPORT-'+i,firstName:'Export',lastName:String(i),email:`export-${i}@example.test`,joiningDate:new Date('2099-01-01')}))});
   assert.equal((await call('organization-chart','GET',undefined,alpha)).data.items.length,502);
   const exported=await call('reports/employees?q=EXPORT-&format=csv','GET',undefined,alpha);
   assert.equal(exported.status,200);assert.equal(exported.data.split('\r\n').length,502);assert.equal(new Set(exported.data.match(/EXPORT-\d+/g)).size,501);assert(!exported.data.includes('employee@example.test'));
   const filtered=await call('reports/employees?q=EXPORT-&status=INACTIVE&format=csv','GET',undefined,alpha);
   assert.equal(filtered.status,200);assert(!filtered.data.includes('EXPORT-'));
   await db.employee.deleteMany({where:{tenantId:alphaTenant,employeeCode:{startsWith:'EXPORT-'}}});
  });
  await t.test('asset reports export all pages with filters and tenant isolation',async()=>{
   await db.asset.createMany({data:Array.from({length:501},(_,i)=>({tenantId:alphaTenant,name:'Export laptop '+i,assetTag:'EXPORT-ASSET-'+i,category:'Laptop'}))});
   const foreign=await db.asset.create({data:{tenantId:betaTenant!,name:'Export foreign laptop',assetTag:'FOREIGN',category:'Laptop'}});
   const exported=await call('reports/assets?q=Export&format=csv','GET',undefined,alpha);
   assert.equal(exported.status,200);assert.equal(exported.data.split('\r\n').length,502);
   assert.equal(new Set(exported.data.match(/EXPORT-ASSET-\d+/g)).size,501);assert(!exported.data.includes('foreign'));
   const filtered=await call('reports/assets?q=Export%20laptop%20500&format=csv','GET',undefined,alpha);
   assert.equal(filtered.status,200);assert.equal(filtered.data.split('\r\n').length,2);assert(filtered.data.includes('EXPORT-ASSET-500'));
   await db.asset.deleteMany({where:{tenantId:alphaTenant,assetTag:{startsWith:'EXPORT-ASSET-'}}});await db.asset.delete({where:{id:foreign.id}});
  });
  await t.test('payroll prepare, reopen and finalization use one safe workflow',async()=>{
   assert.equal((await call('payroll','POST',{month:'2026-10'},alpha)).status,400);
   const prior=await db.payrollRun.create({data:{tenantId:alphaTenant,month:'2026-07',status:'LOCKED'}});
   const excluded=await db.employee.create({data:{tenantId:alphaTenant,employeeCode:'FUTURE',firstName:'Future',lastName:'Employee',email:'future@example.test',joiningDate:new Date('2099-01-01')}});
   const includedAdjustment=await db.payrollAdjustment.create({data:{tenantId:alphaTenant,originalRunId:prior.id,employeeId:a.data.id,targetMonth:'2026-08',amount:100,reason:'Included in payroll'}});
   const pendingAdjustment=await db.payrollAdjustment.create({data:{tenantId:alphaTenant,originalRunId:prior.id,employeeId:excluded.id,targetMonth:'2026-08',amount:100,reason:'No eligible payroll item'}});
   const prepared=await call('payroll','POST',{month:'2026-08'},alpha);assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.equal(prepared.data.status,'REVIEW');assert(prepared.data.items.length>0);
   assert.equal((await db.payrollAdjustment.findUniqueOrThrow({where:{id:includedAdjustment.id}})).appliedRunId,prepared.data.id);
   assert.equal((await db.payrollAdjustment.findUniqueOrThrow({where:{id:pendingAdjustment.id}})).appliedRunId,null);
   const attendanceLock=await db.attendancePeriodLock.findUniqueOrThrow({where:{tenantId_month:{tenantId:alphaTenant,month:'2026-08'}}});assert.equal(attendanceLock.status,'LOCKED');
   const reopened=await call(`payroll/${prepared.data.id}/reopen`,'POST',{},alpha);assert.equal(reopened.status,200,JSON.stringify(reopened.data));assert.equal(reopened.data.status,'DRAFT');
   const reopenedAttendance=await db.attendancePeriodLock.findUniqueOrThrow({where:{tenantId_month:{tenantId:alphaTenant,month:'2026-08'}}});assert.equal(reopenedAttendance.status,'UNLOCKED');assert.equal(await db.payrollItem.count({where:{runId:prepared.data.id}}),0);
   const recalculated=await call('payroll','POST',{month:'2026-08'},alpha);assert.equal(recalculated.status,200,JSON.stringify(recalculated.data));assert.equal(recalculated.data.status,'REVIEW');
   const finalized=await call(`payroll/${prepared.data.id}/finalize`,'POST',{},alpha);assert.equal(finalized.status,200,JSON.stringify(finalized.data));assert.equal(finalized.data.status,'LOCKED');
   await assert.rejects(()=>db.payrollRun.update({where:{id:prepared.data.id},data:{totalNet:1}}));
   const item=await db.payrollItem.findFirstOrThrow({where:{runId:prepared.data.id}});await assert.rejects(()=>db.payrollItem.update({where:{id:item.id},data:{net:1}}));
   assert.equal((await db.payrollAdjustment.findUniqueOrThrow({where:{id:pendingAdjustment.id}})).appliedRunId,null);
   await db.payrollAdjustment.delete({where:{id:pendingAdjustment.id}});await db.employee.delete({where:{id:excluded.id}});
   const slips=await call('payroll','GET',undefined,self);assert.equal(slips.data.items.length,1);assert.equal(slips.data.items[0].employeeId,a.data.id);
  });

  await t.test('Time Off A-to-Z validation, reservations, replay safety and exact balances',async()=>{
   const previousShift=(await db.employee.findUniqueOrThrow({where:{id:a.data.id}})).shiftId;
   const shift=await db.shift.create({data:{tenantId:alphaTenant,name:'Time Off QA weekdays',startMinute:540,endMinute:1080,workWeekMode:'CUSTOM_WEEKLY',workingDays:'1,2,3,4,5'}});
   const type=await db.leaveType.create({data:{tenantId:alphaTenant,name:'QA allowance',annualDays:2,paid:true}});
   const foreignType=await db.leaveType.create({data:{tenantId:betaTenant!,name:'Foreign QA allowance',annualDays:2,paid:true}});
   await db.employee.update({where:{id:a.data.id},data:{shiftId:shift.id}});
   const request={employeeId:a.data.id,leaveTypeId:type.id,startDate:'2027-01-04',endDate:'2027-01-04',reason:'QA time off'};
   try{
    for(const changed of [{endDate:'2027-01-03'},{endDate:'2027-01-05',halfDay:true},{startDate:'2026-12-31',endDate:'2027-01-01'},{startDate:'2027-02-30',endDate:'2027-02-30'},{reason:' '},{startDate:'2024-01-02',endDate:'2024-01-02'},{leaveTypeId:foreignType.id}])assert.equal((await call('leave','POST',{...request,...changed},self)).status,400,JSON.stringify(changed));
    assert.equal((await call('leave','POST',{...request,startDate:'2027-01-09',endDate:'2027-01-10'},self)).status,400,'weekend-only leave must not consume allowance');
    await db.calendarEvent.create({data:{tenantId:alphaTenant,title:'QA holiday',kind:'HOLIDAY',date:new Date('2027-01-06')}});
    assert.equal((await call('leave','POST',{...request,startDate:'2027-01-06',endDate:'2027-01-06'},self)).status,400,'holiday-only leave must not consume allowance');
    const key=randomUUID(),first=await call('leave','POST',{...request,halfDay:true,requestKey:key},self);assert.equal(first.status,200,JSON.stringify(first.data));assert.equal(Number(first.data.days),0.5);
    const notices=await db.notification.count({where:{tenantId:alphaTenant}}),count=await db.leaveRequest.count({where:{tenantId:alphaTenant,requestKey:key}});
    const replay=await call('leave','POST',{...request,halfDay:true,requestKey:key},self);assert.equal(replay.status,200);assert.equal(replay.data.id,first.data.id);assert.equal(await db.leaveRequest.count({where:{tenantId:alphaTenant,requestKey:key}}),count);assert.equal(await db.notification.count({where:{tenantId:alphaTenant}}),notices,'duplicate requests must not resend notices');
    for(const changed of [{reason:'Changed reason'},{halfDay:false},{startDate:'2027-01-07',endDate:'2027-01-07'}])assert.equal((await call('leave','POST',{...request,halfDay:true,requestKey:key,...changed},self)).status,409,'request keys must not alias changed payloads');
    assert.equal((await call('leave','POST',request,self)).status,409,'overlapping half/full requests must be blocked');
    const second=await call('leave','POST',{...request,startDate:'2027-01-07',endDate:'2027-01-07',requestKey:randomUUID()},self);assert.equal(second.status,200,JSON.stringify(second.data));assert.equal(Number(second.data.days),1);
    assert.equal((await call('leave','POST',{...request,startDate:'2027-01-08',endDate:'2027-01-08'},self)).status,400,'pending reservations must prevent overdraw');
    const final=await call('leave','POST',{...request,startDate:'2027-01-08',endDate:'2027-01-08',halfDay:true,requestKey:randomUUID()},self);assert.equal(final.status,200,JSON.stringify(final.data));
    let balance=await call('leave/balances?employeeId='+a.data.id+'&year=2027','GET',undefined,self);assert.equal(balance.status,200);let own=balance.data.items.find((r:any)=>r.id===type.id);assert.equal(own.pending,2);assert.equal(own.remaining,0);
    assert.equal((await call('leave/balances?employeeId='+a.data.id+'&year=bad','GET',undefined,self)).status,400);
    assert.equal((await call('leave/balances?employeeId='+a.data.id+'&year=2027','GET',undefined,beta)).status,404);
    assert.equal((await call('leave/'+second.data.id+'/cancel','POST',{note:'Release balance'},self)).status,200);
    balance=await call('leave/balances?employeeId='+a.data.id+'&year=2027','GET',undefined,self);own=balance.data.items.find((r:any)=>r.id===type.id);assert.equal(own.pending,1);assert.equal(own.remaining,1,'cancellation must restore allowance');
    const list=await call('leave','GET',undefined,self);assert.equal(list.status,200);assert(list.data.summary.PENDING>=2);assert(list.data.items.find((r:any)=>r.id===first.data.id)?.employee?.firstName,'self-service requests must include safe employee identity');
   }finally{await db.employee.update({where:{id:a.data.id},data:{shiftId:previousShift}});}
  });
  await t.test('leave balances and summary include records beyond the latest 500 display limit',async()=>{
   const employee=await db.employee.create({data:{tenantId:alphaTenant,employeeCode:'BALANCE-QA',firstName:'Balance',lastName:'Fixture',email:'balance-fixture@example.test',joiningDate:new Date('2020-01-01')}});
   const type=await db.leaveType.create({data:{tenantId:alphaTenant,name:'Large balance fixture',annualDays:1000,paid:true}});
   // Synthetic historical import rows deliberately exceed the display limit.
   await db.leaveRequest.createMany({data:Array.from({length:501},(_,i)=>({tenantId:alphaTenant,employeeId:employee.id,leaveTypeId:type.id,startDate:new Date(Date.UTC(2027,0,1+i%300)),endDate:new Date(Date.UTC(2027,0,1+i%300+Math.floor(i/300))),days:.5,status:i===0?'APPROVED' as const:'PENDING' as const,reason:'Synthetic historical aggregation fixture '+i}))});
   const balance=await call(`leave/balances?employeeId=${employee.id}&year=2027`,'GET',undefined,alpha);assert.equal(balance.status,200);const item=balance.data.items.find((r:any)=>r.id===type.id);assert.equal(item.approved,.5);assert.equal(item.pending,250);assert.equal(item.remaining,749.5);assert.equal(balance.data.paidTaken,.5);
   const list=await call('leave','GET',undefined,alpha);assert.equal(list.status,200);assert.equal(list.data.items.length,500);assert(list.data.total>500);assert.equal(Object.values(list.data.summary).reduce((sum:any,n:any)=>sum+n,0),list.data.total);
  });
  await t.test('leave overlap, approval, cancellation, and self-approval controls',async()=>{
   const type=await db.leaveType.findFirstOrThrow({where:{tenantId:alphaTenant,paid:true}});
   const input={employeeId:a.data.id,leaveTypeId:type.id,startDate:'2026-10-05',endDate:'2026-10-06',reason:'Test leave'};
   const row=await call('leave','POST',input,self);assert.equal(row.status,200,JSON.stringify(row.data));
   assert.equal((await call('leave','POST',input,self)).status,409);
   assert.equal((await call(`leave/${row.data.id}/review`,'POST',{decision:'APPROVED'},self)).status,403);
   assert.equal((await call(`leave/${row.data.id}/review`,'POST',{decision:'APPROVED'},beta)).status,404);
   const approved=await call(`leave/${row.data.id}/review`,'POST',{decision:'APPROVED'},alpha);assert.equal(approved.status,200,JSON.stringify(approved.data));assert.equal(approved.data.status,'APPROVED');
   assert.equal((await call(`leave/${row.data.id}/review`,'POST',{decision:'REJECTED'},alpha)).status,409);
   assert.equal((await call(`leave/${row.data.id}/cancel`,'POST',{note:'Plans changed'},beta)).status,404);
   const cancelled=await call(`leave/${row.data.id}/cancel`,'POST',{note:'Plans changed'},self);assert.equal(cancelled.status,200,JSON.stringify(cancelled.data));assert.equal(cancelled.data.status,'CANCELLED');
   assert.equal((await call(`leave/${row.data.id}/cancel`,'POST',{},self)).status,409);
   const replacement=await call('leave','POST',{...input,requestKey:randomUUID()},self);assert.equal(replacement.status,200,JSON.stringify(replacement.data));assert.equal(replacement.data.status,'PENDING');
   const lockedInput={...input,startDate:'2026-09-07',endDate:'2026-09-08',reason:'Locked attendance cancellation'};
   const lockedRow=await call('leave','POST',{...lockedInput,requestKey:randomUUID()},self);assert.equal(lockedRow.status,200,JSON.stringify(lockedRow.data));
   const staleReconcile=await call('attendance/reconcile','POST',{month:'2026-09'},alpha);assert.equal(staleReconcile.status,200,JSON.stringify(staleReconcile.data));
   const leaveDay=new Date('2026-09-07T00:00:00.000Z');
   const staleAttendance=await db.attendanceDaily.findUniqueOrThrow({where:{tenantId_employeeId_date:{tenantId:alphaTenant,employeeId:a.data.id,date:leaveDay}}});assert.equal(staleAttendance.status,'ABSENT');assert(staleAttendance.syncedAt,'past no-punch attendance must be finalized before leave approval');
   const lockedApproved=await call(`leave/${lockedRow.data.id}/review`,'POST',{decision:'APPROVED'},alpha);assert.equal(lockedApproved.status,200,JSON.stringify(lockedApproved.data));assert.equal(lockedApproved.data.status,'APPROVED');
   const leaveAttendance=await db.attendanceDaily.findUnique({where:{tenantId_employeeId_date:{tenantId:alphaTenant,employeeId:a.data.id,date:leaveDay}}});assert.equal(leaveAttendance?.dayType,'PAID_LEAVE');assert.equal(leaveAttendance?.status,'PAID_LEAVE');
   await db.attendancePeriodLock.upsert({where:{tenantId_month:{tenantId:alphaTenant,month:'2026-09'}},create:{tenantId:alphaTenant,month:'2026-09'},update:{status:'LOCKED',unlockedAt:null}});
   const blockedCancel=await call(`leave/${lockedRow.data.id}/cancel`,'POST',{note:'Blocked by locked attendance'},self);assert.equal(blockedCancel.status,409,JSON.stringify(blockedCancel.data));
   assert.equal((await db.leaveRequest.findUniqueOrThrow({where:{id:lockedRow.data.id}})).status,'APPROVED');
   assert.equal((await db.attendanceDaily.findUniqueOrThrow({where:{tenantId_employeeId_date:{tenantId:alphaTenant,employeeId:a.data.id,date:leaveDay}}})).dayType,'PAID_LEAVE');
   await db.attendancePeriodLock.update({where:{tenantId_month:{tenantId:alphaTenant,month:'2026-09'}},data:{status:'UNLOCKED',unlockedAt:new Date()}});
   const unlockedCancel=await call(`leave/${lockedRow.data.id}/cancel`,'POST',{note:'Plans changed after unlock'},self);assert.equal(unlockedCancel.status,200,JSON.stringify(unlockedCancel.data));assert.equal(unlockedCancel.data.status,'CANCELLED');
   const reconciledAttendance=await db.attendanceDaily.findUniqueOrThrow({where:{tenantId_employeeId_date:{tenantId:alphaTenant,employeeId:a.data.id,date:leaveDay}}});assert.equal(reconciledAttendance.dayType,'WORKING');assert.equal(reconciledAttendance.leaveUnits,0);assert.notEqual(reconciledAttendance.status,'PAID_LEAVE');assert.notEqual(reconciledAttendance.status,'UNPAID_LEAVE');
   const restoredBalanceReplacement=await call('leave','POST',{...lockedInput,requestKey:randomUUID()},self);assert.equal(restoredBalanceReplacement.status,200,JSON.stringify(restoredBalanceReplacement.data));assert.equal(restoredBalanceReplacement.data.status,'PENDING');
   const finalizedAbsentDate='2026-09-15',finalizedAbsentDay=new Date(finalizedAbsentDate+'T00:00:00.000Z');
   const reconciledBeforeLeave=await call('attendance/reconcile','POST',{month:'2026-09'},alpha);assert.equal(reconciledBeforeLeave.status,200,JSON.stringify(reconciledBeforeLeave.data));
   const finalizedAbsent=await db.attendanceDaily.findUniqueOrThrow({where:{tenantId_employeeId_date:{tenantId:alphaTenant,employeeId:a.data.id,date:finalizedAbsentDay}}});assert.equal(finalizedAbsent.status,'ABSENT');assert(finalizedAbsent.syncedAt,'past no-punch absence must be finalized before approving leave');
   const retroLeave=await call('leave','POST',{employeeId:a.data.id,leaveTypeId:type.id,startDate:finalizedAbsentDate,endDate:finalizedAbsentDate,reason:'Approved after absence finalized',requestKey:randomUUID()},self);assert.equal(retroLeave.status,200,JSON.stringify(retroLeave.data));
   const retroApproved=await call(`leave/${retroLeave.data.id}/review`,'POST',{decision:'APPROVED'},alpha);assert.equal(retroApproved.status,200,JSON.stringify(retroApproved.data));assert.equal(retroApproved.data.status,'APPROVED');
   const leaveOverridesAbsent=await db.attendanceDaily.findUniqueOrThrow({where:{tenantId_employeeId_date:{tenantId:alphaTenant,employeeId:a.data.id,date:finalizedAbsentDay}}});assert.equal(leaveOverridesAbsent.dayType,'PAID_LEAVE');assert.equal(leaveOverridesAbsent.status,'ABSENT');assert.equal(leaveOverridesAbsent.leaveUnits,100);assert.equal(leaveOverridesAbsent.payableUnits,100);
   const paidAttendance=await call(`attendance?from=${finalizedAbsentDate}&to=${finalizedAbsentDate}&employeeId=${a.data.id}`,'GET',undefined,alpha);assert.equal(paidAttendance.status,200,JSON.stringify(paidAttendance.data));const paidRow=paidAttendance.data.items.find((item:any)=>item.employeeId===a.data.id);assert.equal(paidRow.dayType,'PAID_LEAVE');assert.equal(paidRow.status,'ABSENT');
   const unpaidType=await db.leaveType.create({data:{tenantId:alphaTenant,name:'Unpaid Test Leave',annualDays:12,paid:false}}),unpaidDate='2026-09-16',unpaidDay=new Date(unpaidDate+'T00:00:00.000Z');
   const unpaidLeave=await call('leave','POST',{employeeId:a.data.id,leaveTypeId:unpaidType.id,startDate:unpaidDate,endDate:unpaidDate,reason:'Unpaid leave day type and physical status',requestKey:randomUUID()},self);assert.equal(unpaidLeave.status,200,JSON.stringify(unpaidLeave.data));
   const unpaidApproved=await call(`leave/${unpaidLeave.data.id}/review`,'POST',{decision:'APPROVED'},alpha);assert.equal(unpaidApproved.status,200,JSON.stringify(unpaidApproved.data));assert.equal(unpaidApproved.data.status,'APPROVED');
   const unpaidAttendance=await db.attendanceDaily.findUniqueOrThrow({where:{tenantId_employeeId_date:{tenantId:alphaTenant,employeeId:a.data.id,date:unpaidDay}}});assert.equal(unpaidAttendance.dayType,'UNPAID_LEAVE');assert.equal(unpaidAttendance.status,'ABSENT');assert.equal(unpaidAttendance.leaveUnits,100);assert.equal(unpaidAttendance.payableUnits,0);
   const unpaidApi=await call(`attendance?from=${unpaidDate}&to=${unpaidDate}&employeeId=${a.data.id}`,'GET',undefined,alpha);assert.equal(unpaidApi.status,200,JSON.stringify(unpaidApi.data));const unpaidRow=unpaidApi.data.items.find((item:any)=>item.employeeId===a.data.id);assert.equal(unpaidRow.dayType,'UNPAID_LEAVE');assert.equal(unpaidRow.status,'ABSENT');
  });
   await t.test('attendance shows checkout duration status before shift end across working and break sessions',async()=>{
    const shift=await db.shift.findFirstOrThrow({where:{tenantId:alphaTenant}}),now=new Date(),minute=now.getUTCHours()*60+now.getUTCMinutes(),startMinute=(minute+1350)%1440,endMinute=(minute+90)%1440;
    await db.shift.update({where:{id:shift.id},data:{timezone:'UTC',startMinute,endMinute,workingDays:'0,1,2,3,4,5,6',graceMinutes:0,earlyOutGraceMinutes:0,fullDayMinutes:80,halfDayMinutes:30,overtimeAfterMinutes:80,breakMinutes:30,breakStartMinute:null,breakEndMinute:null,punchDrivenBreaks:true,flexibleBreakAnytime:false}});
    await db.employee.update({where:{id:a.data.id},data:{shiftId:shift.id}});
    const noPunch=await call('employees','POST',{...employeeInput,employeeCode:'A02',email:'no-punch@example.test',phone:'9876543211'},alpha);assert.equal(noPunch.status,200,JSON.stringify(noPunch.data));await db.employee.update({where:{id:noPunch.data.id},data:{shiftId:shift.id}});
    const p1=new Date(now.getTime()-50*60000),p2=new Date(now.getTime()-30*60000),p3=new Date(now.getTime()-20*60000),p4=new Date(now.getTime()-10*60000),workDay=attendanceWorkdayDate(p1,startMinute,endMinute,'UTC'),month=workDay.slice(0,7),reportDate=new Date(`${workDay}T00:00:00.000Z`);
    const punch=async(punchTime:Date,punchType:'IN'|'OUT',sourceId=randomUUID())=>call('attendance','POST',{employeeId:a.data.id,punchTime:punchTime.toISOString(),punchType,sourceId,shiftId:shift.id},alpha);
    const live=async()=>{const response=await call(`attendance?from=${workDay}&to=${workDay}`,'GET',undefined,alpha);assert.equal(response.status,200,JSON.stringify(response.data));return response.data.items.find((item:any)=>item.employeeId===a.data.id)};
    let r=await punch(p1,'IN');assert.equal(r.status,200,JSON.stringify(r.data));let row=await live();assert.equal(row.liveState,'WORKING');
    r=await punch(p2,'OUT');assert.equal(r.status,200,JSON.stringify(r.data));row=await live();assert.equal(row.liveState,'OUT');assert.equal(row.status,'INSUFFICIENT_HOURS');let workforce=await call('workforce','GET',undefined,alpha);assert.equal(workforce.status,200,JSON.stringify(workforce.data));assert.equal(workforce.data.items.find((item:any)=>item.id===a.data.id)?.status,'OUT');
    r=await punch(p3,'IN');assert.equal(r.status,200,JSON.stringify(r.data));row=await live();assert.equal(row.liveState,'WORKING');assert.equal(Number(row.earlyOutSeconds),0,'early out must stay hidden while employee is checked in');
    const breakStart=(minute+1425)%1440,breakEnd=(minute+25)%1440;await db.shift.update({where:{id:shift.id},data:{breakStartMinute:breakStart,breakEndMinute:breakEnd}});
    r=await punch(p4,'OUT');assert.equal(r.status,200,JSON.stringify(r.data));row=await live();assert.equal(row.liveState,'BREAK');assert.equal(row.status,'HALF_DAY');assert(Number(row.liveBreakSeconds)>=9*60&&Number(row.liveBreakSeconds)<12*60,'scheduled break must start at zero from the OUT punch');assert.equal(row.inCount,2);assert.equal(row.outCount,2);workforce=await call('workforce','GET',undefined,alpha);assert.equal(workforce.status,200,JSON.stringify(workforce.data));assert.equal(workforce.data.items.find((item:any)=>item.id===a.data.id)?.status,'BREAK');
    const sourceId=randomUUID();r=await punch(new Date(now.getTime()-5*60000),'IN',sourceId);assert.equal(r.status,200,JSON.stringify(r.data));row=await live();assert.equal(row.liveState,'WORKING');
    await db.shift.update({where:{id:shift.id},data:{punchDrivenBreaks:false,flexibleBreakAnytime:false}});row=await live();assert.equal(row.liveState,'WORKING');workforce=await call('workforce','GET',undefined,alpha);assert.equal(workforce.data.items.find((item:any)=>item.id===a.data.id)?.status,'WORKING');assert(Number(row.liveWorkedSeconds)>=34*60&&Number(row.liveWorkedSeconds)<37*60,'manual IN must keep counting work through the automatic break window');assert(Number(row.liveBreakSeconds)>=5*60&&Number(row.liveBreakSeconds)<7*60,'only the actual manual OUT/IN break should count');assert.equal(Number(row.breakCreditSeconds),0,'manual punch attendance must not receive automatic break credit');assert.equal(Number(row.earlyOutSeconds),0,'early out must not appear before final OUT');
    const sourcePunch=await db.attendancePunch.findFirstOrThrow({where:{sourceId}});await assert.rejects(()=>db.attendancePunch.update({where:{id:sourcePunch.id},data:{punchType:'OUT'}}));await assert.rejects(()=>db.attendancePunch.delete({where:{id:sourcePunch.id}}));
    r=await punch(now,'OUT');assert.equal(r.status,200,JSON.stringify(r.data));row=await live();assert.equal(row.liveState,'BREAK','manual scheduled break must start only after an OUT punch');assert.equal(Number(row.earlyOutSeconds),0,'a scheduled break OUT is not a final checkout');
    await db.shift.update({where:{id:shift.id},data:{punchDrivenBreaks:true,flexibleBreakAnytime:false}});row=await live();assert.equal(row.liveState,'BREAK','a second scheduled OUT must share the remaining break allowance');assert(Number(row.breakSeconds)>=5*60,'completed scheduled break usage must be retained');workforce=await call('workforce','GET',undefined,alpha);assert.equal(workforce.data.items.find((item:any)=>item.id===a.data.id)?.status,'BREAK');await db.shift.update({where:{id:shift.id},data:{punchDrivenBreaks:false}});
    const reconciled=await call('attendance/reconcile','POST',{month},alpha);assert.equal(reconciled.status,200,JSON.stringify(reconciled.data));let daily=await db.attendanceDaily.findUniqueOrThrow({where:{tenantId_employeeId_date:{tenantId:alphaTenant,employeeId:a.data.id,date:reportDate}}});assert.equal(daily.status,'INSUFFICIENT_HOURS');assert.equal(daily.workMinutes,35,'reconciliation must preserve actual manual work without fixed-window deductions');assert.equal(daily.syncedAt,null);
    await db.attendanceDaily.update({where:{id:daily.id},data:{status:'INSUFFICIENT_HOURS',syncedAt:now}});await refreshTenantCurrentNoPunchAttendance(db,alphaTenant,new Date(now.getTime()+1000),0);daily=await db.attendanceDaily.findUniqueOrThrow({where:{id:daily.id}});assert.equal(daily.status,'INSUFFICIENT_HOURS');
    const night=endMinute<=startMinute,shiftEnd=zonedMinute(workDay,night?1440+endMinute:endMinute,'UTC');
    let noPunchDaily=await db.attendanceDaily.findUniqueOrThrow({where:{tenantId_employeeId_date:{tenantId:alphaTenant,employeeId:noPunch.data.id,date:reportDate}}});assert.equal(noPunchDaily.status,'NOT_CLOCKED_IN');assert.equal(noPunchDaily.syncedAt,null,'no-punch attendance must remain Not Checked In until the assigned shift ends');
    await refreshTenantCurrentNoPunchAttendance(db,alphaTenant,new Date(shiftEnd.getTime()),0);noPunchDaily=await db.attendanceDaily.findUniqueOrThrow({where:{id:noPunchDaily.id}});assert.equal(noPunchDaily.status,'ABSENT');assert.equal(noPunchDaily.firstIn,null);assert.equal(noPunchDaily.lastOut,null);assert(noPunchDaily.syncedAt&&noPunchDaily.syncedAt.getTime()>=shiftEnd.getTime(),'no-punch absence must finalize at shift end');
    await refreshTenantCurrentNoPunchAttendance(db,alphaTenant,new Date(shiftEnd.getTime()+60000),0);daily=await db.attendanceDaily.findUniqueOrThrow({where:{id:daily.id}});assert.equal(daily.status,'INSUFFICIENT_HOURS');assert(daily.syncedAt&&daily.syncedAt.getTime()>=shiftEnd.getTime());
    const correctedHalf=await call(`attendance/${daily.id}/correct`,'POST',{status:'HALF_DAY',workMinutes:30,note:'Synthetic half day correction'},alpha);assert.equal(correctedHalf.status,200,JSON.stringify(correctedHalf.data));assert.equal(correctedHalf.data.status,'HALF_DAY');assert.equal(correctedHalf.data.payableUnits,50);
    await db.attendancePeriodLock.upsert({where:{tenantId_month:{tenantId:alphaTenant,month}},create:{tenantId:alphaTenant,month,status:'UNLOCKED'},update:{status:'UNLOCKED'}});const reset=await call('attendance/reset-month','DELETE',{month},alpha);assert.equal(reset.status,200,JSON.stringify(reset.data));assert.equal(reset.data.permanent,true);assert(reset.data.deletedPunches>=6);assert.equal(await db.attendancePunch.count({where:{tenantId:alphaTenant,sourceId}}),0);
   });
  await t.test('Break Anytime treats the first OUT gap as break and later OUT as final OUT',async()=>{
   const shift=await db.shift.findFirstOrThrow({where:{tenantId:alphaTenant}}),now=new Date(),minute=now.getUTCHours()*60+now.getUTCMinutes(),startMinute=(minute+1320)%1440,endMinute=(minute+120)%1440;
   await db.shift.update({where:{id:shift.id},data:{timezone:'UTC',startMinute,endMinute,workingDays:'0,1,2,3,4,5,6',graceMinutes:0,earlyOutGraceMinutes:0,fullDayMinutes:90,halfDayMinutes:45,overtimeAfterMinutes:90,breakMinutes:10,breakStartMinute:null,breakEndMinute:null,punchDrivenBreaks:true,flexibleBreakAnytime:true}});
   const done=await call('employees','POST',{...employeeInput,employeeCode:'A03',email:'flex-break-done@example.test',phone:'9876543212'},alpha);assert.equal(done.status,200,JSON.stringify(done.data));await db.employee.update({where:{id:done.data.id},data:{shiftId:shift.id}});
   const over=await call('employees','POST',{...employeeInput,employeeCode:'A04',email:'flex-over-break@example.test',phone:'9876543213'},alpha);assert.equal(over.status,200,JSON.stringify(over.data));await db.employee.update({where:{id:over.data.id},data:{shiftId:shift.id}});
   const punch=async(employeeId:string,punchTime:Date,punchType:'IN'|'OUT')=>call('attendance','POST',{employeeId,punchTime:punchTime.toISOString(),punchType,sourceId:randomUUID(),shiftId:shift.id},alpha);
   const workDay=attendanceWorkdayDate(new Date(now.getTime()-50*60000),startMinute,endMinute,'UTC'),month=workDay.slice(0,7);
   assert.equal((await punch(done.data.id,new Date(now.getTime()-50*60000),'IN')).status,200);
   assert.equal((await punch(done.data.id,new Date(now.getTime()-40*60000),'OUT')).status,200);
   assert.equal((await punch(done.data.id,new Date(now.getTime()-35*60000),'IN')).status,200);
   assert.equal((await punch(done.data.id,new Date(now.getTime()-60*1000),'OUT')).status,200);
   let attendance=await call(`attendance?from=${workDay}&to=${workDay}&employeeId=${done.data.id}`,'GET',undefined,alpha);assert.equal(attendance.status,200,JSON.stringify(attendance.data));let row=attendance.data.items.find((item:any)=>item.employeeId===done.data.id);assert.equal(row.liveState,'OUT');assert.equal(row.currentBreakSince,null);assert(Number(row.breakSeconds)>=4*60&&Number(row.breakSeconds)<=6*60,'only the completed first break gap should count as break');assert.equal(Number(row.overBreakSeconds),0,'later final OUT must not accumulate over break');assert(Number(row.earlyOutSeconds)>0,'later final OUT should calculate early out immediately');
   let workforce=await call('workforce','GET',undefined,alpha);assert.equal(workforce.status,200,JSON.stringify(workforce.data));assert.equal(workforce.data.items.find((item:any)=>item.id===done.data.id)?.status,'OUT');
   assert.equal((await punch(over.data.id,new Date(now.getTime()-20*60000),'IN')).status,200);
   assert.equal((await punch(over.data.id,new Date(now.getTime()-10*60000-1000),'OUT')).status,200);
   attendance=await call(`attendance?from=${workDay}&to=${workDay}&employeeId=${over.data.id}`,'GET',undefined,alpha);assert.equal(attendance.status,200,JSON.stringify(attendance.data));row=attendance.data.items.find((item:any)=>item.employeeId===over.data.id);assert.equal(row.liveState,'OVER_BREAK');assert(row.currentBreakSince,'active flexible break must keep its start time while over break');assert(Number(row.overBreakSeconds)>=1&&Number(row.overBreakSeconds)<30,'live excess seconds must appear before business-minute rounding advances');assert.equal(Number(row.overBreakMinutes),0,'payroll business-minute rounding remains independent');
   workforce=await call('workforce','GET',undefined,alpha);assert.equal(workforce.status,200,JSON.stringify(workforce.data));assert.equal(workforce.data.items.find((item:any)=>item.id===over.data.id)?.status,'OVER_BREAK');
   await db.attendancePeriodLock.upsert({where:{tenantId_month:{tenantId:alphaTenant,month}},create:{tenantId:alphaTenant,month,status:'UNLOCKED'},update:{status:'UNLOCKED'}});
   const reset=await call('attendance/reset-month','DELETE',{month},alpha);assert.equal(reset.status,200,JSON.stringify(reset.data));
  });

  await t.test('automatic and manual mid-window OUT breaks agree with saved IN totals and workforce',async()=>{
   const shift=await db.shift.findFirstOrThrow({where:{tenantId:alphaTenant}}),now=new Date(),minute=now.getUTCHours()*60+now.getUTCMinutes(),startMinute=(minute+1320)%1440,endMinute=(minute+120)%1440,breakStartMinute=(minute+1420)%1440,breakEndMinute=(minute+10)%1440;
   await db.shift.update({where:{id:shift.id},data:{timezone:'UTC',startMinute,endMinute,workingDays:'0,1,2,3,4,5,6',graceMinutes:0,earlyOutGraceMinutes:0,fullDayMinutes:90,halfDayMinutes:45,overtimeAfterMinutes:90,breakMinutes:30,breakStartMinute,breakEndMinute,punchDrivenBreaks:false,flexibleBreakAnytime:false}});
   const make=async(code:string)=>{const r=await call('employees','POST',{...employeeInput,employeeCode:code,email:code.toLowerCase()+'@example.test',phone:'9876543220'},alpha);assert.equal(r.status,200,JSON.stringify(r.data));await db.employee.update({where:{id:r.data.id},data:{shiftId:shift.id}});return r.data.id;};
   const automatic=await make('AUTO-MID'),manual=await make('MANUAL-MID'),final=await make('AUTO-FINAL'),first=new Date(+now-40*60000),out=new Date(+now-10*60000),day=attendanceWorkdayDate(first,startMinute,endMinute,'UTC');
   const punch=async(employeeId:string,punchTime:Date,punchType:'IN'|'OUT')=>{const r=await call('attendance','POST',{employeeId,punchTime:punchTime.toISOString(),punchType,sourceId:randomUUID(),shiftId:shift.id},alpha);assert.equal(r.status,200,JSON.stringify(r.data));};
   for(const employeeId of [automatic,final])await db.attendancePunch.create({data:{tenantId:alphaTenant,employeeId,punchTime:first,punchType:'IN',verificationType:'FACE_DEVICE',sourceId:randomUUID(),rawPayload:{}}});
   await punch(manual,first,'IN');await punch(automatic,out,'OUT');await punch(manual,out,'OUT');await punch(final,new Date(+now-30*60000),'OUT');
   const live=async(employeeId:string)=>{const r=await call(`attendance?from=${day}&to=${day}&employeeId=${employeeId}`,'GET',undefined,alpha);assert.equal(r.status,200,JSON.stringify(r.data));return r.data.items.find((x:any)=>x.employeeId===employeeId);};
   let autoRow=await live(automatic),manualRow=await live(manual);assert.equal(autoRow.liveState,'BREAK');assert.equal(autoRow.breakMode,'AUTO_SCHEDULED');assert.equal(Number(autoRow.earlyOutSeconds),0);assert.equal(manualRow.liveState,'BREAK');assert.equal(manualRow.breakMode,'PUNCH_SCHEDULED');assert.equal(Number(manualRow.breakSeconds),0);assert(Number(manualRow.liveBreakSeconds)>=600&&Number(manualRow.liveBreakSeconds)<605,'manual break starts at OUT, not the earlier scheduled start');assert.equal((await live(final)).liveState,'OUT','automatic OUT before the break window remains final OUT');
   let workforce=await call('workforce','GET',undefined,alpha);for(const id of [automatic,manual])assert.equal(workforce.data.items.find((x:any)=>x.id===id)?.status,'BREAK');
   // The fixed schedule ends first; manual entitlement still runs from actual OUT.
   await db.shift.update({where:{id:shift.id},data:{breakEndMinute:(minute+1439)%1440,breakMinutes:19}});
   autoRow=await live(automatic);manualRow=await live(manual);assert.equal(autoRow.liveState,'OVER_BREAK');assert(Number(autoRow.overBreakSeconds)>=60);assert.equal(manualRow.liveState,'BREAK');workforce=await call('workforce','GET',undefined,alpha);assert.equal(workforce.data.items.find((x:any)=>x.id===automatic)?.status,'OVER_BREAK');assert.equal(workforce.data.items.find((x:any)=>x.id===manual)?.status,'BREAK');
   await db.shift.update({where:{id:shift.id},data:{breakMinutes:5}});manualRow=await live(manual);assert.equal(manualRow.liveState,'OVER_BREAK');assert.equal(Number(manualRow.liveBreakSeconds),300);assert(Number(manualRow.overBreakSeconds)>=300);
   const before=await live(automatic),beforeManual=await live(manual);const back=new Date();await punch(automatic,back,'IN');await punch(manual,back,'IN');autoRow=await live(automatic);manualRow=await live(manual);for(const [saved,active] of [[autoRow,before],[manualRow,beforeManual]]){assert.equal(saved.currentBreakSince,null);assert.equal(Number(saved.breakSeconds),Number(active.liveBreakSeconds),'IN preserves the break counter');assert(Math.abs(Number(saved.overBreakSeconds)-Number(active.overBreakSeconds))<5,'IN freezes actual excess seconds');assert.equal(Number(saved.earlyOutSeconds),0);}
   await db.attendancePeriodLock.upsert({where:{tenantId_month:{tenantId:alphaTenant,month:day.slice(0,7)}},create:{tenantId:alphaTenant,month:day.slice(0,7),status:'UNLOCKED'},update:{status:'UNLOCKED'}});assert.equal((await call('attendance/reset-month','DELETE',{month:day.slice(0,7)},alpha)).status,200);
  });

  await t.test('phone-opened days require real OUT for scheduled and flexible break and keep real work on reconciliation',async()=>{
   const shift=await db.shift.findFirstOrThrow({where:{tenantId:alphaTenant}}),now=new Date(),minute=now.getUTCHours()*60+now.getUTCMinutes(),startMinute=(minute+1320)%1440,endMinute=(minute+120)%1440,first=new Date(+now-40*60000),out=new Date(+now-10*60000),day=attendanceWorkdayDate(first,startMinute,endMinute,'UTC');
   await db.shift.update({where:{id:shift.id},data:{timezone:'UTC',startMinute,endMinute,workingDays:'0,1,2,3,4,5,6',fullDayMinutes:90,halfDayMinutes:45,overtimeAfterMinutes:90,breakMinutes:15,breakStartMinute:(minute+1420)%1440,breakEndMinute:(minute+10)%1440,punchDrivenBreaks:false,flexibleBreakAnytime:false}});
   const created=await call('employees','POST',{...employeeInput,employeeCode:'PHONE-BREAK',email:'phone-break@example.test',phone:'9876543230'},alpha);assert.equal(created.status,200,JSON.stringify(created.data));const id=created.data.id;await db.employee.update({where:{id},data:{shiftId:shift.id}});
   const phonePunch=async(time:Date,type:'IN'|'OUT')=>db.attendancePunch.create({data:{tenantId:alphaTenant,employeeId:id,punchTime:time,punchType:type,verificationType:'FACE_SCAN',sourceId:randomUUID(),rawPayload:{intent:type}}});
   await phonePunch(first,'IN');await db.attendanceDaily.create({data:{tenantId:alphaTenant,employeeId:id,date:new Date(day+'T00:00:00.000Z'),shiftId:shift.id,status:'MISSING_PUNCH',firstIn:first,workMinutes:0,scheduledMinutes:90,payableUnits:0}});
   const live=async()=>{const r=await call(`attendance?from=${day}&to=${day}&employeeId=${id}`,'GET',undefined,alpha);assert.equal(r.status,200,JSON.stringify(r.data));return r.data.items.find((x:any)=>x.employeeId===id);};
   let row=await live();assert.equal(row.liveState,'WORKING');assert.equal(row.breakMode,'PUNCH_SCHEDULED');assert.equal(row.currentBreakSince,null);assert.equal(Number(row.liveBreakSeconds),0);assert(Number(row.liveWorkedSeconds)>=2400,'phone work must continue through auto schedule until actual OUT');let workforce=await call('workforce','GET',undefined,alpha);assert.equal(workforce.data.items.find((x:any)=>x.id===id)?.status,'WORKING');
   await phonePunch(out,'OUT');row=await live();assert.equal(row.liveState,'BREAK');assert(Number(row.liveBreakSeconds)>=600&&Number(row.liveBreakSeconds)<605);assert.equal(Number(row.earlyOutSeconds),0);workforce=await call('workforce','GET',undefined,alpha);assert.equal(workforce.data.items.find((x:any)=>x.id===id)?.status,'BREAK');
   await db.shift.update({where:{id:shift.id},data:{flexibleBreakAnytime:true}});row=await live();assert.equal(row.breakMode,'PUNCH_ANYTIME');assert.equal(row.liveState,'BREAK');workforce=await call('workforce','GET',undefined,alpha);assert.equal(workforce.data.items.find((x:any)=>x.id===id)?.status,'BREAK');
   await db.shift.update({where:{id:shift.id},data:{flexibleBreakAnytime:false,breakMinutes:5}});row=await live();assert.equal(row.liveState,'OVER_BREAK');assert(Number(row.overBreakSeconds)>=300);
   const back=new Date();await phonePunch(back,'IN');row=await live();assert.equal(row.liveState,'WORKING');assert.equal(row.currentBreakSince,null);assert.equal(Number(row.breakSeconds),300);assert.equal(Number(row.breakCreditSeconds),0);assert(Number(row.overBreakSeconds)>=300);
   const rec=await call('attendance/reconcile','POST',{month:day.slice(0,7)},alpha);assert.equal(rec.status,200,JSON.stringify(rec.data));const saved=await db.attendanceDaily.findUniqueOrThrow({where:{tenantId_employeeId_date:{tenantId:alphaTenant,employeeId:id,date:new Date(day+'T00:00:00.000Z')}}});assert.equal(saved.workMinutes,30,'reconciliation deducts only actual phone OUT gap');
   // A legacy flexible flag with auto source must use the same phone policy in both live views.
   await db.shift.update({where:{id:shift.id},data:{flexibleBreakAnytime:true,breakMinutes:15}});row=await live();assert.equal(row.breakMode,'PUNCH_ANYTIME');assert.equal(row.liveState,'WORKING');await phonePunch(new Date(),'OUT');row=await live();assert.equal(row.liveState,'OUT','later flexible OUT is final checkout after the completed first break');workforce=await call('workforce','GET',undefined,alpha);assert.equal(workforce.data.items.find((x:any)=>x.id===id)?.status,'OUT');
   await db.attendancePeriodLock.upsert({where:{tenantId_month:{tenantId:alphaTenant,month:day.slice(0,7)}},create:{tenantId:alphaTenant,month:day.slice(0,7),status:'UNLOCKED'},update:{status:'UNLOCKED'}});assert.equal((await call('attendance/reset-month','DELETE',{month:day.slice(0,7)},alpha)).status,200);
  });

  await t.test('device management settings, mappings, status, gateway and deletion stay consistent and tenant scoped',async()=>{
   const input={name:'QA device',vendor:'GENERIC',model:'QA terminal',serialNumber:'QA-'+randomUUID(),connectionMode:'MIDDLEWARE',host:'',port:5005,branchId:null,timezone:'UTC'},created=await call('devices','POST',input,alpha);assert.equal(created.status,200,JSON.stringify(created.data));const device=created.data;assert(device.pushSecret);assert.equal(device.apiSecretHash,undefined);
   const safe=(r:any)=>Object.fromEntries(Object.keys(input).map(k=>[k,r[k]]));
   assert.equal((await call(`devices/${device.id}/setup`,'GET',undefined,beta)).status,404);assert.equal((await call(`devices/${device.id}/mappings`,'GET',undefined,beta)).status,404);assert.equal((await call(`devices/${device.id}/logs`,'GET',undefined,beta)).status,404);assert.equal((await call(`devices/${device.id}/punches`,'GET',undefined,beta)).status,404);
   assert.equal((await call('devices','POST',{...input,serialNumber:'LAN-'+randomUUID(),connectionMode:'LAN_PULL'},alpha)).status,400);assert.equal((await call('devices','POST',{...input,serialNumber:'ZONE-'+randomUUID(),timezone:'Invalid/Timezone'},alpha)).status,400);
   await db.attendanceDevice.update({where:{id:device.id},data:{lastSeenAt:new Date(),status:'OFFLINE'}});
   const tested=await call(`devices/${device.id}/test`,'POST',{},alpha);assert.equal(tested.status,200);assert.equal(tested.data.status,'ONLINE');assert.equal((await db.attendanceDevice.findUniqueOrThrow({where:{id:device.id}})).status,'ONLINE');
   const edited=await call(`devices/${device.id}`,'PATCH',{...input,name:'QA updated',expectedSettings:safe(device)},alpha);assert.equal(edited.status,200,JSON.stringify(edited.data));assert.equal(edited.data.apiSecretHash,undefined,'device edits must not expose credentials');
   const stale=await call(`devices/${device.id}`,'PATCH',{...input,name:'Stale update',expectedSettings:safe(device)},alpha);assert.equal(stale.status,409);assert.equal((await db.attendanceDevice.findUniqueOrThrow({where:{id:device.id}})).name,'QA updated');
   const mapped=await call(`devices/${device.id}/mappings`,'POST',{employeeId:a.data.id,deviceUserId:'QA-101',active:true},alpha);assert.equal(mapped.status,200,JSON.stringify(mapped.data));
   const other=await db.employee.findFirstOrThrow({where:{tenantId:alphaTenant,id:{not:a.data.id},deletedAt:null}});const duplicate=await call(`devices/${device.id}/mappings`,'POST',{employeeId:other.id,deviceUserId:'QA-101',active:true},alpha);assert.equal(duplicate.status,409);assert.equal((await call(`devices/${device.id}/mappings`,'GET',undefined,alpha)).data.items.length,1);
   const events=[{eventId:randomUUID(),userId:'QA-101',timestamp:new Date().toISOString(),type:'IN',verification:'FACE'}];
   const push=async(key:string)=>fetch(base+'biometric/push',{method:'POST',headers:{'Content-Type':'application/json','x-tcw-device-serial':input.serialNumber,'x-tcw-device-key':key},body:JSON.stringify(events)});
   let response=await push(device.pushSecret);assert.equal(response.status,200,await response.text());const punches=await call(`devices/${device.id}/punches`,'GET',undefined,alpha);assert.equal(punches.status,200);assert.equal(punches.data.items.length,1);assert.equal(punches.data.items[0].employee.id,a.data.id);
   const rotated=await call(`devices/${device.id}/rotate-secret`,'POST',{},alpha);assert.equal(rotated.status,200);assert(rotated.data.pushSecret!==device.pushSecret);assert.equal(rotated.data.device.apiSecretHash,undefined);assert.equal((await push(device.pushSecret)).status,403);assert.equal((await push(rotated.data.pushSecret)).status,200,'same event retry is idempotent');assert.equal((await call(`devices/${device.id}/punches`,'GET',undefined,alpha)).data.items.length,1);
   const logs=await call(`devices/${device.id}/logs`,'GET',undefined,alpha);assert(logs.data.items.some((r:any)=>r.action==='CONNECTION_TEST'));assert(logs.data.items.some((r:any)=>r.action==='SECRET_ROTATED'));
   const mobileInput={...input,name:'QA Employee App',vendor:'TCW_MOBILE',connectionMode:'EMPLOYEE_APP',serialNumber:'ignored'};let mobile=await call('devices','POST',mobileInput,alpha);if(mobile.status===409){const existing=await db.attendanceDevice.findFirstOrThrow({where:{tenantId:alphaTenant,connectionMode:'EMPLOYEE_APP'}});mobile={...mobile,status:200,data:existing};}assert.equal(mobile.status,200);assert.equal((await call(`devices/${mobile.data.id}/rotate-secret`,'POST',{},alpha)).status,400);assert.equal((await call(`devices/${mobile.data.id}/test`,'POST',{},alpha)).status,200);assert.equal((await call(`devices/${device.id}`,'PATCH',{...input,connectionMode:'EMPLOYEE_APP'},alpha)).status,409);
   assert.equal((await call(`devices/${device.id}/mappings`,'POST',{operation:'REMOVE',mappingId:mapped.data.id},alpha)).status,200);assert.equal((await call(`devices/${device.id}/mappings`,'GET',undefined,alpha)).data.items.length,0);
   const punchId=punches.data.items[0].id;assert.equal((await call(`devices/${device.id}`,'DELETE',undefined,alpha)).status,409);assert(await db.attendancePunch.findUnique({where:{id:punchId}}),'device deletion must not remove recorded attendance');const unused=await call('devices','POST',{...input,serialNumber:'UNUSED-'+randomUUID()},alpha);assert.equal(unused.status,200);assert.equal((await call(`devices/${unused.data.id}`,'DELETE',undefined,alpha)).status,200);
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
