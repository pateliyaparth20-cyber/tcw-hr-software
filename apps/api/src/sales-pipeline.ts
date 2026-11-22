import {ConflictException,NotFoundException} from '@nestjs/common';
import {z} from 'zod';
import type {Database} from '../../../packages/database';
import {audit,platform,requirePermission,type Context} from './context';

export const salesStages=['LEAD','CONTACTED','DEMO','QUOTATION','NEGOTIATION','WON','LOST'] as const;
export function salesCompany(lead:any,companies:any[]){
 const marker=String(lead.notes??'').match(/^\[(?:CUSTOM_PLAN|TCW_COMPANY):([a-f0-9-]{36})\]/i);
 if(marker)return companies.find(c=>c.id===marker[1])??null;
 const trial=String(lead.notes??'').match(/^(?:Self-service \d+-day trial signup|Admin-created \d+-day trial) · ([A-Z0-9-]+)(?:\n|$)/);
 return trial?companies.find(c=>c.code===trial[1])??null:null;
}
export function activeSalesCompany(company:any,now=new Date()){return company?.status==='ACTIVE'&&(!company.expiresAt||new Date(company.expiresAt)>now);}
export async function salesPipeline(db:Database,ctx:Context,method:string,recordId?:string,body?:unknown){
 platform(ctx);requirePermission(ctx,'sales',method==='GET'?'VIEW':'EDIT');
 if(method==='GET'){
  const [items,total,companies]=await Promise.all([db.lead.findMany({orderBy:[{createdAt:'desc'},{id:'desc'}],take:500}),db.lead.count(),db.tenant.findMany({select:{id:true,name:true,code:true,status:true,plan:true,expiresAt:true}})]);
  return {total,items:items.map(lead=>{const company=salesCompany(lead,companies);return {...lead,companyAccount:company,effectiveStage:activeSalesCompany(company)?'ACTIVE':lead.stage};})};
 }
 const input=z.object({stage:z.enum(salesStages),expectedUpdatedAt:z.string().datetime()}).strict().parse(body),id=z.string().uuid().parse(recordId);
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM leads WHERE id=${id}::uuid FOR UPDATE`;
  const before=await tx.lead.findUnique({where:{id}});if(!before)throw new NotFoundException('Lead not found.');
  if(before.updatedAt.toISOString()!==input.expectedUpdatedAt)throw new ConflictException('This lead changed in another window. Refresh and try again.');
  const companies=await tx.tenant.findMany({select:{id:true,code:true,status:true,expiresAt:true}});
  if(activeSalesCompany(salesCompany(before,companies)))throw new ConflictException('This company is active. It is grouped automatically; its subscription cannot be changed from Sales.');
  const after=await tx.lead.update({where:{id},data:{stage:input.stage}});await audit(tx,ctx,'SALES_STAGE_CHANGED','leads',id,{stage:before.stage},{stage:after.stage});return after;
 });
}
