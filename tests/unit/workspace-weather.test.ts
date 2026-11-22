import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWeather,cityWeather,workspaceWeather} from '../../apps/api/src/workspace-weather';
import {roleDefinitions} from '../../packages/permissions';
const sample={current_condition:[{temp_C:'25',FeelsLikeC:'27',humidity:'60',windspeedKmph:'9',weatherDesc:[{value:'Partly cloudy'}],weatherCode:'116'}]};
test('weather parses real temperatures including zero and rejects missing or invalid data',()=>{
 assert.equal(parseWeather(sample,'Synthetic City','India')?.temperature,25);assert.equal(parseWeather({data:sample},'City','India')?.humidity,60);assert.equal(parseWeather({current_condition:[{temp_C:'0'}]},'City','India')?.temperature,0);assert.equal(parseWeather({current_condition:[{temp_C:''}]},'City','India'),null);assert.equal(parseWeather({},'City','India'),null);
});
test('weather requests are city-scoped, deduplicated, cached and honestly marked stale on failures',async()=>{
 let calls=0,fail=false;const fake:typeof fetch=async(url,init)=>{calls++;assert.ok(String(url).startsWith('https://wttr.in/Synthetic%20Weather%20City%2C%20India?format=j2'));assert.ok(init?.signal);return fail?new Response('',{status:503}):Response.json(sample)};
 const first=await cityWeather('Synthetic Weather City','India',fake,1700000000000);assert.equal(first.status,'AVAILABLE');await cityWeather('Synthetic Weather City','India',fake,1700000001000);assert.equal(calls,1);fail=true;const stale=await cityWeather('Synthetic Weather City','India',fake,1700001000000);assert.equal(stale.stale,true);const missing=await cityWeather('Synthetic Weather City','India',fake,1700010000000);assert.equal(missing.status,'UNAVAILABLE');assert.equal(missing.temperature,undefined);
});
test('weather requires dashboard access and a saved company city; no fabricated default location',async()=>{
 const root:any={user:{role:roleDefinitions.find(r=>r.code==='SUPER_ADMIN')}},tenant:any={tenantId:'own-company',user:{role:roleDefinitions.find(r=>r.code==='HR_ADMIN')}};
 const db:any={platformSetting:{findUnique:async()=>({value:{country:'India'}})},tenant:{findUnique:async(args:any)=>{assert.equal(args.where.id,'own-company');return {profile:{},timezone:'Asia/Kolkata'}}}};
 assert.equal((await workspaceWeather(db,root)).status,'LOCATION_REQUIRED');assert.equal((await workspaceWeather(db,tenant)).status,'LOCATION_REQUIRED');await assert.rejects(()=>workspaceWeather(db,{...root,user:{role:{permissions:[]}}} as any),/permission/);
});
