/** Keep the deadline active until response bodies finish, not just HTTP headers. */
export async function fetchCompleteResponse(url:string,init:RequestInit,timeoutMs:number,fetcher:typeof fetch=fetch){
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{const error=Object.assign(new Error('Request timed out'),{name:'AbortError'});controller.abort();reject(error)},timeoutMs)});
 try{return await Promise.race([(async()=>{const response=await fetcher(url,{...init,signal:controller.signal});const body=[204,205,304].includes(response.status)?null:await response.arrayBuffer();const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');return new Response(body,{status:response.status,statusText:response.statusText,headers})})(),deadline])}finally{if(timer)clearTimeout(timer)}
}
