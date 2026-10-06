import {ConflictException,ServiceUnavailableException} from '@nestjs/common';
import type {Database} from '../../../packages/database';
import {hasPermission} from '../../../packages/permissions';
import {audit,Context,platform,requirePermission,tenant} from './context';
export type ReleaseCandidate={version:string;title:string;publishedAt:string;url:string};
export const runningRelease=()=>process.env.RAILWAY_GIT_COMMIT_SHA??process.env.GIT_COMMIT_SHA??process.env.npm_package_version??'local';
const requestKey=(version:string)=>'software-release-request:'+version;
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
  if(!enabled)return {enabled,currentVersion,candidate:null,available:false,ready:false,updateRequested:false};
  const candidate=await this.source(),available=candidate.version!==currentVersion;
  const request=await this.db.platformSetting.findUnique({where:{key:requestKey(candidate.version)}});
  const updateRequested=available&&(request?.value as any)?.version===candidate.version;
  return {enabled,currentVersion,candidate,available,updateRequested,ready:updateRequested};
 }
 async canUpdate(ctx:Context){
  if(ctx.user.role.scope==='PLATFORM')return hasPermission(ctx.user.role.permissions,'system','MANAGE');
  if(!ctx.tenantId||!hasPermission(ctx.user.role.permissions,'company','EDIT'))return false;
  return !!await this.db.tenant.findFirst({where:{id:ctx.tenantId,status:{in:['ACTIVE','TRIAL']},OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]},select:{id:true}});
 }
 async status(ctx:Context){
  const s=await this.state();return {...s,canUpdate:s.enabled&&await this.canUpdate(ctx),checkedAt:new Date().toISOString()};
 }
 async update(ctx:Context,version:string){
  if(ctx.user.role.scope==='PLATFORM'){platform(ctx);requirePermission(ctx,'system','MANAGE');}else{tenant(ctx);requirePermission(ctx,'company','EDIT');}
  const s=await this.state();if(!s.enabled)throw new ServiceUnavailableException('Manual software updates are not enabled.');
  if(!s.available||s.candidate?.version!==version)throw new ConflictException('The available release changed. Check for updates again before updating.');
  if(!await this.canUpdate(ctx))throw new ConflictException('Only active or trial companies can start software updates.');
  const key=requestKey(version);
  try{
   await this.db.$transaction(async tx=>{const value={version,actorId:ctx.user.id,tenantId:ctx.tenantId??null,requestedAt:new Date().toISOString()};await tx.platformSetting.create({data:{key,value}});await audit(tx,ctx,'SOFTWARE_UPDATE_REQUESTED','software-update',version,null,value);});
  }catch(e:any){if(e.code!=='P2002'||!await this.db.platformSetting.findUnique({where:{key}}))throw e;}
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
