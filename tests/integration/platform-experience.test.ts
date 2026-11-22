import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {embeddedDatabase} from '../helpers/database';
import {roleDefinitions} from '../../packages/permissions';
import {defaultLoading,loadingSettings,publicLoading,validateLoading} from '../../apps/api/src/loading-branding';
import {salesPipeline} from '../../apps/api/src/sales-pipeline';
import {DataService} from '../../apps/api/src/data';

test('platform appearance and sales preserve authorization, state and automatic active grouping',async t=>{
 process.env.NODE_ENV='test';const f=await embeddedDatabase(),db=f.db;
 const root:any={user:{id:randomUUID(),role:roleDefinitions.find(r=>r.code==='SUPER_ADMIN')!},session:{},ip:'127.0.0.1'},tenant:any={tenantId:randomUUID(),user:{id:randomUUID(),role:roleDefinitions.find(r=>r.code==='HR_ADMIN')!},session:{},ip:'127.0.0.1'};
 try{
  await t.test('only platform system editors can save valid loading media; stale updates are rejected',async()=>{
   await assert.rejects(()=>loadingSettings(db,tenant,'GET',null),/platform|Super/i);
   const value={...defaultLoading,title:'Synthetic brand',message:'Preparing synthetic test workspace',animation:'PULSE',expectedUpdatedAt:null};
   const saved=await loadingSettings(db,root,'PUT',value);assert.equal(saved.animation,'PULSE');assert.equal((await publicLoading(db)).title,'Synthetic brand');
   await assert.rejects(()=>loadingSettings(db,root,'PUT',{...value,title:'Stale overwrite'}),/another window/);
   assert.throws(()=>validateLoading({...defaultLoading,logo:'data:image/svg+xml;base64,PHN2Zz4='}));assert.throws(()=>validateLoading({...defaultLoading,logo:'data:image/gif;base64,YmFk'}));assert.throws(()=>validateLoading({...defaultLoading,accent:'url(https://invalid.test/)'}));
  });
  await t.test('active companies move automatically without changing lead stage or subscription',async()=>{
   const company=await db.tenant.create({data:{code:('PIPE-'+randomUUID()).toUpperCase(),name:'Synthetic active company',status:'ACTIVE',expiresAt:new Date(Date.now()+86400000)}});
   const lead=await db.lead.create({data:{company:company.name,contactName:'Synthetic owner',email:'synthetic@example.test',stage:'DEMO',notes:'Self-service 3-day trial signup · '+company.code}});
   const open=await db.lead.create({data:{company:'Unlinked names do not activate',contactName:'Synthetic contact',email:'open@example.test',stage:'LEAD'}});
   const list:any=await salesPipeline(db,root,'GET');assert.equal(list.items.find((r:any)=>r.id===lead.id).effectiveStage,'ACTIVE');assert.equal(list.items.find((r:any)=>r.id===open.id).effectiveStage,'LEAD');assert.equal((await db.lead.findUniqueOrThrow({where:{id:lead.id}})).stage,'DEMO');
   await assert.rejects(()=>salesPipeline(db,root,'PATCH',lead.id,{stage:'LOST',expectedUpdatedAt:lead.updatedAt.toISOString()}),/grouped automatically/);
   await assert.rejects(()=>salesPipeline(db,tenant,'GET'),/platform|Super/i);
   const moved:any=await salesPipeline(db,root,'PATCH',open.id,{stage:'CONTACTED',expectedUpdatedAt:open.updatedAt.toISOString()});assert.equal(moved.stage,'CONTACTED');
   await assert.rejects(()=>salesPipeline(db,root,'PATCH',open.id,{stage:'WON',expectedUpdatedAt:open.updatedAt.toISOString()}),/another window/);assert.equal((await db.tenant.findUniqueOrThrow({where:{id:company.id}})).status,'ACTIVE');
   await new DataService(db).platformResource(root,'leads','PATCH',lead.id,{company:lead.company,contactName:lead.contactName,email:lead.email,phone:'',stage:'DEMO',value:0,notes:'Updated human note'});
   const edited=await db.lead.findUniqueOrThrow({where:{id:lead.id}});assert.ok(edited.notes.startsWith('[TCW_COMPANY:'+company.id+']'));
   const manual=await new DataService(db).platformResource(root,'leads','POST',undefined,{company:'Manually linked customer',contactName:'Synthetic',email:'manual@example.test',stage:'LEAD',value:0,phone:'',notes:'Explicit link',companyId:company.id});const linkedList:any=await salesPipeline(db,root,'GET');assert.equal(linkedList.items.find((r:any)=>r.id===manual.id).effectiveStage,'ACTIVE');
   await db.tenant.update({where:{id:company.id},data:{status:'EXPIRED'}});const expired:any=await salesPipeline(db,root,'GET');assert.equal(expired.items.find((r:any)=>r.id===lead.id).effectiveStage,'DEMO');
  });
 }finally{await f.close();}
});
