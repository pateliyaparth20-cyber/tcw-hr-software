import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {embeddedDatabase} from '../helpers/database';
import {roleDefinitions} from '../../packages/permissions';
import {salaryPaymentChallan,salaryChallanPdf} from '../../apps/api/src/salary-challan';
import type {Context} from '../../apps/api/src/context';
import {createApp} from '../../apps/api/src/app';
import {digest} from '../../packages/auth';

test('salary challan uses finalized tenant snapshots and distinguishes confirmed, failed, unverified and zero payments',async()=>{
  const fixture=await embeddedDatabase(),db=fixture.db;
  let server:Awaited<ReturnType<typeof createApp>>|undefined;
  try{
    const company=await db.tenant.create({data:{name:'Synthetic Challan Company',code:'CHALLAN-'+randomUUID(),currency:'INR'}});
    const ctx:Context={tenantId:company.id,user:{id:randomUUID(),role:roleDefinitions.find(r=>r.code==='COMPANY_OWNER')!},session:{},ip:'127.0.0.1'};
    const statuses=['processed','FAILED','UNKNOWN','INITIATING',null,'processed','processed'];
    const employees=await Promise.all(statuses.map((_,i)=>db.employee.create({data:{tenantId:company.id,employeeCode:'TEST-'+i,firstName:'Current',lastName:'Name',email:`employee-${i}@example.test`,joiningDate:new Date('2020-01-01'),monthlySalary:999999}})));
    const run=await db.payrollRun.create({data:{tenantId:company.id,month:'2024-01',status:'REVIEW',items:{create:employees.map((e,i)=>({employeeId:e.id,employeeName:'Snapshot Employee '+i,employeeCode:e.employeeCode,gross:i===6?0:12000,deductions:i===6?0:2000,net:i===6?0:10000,components:[]}))}}});
    await assert.rejects(()=>salaryPaymentChallan(db,ctx,run.id),/Finalize payroll/);
    await db.payrollRun.update({where:{id:run.id},data:{status:'LOCKED',lockedAt:new Date()}});
    for(let i=0;i<statuses.length;i++)if(statuses[i])await db.payrollPayout.create({data:{tenantId:company.id,runId:run.id,employeeId:employees[i].id,employeeName:'Provider Name',employeeCode:employees[i].employeeCode,amount:i===5?9999:i===6?0:10000,provider:'TEST',status:statuses[i]!,reference:'SYNTHETIC-REF-'+i,utr:i===0?'SYNTHETIC-UTR-12345678901234567890':null}});
    const before=await db.payrollPayout.count(),challan=await salaryPaymentChallan(db,ctx,run.id);
    assert.deepEqual(challan.items.map(i=>i.paymentStatus),['PAID','FAILED','UNVERIFIED','UNVERIFIED','PENDING','UNVERIFIED','NO_PAYMENT_DUE']);
    assert.deepEqual(challan.totals,{employees:7,gross:72000,deductions:12000,net:60000,paid:10000,failed:10000,pending:40000,paidEmployees:1,failedEmployees:1,pendingEmployees:4,zeroEmployees:1});
    assert.equal(challan.items[0].employeeName,'Snapshot Employee 0');
    assert.equal(challan.items[0].utr,'SYNTHETIC-UTR-12345678901234567890');
    assert.equal(challan.number,(await salaryPaymentChallan(db,ctx,run.id)).number);
    assert.equal(await db.payrollPayout.count(),before,'Viewing never creates transfers');
    for(const role of ['EMPLOYEE','MANAGER','TEAM_LEADER','HR_EXECUTIVE'])await assert.rejects(()=>salaryPaymentChallan(db,{...ctx,user:{...ctx.user,role:roleDefinitions.find(r=>r.code===role)!}},run.id));
    await assert.rejects(()=>salaryPaymentChallan(db,{...ctx,tenantId:randomUUID()},run.id),/not found/i);
    await assert.rejects(()=>salaryPaymentChallan(db,ctx,'invalid-id'));
    const pdf=salaryChallanPdf(challan).toString();
    assert.ok(pdf.startsWith('%PDF-1.4'));assert.match(pdf,/Salary Payment Challan/);assert.match(pdf,/INR 600.00/);assert.match(pdf,/Pending\/unverified/);assert.match(pdf,/Authorized by/);
    server=await createApp(db);await server.app.listen(0,'127.0.0.1');
    const base=`http://127.0.0.1:${server.app.getHttpServer().address().port}/api/payroll/${run.id}/payment-challan`;
    const role=await db.role.create({data:{code:'CHALLAN_READER',name:'Synthetic reader',scope:'TENANT',permissions:['payroll:VIEW']}});
    const user=await db.user.create({data:{tenantId:company.id,roleId:role.id,email:'reader@example.test',name:'Reader',passwordHash:'unused-test-hash',active:true,mustChangePassword:false}});
    const token=randomUUID();await db.session.create({data:{tenantId:company.id,userId:user.id,tokenHash:digest(token),csrf:randomUUID(),expiresAt:new Date(Date.now()+86400000),userAgent:'Synthetic test',ip:'127.0.0.1'}});
    const headers={Cookie:`tcw_hr_session_v2=${token}`,'X-PeopleOS-Portal':'TENANT'};
    assert.equal((await fetch(base)).status,401);
    let response=await fetch(base,{headers});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal((await response.json()).number,challan.number);
    assert.equal((await fetch(base+'?format=pdf',{headers})).status,403);
    await db.role.update({where:{id:role.id},data:{permissions:['payroll:VIEW','payroll:EXPORT']}});
    response=await fetch(base+'?format=pdf',{headers});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');assert.match(response.headers.get('content-disposition')!,/salary-payment-challan-2024-01/);assert.ok((await response.text()).startsWith('%PDF-1.4'));
    assert.equal((await fetch(base+'?format=invalid',{headers})).status,400);
  }finally{if(server){server.io.close();await server.app.close()}await fixture.close()}
});
