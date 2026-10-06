const portals=['https://hr.techcyberwarrior.in','https://admin.techcyberwarrior.in','https://employee.techcyberwarrior.in'];
async function advanceRequestedRelease({fetch,github,context,core,trackingVersion,onStage=async()=>{}}){
 const response=await fetch(portals[0]+'/api/releases/deployable',{signal:AbortSignal.timeout(15000),cache:'no-store'});
 if(!response.ok){core.info('Release control unavailable; retrying.');return;}
 const requested=await response.json(),version=requested.version??trackingVersion;if(!version)return;
 if(!/^[a-f0-9]{40}$/.test(version))throw new Error('Invalid release SHA');
 const {owner,repo}=context.repo;
 const current=await github.rest.git.getRef({owner,repo,ref:'heads/release/production'});
 if(current.data.object.sha!==version){
  if(!requested.version)return;
  await onStage(version,'verifying');
  const compare=await github.rest.repos.compareCommitsWithBasehead({owner,repo,basehead:`${current.data.object.sha}...${version}`});
  if(compare.data.status!=='ahead')throw new Error('Requested release is not a forward production update');
  const runs=await github.rest.actions.listWorkflowRuns({owner,repo,workflow_id:'ci.yml',head_sha:version,branch:'main',event:'push',per_page:10});
  const verification=runs.data.workflow_runs[0];
  if(!verification||verification.status!=='completed'||verification.conclusion!=='success'){await onStage(version,'verifying');return;}
  await github.rest.git.updateRef({owner,repo,ref:'heads/release/production',sha:version,force:false});
  core.info(`Started requested software update ${version.slice(0,12)}.`);
 }
 const live=await Promise.all(portals.map(async origin=>{try{const r=await fetch(origin+'/api/version',{signal:AbortSignal.timeout(10000),cache:'no-store'});return r.ok&&(await r.json()).version===version;}catch{return false;}}));
 const stage=live.every(Boolean)?'ready':'deploying';await onStage(version,stage);return {version,stage};
}
async function watchRequestedReleases(options,{durationMs=55*60000,intervalMs=15000,now=()=>Date.now(),wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const end=now()+durationMs;let previous='',publishedAt=0,trackingVersion;
 const {github,context,core}=options;const {owner,repo}=context.repo;
 async function onStage(version,stage){
  trackingVersion=version;const key=version+':'+stage;if(key===previous&&now()-publishedAt<60000)return;
  const path='.release/progress.json',branch='release/catalog';let sha;
  try{const old=await github.rest.repos.getContent({owner,repo,path,ref:branch});sha=old.data.sha;}catch(e){if(e.status!==404)throw e;}
  const value={version,stage,checkedAt:new Date(now()).toISOString()};
  await github.rest.repos.createOrUpdateFileContents({owner,repo,branch,path,sha,message:'Update software deployment progress',content:Buffer.from(JSON.stringify(value)+'\n').toString('base64')});
  previous=key;publishedAt=now();
 }
 do{
  try{const result=await advanceRequestedRelease({...options,trackingVersion,onStage});if(result?.stage==='ready')trackingVersion=undefined;}catch{core.info('Release check failed; keeping the current version and retrying.');if(trackingVersion){try{await onStage(trackingVersion,'retrying');}catch{}}}
  if(now()>=end)break;await wait(intervalMs);
 }while(now()<end);
}
module.exports={advanceRequestedRelease,watchRequestedReleases};
