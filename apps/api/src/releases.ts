import {ConflictException,ServiceUnavailableException} from '@nestjs/common';
import type {Database} from '../../../packages/database';
import {hasPermission} from '../../../packages/permissions';
import {audit,Context,platform,requirePermission,tenant} from './context';
import {latestRelease,type ReleaseCandidate} from './release-source';
export {latestRelease,type ReleaseCandidate} from './release-source';
export const runningRelease=()=>process.env.RAILWAY_GIT_COMMIT_SHA??process.env.GIT_COMMIT_SHA??process.env.npm_package_version??'local';
const requestKey=(version:string)=>'software-release-request:'+version;
export class Releases{
 constructor(private db:Database,private source:()=>Promise<ReleaseCandidate>=latestRelease){}
 async state(){
  const enabled=process.env.RELEASE_CONTROL_ENABLED==='true',currentVersion=runningRelease();
  if(!enabled)return {enabled,currentVersion,candidate:null,available:false,ready:false,updateRequested:false};
  let candidate:ReleaseCandidate;try{candidate=await this.source();}catch{return {enabled,currentVersion,candidate:null,available:false,ready:false,updateRequested:false,checkUnavailable:true};}
  const available=candidate.version!==currentVersion,checkUnavailable=!!candidate.lookupUnavailable;
  const request=await this.db.platformSetting.findUnique({where:{key:requestKey(candidate.version)}});
  const updateRequested=available&&(request?.value as any)?.version===candidate.version;
  return {enabled,currentVersion,candidate,available,updateRequested,ready:updateRequested&&!checkUnavailable,checkUnavailable};
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
  if(s.checkUnavailable)throw new ServiceUnavailableException('Could not verify the available update. Check again shortly; your current software remains active.');
  if(!s.available||s.candidate?.version!==version)throw new ConflictException('The available release changed. Check for updates again before updating.');
  if(!await this.canUpdate(ctx))throw new ConflictException('Only active or trial companies can start software updates.');
  const key=requestKey(version);
  try{
   await this.db.$transaction(async tx=>{const value={version,actorId:ctx.user.id,tenantId:ctx.tenantId??null,requestedAt:new Date().toISOString()};await tx.platformSetting.create({data:{key,value}});await audit(tx,ctx,'SOFTWARE_UPDATE_REQUESTED','software-update',version,null,value);});
  }catch(e:any){if(e.code!=='P2002'||!await this.db.platformSetting.findUnique({where:{key}}))throw e;}
  // Once committed, an accepted request must not become a false failure because
  // another external version lookup fails while building the response.
  return {...s,canUpdate:true,updateRequested:true,ready:true,checkedAt:new Date().toISOString()};
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
