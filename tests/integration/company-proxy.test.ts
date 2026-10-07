import test from 'node:test';
import assert from 'node:assert/strict';
import {embeddedDatabase} from '../helpers/database';
import {seed} from '../../prisma/seed';
import {createApp} from '../../apps/api/src/app';

test('Super Admin proxy handoff is single-use, tenant scoped, audited and bound to its parent session',async()=>{
 Object.assign(process.env,{NODE_ENV:'test',APP_ORIGINS:'http://localhost:3000,http://localhost:3001'});
 const f=await embeddedDatabase(),db=f.db;
 await seed(db,{adminEmail:'proxy-admin@example.test',adminPassword:'ProxyAdmin!2026',ownerEmail:'proxy-hr@example.test',ownerPassword:'ProxyHR!2026',companyCode:'PROXY-A',demo:false});
 const {app,io}=await createApp(db);await app.listen(0,'127.0.0.1');const port=app.getHttpServer().address().port;
 type Auth={cookie:string;csrf:string;scope:string};
 async function call(path:string,method='GET',body?:any,auth?:Auth){const r=await fetch(`http://127.0.0.1:${port}/api/${path}`,{method,headers:{Origin:'http://localhost:3000','Content-Type':'application/json',...(auth?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf,'X-PeopleOS-Portal':auth.scope}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]??''};}
 async function login(email:string,password:string,companyCode?:string){const r=await call('auth/login','POST',{email,password,...(companyCode?{companyCode}:{})});assert.equal(r.status,200);return {cookie:r.cookie,csrf:r.data.csrf,scope:companyCode?'TENANT':'PLATFORM'};}
 try{
  const root=await login('proxy-admin@example.test','ProxyAdmin!2026'),hr=await login('proxy-hr@example.test','ProxyHR!2026','PROXY-A');
  const a=await db.tenant.findUniqueOrThrow({where:{code:'PROXY-A'}}),b=await db.tenant.create({data:{name:'Other company',code:'PROXY-B',status:'ACTIVE'}});
  const companies=await call('platform/companies?pageSize=1&page=2','GET',undefined,root);assert.equal(companies.data.total,2);assert.equal(companies.data.items.length,1);assert.equal(companies.data.page,2);const search=await call('platform/companies?q=PROXY-B&status=ACTIVE','GET',undefined,root);assert.equal(search.data.total,1);assert.equal(search.data.items[0].id,b.id);
  assert.equal((await call('auth/proxy-start','POST',{tenantId:a.id},hr)).status,403);
  assert.equal((await call('auth/proxy-start','POST',{tenantId:a.id},{...root,csrf:''})).status,403);
  const grant=await call('auth/proxy-start','POST',{tenantId:a.id},root);assert.equal(grant.status,200);
  // A handoff code is not a normal platform or tenant session.
  assert.equal((await call('company','GET',undefined,{cookie:'tcw_hr_session_v2='+grant.data.grant,csrf:'',scope:'TENANT'})).status,401);
  const claimed=await call('auth/proxy-claim','POST',{grant:grant.data.grant});assert.equal(claimed.status,200,JSON.stringify(claimed.data));
  assert.equal((await call('auth/proxy-claim','POST',{grant:grant.data.grant})).status,401);
  const me=await call('auth/me','GET',undefined,{cookie:claimed.cookie,csrf:'',scope:'TENANT'});assert.equal(me.status,200);assert.equal(me.data.company.id,a.id);assert.equal(me.data.user.role,'HR_ADMIN');assert.equal(me.data.proxy.actorName,'Platform Administrator');
  const proxy={cookie:claimed.cookie,csrf:me.data.csrf,scope:'TENANT'};
  assert.equal((await call('auth/me','GET',undefined,{...proxy,scope:'PLATFORM'})).status,401);
  assert.equal((await call('platform/companies','GET',undefined,proxy)).status,403);
  assert.equal((await call('auth/two-factor','GET',undefined,proxy)).status,403);
  const team=await call('teams','POST',{name:'Field sales',code:'FIELD'},proxy);assert.equal(team.status,200);
  const otherTeam=await db.team.create({data:{tenantId:b.id,name:'Other team',code:'OTHER'}});
  const person={employeeCode:'FIELD-1',firstName:'Field',lastName:'Worker',email:'field@example.test',phone:'9876543210',joiningDate:'2026-01-01',teamId:team.data.id};
  const employee=await call('employees','POST',person,proxy);assert.equal(employee.status,200,JSON.stringify(employee.data));
  assert.equal((await call('employees','POST',{...person,employeeCode:'FIELD-2',email:'field2@example.test',teamId:otherTeam.id},proxy)).status,400);
  assert.equal((await call('employees?teamId='+team.data.id,'GET',undefined,proxy)).data.total,1);
  assert.equal((await call('employees/'+employee.data.id,'GET',undefined,proxy)).data.teamName,'Field sales');
  assert.equal((await call('teams','GET',undefined,proxy)).data.items[0].memberCount,1);
  assert.equal((await call('teams/'+team.data.id,'DELETE',undefined,proxy)).status,409);
  assert.equal((await call('employees/'+employee.data.id,'DELETE',undefined,proxy)).status,200);assert.equal((await call('teams/'+team.data.id,'DELETE',undefined,proxy)).status,200);
  const audit=await db.auditLog.findFirst({where:{tenantId:a.id,entity:'employees',actorId:me.data.user.id}});assert(audit);assert((audit.after as any)?.proxySessionId);
  const expiredGrant=await call('auth/proxy-start','POST',{tenantId:b.id},root);await db.session.updateMany({where:{tenantId:b.id,proxyGrant:true},data:{expiresAt:new Date(0)}});assert.equal((await call('auth/proxy-claim','POST',{grant:expiredGrant.data.grant})).status,401);
  await call('auth/logout','POST',{},proxy);assert.equal((await call('auth/me','GET',undefined,root)).status,200);assert.equal((await call('company','GET',undefined,proxy)).status,401);
  assert(await db.auditLog.findFirst({where:{tenantId:a.id,action:'PROXY_LOGIN_ENDED',actorId:me.data.user.id}}));
  const raceGrant=await call('auth/proxy-start','POST',{tenantId:a.id},root);const race=await Promise.all([call('auth/proxy-claim','POST',{grant:raceGrant.data.grant}),call('auth/proxy-claim','POST',{grant:raceGrant.data.grant})]);assert.deepEqual(race.map(r=>r.status).sort(),[200,401]);
  const nextCookie=race.find(r=>r.status===200)!.cookie;const nextMe=await call('auth/me','GET',undefined,{cookie:nextCookie,csrf:'',scope:'TENANT'});const nextProxy={cookie:nextCookie,csrf:nextMe.data.csrf,scope:'TENANT'};
  const nextSession=await db.session.findFirstOrThrow({where:{tenantId:a.id,proxyGrant:false,proxyParentSessionId:{not:null}}});const fixedExpiry=new Date(Date.now()+30000);await db.session.update({where:{id:nextSession.id},data:{expiresAt:fixedExpiry}});await call('auth/me','GET',undefined,nextProxy);assert.equal((await db.session.findUniqueOrThrow({where:{id:nextSession.id}})).expiresAt.getTime(),fixedExpiry.getTime());
  await call('auth/logout','POST',{},root);assert.equal((await call('company','GET',undefined,nextProxy)).status,401);assert.equal((await call('company','GET',undefined,proxy)).status,401);
 }finally{io.close();await app.close();await f.close()}
});
