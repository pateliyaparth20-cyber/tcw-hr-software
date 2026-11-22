export type PortalScope='TENANT'|'PLATFORM'|'ANY';
/** Only return to a protected page in this portal; never redirect to another origin. */
export function workspaceReturnPath(value:string|null|undefined,scope:PortalScope){
 const fallback='/dashboard';
 if(!value||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u001f\u007f]/.test(value))return fallback;
 try{
  const url=new URL(value,'https://workspace.invalid');
  if(url.origin!=='https://workspace.invalid')return fallback;
  const page=decodeURIComponent(url.pathname).slice(1);
  const shared=['dashboard','profile','security','notifications'];
  const tenant=['employees','organization','calendar','attendance','devices','workforce','field-work','leave','payroll','recruitment','goals','courses','assets','expenses','travel','documents','exit','reports','support','settings','users','audit','subscription','software-update'];
  const platform=['trials','companies','plans','leads','invoices','payments','system','settings','users','audit','reports','support'];
  const allowed=[...shared,...(scope==='PLATFORM'?platform:scope==='TENANT'?tenant:[...tenant,...platform])];
  if(!allowed.includes(page))return fallback;
  for(const key of ['token','proxy','next','access_token'])url.searchParams.delete(key);
  return url.pathname+url.search;
 }catch{return fallback}
}
export function workspaceSignInPath(scope:PortalScope,path:string){
 const target=workspaceReturnPath(path,scope),login=scope==='PLATFORM'?'/admin-login':'/login';
 return login+'?'+new URLSearchParams({next:target}).toString();
}
export function selectedUrlTab(query:string,key:string,allowed:readonly string[],fallback:string){
 const requested=new URLSearchParams(query).get(key)??'';
 return allowed.includes(requested)?requested:fallback;
}
export function urlTabHref(path:string,query:string,key:string,value:string){
 const params=new URLSearchParams(query);params.set(key,value);
 return path+'?'+params.toString();
}
