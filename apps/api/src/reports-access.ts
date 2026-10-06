import {ForbiddenException} from '@nestjs/common';
import type {Database} from '../../../packages/database';
import type {Context} from './context';

// Access exceptions identify accounts, never roles. Configuration is server-only.
export async function reportsAccess(db:Database,ctx:Context){
  const maintenance=process.env.REPORTS_MAINTENANCE==='true';
  if(!maintenance)return {available:true,maintenance:false};
  const userIds=(process.env.REPORTS_PREVIEW_USER_IDS??'').split(',').map(v=>v.trim()).filter(Boolean);
  if(userIds.includes(ctx.user.id))return {available:true,maintenance:true};
  const login=(process.env.REPORTS_PREVIEW_LOGIN??'').trim().toLowerCase();
  const companyCode=(process.env.REPORTS_PREVIEW_COMPANY_CODE??'').trim().toUpperCase();
  const cutoff=Date.parse(process.env.REPORTS_PREVIEW_CREATED_BEFORE??'');
  // The cutoff prevents newly created/recreated logins from inheriting the exception.
  const existing=Number.isFinite(cutoff)&&new Date(ctx.user.createdAt).getTime()<=cutoff;
  if(login&&companyCode&&existing&&ctx.tenantId&&ctx.user.role.scope==='TENANT'&&
    [ctx.user.email,ctx.user.loginId].some(v=>typeof v==='string'&&v.toLowerCase()===login)){
    const company=await db.tenant.findUnique({where:{id:ctx.tenantId},select:{code:true}});
    if(company?.code.toUpperCase()===companyCode)return {available:true,maintenance:true};
  }
  return {available:false,maintenance:true};
}

export async function requireReportsAccess(db:Database,ctx:Context){
  if(!(await reportsAccess(db,ctx)).available)throw new ForbiddenException('Reports are Under Maintenance. Please try again later.');
}
