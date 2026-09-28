import type {NextRequest} from 'next/server';

const apiBase=process.env.API_INTERNAL_URL??'http://127.0.0.1:4000';
const portal='TENANT';
const hopByHop=new Set(['connection','content-length','content-encoding','transfer-encoding','keep-alive']);

async function proxy(request:NextRequest,{params}:{params:Promise<{path:string[]}>}){
  const {path}=await params;
  const incoming=new URL(request.url);
  const target=new URL(`/api/${(path??[]).join('/')}`,apiBase);
  target.search=incoming.search;
  const headers=new Headers();
  for(const name of ['accept','content-type','cookie','user-agent','x-csrf-token','x-forwarded-for','x-tcw-local-session']){
    const value=request.headers.get(name);if(value)headers.set(name,value);
  }
  headers.set('origin',request.headers.get('origin')??incoming.origin);
  headers.set('x-peopleos-portal',portal);
  const method=request.method.toUpperCase();
  const body=['GET','HEAD'].includes(method)?undefined:await request.arrayBuffer();
  let upstream:Response;
  try{
    const apiHost=new URL(apiBase).hostname;
    const localApi=apiHost==='localhost'||apiHost==='127.0.0.1'||apiHost==='::1';
    const timeoutMs=(path?.[0]==='auth'||path?.[0]==='health')?(localApi?10000:30000):60000;
    upstream=await fetch(target,{method,headers,body,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(timeoutMs)});
  }catch{
    return new Response(JSON.stringify({message:'TCW HR API is unavailable. Check the server connection and try again.'}),{status:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
  }
  const responseHeaders=new Headers();
  upstream.headers.forEach((value,key)=>{if(!hopByHop.has(key.toLowerCase())&&key.toLowerCase()!=='set-cookie')responseHeaders.set(key,value)});
  const getSetCookie=(upstream.headers as Headers & {getSetCookie?:()=>string[]}).getSetCookie;
  const cookies=getSetCookie?.call(upstream.headers)??[];
  if(cookies.length)for(const cookie of cookies)responseHeaders.append('set-cookie',cookie);
  else{const cookie=upstream.headers.get('set-cookie');if(cookie)responseHeaders.append('set-cookie',cookie)}
  responseHeaders.set('cache-control','no-store');
  return new Response(await upstream.arrayBuffer(),{status:upstream.status,statusText:upstream.statusText,headers:responseHeaders});
}

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=proxy;export const POST=proxy;export const PUT=proxy;export const PATCH=proxy;export const DELETE=proxy;export const OPTIONS=proxy;export const HEAD=proxy;
