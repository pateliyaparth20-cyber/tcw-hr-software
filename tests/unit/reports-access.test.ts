import test from 'node:test';
import assert from 'node:assert/strict';
import {reportsAccess,requireReportsAccess} from '../../apps/api/src/reports-access';

test('report account exception is tenant scoped and excludes accounts created after the cutoff',async()=>{
 const keys=['REPORTS_MAINTENANCE','REPORTS_PREVIEW_USER_IDS','REPORTS_PREVIEW_LOGIN','REPORTS_PREVIEW_COMPANY_CODE','REPORTS_PREVIEW_CREATED_BEFORE'];
 const old=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 const ctx:any={tenantId:'tenant-a',user:{id:'user-a',email:'owner@example.test',loginId:'owner',createdAt:new Date('2026-01-01'),role:{scope:'TENANT'}}};
 const db:any={tenant:{findUnique:async({where}:any)=>({code:where.id==='tenant-a'?'A':'B'})}};
 try{
  for(const key of keys)delete process.env[key];
  // Unconfigured production defaults to maintenance for everyone.
  assert.deepEqual(await reportsAccess(db,ctx),{available:false,maintenance:true});process.env.REPORTS_MAINTENANCE='true';
  assert.equal((await reportsAccess(db,ctx)).available,false);await assert.rejects(requireReportsAccess(db,ctx),/Under Maintenance/);
  process.env.REPORTS_PREVIEW_LOGIN='OWNER@example.test';process.env.REPORTS_PREVIEW_COMPANY_CODE='a';process.env.REPORTS_PREVIEW_CREATED_BEFORE='2026-10-06T00:00:00Z';
  assert.equal((await reportsAccess(db,ctx)).available,true);
  assert.equal((await reportsAccess(db,{...ctx,tenantId:'tenant-b'})).available,false);
  assert.equal((await reportsAccess(db,{...ctx,user:{...ctx.user,createdAt:new Date('2026-10-07')}})).available,false);
  delete process.env.REPORTS_PREVIEW_CREATED_BEFORE;assert.equal((await reportsAccess(db,ctx)).available,false);
  process.env.REPORTS_PREVIEW_USER_IDS='user-a';assert.equal((await reportsAccess(db,ctx)).available,true);
  assert.equal((await reportsAccess(db,{...ctx,user:{...ctx.user,id:'user-b'}})).available,false);
  process.env.REPORTS_MAINTENANCE='false';assert.equal((await reportsAccess(db,ctx)).available,true);
 }finally{for(const key of keys){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}}
});
