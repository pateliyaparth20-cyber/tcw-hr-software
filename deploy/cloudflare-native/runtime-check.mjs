import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
// Import the real password implementation. No real account, database, key or
// production request is used. Never weaken scrypt to meet a hosting quota.
const result=await build({
  stdin:{contents:`import {hashPassword,verifyPassword,safeEqual} from './packages/auth/index.ts';
    export default {async fetch(){
      const start=performance.now();
      const stored=await hashPassword('Synthetic-runtime-check-only!');
      return Response.json({
        correct:await verifyPassword('Synthetic-runtime-check-only!',stored),
        wrong:await verifyPassword('Wrong-synthetic-password',stored),
        malformed:await verifyPassword('Synthetic-runtime-check-only!','invalid'),
        equal:safeEqual('same','same'),different:safeEqual('one','two'),
        elapsedMs:performance.now()-start
      });
    }};`,resolveDir:root,sourcefile:'tcw-runtime-check.ts'},
  bundle:true,write:false,format:'esm',platform:'neutral',external:['node:*']
});
const runtime=new Miniflare({modules:true,script:result.outputFiles[0].text,
  compatibilityDate:'2026-07-30',compatibilityFlags:['nodejs_compat']});
try{
  const response=await runtime.dispatchFetch('https://local.invalid/');
  assert.equal(response.status,200);
  const data=await response.json();
  assert.deepEqual({correct:data.correct,wrong:data.wrong,malformed:data.malformed,equal:data.equal,different:data.different},
    {correct:true,wrong:false,malformed:false,equal:true,different:false});
  console.log(JSON.stringify({status:'PASS',checks:5,elapsedMs:data.elapsedMs,
    scope:'Local Workers password compatibility only. Not a deployed login or Free CPU-limit test.'}));
}finally{await runtime.dispose();}
