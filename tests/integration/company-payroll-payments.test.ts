import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {embeddedDatabase} from '../helpers/database';
import {roleDefinitions} from '../../packages/permissions';
import {PayoutConnections,openPayoutCredentials} from '../../apps/api/src/payout-connections';
import {PayoutService} from '../../apps/api/src/payouts';
import {PayrollPayments} from '../../apps/api/src/payroll-payments';
import {salaryPaymentChallan} from '../../apps/api/src/salary-challan';
import {reopenPayrollMonth} from '../../apps/api/src/payroll-service';
import type {Context} from '../../apps/api/src/context';

test('company salary payments isolate credentials, approve timed transfers and reconcile manual payment',async t=>{
 const fixture=await embeddedDatabase(),db=fixture.db,oldKey=process.env.CONFIG_ENCRYPTION_KEY;process.env.CONFIG_ENCRYPTION_KEY='synthetic-encryption-key-for-tests-only-123456789';
 try{
  const role=await db.role.create({data:roleDefinitions.find(r=>r.code==='COMPANY_OWNER')!});
  async function company(code:string){const tenant=await db.tenant.create({data:{code:code+randomUUID(),name:code,status:'ACTIVE'}}),user=await db.user.create({data:{tenantId:tenant.id,roleId:role.id,name:'Synthetic owner',email:code+'@example.test',passwordHash:'not-used'}}),ctx:Context={tenantId:tenant.id,user:{...user,role},session:{},ip:'127.0.0.1'};const employee=await db.employee.create({data:{tenantId:tenant.id,employeeCode:'EMP-1',firstName:'Synthetic',lastName:'Employee',email:code+'-employee@example.test',joiningDate:new Date('2020-01-01'),personal:{accountNumber:'1234567890',ifsc:'TEST0000001'}}});return {tenant,user,ctx,employee};}
  const a=await company('PAY-A'),b=await company('PAY-B'),connections=new PayoutConnections(db);
  const credentials={keyId:'synthetic-key-A',keySecret:'synthetic-secret-A',sourceAccount:'1234567890'};
  const input={provider:'RAZORPAYX',bankName:'Synthetic',accountLabel:'Salary A',mode:'NEFT',enabled:true,expectedRevision:0,confirm:true,credentials};
  await connections.save(a.ctx,input);await connections.save(b.ctx,{...input,accountLabel:'Salary B',credentials:{...credentials,keyId:'synthetic-key-B',keySecret:'synthetic-secret-B'}});
  const saved=await db.companyPayoutConnection.findUniqueOrThrow({where:{tenantId:a.tenant.id}});
  assert.ok(!saved.credentialsCiphertext!.includes(credentials.keySecret));assert.equal(openPayoutCredentials(a.tenant.id,saved.credentialsCiphertext!).keySecret,credentials.keySecret);assert.throws(()=>openPayoutCredentials(b.tenant.id,saved.credentialsCiphertext!));
  assert.ok(!JSON.stringify(await connections.get(a.ctx)).includes('synthetic-secret'));assert.equal((await connections.get(b.ctx)).connection?.accountLabel,'Salary B');
  await assert.rejects(()=>connections.save(a.ctx,input),/changed/);
  const denied={...a.ctx,user:{...a.user,role:roleDefinitions.find(r=>r.code==='EMPLOYEE')!}};await assert.rejects(()=>connections.get(denied));await assert.rejects(()=>connections.save(denied,input));
  const sent:any[]=[];const service=new PayoutService(db,{validateConfiguration(){},async send(id,e,amount,month,mode,config){sent.push({id,amount,mode,key:config.credentials().keyId});return {id:'pout-'+id,status:'processed',amount,currency:'INR',utr:'SYNTHETIC-UTR'}},async status(id){return {id,status:'reversed'}}}),payments=new PayrollPayments(db,service);
  async function run(month:string,who=a){const r=await db.payrollRun.create({data:{tenantId:who.tenant.id,month,status:'REVIEW',totalGross:100000,totalNet:100000,items:{create:{employeeId:who.employee.id,employeeName:'Synthetic Employee',employeeCode:who.employee.employeeCode,gross:100000,deductions:0,net:100000,components:[]}}}});return db.payrollRun.update({where:{id:r.id},data:{status:'LOCKED',approvedBy:who.user.id,lockedAt:new Date()}});}
  const now=new Date('2027-01-10T00:00:00Z');
  await t.test('due schedule uses company timezone, claims once and blocks conflicting manual or account changes',async()=>{
   const r=await run('2024-01');const schedule=await payments.schedule(a.ctx,r.id,{localDate:'2027-01-10',localTime:'10:00',mode:'NEFT',confirm:true},now);assert.equal(schedule.scheduledAt.toISOString(),'2027-01-10T04:30:00.000Z');
   await assert.rejects(()=>payments.schedule(a.ctx,r.id,{scheduledAt:'2027-01-10T04:30:00Z',mode:'NEFT',confirm:true},now),/already active/);
   await assert.rejects(()=>connections.save(a.ctx,{...input,expectedRevision:1}),/active salary schedules/);
   await assert.rejects(()=>service.pay(a.ctx,r.id,{confirm:true,mode:'NEFT',scheduleId:schedule.id}),/Cancel the scheduled/);
   await assert.rejects(()=>reopenPayrollMonth(db,a.tenant.id,r.id,a.user.id),/Cancel the salary/);
   await assert.rejects(()=>payments.manual(a.ctx,r.id,{employeeId:a.employee.id,expectedNet:100000,mode:'CASH',reference:'CASH-1',paidAt:'2020-01-01T00:00:00Z',confirm:true}),/Cancel the active/);
   assert.equal((await payments.executeDue(new Date('2027-01-10T04:29:59Z'))).started,0);
   assert.equal((await payments.executeDue(new Date('2027-01-10T04:30:00Z'))).started,1);assert.equal(sent.length,1);assert.equal(sent[0].key,credentials.keyId);
   assert.equal((await db.payrollPaymentSchedule.findUniqueOrThrow({where:{id:schedule.id}})).status,'DISPATCHED');await payments.executeDue(new Date('2027-01-10T04:31:00Z'));assert.equal(sent.length,1);
   await service.sync(a.ctx,r.id);assert.equal((await db.payrollPayout.findFirstOrThrow({where:{runId:r.id}})).status,'reversed');
  });
  await t.test('changed beneficiary, missed time, revoked approver and wrong RTGS amount block transfers',async()=>{
   for(const [month,reason] of [['2024-02','bank'],['2024-03','missed'],['2024-04','permission']]){
    const r=await run(month),s=await payments.schedule(a.ctx,r.id,{scheduledAt:'2027-01-10T01:00:00Z',mode:'NEFT',confirm:true},now);
    if(reason==='bank')await db.employee.update({where:{id:a.employee.id},data:{personal:{accountNumber:'9999999999',ifsc:'TEST0000001'}}});
    if(reason==='permission')await db.user.update({where:{id:a.user.id},data:{active:false}});
    await payments.executeDue(new Date(reason==='missed'?'2027-01-10T01:16:00Z':'2027-01-10T01:00:00Z'));assert.equal((await db.payrollPaymentSchedule.findUniqueOrThrow({where:{id:s.id}})).status,'BLOCKED');
    await db.user.update({where:{id:a.user.id},data:{active:true}});await db.employee.update({where:{id:a.employee.id},data:{personal:{accountNumber:'1234567890',ifsc:'TEST0000001'}}});
   }assert.equal(sent.length,1);
   const r=await run('2024-05');await assert.rejects(()=>payments.schedule(a.ctx,r.id,{scheduledAt:'2027-01-10T01:00:00Z',mode:'RTGS',confirm:true},now),/bank or transfer-mode/);
   await assert.rejects(()=>payments.overview(b.ctx,r.id),/not found/);
   await assert.rejects(()=>payments.manual(a.ctx,r.id,{employeeId:a.employee.id,expectedNet:100000,mode:'CASH',reference:'FUTURE',paidAt:'2099-01-01T00:00:00Z',confirm:true}),/future/);
  });
  await t.test('manual payment updates challan, refuses duplicates or stale amount and cancels a schedule',async()=>{
   const r=await run('2024-06'),s=await payments.schedule(a.ctx,r.id,{scheduledAt:'2027-01-10T01:00:00Z',mode:'NEFT',confirm:true},now);await payments.cancel(a.ctx,r.id);assert.equal((await db.payrollPaymentSchedule.findUniqueOrThrow({where:{id:s.id}})).status,'CANCELLED');
   const body={employeeId:a.employee.id,expectedNet:100000,mode:'BANK_TRANSFER',reference:'TEST-UTR-MANUAL',paidAt:'2020-01-01T00:00:00Z',confirm:true};
   await assert.rejects(()=>payments.manual(a.ctx,r.id,{...body,expectedNet:99999}),/changed/);const row=await payments.manual(a.ctx,r.id,body);assert.equal(row.status,'PAID');assert.equal((await salaryPaymentChallan(db,a.ctx,r.id)).totals.paid,100000);
   await assert.rejects(()=>payments.manual(a.ctx,r.id,body),/already exists/);assert.equal((await service.pay(a.ctx,r.id,{confirm:true,mode:'NEFT'})).initiated,0);
  });
  await t.test('a verified reversal can be replaced manually while historical credentials remain bound',async()=>{
   const r=await run('2024-08');await service.pay(a.ctx,r.id,{confirm:true,mode:'NEFT'});
   await connections.save(a.ctx,{...input,expectedRevision:1,credentials:{...credentials,keyId:'synthetic-key-A-v2',keySecret:'synthetic-secret-A-v2'}});
   let historicalKey='';const reader=new PayoutService(db,{validateConfiguration(){},async send(){throw new Error('No sending allowed')},async status(id,config){historicalKey=config.credentials().keyId;return {id,status:'reversed'}}});await reader.sync(a.ctx,r.id);assert.equal(historicalKey,credentials.keyId);
   const prior=await db.payrollPayout.findFirstOrThrow({where:{runId:r.id}});await assert.rejects(()=>payments.manual(a.ctx,r.id,{employeeId:a.employee.id,expectedNet:100000,mode:'CASH',reference:'RECEIPT-1',paidAt:'2020-01-01T00:00:00Z',confirm:true}),/already exists/);
   const result=await payments.manual(a.ctx,r.id,{employeeId:a.employee.id,expectedNet:100000,mode:'CASH',reference:'RECEIPT-1',paidAt:'2020-01-01T00:00:00Z',expectedPayoutUpdatedAt:prior.updatedAt.toISOString(),confirm:true});assert.equal(result.status,'PAID');assert.equal(result.provider,'MANUAL');assert.equal((result.details as any).previousTransfer.status,'reversed');
  });
  await t.test('separate company dispatch uses its own API key and unknown response is never retried',async()=>{
   const r=await run('2024-01',b);await service.pay(b.ctx,r.id,{confirm:true,mode:'NEFT'});assert.equal(sent.at(-1).key,'synthetic-key-B');
   const unknownRun=await run('2024-07');let count=0;let recoveredReference='';const unknown=new PayoutService(db,{validateConfiguration(){},async send(){count++;throw new Error('Synthetic timeout')},async status(id){return {id,status:'processed',amount:100000,currency:'INR',reference_id:recoveredReference}}}),scheduled=new PayrollPayments(db,unknown);
   const s=await scheduled.schedule(a.ctx,unknownRun.id,{scheduledAt:'2027-01-10T01:00:00Z',mode:'NEFT',confirm:true},now);await scheduled.executeDue(new Date('2027-01-10T01:00:00Z'));assert.equal((await db.payrollPaymentSchedule.findUniqueOrThrow({where:{id:s.id}})).status,'NEEDS_ATTENTION');await unknown.pay(a.ctx,unknownRun.id,{confirm:true});assert.equal(count,1);await assert.rejects(()=>connections.save(a.ctx,{...input,expectedRevision:2}),/pending or unverified/);
   const row=await db.payrollPayout.findFirstOrThrow({where:{runId:unknownRun.id}}),recovery={payoutId:row.id,providerRef:'SYNTHETIC-RECOVERED',expectedUpdatedAt:row.updatedAt.toISOString()};await assert.rejects(()=>unknown.recoverReference(a.ctx,unknownRun.id,recovery),/does not match/);recoveredReference=row.id;await unknown.recoverReference(a.ctx,unknownRun.id,recovery);assert.equal((await salaryPaymentChallan(db,a.ctx,unknownRun.id)).totals.paid,100000);assert.equal(count,1);
  });
  await t.test('installed bank adapter uses tenant corporate credentials and stable idempotency without redirects',async()=>{
   const c=await company('BANK-C'),oldConnectors=process.env.BANK_PAYOUT_CONNECTORS_JSON,originalFetch=globalThis.fetch;process.env.BANK_PAYOUT_CONNECTORS_JSON=JSON.stringify({SYNTHETIC_BANK:{label:'Synthetic bank adapter',url:'https://bank-adapter.example.test/v1'}});
   try{
    await connections.save(c.ctx,{...input,provider:'BANK_API',bankName:'SYNTHETIC_BANK',credentials:{keyId:'synthetic-bank-key',keySecret:'synthetic-bank-secret',sourceAccount:'5555555555',corporateId:'BANK-C'}});
    const r=await run('2024-01',c),requests:any[]=[];let payout:any;
    globalThis.fetch=async(url,options)=>{assert.ok(String(url).startsWith('https://bank-adapter.example.test/v1/payouts'));assert.equal(options?.redirect,'error');const headers=options?.headers as Record<string,string>;assert.equal(headers['X-Corporate-Id'],'BANK-C');assert.equal(headers.Authorization,'Basic '+Buffer.from('synthetic-bank-key:synthetic-bank-secret').toString('base64'));requests.push(options);if(options?.method==='POST'){payout=JSON.parse(String(options.body));assert.equal(headers['Idempotency-Key'],payout.reference);assert.equal(payout.amount,100000);assert.equal(payout.sourceAccount,'5555555555');assert.equal(payout.beneficiary.accountNumber,'1234567890');}return new Response(JSON.stringify({id:'synthetic-bank-payout',status:options?.method==='POST'?'processing':'processed',reference_id:payout.reference,amount:payout.amount,currency:'INR',utr:options?.method==='POST'?null:'BANK-C-UTR'}),{status:200,headers:{'Content-Type':'application/json'}})};
    const bank=new PayoutService(db);await bank.pay(c.ctx,r.id,{confirm:true,mode:'NEFT'});await bank.pay(c.ctx,r.id,{confirm:true,mode:'NEFT'});await bank.sync(c.ctx,r.id);assert.equal(requests.filter(r=>r.method==='POST').length,1);assert.equal((await salaryPaymentChallan(db,c.ctx,r.id)).totals.paid,100000);
   }finally{globalThis.fetch=originalFetch;if(oldConnectors===undefined)delete process.env.BANK_PAYOUT_CONNECTORS_JSON;else process.env.BANK_PAYOUT_CONNECTORS_JSON=oldConnectors;}
  });
 }finally{if(oldKey===undefined)delete process.env.CONFIG_ENCRYPTION_KEY;else process.env.CONFIG_ENCRYPTION_KEY=oldKey;await fixture.close()}
});
