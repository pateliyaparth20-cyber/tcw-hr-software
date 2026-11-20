import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('./_worker.js',import.meta.url),'utf8');
const {default:gateway}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

test('startup requests use only fixed endpoints without credentials, referrers or user tokens',async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async()=>new Response('Unavailable',{status:502});
    const response=await gateway.fetch(new Request('https://employee.techcyberwarrior.in/reset-password?token=private-synthetic',{headers:{accept:'text/html',cookie:'session=private-synthetic'}}));
    const html=await response.text(),calls=[];
    const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];assert.ok(script);
    vm.runInNewContext(script,{fetch:async(url,options)=>{calls.push({url,options});}});
    assert.deepEqual(calls.map(c=>c.url),['https://tcw-hr-api-ef18.onrender.com/api/health','https://tcw-employee-portal-ef18.onrender.com/login']);
    for(const {options} of calls){assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.cache,'no-store');assert.equal(options.mode,'no-cors');assert.equal(options.headers,undefined);}
    assert.doesNotMatch(script,/private-synthetic|cookie|session/);
  }finally{globalThis.fetch=original;}
});

test('temporary upstream failure shows a noncached auto-retry page',async()=>{
  const original=globalThis.fetch;
  try{
    for(const status of [502,503,504]){
      globalThis.fetch=async()=>new Response('Upstream unavailable',{status});
      const response=await gateway.fetch(new Request('https://admin.techcyberwarrior.in/login',{headers:{accept:'text/html'}}));
      assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('retry-after'),'8');
      const html=await response.text();assert.match(html,/Connecting to your workspace/);assert.doesNotMatch(html,/http-equiv="refresh"/);assert.match(html,/x-tcw-startup-check/);assert.match(html,/<iframe hidden credentialless/);assert.doesNotMatch(html,/Bad Gateway/);
    }
  }finally{globalThis.fetch=original;}
});

test('network failures use startup page, but API and POST requests are never replayed',async()=>{
  const original=globalThis.fetch;let calls=0;
  try{
    globalThis.fetch=async()=>{calls++;throw new Error('Connection failed');};
    const html=await gateway.fetch(new Request('https://hr.techcyberwarrior.in/',{headers:{accept:'text/html'}}));assert.match(await html.text(),/Connecting to your workspace/);
    const api=await gateway.fetch(new Request('https://admin.techcyberwarrior.in/api/auth/login',{method:'POST',headers:{accept:'text/html','content-type':'application/json'},body:'{}'}));
    assert.equal(api.status,503);assert.match(api.headers.get('content-type'),/application\/json/);assert.ok((await api.json()).message);assert.equal(calls,2);
    const post=await gateway.fetch(new Request('https://admin.techcyberwarrior.in/proxy-login',{method:'POST',headers:{accept:'text/html'},body:'synthetic'}));assert.match(post.headers.get('content-type'),/application\/json/);assert.equal(calls,3);
  }finally{globalThis.fetch=original;}
});

test('successful routing preserves bodies and CSRF, isolates hosts and rewrites redirects',async()=>{
  const original=globalThis.fetch;let forwarded;
  try{
    globalThis.fetch=async(request,options)=>{forwarded={url:request.url,headers:options.headers,body:await request.text()};return new Response('ok');};
    for(const [host,upstream] of [['admin.techcyberwarrior.in','tcw-super-admin-ef18.onrender.com'],['employee.techcyberwarrior.in','tcw-employee-portal-ef18.onrender.com'],['hr.techcyberwarrior.in','tcw-hr-portal-ef18.onrender.com']]){
      const result=await gateway.fetch(new Request(`https://${host}/api/test`,{method:'POST',headers:{origin:`https://${host}`,'x-csrf-token':'synthetic'},body:'synthetic'}));
      assert.equal(result.status,200);assert.equal(new URL(forwarded.url).hostname,upstream);assert.equal(forwarded.headers.get('x-forwarded-host'),upstream);assert.equal(forwarded.headers.get('origin'),`https://${upstream}`);assert.equal(forwarded.headers.get('x-csrf-token'),'synthetic');assert.equal(forwarded.body,'synthetic');
    }
    await gateway.fetch(new Request('https://hr.techcyberwarrior.in//foreign.example/path',{headers:{origin:'https://foreign.example'}}));assert.equal(new URL(forwarded.url).hostname,'tcw-hr-portal-ef18.onrender.com');assert.equal(forwarded.headers.get('origin'),'https://foreign.example');
    globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'https://tcw-super-admin-ef18.onrender.com/admin-login'}});
    const redirect=await gateway.fetch(new Request('https://admin.techcyberwarrior.in/'));assert.equal(redirect.headers.get('location'),'https://admin.techcyberwarrior.in/admin-login');
    assert.equal((await gateway.fetch(new Request('https://unknown.example/'))).status,404);
  }finally{globalThis.fetch=original;}
});
