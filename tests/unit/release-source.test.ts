import test from 'node:test';
import assert from 'node:assert/strict';
import {createReleaseSource} from '../../apps/api/src/release-source';
const candidate=(version='b'.repeat(40))=>({version,title:'Verified software update',publishedAt:'2026-10-06T00:00:00Z'});

test('verified release checks share one request and reuse the validated result',async()=>{
 let calls=0,clock=100000,finish!:()=>void;
 const source=createReleaseSource({now:()=>clock,fetcher:async(url)=>{calls++;assert.ok(url.startsWith('https://raw.githubusercontent.com/pateliyaparth20-cyber/tcw-hr-software/release/catalog/.release/latest.json'));await new Promise<void>(resolve=>{finish=resolve});return Response.json(candidate());}});
 const pending=Array.from({length:20},()=>source());finish();const values=await Promise.all(pending);assert.equal(calls,1);assert.ok(values.every(v=>v.version===candidate().version));
 clock+=59000;assert.equal((await source()).version,candidate().version);assert.equal(calls,1);
});

test('release source backs off after initial failure and recovers without a cached candidate',async()=>{
 let calls=0,clock=100000,fail=true;
 const source=createReleaseSource({now:()=>clock,fetcher:async()=>{calls++;if(fail)throw new Error('Synthetic network timeout');return Response.json(candidate());}});
 await assert.rejects(source(),/Could not check the next release/);await assert.rejects(source());assert.equal(calls,1);
 clock+=30001;fail=false;assert.equal((await source()).version,candidate().version);assert.equal(calls,2);
});

test('cached release information is marked unverified during an outage and becomes fresh after recovery',async()=>{
 let calls=0,clock=100000,fail=false,version='b'.repeat(40);
 const source=createReleaseSource({now:()=>clock,fetcher:async()=>{calls++;if(fail)return new Response('',{status:503});return Response.json(candidate(version));}});
 await source();clock+=60001;fail=true;const stale=await source();assert.equal(stale.lookupUnavailable,true);assert.equal(stale.version,version);await source();assert.equal(calls,2);
 clock+=30001;fail=false;version='c'.repeat(40);const fresh=await source();assert.equal(fresh.version,version);assert.equal(fresh.lookupUnavailable,undefined);assert.equal(calls,3);
});

test('invalid version identifiers and malformed publication dates cannot become release candidates',async()=>{
 for(const value of [{...candidate(),version:'main'},{...candidate(),publishedAt:'invalid'},{...candidate(),version:123},null]){
  const source=createReleaseSource({fetcher:async()=>Response.json(value)});await assert.rejects(source(),/Could not check the next release/);
 }
});

test('only a successful main-push verification can publish the candidate feed',async()=>{
 const {readFile}=await import('node:fs/promises');const workflow=await readFile('.github/workflows/publish-software-candidate.yml','utf8');
 assert.match(workflow,/conclusion == 'success'/);assert.match(workflow,/event == 'push'/);assert.match(workflow,/head_branch == 'main'/);assert.match(workflow,/main\.data\.object\.sha !== version/);assert.match(workflow,/branch = 'release\/catalog'/);assert.doesNotMatch(workflow,/ref: 'heads\/release\/production'/);
});

test('deployment progress is fresh validated and coalesces concurrent checks',async()=>{
 const {createReleaseProgressSource}=await import('../../apps/api/src/release-source');let calls=0,clock=Date.parse('2026-10-06T12:00:00Z');
 const source=createReleaseProgressSource({now:()=>clock,fetcher:async()=>{calls++;return Response.json({version:'b'.repeat(40),stage:'deploying',checkedAt:new Date(clock).toISOString()})}});
 const values=await Promise.all(Array.from({length:15},()=>source()));assert.equal(calls,1);assert.ok(values.every(p=>p?.stage==='deploying'));await source();assert.equal(calls,1);
});
test('stale invalid and unavailable deployment progress never becomes a fake status',async()=>{
 const {createReleaseProgressSource}=await import('../../apps/api/src/release-source');const clock=Date.parse('2026-10-06T12:00:00Z');
 for(const p of [{version:'b'.repeat(40),stage:'ready',checkedAt:new Date(clock-180000).toISOString()},{version:'main',stage:'deploying',checkedAt:new Date(clock).toISOString()},{version:'b'.repeat(40),stage:'unknown',checkedAt:new Date(clock).toISOString()}]){
  const source=createReleaseProgressSource({now:()=>clock,fetcher:async()=>Response.json(p)});assert.equal(await source(),null);
 }
 const source=createReleaseProgressSource({now:()=>clock,fetcher:async()=>{throw new Error('Offline')}});assert.equal(await source(),null);
});
