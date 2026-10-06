import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const yaml=readFileSync('.github/workflows/company-release.yml','utf8');
const script=yaml.split('          script: |\n')[1].split('\n').map(line=>line.slice(12)).join('\n');
const run=new (Object.getPrototypeOf(async function(){}).constructor)('fetch','github','context','core','AbortSignal',script);
test('release workflow requires a manual update request, forward history and successful verification before advancing production',async()=>{
 const sha='b'.repeat(40);let available:any=null,ci='success',status='ahead',updated:any=null;
 const github={rest:{git:{getRef:async()=>({data:{object:{sha:'a'.repeat(40)}}}),updateRef:async(v:any)=>{updated=v}},repos:{compareCommitsWithBasehead:async()=>({data:{status}})},actions:{listWorkflowRuns:async()=>({data:{workflow_runs:[{status:'completed',conclusion:ci}]}})}}};
 const call=()=>run(async()=>({ok:true,json:async()=>({version:available})}),github,{repo:{owner:'synthetic',repo:'repo'}},{info:()=>{}},AbortSignal);
 await call();assert.equal(updated,null);available=sha;ci='failure';await call();assert.equal(updated,null);
 ci='success';status='behind';await assert.rejects(call(),/forward production/);assert.equal(updated,null);
 status='ahead';await call();assert.deepEqual(updated,{owner:'synthetic',repo:'repo',ref:'heads/release/production',sha,force:false});
 available='malformed';await assert.rejects(call(),/Invalid release/);
});
