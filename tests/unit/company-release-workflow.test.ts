import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {advanceRequestedRelease,watchRequestedReleases}=require('../../scripts/manual-release.cjs');
const yaml=readFileSync('.github/workflows/company-release.yml','utf8');
test('release workflow requires a manual update request, forward history and successful verification before advancing production',async()=>{
 const sha='b'.repeat(40);let available:any=null,ci='success',status='ahead',updated:any=null;const stages:any[]=[];
 const github={rest:{git:{getRef:async()=>({data:{object:{sha:'a'.repeat(40)}}}),updateRef:async(v:any)=>{updated=v}},repos:{compareCommitsWithBasehead:async()=>({data:{status}})},actions:{listWorkflowRuns:async()=>({data:{workflow_runs:[{status:'completed',conclusion:ci}]}})}}};
 const fetcher=async(url:string)=>({ok:true,json:async()=>url.endsWith('deployable')?{version:available}:{version:sha}});
 const call=()=>advanceRequestedRelease({fetch:fetcher,github,context:{repo:{owner:'synthetic',repo:'repo'}},core:{info:()=>{}},onStage:async(v:string,s:string)=>{stages.push(s)}});
 await call();assert.equal(updated,null);available=sha;ci='failure';await call();assert.equal(updated,null);assert.deepEqual(stages,['verifying','verifying']);
 ci='success';status='behind';await assert.rejects(call(),/forward production/);assert.equal(updated,null);
 status='ahead';await call();assert.deepEqual(updated,{owner:'synthetic',repo:'repo',ref:'heads/release/production',sha,force:false});assert.equal(stages.at(-1),'ready');
 available='malformed';await assert.rejects(call(),/Invalid release/);
});
test('already advanced releases do not deploy twice and partial portal rollout is shown as deploying',async()=>{
 const sha='b'.repeat(40);let pushes=0,stage='';
 const github={rest:{git:{getRef:async()=>({data:{object:{sha}}}),updateRef:async()=>pushes++}}};
 await advanceRequestedRelease({github,context:{repo:{}},core:{info:()=>{}},fetch:async(url:string)=>({ok:true,json:async()=>url.endsWith('deployable')?{version:sha}:{version:url.includes('employee.')?'old':sha}}),onStage:async(v:string,s:string)=>{stage=s}});
 assert.equal(pushes,0);assert.equal(stage,'deploying');
});
test('active watcher retries without deploying an unrequested version and scheduled restarts do not queue behind it',async()=>{
 assert.match(yaml,/cancel-in-progress: true/);assert.match(yaml,/Publish Verified Software Candidate/);assert.match(yaml,/watchRequestedReleases/);
 let clock=0,calls=0;
 await watchRequestedReleases({fetch:async()=>{calls++;if(calls===1)throw new Error('Offline');return {ok:true,json:async()=>({version:null})}},github:{},context:{repo:{}},core:{info:()=>{}}},{durationMs:31,intervalMs:15,now:()=>clock,wait:async(ms:number)=>{clock+=ms}});
 assert.equal(calls,3);
});


test('watcher keeps tracking remaining portals after HR has already updated',async()=>{
 const sha='b'.repeat(40);let stage='';
 await advanceRequestedRelease({trackingVersion:sha,github:{rest:{git:{getRef:async()=>({data:{object:{sha}}})}}},context:{repo:{}},core:{info:()=>{}},fetch:async(url:string)=>({ok:true,json:async()=>url.endsWith('deployable')?{version:null}:{version:sha}}),onStage:async(v:string,s:string)=>{stage=s}});
 assert.equal(stage,'ready');
});
