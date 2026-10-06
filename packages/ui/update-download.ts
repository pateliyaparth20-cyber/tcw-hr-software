export type DownloadProgress={received:number;total:number;files:number;completed:number};
export function formatDownloadBytes(value:number){
 const bytes=Number.isFinite(value)?Math.max(0,value):0,units=['B','KB','MB','GB'];
 let amount=bytes,index=0;while(amount>=1024&&index<units.length-1){amount/=1024;index++;}
 return `${index?amount.toFixed(amount>=100?0:amount>=10?1:2):Math.round(amount)} ${units[index]}`;
}
export async function downloadRelease(version:string,onProgress:(p:DownloadProgress)=>void,{fetcher=fetch,signal}:{fetcher?:typeof fetch;signal?:AbortSignal}={}){
 const response=await fetcher('/api/releases/assets',{cache:'no-store',signal});if(!response.ok)throw new Error('Could not load the download list. Try Update again.');
 const manifest=await response.json();
 if(manifest.version!==version)throw new Error('The server version changed. Check for updates and try again.');
 if(!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>1000)throw new Error('The update files are not ready yet. Try again shortly.');
 const files=manifest.files as {url:string;bytes:number}[];
 if(files.some(f=>typeof f.url!=='string'||!/^\/_next\/static\/[a-zA-Z0-9_./()\[\]-]+\.(js|css)$/.test(f.url)||f.url.split('/').some(part=>part==='..'||part==='.')||!Number.isSafeInteger(f.bytes)||f.bytes<=0))throw new Error('The update download list is invalid.');
 if(new Set(files.map(f=>f.url)).size!==files.length)throw new Error('The update download list is invalid.');
 const total=files.reduce((n,f)=>n+f.bytes,0);let received=0,completed=0,cursor=0;
 const report=()=>onProgress({received,total,completed,files:files.length});report();
 async function worker(){while(cursor<files.length){const file=files[cursor++];const r=await fetcher(file.url,{cache:'reload',signal});if(!r.ok)throw new Error('A software file could not download. Retry Update; your HR records are safe.');
  let count=0;if(r.body){const reader=r.body.getReader();try{while(true){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;received+=value.byteLength;report();}}finally{reader.releaseLock();}}
  else{const data=await r.arrayBuffer();count=data.byteLength;received+=count;report();}
  if(count!==file.bytes)throw new Error('A downloaded file was incomplete. Retry Update.');completed++;report();
 }}
 await Promise.all(Array.from({length:Math.min(3,files.length)},worker));return {received,total,completed,files:files.length};
}
