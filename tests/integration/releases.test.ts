import test from 'node:test';
import assert from 'node:assert/strict';
import {embeddedDatabase} from '../helpers/database';
import {seed} from '../../prisma/seed';
import {createApp} from '../../apps/api/src/app';
import {hashPassword} from '../../packages/auth';
import {claimReleaseNotice,releaseRecipients} from '../../apps/api/src/releases';
test('company release approvals are authenticated, scoped, exact-version and required from every active company',async()=>{
 const before={enabled:process.env.RELEASE_CONTROL_ENABLED,sha:process.env.GIT_COMMIT_SHA};process.env.NODE_ENV='test';process.env.APP_ORIGINS='http://localhost:3000';process.env.RELEASE_CONTROL_ENABLED='true';process.env.GIT_COMMIT_SHA='a'.repeat(40);
 const fixture=await embeddedDatabase(),db=fixture.db;await seed(db,{adminEmail:'release-admin@example.test',adminPassword:'SyntheticAdmin!2026',ownerEmail:'release-owner@example.test',ownerPassword:'SyntheticOwner!2026',companyCode:'RELEASE'});
 let version='b'.repeat(40);const source=async()=>({version,title:'Synthetic next release',publishedAt:'2026-10-06T00:00:00Z',url:'https://github.com/example/test/commit/'+version});
 const {app,io}=await createApp(db,source);await app.listen(0,'127.0.0.1');const base=`http://127.0.0.1:${app.getHttpServer().address().port}/api/`;
 async function call(path:string,method='GET',body?:any,auth?:any){const r=await fetch(base+path,{method,headers:{Origin:'http://localhost:3000','X-PeopleOS-Portal':'TENANT',...(body?{'Content-Type':'application/json'}:{}),...(auth?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),r};}
 async function login(email:string,companyCode='RELEASE'){const r=await call('auth/login','POST',{email,companyCode,password:'SyntheticOwner!2026'});assert.equal(r.status,200);return {cookie:r.r.headers.get('set-cookie')!.split(';')[0],csrf:r.data.csrf};}
 try{
  const company=await db.tenant.findUniqueOrThrow({where:{code:'RELEASE'}}),ownerUser=await db.user.findFirstOrThrow({where:{tenantId:company.id,email:'release-owner@example.test'}});
  const other=await db.tenant.create({data:{name:'Other company',code:'OTHER-RELEASE',status:'ACTIVE'}});await db.user.create({data:{name:'Other Owner',tenantId:other.id,email:'other-owner@example.test',roleId:ownerUser.roleId,passwordHash:await hashPassword('SyntheticOwner!2026')}});
  const role=await db.role.findUniqueOrThrow({where:{code:'EMPLOYEE'}});await db.user.create({data:{name:'Employee',tenantId:company.id,email:'release-employee@example.test',roleId:role.id,passwordHash:await hashPassword('SyntheticOwner!2026')}});
  const owner=await login(ownerUser.email),otherOwner=await login('other-owner@example.test','OTHER-RELEASE'),employee=await login('release-employee@example.test');
  assert.equal((await call('releases/approve','POST',{version},{...owner,csrf:''})).status,403);
  const recipients=await releaseRecipients(db);assert.ok(recipients.includes(ownerUser.id));assert.equal(recipients.length,2);
  assert.equal((await call('releases/status')).status,401);assert.equal((await call('releases/approve','POST',{version})).status,401);assert.equal((await call('releases/approve','POST',{version},employee)).status,403);
  assert.equal((await call('releases/approve','POST',{version,tenantId:other.id},owner)).status,400);
  assert.equal((await call('releases/deployable')).data.version,null);assert.equal((await call('releases/approve','POST',{version:'c'.repeat(40)},owner)).status,409);
  const approved=await call('releases/approve','POST',{version},owner);assert.equal(approved.status,200);assert.equal(approved.data.approved,true);assert.equal(approved.data.ready,false);assert.equal(approved.data.approvedCompanies,undefined);
  assert.equal((await call('releases/status','GET',undefined,otherOwner)).data.approved,false);assert.equal((await call('releases/deployable')).data.version,null);
  assert.equal((await call('releases/approve','POST',{version},owner)).status,200);assert.equal(await db.auditLog.count({where:{action:'COMPANY_RELEASE_APPROVED'}}),1);
  assert.equal((await call('releases/approve','POST',{version},otherOwner)).status,200);assert.equal((await call('releases/deployable')).data.version,version);
  version='c'.repeat(40);assert.equal((await call('releases/deployable')).data.version,null);assert.equal((await call('releases/status','GET',undefined,owner)).data.approved,false);
  const claims=await Promise.all(Array.from({length:10},()=>claimReleaseNotice(db,version)));assert.equal(claims.filter(Boolean).length,1);assert.equal(await claimReleaseNotice(db,version),false);
  await db.tenant.updateMany({data:{status:'ARCHIVED'}});assert.equal((await call('releases/deployable')).data.version,null);
 }finally{io.close();await app.close();await fixture.close();if(before.enabled===undefined)delete process.env.RELEASE_CONTROL_ENABLED;else process.env.RELEASE_CONTROL_ENABLED=before.enabled;if(before.sha===undefined)delete process.env.GIT_COMMIT_SHA;else process.env.GIT_COMMIT_SHA=before.sha;}
});
