import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthService} from '../../apps/api/src/auth';
import {hashPassword} from '../../packages/auth';
const secret='SyntheticPassword!2026';
const passwordHash=hashPassword(secret);
function fixture({companyCode='TCW-TEST',companyFound=true,users=[] as any[],locked=false}={}){
 const failed:any[]=[],sessions:any[]=[],audits:any[]=[],locks:any[]=[];
 const db:any={
  tenant:{findUnique:async()=>companyFound?{id:'tenant-test',code:companyCode}:null},
  employee:{findFirst:async()=>null},
  user:{findMany:async()=>users},
  loginAttempt:{findUnique:async()=>locked?{lockedUntil:new Date(Date.now()+60000)}:null,upsert:async(args:any)=>{failed.push(args);return {failures:failed.length}},update:async(args:any)=>{locks.push(args)},deleteMany:async()=>({count:0})},
  auditLog:{create:async(args:any)=>{audits.push(args)}},
  userSecurity:{findUnique:async()=>null},
  session:{create:async(args:any)=>{sessions.push(args)}},
 };
 const res:any={cookie(){},clearCookie(){}};
 const login=(input:any)=>new AuthService(db).login(input,{ip:'127.0.0.1',headers:{}} as any,res);
 return {login,failed,sessions,audits,locks};
}
async function candidate(extra:any={}){return {id:'test-user',tenantId:null,name:'Synthetic Admin',email:'admin@example.test',loginId:'TCW-ADMIN',active:true,passwordHash:await passwordHash,role:{code:'SUPER_ADMIN',name:'Super Admin',scope:'PLATFORM',permissions:[]},...extra};}
for(const [name,setup,input,message,status] of [
 ['unknown company',{companyFound:false},{companyCode:'MISSING',email:'user@example.test',password:secret},/Company Code not found/,401],
 ['unknown company user',{}, {companyCode:'TCW-TEST',email:'missing@example.test',password:secret},/not found in this company/,401],
 ['unknown admin',{}, {email:'missing@example.test',password:secret},/Admin User ID or email not found/,401],
] as const)test(name+' has a distinct error and records the failed attempt',async()=>{
 const f=fixture(setup);await assert.rejects(f.login(input),(e:any)=>e.getStatus()===status&&message.test(e.message));assert.equal(f.failed.length,1);assert.equal(f.sessions.length,0);assert.equal(f.audits[0].data.action,'LOGIN_FAILED');
});
test('wrong password stays distinct and five failures still cause the existing lockout',async()=>{
 const f=fixture({users:[await candidate()]});for(let i=0;i<5;i++)await assert.rejects(f.login({email:'admin@example.test',password:'WrongSynthetic!2026'}),/Incorrect password/);
 assert.equal(f.failed.length,5);assert.equal(f.locks.length,1);assert.ok(f.locks[0].data.lockedUntil>Date.now());assert.equal(f.sessions.length,0);
});
test('disabled accounts cannot sign in',async()=>{
 const f=fixture({users:[await candidate({active:false})]});await assert.rejects(f.login({email:'admin@example.test',password:secret}),(e:any)=>e.getStatus()===403&&/account is disabled/.test(e.message));assert.equal(f.sessions.length,0);
});
test('locked accounts retain their specific throttling response',async()=>{
 const f=fixture({locked:true});await assert.rejects(f.login({email:'admin@example.test',password:secret}),(e:any)=>e.getStatus()===429&&/15 minutes/.test(e.message));assert.equal(f.failed.length,0);
});
test('legacy duplicate admin rows still authenticate against the matching active password',async()=>{
 const f=fixture({users:[await candidate({passwordHash:await hashPassword('OtherSynthetic!2026')}),await candidate()]});const result=await f.login({email:'admin@example.test',password:secret});assert.ok('user' in result);assert.equal(result.user.id,'test-user');assert.equal(f.sessions.length,1);assert.equal(f.failed.length,0);
});
