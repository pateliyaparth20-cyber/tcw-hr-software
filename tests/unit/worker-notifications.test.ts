import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
for(const path of ['apps/web/public/sw.js','apps/super-admin/public/sw.js'])test(path+' waits for manual worker activation and delivers an event only once',async()=>{
 const handlers:Record<string,any>={},stored=new Map<string,Response>(),notifications:any[]=[];let skipped=0;
 const cache={match:async(r:any)=>stored.get(typeof r==='string'?r:r.url),put:async(r:any,v:any)=>{stored.set(r.url,v)},keys:async()=>[...stored.keys()].map(url=>new Request(url)),delete:async(r:any)=>stored.delete(r.url),addAll:async()=>{}};
 vm.runInNewContext(readFileSync(path,'utf8'),{self:{location:{origin:'https://example.test'},addEventListener:(key:string,fn:any)=>{handlers[key]=fn},skipWaiting:async()=>{skipped++},registration:{showNotification:async(title:any,options:any)=>{notifications.push({title,options})}},clients:{claim:async()=>{}}},caches:{open:async()=>cache,keys:async()=>[],delete:async()=>true},Request,Response,URL,Promise});
 let promise:Promise<any>|undefined;const waitUntil=(p:Promise<any>)=>{promise=p};handlers.install({waitUntil});await promise;assert.equal(skipped,0);
 const data={title:'Synthetic update',body:'Synthetic notification',tag:'release-abc'};const tasks:Promise<any>[]=[];
 handlers.push({data:{json:()=>data},waitUntil:(p:Promise<any>)=>tasks.push(p)});handlers.message({data:{...data,type:'TCW_SHOW_NOTIFICATION'},waitUntil:(p:Promise<any>)=>tasks.push(p)});handlers.push({data:{json:()=>data},waitUntil:(p:Promise<any>)=>tasks.push(p)});await Promise.all(tasks);
 assert.equal(notifications.length,1);assert.equal(notifications[0].options.renotify,false);assert.equal(stored.size,1);
 handlers.message({data:{type:'TCW_ACTIVATE_APPROVED_WORKER'},waitUntil});await promise;assert.equal(skipped,1);
});
