import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {embeddedDatabase} from '../helpers/database';
import {seed} from '../../prisma/seed';
import {createApp} from '../../apps/api/src/app';
import {SubscriptionGateway} from '../../apps/api/src/subscription-gateway';
test('plan modules are enforced on fresh API authentication and unlock only after verified upgrade',async()=>{
 process.env.NODE_ENV='test';process.env.APP_ORIGINS='http://localhost:3000,http://localhost:3001';process.env.CONFIG_ENCRYPTION_KEY='synthetic-plan-module-test-key-at-least-32-characters';
 const f=await embeddedDatabase(),db=f.db;
 await seed(db,{companyCode:'PLAN-ACCESS',ownerEmail:'plan-owner@example.test',ownerPassword:'Synthetic-owner-password',adminEmail:'plan-admin@example.test',adminPassword:'Synthetic-admin-password'});
 const company=await db.tenant.findUniqueOrThrow({where:{code:'PLAN-ACCESS'}});await db.tenant.update({where:{id:company.id},data:{plan:'GROWTH',status:'ACTIVE',expiresAt:new Date(Date.now()+86400000)}});
 const {app,api,io}=await createApp(db);await app.listen(0,'127.0.0.1');const base='http://127.0.0.1:'+(app.getHttpServer().address() as any).port+'/api/';let cookie='',csrf='';
 async function call(path:string,method='GET',body?:any){const r=await fetch(base+path,{method,headers:{Origin:'http://localhost:3000','X-PeopleOS-Portal':'TENANT',...(cookie?{Cookie:cookie,'X-CSRF-Token':csrf}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
 try{
  const login=await fetch(base+'auth/login',{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({email:'plan-owner@example.test',password:'Synthetic-owner-password',companyCode:'PLAN-ACCESS'})});assert.equal(login.status,200);cookie=login.headers.get('set-cookie')!.split(';')[0];csrf=(await login.json() as any).csrf;
  const growth=await call('auth/me');assert.ok(growth.data.user.permissions.includes('payroll:VIEW'));assert.ok(!growth.data.user.permissions.includes('assets:VIEW'));assert.ok(!growth.data.user.permissions.includes('performance:VIEW'));
  for(const route of ['assets','goals','courses','expenses','travel','documents','exit','reports/employees','field-work','agent/status']){const denied=await call(route);assert.equal(denied.status,403,route+JSON.stringify(denied.data));assert.match(denied.data.message,/not included/);}
  for(const route of ['employees','attendance','leave','payroll','jobs'])assert.equal((await call(route)).status,200,route);
  assert.equal((await call('assets','POST',{})).status,403);assert.equal(await db.asset.count({where:{tenantId:company.id}}),0);
  const catalog=await call('subscription');assert.deepEqual(catalog.data.plans.find((p:any)=>p.name==='GROWTH').moduleFeatures,['Core HR','Attendance','Leave','Payroll','Recruitment']);
  const secret='synthetic_plan_payment_secret';let amount=0;
  const transport=async(url:any,options:any)=>{const path=new URL(String(url)).pathname;if(path==='/v1/orders'){amount=JSON.parse(options.body).amount;return Response.json({id:'order_PlanUpgrade'});}if(path==='/v1/payments/pay_PlanUpgrade')return Response.json({id:'pay_PlanUpgrade',order_id:'order_PlanUpgrade',currency:'INR',amount,status:'captured',captured:true,amount_refunded:0,created_at:Math.floor(Date.now()/1000)});throw Error('Unexpected synthetic provider request '+path);};
  api.billing=new SubscriptionGateway(db,transport as typeof fetch);const admin=await db.user.findFirstOrThrow({where:{email:'plan-admin@example.test'},include:{role:true}});await api.billing.settings({user:admin,session:{},tenantId:null,ip:'127.0.0.1'},'PUT',{mode:'LIVE',enabled:true,autoPayEnabled:false,keyId:'rzp_live_SyntheticPlan',keySecret:secret,webhookSecret:'synthetic_plan_webhook_secret',expectedRevision:null});
  const checkout=await call('subscription/gateway-checkout','POST',{plan:'ENTERPRISE',cycle:'MONTHLY',kind:'ONETIME',requestKey:randomUUID()});assert.equal(checkout.status,200,JSON.stringify(checkout.data));assert.equal((await call('assets')).status,403);
  const signature=createHmac('sha256',secret).update('order_PlanUpgrade|pay_PlanUpgrade').digest('hex');const paid=await call('subscription/gateway-verify','POST',{checkoutId:checkout.data.id,paymentId:'pay_PlanUpgrade',signature});assert.equal(paid.status,200);assert.equal(paid.data.status,'PAID');
  const enterprise=await call('auth/me');assert.equal(enterprise.data.company.plan,'ENTERPRISE');assert.ok(enterprise.data.user.permissions.includes('assets:VIEW'));
  for(const route of ['assets','goals','courses','documents'])assert.equal((await call(route)).status,200,route);
  await db.tenant.update({where:{id:company.id},data:{plan:'GROWTH'}});assert.equal((await call('assets')).status,403);assert.ok((await db.role.findUniqueOrThrow({where:{code:'HR_ADMIN'}})).permissions.includes('assets:VIEW'));
  await db.tenant.update({where:{id:company.id},data:{plan:'STARTER'}});assert.equal((await call('payroll')).status,403);assert.equal((await call('jobs')).status,403);assert.equal((await call('employees')).status,200);assert.equal((await call('attendance')).status,200);assert.equal((await call('subscription')).status,200);
 }finally{io.close();await app.close();await f.close();}
});
