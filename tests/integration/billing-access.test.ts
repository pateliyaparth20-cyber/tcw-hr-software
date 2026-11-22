import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {embeddedDatabase} from '../helpers/database';
import {seed} from '../../prisma/seed';
import {hashPassword} from '../../packages/auth';
import {createApp} from '../../apps/api/src/app';
import {syncCompanyAccess} from '../../apps/api/src/billing';
import {refreshTenantCurrentNoPunchAttendance} from '../../apps/api/src/attendance-automation';
import {billingRouteBlocked,coreCompanyAccess} from '../../packages/billing-access';

test('expired subscriptions retain core HR while restricting paid operations',async t=>{
 process.env.NODE_ENV='test';process.env.APP_ORIGINS='http://localhost:3000,http://localhost:3001';
 const f=await embeddedDatabase(),db=f.db;
 await seed(db,{adminEmail:'billing-admin@example.test',adminPassword:'Strong-admin-test-password',ownerEmail:'billing-owner@example.test',ownerPassword:'Strong-owner-test-password',companyCode:'BILLING-ACCESS'});
 const {app,io}=await createApp(db);await app.listen(0,'127.0.0.1');const base=`http://127.0.0.1:${app.getHttpServer().address().port}/api/`;
 let cookie='',csrf='';
 async function call(path:string,method='GET',body?:any){const r=await fetch(base+path,{method,headers:{Origin:'http://localhost:3000','X-PeopleOS-Portal':'TENANT',...(cookie?{Cookie:cookie,'X-CSRF-Token':csrf}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {r,data:await r.json()};}
 async function login(){const result=await call('auth/login','POST',{email:'billing-owner@example.test',password:'Strong-owner-test-password',companyCode:'BILLING-ACCESS'});assert.equal(result.r.status,200,JSON.stringify(result.data));cookie=result.r.headers.get('set-cookie')!.split(';')[0];csrf=result.data.csrf;}
 try{
  await login();const company=await db.tenant.findUniqueOrThrow({where:{code:'BILLING-ACCESS'}});
  const shift=await db.shift.create({data:{tenantId:company.id,name:'Expiry test shift',startMinute:540,endMinute:1020}});
  const employee=await db.employee.create({data:{tenantId:company.id,employeeCode:'EX01',firstName:'Expiry',lastName:'Test',email:'expiry@example.test',joiningDate:new Date('2025-01-01'),shiftId:shift.id}});
  const role=await db.role.findUniqueOrThrow({where:{code:'EMPLOYEE'}});
  await db.user.create({data:{tenantId:company.id,name:'Expiry employee',email:'expiry-login@example.test',passwordHash:await hashPassword('Strong-employee-test-password'),employeeId:employee.id,roleId:role.id}});
  await db.tenant.update({where:{id:company.id},data:{status:'ACTIVE',expiresAt:new Date(Date.now()-60000)}});
  await syncCompanyAccess(db,company.id);
  await t.test('existing sessions survive expiry and new sign-ins succeed',async()=>{assert.equal((await call('auth/me')).r.status,200);assert.equal((await db.tenant.findUniqueOrThrow({where:{id:company.id}})).status,'EXPIRED');await login();});
  await t.test('profiles and attendance remain usable with normal validation and CSRF',async()=>{
   assert.equal((await call('employees')).r.status,200);assert.equal((await call('employees/'+employee.id)).r.status,200);
   assert.equal((await call('attendance')).r.status,200);
   const punch=await call('attendance','POST',{employeeId:employee.id,punchTime:new Date().toISOString(),punchType:'IN',sourceId:randomUUID(),shiftId:shift.id});assert.equal(punch.r.status,200,JSON.stringify(punch.data));
   const refreshed=await refreshTenantCurrentNoPunchAttendance(db,company.id,new Date(),0);assert.equal(refreshed.skipped,false);
   const saved=csrf;csrf='';assert.equal((await call('attendance','POST',{})).r.status,403);csrf=saved;
  });
  await t.test('employee sign-in, own profile and biometric setup stay available after expiry',async()=>{
   const owner={cookie,csrf};const signed=await call('auth/login','POST',{email:'expiry-login@example.test',password:'Strong-employee-test-password',companyCode:'BILLING-ACCESS'});assert.equal(signed.r.status,200,JSON.stringify(signed.data));cookie=signed.r.headers.get('set-cookie')!.split(';')[0];csrf=signed.data.csrf;
   try{assert.equal((await call('employees/'+employee.id)).r.status,200);assert.equal((await call('attendance/face-profile')).r.status,200);assert.equal((await call('attendance')).r.status,200);assert.equal((await call('payroll','POST',{})).r.status,403);}finally{cookie=owner.cookie;csrf=owner.csrf;}
  });
  await t.test('paid actions and export alternatives are denied before any mutation',async()=>{
   for(const [path,method] of [['employees','POST'],['employees/import/commit','POST'],['payroll','POST'],['payroll/'+randomUUID()+'/calculate','POST'],['salary-contracts','POST'],['reports/employees','GET'],['reports/attendance?preview=true','GET'],['statutory-ids/template','GET']] as const){const result=await call(path,method,method==='POST'?{}:undefined);assert.equal(result.r.status,403,path+': '+JSON.stringify(result.data));assert.match(result.data.message,/plan has ended/);}
   assert.equal((await call('payroll')).r.status,200);assert.equal((await call('subscription')).r.status,200);
   const invoice=await db.invoice.create({data:{tenantId:company.id,number:'EXPIRED-RECEIPT',amount:10000,tax:1800,total:11800,paidAmount:11800,status:'PAID',dueDate:new Date()}});
   const pdf=await fetch(base+'subscription/invoices/'+invoice.id+'/download',{headers:{Origin:'http://localhost:3000','X-PeopleOS-Portal':'TENANT',Cookie:cookie}});assert.equal(pdf.status,200);assert.match(pdf.headers.get('content-type')??'',/application\/pdf/);assert.equal((await pdf.text()).slice(0,4),'%PDF');
   assert.equal(billingRouteBlocked('subscription','invoices','download','GET'),false);assert.equal(billingRouteBlocked('documents','file',undefined,'GET'),false);
  });
  await t.test('renewal restores feature access; manual suspensions remain blocked',async()=>{
   await db.tenant.update({where:{id:company.id},data:{status:'ACTIVE',expiresAt:new Date(Date.now()+86400000)}});
   const created=await call('employees','POST',{employeeCode:'EX02',firstName:'Renewed',lastName:'Test',email:'renewed@example.test',phone:'9876543210',joiningDate:'2025-01-01',monthlySalary:0});assert.equal(created.r.status,200,JSON.stringify(created.data));
   await db.tenant.update({where:{id:company.id},data:{status:'SUSPENDED',profile:{suspensionReason:'BILLING'}}});assert.equal((await call('employees')).r.status,200);assert.equal((await call('payroll','POST',{})).r.status,403);assert.equal(coreCompanyAccess({status:'SUSPENDED',profile:{suspensionReason:'BILLING'}}),true);
   await db.tenant.update({where:{id:company.id},data:{profile:{suspensionReason:'MANUAL'}}});assert.equal((await call('employees')).r.status,403);assert.equal((await call('auth/login','POST',{email:'billing-owner@example.test',password:'Strong-owner-test-password',companyCode:'BILLING-ACCESS'})).r.status,403);
  });
 }finally{io.close();await app.close();await f.close();}
});
