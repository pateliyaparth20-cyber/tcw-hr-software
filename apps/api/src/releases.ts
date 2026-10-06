import {ConflictException,ServiceUnavailableException} from '@nestjs/common';
import type {Database} from '../../../packages/database';
import {hasPermission} from '../../../packages/permissions';
import {audit,Context,platform,requirePermission,tenant} from './context';
export type ReleaseCandidate={version:string;title:string;publishedAt:string;url:string};
export const runningRelease=()=>process.env.RAILWAY_GIT_COMMIT_SHA??process.env.GIT_COMMIT_SHA??process.env.npm_package_version??'local';
const approvalKey=(tid:string)=>'company-release-approval:'+tid;
let cached:{at:number;value:ReleaseCandidate}|undefined;
export async function latestRelease():Promise<ReleaseCandidate>{
 if(cached&&Date.now()-cached.at<300000)return cached.value;
 const r=await fetch('https://api.github.com/repos/pateliyaparth20-cyber/tcw-hr-software/commits/main',{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new ServiceUnavailableException('Could not check the next release. Your current software remains active.');
 const data=await r.json() as any;if(!/^[a-f0-9]{40}$/.test(data.sha))throw new ServiceUnavailableException('Release information is invalid.');
 const value={version:data.sha,title:String(data.commit?.message??'Software update').split('\n')[0].slice(0,180),publishedAt:String(data.commit?.committer?.date??''),url:String(data.html_url??'')};cached={at:Date.now(),value};return value;
}
export class Releases{
 constructor(private db:Database,private source:()=>Promise<ReleaseCandidate>=latestRelease){}
 async state(){
  const enabled=process.env.RELEASE_CONTROL_ENABLED==='true',currentVersion=runningRelease();
  if(!enabled)return {enabled,currentVersion,candidate:null,available:false,ready:false,approvals:[] as string[],companies:[] as {id:string}[]};
  const candidate=await this.source(),available=candidate.version!==currentVersion;
  const companies=await this.db.tenant.findMany({where:{status:{in:['ACTIVE','TRIAL']},OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]},select:{id:true}});
  const approvals=await this.db.platformSetting.findMany({where:{key:{in:companies.map(c=>approvalKey(c.id))}}});
  const approved=approvals.filter(r=>(r.value as any)?.version===candidate.version).map(r=>r.key.slice('company-release-approval:'.length));
  const platformApproval=companies.length?null:await this.db.platformSetting.findUnique({where:{key:'platform-release-approval'}});
  return {enabled,currentVersion,candidate,available,companies,approvals:approved,ready:available&&(companies.length>0?approved.length===companies.length:(platformApproval?.value as any)?.version===candidate.version)};
 }
 async status(ctx:Context){
  const s=await this.state();const isPlatform=ctx.user.role.scope==='PLATFORM';
  const approved=isPlatform?s.ready:s.approvals.includes(ctx.tenantId??'');
  return {enabled:s.enabled,currentVersion:s.currentVersion,candidate:s.candidate,available:s.available,approved,ready:s.ready,canApprove:isPlatform?s.companies.length===0&&hasPermission(ctx.user.role.permissions,'system','MANAGE'):hasPermission(ctx.user.role.permissions,'company','EDIT'),waitingForCompanies:s.available&&!s.ready,...(isPlatform?{approvedCompanies:s.approvals.length,totalCompanies:s.companies.length}:{}),checkedAt:new Date().toISOString()};
 }
 async approve(ctx:Context,version:string){
  if(ctx.user.role.scope==='PLATFORM'){platform(ctx);requirePermission(ctx,'system','MANAGE');}else{tenant(ctx);requirePermission(ctx,'company','EDIT');}
  const s=await this.state();if(!s.enabled)throw new ServiceUnavailableException('Company release control is not enabled.');
  if(!s.available||s.candidate?.version!==version)throw new ConflictException('The available release changed. Check for updates again before approving.');
  if(ctx.user.role.scope==='PLATFORM'&&s.companies.length)throw new ConflictException('Each active company must approve this shared release.');
  if(ctx.tenantId&&!s.companies.some(c=>c.id===ctx.tenantId))throw new ConflictException('Only active or trial companies can approve releases.');
  const key=ctx.tenantId?approvalKey(ctx.tenantId):'platform-release-approval';
  await this.db.$transaction(async tx=>{const before=await tx.platformSetting.findUnique({where:{key}});if((before?.value as any)?.version===version)return;const value={version,actorId:ctx.user.id,approvedAt:new Date().toISOString()};await tx.platformSetting.upsert({where:{key},create:{key,value},update:{value}});await audit(tx,ctx,'COMPANY_RELEASE_APPROVED','software-update',version,before?.value,value);});
  return this.status(ctx);
 }
 async deployable(){const s=await this.state();return {version:s.ready?s.candidate?.version:null};}
}
export async function claimReleaseNotice(db:Database,version:string){
 try{await db.platformSetting.create({data:{key:'release-notice:'+version,value:{version,claimedAt:new Date().toISOString()}}});return true;}catch(e:any){if(e.code==='P2002')return false;throw e;}
}
export async function releaseRecipients(db:Database){
 const companies=await db.tenant.findMany({where:{status:{in:['ACTIVE','TRIAL']},OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]},select:{id:true}});
 const users=await db.user.findMany({where:{active:true,tenantId:{in:companies.map(c=>c.id)}},include:{role:true}});
 return users.filter(u=>u.role.scope==='TENANT'&&hasPermission(u.role.permissions,'company','EDIT')).map(u=>u.id);
}
