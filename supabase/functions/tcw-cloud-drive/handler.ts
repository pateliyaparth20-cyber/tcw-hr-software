type Options={publicKeySpki:string;storageUrl:string;serviceKey:string;bucket:string;fetcher?:typeof fetch;now?:()=>number};
const encoder=new TextEncoder(),emptyHash='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const objectKey=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function decode(v:string){return Uint8Array.from(atob(v.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
export function createDriveHandler(options:Options){
 const transport=options.fetcher??fetch,now=options.now??Date.now;
 const publicKey=crypto.subtle.importKey('spki',decode(options.publicKeySpki),{name:'Ed25519'},false,['verify']);
 return async(req:Request)=>{
  const fail=(status:number)=>new Response(null,{status,headers:{'cache-control':'no-store'}});
  try{
   const method=req.method,key=new URL(req.url).searchParams.get('key')??'',timestamp=req.headers.get('x-tcw-time')??'',hash=req.headers.get('x-tcw-hash')??'',signature=req.headers.get('x-tcw-signature')??'',mime=method==='PUT'?req.headers.get('content-type')??'':'';
   if(!['HEAD','GET','PUT','DELETE'].includes(method)||method==='HEAD'&&key||method!=='HEAD'&&!objectKey.test(key))return fail(400);
   if(!/^\d{10}$/.test(timestamp)||Math.abs(Math.floor(now()/1000)-Number(timestamp))>45||!/^\w{86}$/.test(signature.replace(/-/g,'_'))||!/^([a-f0-9]{64})$/.test(hash))return fail(401);
   const payload=[method,options.bucket,key,timestamp,hash,mime].join('\n');if(!await crypto.subtle.verify('Ed25519',await publicKey,decode(signature),encoder.encode(payload)))return fail(401);
   if(method!=='PUT'&&hash!==emptyHash)return fail(400);
   if(method==='PUT'&&!['application/pdf','image/png','image/jpeg'].includes(mime))return fail(415);
   if(method==='PUT'&&Number(req.headers.get('content-length'))>10*1024*1024)return fail(413);
   const bytes=method==='PUT'?new Uint8Array(await req.arrayBuffer()):undefined;
   if(bytes){if(bytes.length>10*1024*1024)return fail(413);const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));if(Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('')!==hash)return fail(401);}
   const base=options.storageUrl.replace(/\/$/,''),headers:Record<string,string>={authorization:'Bearer '+options.serviceKey,apikey:options.serviceKey};
   let upstream:Response;
   if(method==='HEAD'){
    upstream=await transport(base+'/storage/v1/bucket/'+options.bucket,{headers,signal:AbortSignal.timeout(15000),redirect:'error'});
    if(!upstream.ok)return fail(502);const bucket=await upstream.json();return fail(bucket.public===false?200:503);
   }
   const url=base+'/storage/v1/object/'+options.bucket+'/'+key.split('/').map(encodeURIComponent).join('/');
   if(method==='DELETE')upstream=await transport(base+'/storage/v1/object/'+options.bucket,{method:'DELETE',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({prefixes:[key]}),signal:AbortSignal.timeout(15000),redirect:'error'});
   else if(method==='PUT'){const form=new FormData();form.append('cacheControl','0');form.append('',new Blob([bytes! as BlobPart],{type:mime}),'document');upstream=await transport(url,{method:'POST',headers:{...headers,'x-upsert':'false'},body:form,signal:AbortSignal.timeout(15000),redirect:'error'});}
   else upstream=await transport(url,{headers,signal:AbortSignal.timeout(15000),redirect:'error'});
   if(!upstream.ok)return fail(upstream.status===413?413:502);
   return new Response(method==='GET'?upstream.body:null,{status:200,headers:{'cache-control':'private, no-store',...(method==='GET'?{'content-type':upstream.headers.get('content-type')??'application/octet-stream'}:{})}});
  }catch{return fail(503)}
 };
}
