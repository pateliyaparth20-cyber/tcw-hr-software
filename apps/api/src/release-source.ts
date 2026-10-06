import {ServiceUnavailableException} from '@nestjs/common';
export type ReleaseCandidate={version:string;title:string;publishedAt:string;url:string;lookupUnavailable?:boolean};
const feed='https://raw.githubusercontent.com/pateliyaparth20-cyber/tcw-hr-software/release/catalog/.release/latest.json';
const unavailable=()=>new ServiceUnavailableException('Could not check the next release. Try again shortly. Your current software remains active.');

// The verified feed is published by CI. Runtime servers need no GitHub token
// and do not consume the shared, unauthenticated GitHub API rate limit.
export function createReleaseSource({fetcher=(url:string,options:RequestInit)=>fetch(url,options),now=()=>Date.now()}={}){
 let cached:{at:number;value:ReleaseCandidate}|undefined,pending:Promise<ReleaseCandidate>|undefined,retryAt=0;
 return function latest():Promise<ReleaseCandidate>{
  if(cached&&now()-cached.at<60000)return Promise.resolve(cached.value);
  if(pending)return pending;
  if(now()<retryAt)return cached?Promise.resolve({...cached.value,lookupUnavailable:true}):Promise.reject(unavailable());
  pending=(async()=>{
   const response=await fetcher(feed+'?checked='+Math.floor(now()/60000),{headers:{Accept:'application/json','Cache-Control':'no-cache'},cache:'no-store',signal:AbortSignal.timeout(5000)});
   if(!response.ok)throw unavailable();
   const data=await response.json() as any;
   if(!data||typeof data.version!=='string'||! /^[a-f0-9]{40}$/.test(data.version)||typeof data.title!=='string'||typeof data.publishedAt!=='string'||!Number.isFinite(Date.parse(data.publishedAt)))throw unavailable();
   const value={version:data.version,title:data.title.slice(0,180),publishedAt:data.publishedAt,url:'https://github.com/pateliyaparth20-cyber/tcw-hr-software/commit/'+data.version};
   cached={at:now(),value};retryAt=0;return value;
  })().catch(()=>{retryAt=now()+30000;if(cached)return {...cached.value,lookupUnavailable:true};throw unavailable();}).finally(()=>{pending=undefined;});
  return pending;
 };
}
export const latestRelease=createReleaseSource();
