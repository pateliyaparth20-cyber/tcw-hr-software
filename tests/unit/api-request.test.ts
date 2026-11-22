import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchCompleteResponse} from '../../packages/ui/api-request';
test('request deadline includes a stalled JSON body after successful headers',async()=>{
 const stalled=new Response(new ReadableStream({start(){}}),{headers:{'content-type':'application/json'}});
 await assert.rejects(fetchCompleteResponse('/api/company',{},20,async()=>stalled),{name:'AbortError'});
});
test('buffered responses retain status, security headers and JSON payload',async()=>{
 const r=await fetchCompleteResponse('/api/company',{},1000,async()=>new Response(JSON.stringify({name:'Synthetic company'}),{status:200,headers:{'content-type':'application/json','x-test':'preserved'}}));assert.equal(r.status,200);assert.equal(r.headers.get('x-test'),'preserved');assert.deepEqual(await r.json(),{name:'Synthetic company'});
 const denied=await fetchCompleteResponse('/api/company',{},1000,async()=>new Response('challenge',{status:403,headers:{'cf-mitigated':'challenge'}}));assert.equal(denied.status,403);assert.equal(denied.headers.get('cf-mitigated'),'challenge');
});
test('no-content responses and upstream exceptions preserve the normal flow',async()=>{
 const r=await fetchCompleteResponse('/api/company',{},1000,async()=>new Response(null,{status:204}));assert.equal(r.status,204);await assert.rejects(fetchCompleteResponse('/api/company',{},1000,async()=>{throw Error('unavailable')}),/unavailable/);
});
test('request transport preserves credentials, CSRF headers and mutation body without replay',async()=>{
 let calls=0;await fetchCompleteResponse('/api/company',{method:'PATCH',credentials:'include',headers:{'X-CSRF-Token':'synthetic'},body:'{"name":"Synthetic"}'},1000,async(url,options)=>{calls++;assert.equal(url,'/api/company');assert.equal(options?.credentials,'include');assert.equal(new Headers(options?.headers).get('X-CSRF-Token'),'synthetic');assert.equal(options?.body,'{"name":"Synthetic"}');assert.ok(options?.signal);return new Response('{}')});assert.equal(calls,1);
});
