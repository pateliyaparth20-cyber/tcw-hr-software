import test from 'node:test';
import assert from 'node:assert/strict';
import {formatDownloadBytes,downloadRelease} from '../../packages/ui/update-download';
const version='b'.repeat(40),url='/_next/static/chunks/update.js';
test('download sizes switch correctly between bytes KB MB and GB',()=>{
 assert.equal(formatDownloadBytes(0),'0 B');assert.equal(formatDownloadBytes(1023),'1023 B');assert.equal(formatDownloadBytes(1024),'1.00 KB');assert.equal(formatDownloadBytes(5*1024**2),'5.00 MB');assert.equal(formatDownloadBytes(2*1024**3),'2.00 GB');assert.equal(formatDownloadBytes(NaN),'0 B');
});
test('download progress counts actual streamed bytes and completes only after every file',async()=>{
 const progress:any[]=[];const data=new Uint8Array(4096);
 const fetcher:any=async(path:string)=>path.startsWith('/api/')?Response.json({version,files:[{url,bytes:data.length}]}):new Response(new ReadableStream({start(c){c.enqueue(data.slice(0,1024));c.enqueue(data.slice(1024));c.close()}}));
 const result=await downloadRelease(version,p=>progress.push({...p}),{fetcher});assert.equal(result.received,4096);assert.equal(result.completed,1);assert.ok(progress.some(p=>p.received===1024&&p.completed===0));assert.equal(progress.at(-1).total,4096);
});
test('wrong versions unsafe paths duplicate files and incomplete downloads are rejected',async()=>{
 for(const manifest of [{version:'c'.repeat(40),files:[{url,bytes:2}]},{version,files:[{url:'https://evil.test/a.js',bytes:2}]},{version,files:[{url:'/_next/static/../evil.js',bytes:2}]},{version,files:[{url,bytes:2},{url,bytes:2}]}]){
  await assert.rejects(downloadRelease(version,()=>{},{fetcher:(async()=>Response.json(manifest)) as any}));
 }
 await assert.rejects(downloadRelease(version,()=>{},{fetcher:(async(path:string)=>path.startsWith('/api/')?Response.json({version,files:[{url,bytes:4}]}):new Response('hi')) as any}),/incomplete/);
});


test('Next catch-all route chunks are valid assets rather than traversal paths',async()=>{
 const file='/_next/static/chunks/app/[[...path]]/page-123.js';
 const result=await downloadRelease(version,()=>{},{fetcher:(async(path:string)=>path.startsWith('/api/')?Response.json({version,files:[{url:file,bytes:2}]}):new Response('hi')) as any});assert.equal(result.received,2);
});


test('a version changed during download cannot be marked ready to install',async()=>{
 let manifests=0;
 await assert.rejects(downloadRelease(version,()=>{},{fetcher:(async(path:string)=>path.startsWith('/api/')?Response.json({version:++manifests===1?version:'c'.repeat(40),files:[{url,bytes:2}]}):new Response('hi')) as any}),/Another version/);
});
