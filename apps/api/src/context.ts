import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { Database } from '../../../packages/database';
import { hasPermission, restrictedRoles } from '../../../packages/permissions';
import { digest, safeEqual } from '../../../packages/auth';
export interface Context {user:any;session:any;tenantId:string|null;ip:string;}
export type PortalScope='TENANT'|'PLATFORM';
export const sessionCookieName=(scope:PortalScope)=>scope==='PLATFORM'?'tcw_admin_session_v2':'tcw_hr_session_v2';
export function requestPortalScope(req:Pick<Request,'headers'>):PortalScope|null{
  const explicit=String(req.headers?.['x-peopleos-portal']??'').toUpperCase();
  if(explicit==='TENANT'||explicit==='PLATFORM')return explicit;
  const forwarded=String(req.headers?.['x-forwarded-host']??'');
  const host=forwarded||String(req.headers?.host??'');
  const origin=String(req.headers?.origin??req.headers?.referer??'');
  const hint=`${host} ${origin}`;
  if(/(?:^|[/:])3001(?:\b|\/)/.test(hint))return 'PLATFORM';
  if(/(?:^|[/:])3000(?:\b|\/)/.test(hint))return 'TENANT';
  return null;
}
export function requirePermission(ctx:Context,resource:string,action:string) {
  if(!hasPermission(ctx.user.role.permissions,resource,action)) throw new ForbiddenException('You do not have permission for this action.');
}
export function tenant(ctx:Context) {if(!ctx.tenantId||ctx.user.role.scope!=='TENANT') throw new ForbiddenException('A company account is required.');return ctx.tenantId;}
export function platform(ctx:Context) {if(ctx.user.role.scope!=='PLATFORM')throw new ForbiddenException('A platform account is required.');}
export async function authenticate(db:Database,req:Request):Promise<Context>{
  const scope=requestPortalScope(req);
  const names=scope?[sessionCookieName(scope),scope==='PLATFORM'?'tcw_admin_session':'tcw_hr_session','peopleos_session']:[sessionCookieName('TENANT'),sessionCookieName('PLATFORM'),'tcw_hr_session','tcw_admin_session','peopleos_session'];
  let session:any=null;
  for(const name of names){
    const raw=req.cookies?.[name];
    if(!raw)continue;
    const candidate=await db.session.findUnique({where:{tokenHash:digest(raw)},include:{user:{include:{role:true}}}});
    if(candidate&&(!scope||candidate.user.role.scope===scope)){session=candidate;break;}
  }
  // Local/LAN QA fallback: Next.js dev proxies on some Windows/browser combinations can
  // lose Set-Cookie while forwarding the embedded API response. In non-production only,
  // accept the exact server-issued session token through a dedicated header. The token is
  // still validated against the hashed session row and normal expiry/scope checks below.
  if(!session&&process.env.NODE_ENV!=='production'){
    const headerValue=req.headers?.['x-tcw-local-session'];
    const raw=Array.isArray(headerValue)?headerValue[0]:String(headerValue??'');
    if(raw){
      const candidate=await db.session.findUnique({where:{tokenHash:digest(raw)},include:{user:{include:{role:true}}}});
      if(candidate&&(!scope||candidate.user.role.scope===scope))session=candidate;
    }
  }
  if(!session) throw new UnauthorizedException('Please sign in.');
  const now=new Date();
  if(session.expiresAt<now||!session.user.active) throw new UnauthorizedException('Your session has expired.');
  // Sliding expiry: active users are not interrupted while they are working.
  // A normal session is renewed when it is within 6 hours of expiry; a long
  // "Remember me" session is renewed when it is within 7 days of expiry.
  const remaining=session.expiresAt.getTime()-now.getTime();
  const remembered=remaining>2*86400000;
  const ttl=remembered?30*86400000:86400000;
  const refreshWindow=remembered?7*86400000:6*3600000;
  if(remaining<refreshWindow){
    const nextExpiry=new Date(now.getTime()+ttl);
    await db.session.update({where:{id:session.id},data:{expiresAt:nextExpiry}});
    session.expiresAt=nextExpiry;
  }
  if(session.user.tenantId){
    const company=await db.tenant.findUnique({where:{id:session.user.tenantId}});
    if(!company||company.status==='ARCHIVED')throw new ForbiddenException('This company account is unavailable.');
    if(company.status==='SUSPENDED'&&(company.profile as any)?.suspensionReason!=='BILLING')throw new ForbiddenException('This company is suspended. Contact your software administrator.');
    if(session.user.role?.code==='COMPANY_OWNER'){
      const hrRole=await db.role.findUnique({where:{code:'HR_ADMIN'}});
      if(hrRole){
        session.user=await db.user.update({where:{id:session.user.id},data:{roleId:hrRole.id},include:{role:true}});
      }
    }
  }
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!safeEqual(String(req.headers['x-csrf-token']??''),session.csrf))throw new ForbiddenException('Session verification failed. Refresh and try again.');
  return {user:session.user,session,tenantId:session.user.tenantId,ip:req.ip??''};
}
export async function employeeScope(db:any,ctx:Context):Promise<string[]|null>{
  if(!restrictedRoles.has(ctx.user.role.code))return null;
  if(!ctx.user.employeeId)return [];
  if(ctx.user.role.code==='EMPLOYEE')return [ctx.user.employeeId];
  const team=await db.employee.findMany({where:{tenantId:tenant(ctx),managerId:ctx.user.employeeId,deletedAt:null},select:{id:true}});
  return [ctx.user.employeeId,...team.map((e:any)=>e.id)];
}
export async function assertEmployee(db:any,ctx:Context,employeeId:string){
  const scope=await employeeScope(db,ctx);
  if(scope&&!scope.includes(employeeId))throw new NotFoundException('Employee not found.');
  const row=await db.employee.findFirst({where:{id:employeeId,tenantId:tenant(ctx),deletedAt:null}});
  if(!row)throw new NotFoundException('Employee not found.');
  return row;
}
const sensitive=new Set(['password','passwordHash','ownerPassword','tokenHash','csrf','rawPayload','logo','personal','apiSecretHash','secret','pendingSecret','recoveryHashes','recoveryCodes']);
function sanitize(value:any):any{
  if(value==null)return null;
  if(value instanceof Date)return value.toISOString();
  if(typeof value==='bigint')return value.toString();
  if(typeof value==='object'&&typeof value.toJSON==='function')return sanitize(value.toJSON());
  if(Array.isArray(value))return value.map(sanitize);
  if(typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!sensitive.has(key)).map(([key,v])=>[key,sanitize(v)]));
  return value;
}
export async function audit(db:any,ctx:Context,action:string,entity:string,entityId?:string,before?:any,after?:any){
  await db.auditLog.create({data:{tenantId:ctx.tenantId,actorId:ctx.user.id,action,entity,entityId,ip:ctx.ip,...(before?{before:sanitize(before)}:{}),...(after?{after:sanitize(after)}:{})}});
}
