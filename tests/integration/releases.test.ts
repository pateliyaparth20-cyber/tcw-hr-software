import test from 'node:test';
import assert from 'node:assert/strict';
import {embeddedDatabase} from '../helpers/database';
import {seed} from '../../prisma/seed';
import {createApp} from '../../apps/api/src/app';
import {hashPassword} from '../../packages/auth';
import {claimReleaseNotice,releaseRecipients} from '../../apps/api/src/releases';
test('manual updates require one authorized exact-version request without company approvals',async()=>{
 const before={enabled:process.env.RELEASE_CONTROL_ENABLED,sha:process.env.GIT_COMMIT_SHA,railwaySha:process.env.RAILWAY_GIT_COMMIT_SHA};process.env.NODE_ENV='test';process.env.APP_ORIGINS='http://localhost:3000,http://localhost:3001';process.env.RELEASE_CONTROL_ENABLED='true';process.env.GIT_COMMIT_SHA='a'.repeat(40);process.env.RAILWAY_GIT_COMMIT_SHA='a'.repeat(40);
 const fixture=await embeddedDatabase(),db=fixture.db;await seed(db,{adminEmail:'release-admin@example.test',adminPassword:'SyntheticAdmin!2026',ownerEmail:'release-owner@example.test',ownerPassword:'SyntheticOwner!2026',companyCode:'RELEASE'});
 let version='b'.repeat(40),reads=0,failAfter=Infinity,stale=false;const source=async()=>{if(++reads>failAfter)throw new Error('Synthetic release lookup outage');return {version,title:'Synthetic next release',publishedAt:'2026-10-06T00:00:00Z',url:'https://github.com/example/test/commit/'+version,...(stale?{lookupUnavailable:true}:{})};};
 const {app,io}=await createApp(db,source);await app.listen(0,'127.0.0.1');const base=`http://127.0.0.1:${app.getHttpServer().address().port}/api/`;
 async function call(path:string,method='GET',body?:any,auth?:any){const scope=auth?.scope??'TENANT';const r=await fetch(base+path,{method,headers:{Origin:scope==='PLATFORM'?'http://localhost:3001':'http://localhost:3000','X-PeopleOS-Portal':scope,...(body?{'Content-Type':'application/json'}:{}),...(auth?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),r};}
 async function login(email:string,companyCode:string|null='RELEASE'){const scope=companyCode?'TENANT':'PLATFORM';const r=await call('auth/login','POST',{email,...(companyCode?{companyCode}:{}),password:companyCode?'SyntheticOwner!2026':'SyntheticAdmin!2026'},{scope});assert.equal(r.status,200);return {cookie:r.r.headers.get('set-cookie')!.split(';')[0],csrf:r.data.csrf,scope};}
 try{
  const company=await db.tenant.findUniqueOrThrow({where:{code:'RELEASE'}}),ownerUser=await db.user.findFirstOrThrow({where:{tenantId:company.id,email:'release-owner@example.test'}});
  const other=await db.tenant.create({data:{name:'Other company',code:'OTHER-RELEASE',status:'ACTIVE'}});await db.user.create({data:{name:'Other Owner',tenantId:other.id,email:'other-owner@example.test',roleId:ownerUser.roleId,passwordHash:await hashPassword('SyntheticOwner!2026')}});
  const role=await db.role.findUniqueOrThrow({where:{code:'EMPLOYEE'}});await db.user.create({data:{name:'Employee',tenantId:company.id,email:'release-employee@example.test',roleId:role.id,passwordHash:await hashPassword('SyntheticOwner!2026')}});
  const owner=await login(ownerUser.email),otherOwner=await login('other-owner@example.test','OTHER-RELEASE'),employee=await login('release-employee@example.test'),admin=await login('release-admin@example.test',null);
  // Legacy approvals cannot silently start a release under the new policy.
  for(const c of [company,other])await db.platformSetting.create({data:{key:'company-release-approval:'+c.id,value:{version}}});
  assert.equal((await call('releases/deployable')).data.version,null);assert.equal((await call('releases/status','GET',undefined,owner)).data.updateRequested,false);
  assert.equal((await call('releases/status','GET',undefined,employee)).data.canUpdate,false);
  assert.equal((await call('releases/update','POST',{version},{...owner,csrf:''})).status,403);
  const recipients=await releaseRecipients(db);assert.ok(recipients.includes(ownerUser.id));assert.equal(recipients.length,2);
  assert.equal((await call('releases/status')).status,401);assert.equal((await call('releases/update','POST',{version})).status,401);assert.equal((await call('releases/update','POST',{version},employee)).status,403);
  assert.equal((await call('releases/update','POST',{version,tenantId:other.id},owner)).status,400);
  assert.equal((await call('releases/update','POST',{version:'c'.repeat(40)},owner)).status,409);
  assert.equal((await call('releases/approve','POST',{version},owner)).status,404);
  failAfter=reads+1;const started=await call('releases/update','POST',{version},owner);assert.equal(started.status,200);assert.equal(started.data.updateRequested,true);assert.equal(started.data.ready,true);assert.equal(started.data.approved,undefined);assert.equal(started.data.approvedCompanies,undefined);assert.equal(started.data.actorId,undefined);
  const unavailable=await call('releases/status','GET',undefined,owner);assert.equal(unavailable.status,200);assert.equal(unavailable.data.checkUnavailable,true);assert.equal(unavailable.data.currentVersion,'a'.repeat(40));assert.equal((await call('releases/deployable')).data.version,null);failAfter=Infinity;
  stale=true;const cached=await call('releases/status','GET',undefined,owner);assert.equal(cached.status,200);assert.equal(cached.data.updateRequested,true);assert.equal(cached.data.ready,false);assert.equal((await call('releases/deployable')).data.version,null);assert.equal((await call('releases/update','POST',{version},owner)).status,503);stale=false;
  assert.equal((await call('releases/status','GET',undefined,otherOwner)).data.updateRequested,true);assert.equal((await call('releases/deployable')).data.version,version);
  const duplicates=await Promise.all(Array.from({length:10},(_,i)=>call('releases/update','POST',{version},i%2?owner:otherOwner)));assert.ok(duplicates.every(r=>r.status===200));assert.equal(await db.auditLog.count({where:{action:'SOFTWARE_UPDATE_REQUESTED'}}),1);
  version='c'.repeat(40);assert.equal((await call('releases/deployable')).data.version,null);assert.equal((await call('releases/status','GET',undefined,owner)).data.updateRequested,false);assert.equal((await call('releases/update','POST',{version:'b'.repeat(40)},owner)).status,409);
  await db.tenant.update({where:{id:other.id},data:{expiresAt:new Date('2020-01-01')}});assert.equal((await call('releases/status','GET',undefined,otherOwner)).data.canUpdate,false);assert.ok([403,409].includes((await call('releases/update','POST',{version},otherOwner)).status));
  // Platform administrators may start updates without waiting for active companies.
  assert.equal((await call('releases/status','GET',undefined,admin)).data.canUpdate,true);assert.equal((await call('releases/update','POST',{version},admin)).status,200);assert.equal((await call('releases/deployable')).data.version,version);
  const claims=await Promise.all(Array.from({length:10},()=>claimReleaseNotice(db,version)));assert.equal(claims.filter(Boolean).length,1);assert.equal(await claimReleaseNotice(db,version),false);
  process.env.RELEASE_CONTROL_ENABLED='false';assert.equal((await call('releases/deployable')).data.version,null);assert.equal((await call('releases/update','POST',{version},owner)).status,503);
 }finally{io.close();await app.close();await fixture.close();if(before.enabled===undefined)delete process.env.RELEASE_CONTROL_ENABLED;else process.env.RELEASE_CONTROL_ENABLED=before.enabled;if(before.sha===undefined)delete process.env.GIT_COMMIT_SHA;else process.env.GIT_COMMIT_SHA=before.sha;if(before.railwaySha===undefined)delete process.env.RAILWAY_GIT_COMMIT_SHA;else process.env.RAILWAY_GIT_COMMIT_SHA=before.railwaySha;}
});
