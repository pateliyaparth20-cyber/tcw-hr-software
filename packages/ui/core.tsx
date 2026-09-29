'use client';
import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
import {useQuery,QueryClient,QueryClientProvider,useQueryClient} from '@tanstack/react-query';
import {X,LoaderCircle,AlertCircle,Check,Inbox,ChevronRight} from 'lucide-react';
import {Field,Row,readable} from './config';
export type Session={user:Row;csrf:string;company?:Row};
const LOCAL_SESSION_KEY='tcw_local_session';
const LOCAL_SESSION_BACKUP_KEY='tcw_local_session_backup';
const LOCAL_SESSION_SNAPSHOT_KEY='tcw_local_session_snapshot';
const LEGACY_LOCAL_SESSION_KEYS=['tcw_local_session_v127','tcw_local_session_v126','tcw_local_session_v125'];
function readStorage(kind:'session'|'local',key:string){
  if(typeof window==='undefined')return null;
  try{return (kind==='session'?window.sessionStorage:window.localStorage).getItem(key)}catch{return null}
}
function writeStorage(kind:'session'|'local',key:string,value:string){
  if(typeof window==='undefined')return;
  try{(kind==='session'?window.sessionStorage:window.localStorage).setItem(key,value)}catch{}
}
function removeStorage(kind:'session'|'local',key:string){
  if(typeof window==='undefined')return;
  try{(kind==='session'?window.sessionStorage:window.localStorage).removeItem(key)}catch{}
}
export function getLocalSessionToken(){
  if(typeof window==='undefined')return null;
  const current=readStorage('session',LOCAL_SESSION_KEY);
  if(current)return current;
  // Mobile browsers/WebViews can discard sessionStorage during a navigation or tab
  // restoration. Keep a local-development backup of the exact server-issued token.
  const backup=readStorage('local',LOCAL_SESSION_BACKUP_KEY);
  if(backup){writeStorage('session',LOCAL_SESSION_KEY,backup);return backup;}
  for(const key of LEGACY_LOCAL_SESSION_KEYS){
    const legacy=readStorage('session',key);
    if(legacy){writeStorage('session',LOCAL_SESSION_KEY,legacy);removeStorage('session',key);return legacy;}
  }
  return null;
}
export function saveLocalSessionSnapshot(session:any){
  if(typeof window==='undefined'||!session?.user?.scope||!session?.csrf)return;
  const safe={user:session.user,csrf:session.csrf,...(session.company?{company:session.company}:{})};
  const encoded=JSON.stringify(safe);
  writeStorage('session',LOCAL_SESSION_SNAPSHOT_KEY,encoded);
  // Keep the persistent snapshot only on local/LAN development. Production sessions
  // stay in sessionStorage and are still verified against the server on navigation.
  if(isLocalBrowser())writeStorage('local',LOCAL_SESSION_SNAPSHOT_KEY,encoded);
}
export function getLocalSessionSnapshot(scope?:'TENANT'|'PLATFORM'|'ANY'){
  if(typeof window==='undefined')return null;
  const raw=readStorage('session',LOCAL_SESSION_SNAPSHOT_KEY)??(isLocalBrowser()?readStorage('local',LOCAL_SESSION_SNAPSHOT_KEY):null);
  if(!raw)return null;
  try{
    const value=JSON.parse(raw) as Session;
    if(!value?.user?.scope||!value?.csrf)throw new Error('invalid');
    if(scope&&scope!=='ANY'&&value.user.scope!==scope)return null;
    writeStorage('session',LOCAL_SESSION_SNAPSHOT_KEY,raw);
    return value;
  }catch{removeStorage('session',LOCAL_SESSION_SNAPSHOT_KEY);removeStorage('local',LOCAL_SESSION_SNAPSHOT_KEY);return null;}
}
export function clearLocalSessionState(){
  if(typeof window==='undefined')return;
  removeStorage('session',LOCAL_SESSION_KEY);
  removeStorage('local',LOCAL_SESSION_BACKUP_KEY);
  removeStorage('session',LOCAL_SESSION_SNAPSHOT_KEY);
  removeStorage('local',LOCAL_SESSION_SNAPSHOT_KEY);
  for(const key of LEGACY_LOCAL_SESSION_KEYS)removeStorage('session',key);
}
export function isLocalBrowser(){
  if(typeof window==='undefined')return false;
  const host=window.location.hostname;
  const port=window.location.port;
  if(host==='localhost'||host==='127.0.0.1'||host==='::1')return true;
  if(/^10\./.test(host)||/^192\.168\./.test(host))return true;
  const match=host.match(/^172\.(\d+)\./);
  if(!!match&&Number(match[1])>=16&&Number(match[1])<=31)return true;
  // Windows host names and mDNS names are also common when opening the local QA
  // server from a phone. Restrict this convenience to plain HTTP on TCW ports so
  // a normal HTTPS production domain is never treated as local development.
  if(window.location.protocol==='http:'&&['3000','3001'].includes(port)&&(host.endsWith('.local')||!host.includes('.')))return true;
  return false;
}
function requestTimeout(path:string,method:string,data:any){
  const local=isLocalBrowser();
  if(path==='auth/me')return local?6000:15000;
  if(path==='auth/login'||path==='auth/signup'||path==='auth/forgot-password'||path==='auth/reset-password')return local?20000:30000;
  if(data instanceof FormData)return 65000;
  return method==='GET'?30000:45000;
}
function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms));}
async function requestOnce(path:string,method:string,data:any,csrf:string|undefined,localSession:string|null){
  const form=data instanceof FormData;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),requestTimeout(path,method,data));
  try{
    return await fetch('/api/'+path,{method,credentials:'include',cache:'no-store',signal:controller.signal,headers:{...(!form&&data!==undefined?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(localSession?{'X-TCW-Local-Session':localSession}:{})},...(data!==undefined?{body:form?data:JSON.stringify(data)}:{})});
  }finally{clearTimeout(timeout)}
}
export async function api(path:string,method='GET',data?:any,csrf?:string){
  const localSession=getLocalSessionToken();
  const authCritical=['auth/login','auth/signup','auth/me'].includes(path);
  const attempts=isLocalBrowser()&&authCritical?2:1;
  let response:Response|undefined;
  let lastError:any;
  for(let attempt=0;attempt<attempts;attempt++){
    try{
      response=await requestOnce(path,method,data,csrf,localSession);
      if(response.ok||![502,503,504].includes(response.status)||attempt===attempts-1)break;
    }catch(e:any){
      lastError=e;
      if(attempt===attempts-1)break;
    }
    await sleep(350);
  }
  if(!response){
    const message=lastError?.name==='AbortError'?(path.startsWith('auth/')?'The server is taking too long to respond. Please try again.':'The server did not respond in time. Please try again.'):'Unable to reach TCW HR Software. Please check your connection and try again.';
    if(typeof window!=='undefined'&&!path.startsWith('agent'))window.dispatchEvent(new CustomEvent('tcw-app-error',{detail:{path,status:0,message}}));
    throw new Error(message);
  }
  if(!response.ok){
    let message='The request failed.';
    try{message=(await response.json()).message??message;}catch{}
    if(path==='auth/logout')clearLocalSessionState();
    if(response.status===401&&!path.startsWith('auth/')){
      clearLocalSessionState();
      if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('tcw-session-expired',{detail:{message}}));
    }
    if(typeof window!=='undefined'&&response.status>=500&&!path.startsWith('agent'))window.dispatchEvent(new CustomEvent('tcw-app-error',{detail:{path,status:response.status,message}}));
    const error=Object.assign(new Error(message),{status:response.status});throw error;
  }
  if(response.status===204)return {};
  const result=await response.json();
  if(typeof window!=='undefined'){
    if((path==='auth/login'||path==='auth/signup')&&result?.localSessionToken){writeStorage('session',LOCAL_SESSION_KEY,result.localSessionToken);writeStorage('local',LOCAL_SESSION_BACKUP_KEY,result.localSessionToken);}
    if(['auth/login','auth/signup','auth/me'].includes(path)&&result?.user?.scope&&result?.csrf)saveLocalSessionSnapshot(result);
    if((path==='auth/login'||path==='auth/signup')&&result?.user?.scope)writeStorage('local','tcw_portal_scope',String(result.user.scope));
    if(path==='auth/logout')clearLocalSessionState();
  }
  return result;
}
const Context=createContext<any>(null);
export function useApp(){return useContext(Context) as {session:Session;can:(r:string,a?:string)=>boolean;notify:(v:string,error?:boolean)=>void;mutate:(path:string,method:string,data?:any)=>Promise<any>;currency:string};}
export function Providers({children,session}:{children:React.ReactNode;session:Session}){
  const[client]=useState(()=>new QueryClient({defaultOptions:{queries:{retry:false,staleTime:25000,refetchOnWindowFocus:false,refetchOnReconnect:true,...(process.env.NEXT_PUBLIC_REALTIME_ENABLED==='false'?{refetchInterval:30000}: {})}}}));
  const[toast,setToast]=useState<{text:string;error:boolean}|null>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const notify=(text:string,error=false)=>{setToast({text,error});if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setToast(null),6000);};
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current)},[]);
  const mutate=async(path:string,method:string,data?:any)=>{try{const r=await api(path,method,data,session.csrf);await client.invalidateQueries();notify('Changes saved.');return r;}catch(e:any){notify(e.message,true);throw e;}};
  return <QueryClientProvider client={client}><Context.Provider value={{session,can:(r:string,a='VIEW')=>r==='self'||session.user.permissions.includes(`${r}:${a}`),notify,mutate,currency:session.company?.currency??'INR'}}>{children}{toast&&<div role={toast.error?'alert':'status'} className={'toast '+(toast.error?'error':'')}>{toast.error?<AlertCircle size={19}/>:<Check size={19}/>}<span>{toast.text}</span><button aria-label="Dismiss notification" onClick={()=>setToast(null)}><X size={16}/></button></div>}</Context.Provider></QueryClientProvider>;
}
export function useData(path:string,enabled=true){return useQuery<Row>({queryKey:[path],queryFn:()=>api(path),enabled});}
export function Loading(){return <div className="loading" role="status"><LoaderCircle className="spin" size={24}/><span>Loading your workspace…</span></div>}
export function Failure({error,retry}:{error:Error;retry?:()=>void}){return <div className="empty error-state"><AlertCircle/><h3>Unable to load this view</h3><p>{error.message}</p>{retry&&<button className="btn secondary" onClick={retry}>Try again</button>}</div>}
export function Empty({title='Nothing here yet',description='New records will appear here.',action}:{title?:string;description?:string;action?:React.ReactNode}){return <div className="empty"><span className="empty-icon"><Inbox size={26}/></span><h3>{title}</h3><p>{description}</p>{action}</div>}
export function Badge({value}:{value:any}){const str=String(value??'—');return <span className={'badge '+(['ACTIVE','PRESENT','APPROVED','PAID','COMPLETED','HIRED','WON','AVAILABLE','WORKING','CONNECTED','ONLINE','LOCKED','RESOLVED','INFO','CLEAR','OPEN','PAID_LEAVE','CONTACTED','INTERESTED','CONVERTED','HOLIDAY','WEEK_OFF','LOW'].includes(str)?'green':['PENDING','TRIAL','REVIEW','PROBATION','MEETING','PART_PAID','IN_PROGRESS','AWAITING_CONNECTION','DEGRADED','WARN','NORMAL','HIGH','FOLLOW_UP','NO_ANSWER'].includes(str)?'amber':['REJECTED','ABSENT','SUSPENDED','EXPIRED','ARCHIVED','OVERDUE','MISSING_PUNCH','LOST','OFFLINE','ERROR','URGENT','CALL_DUE','NOT_INTERESTED'].includes(str)?'red':'blue')}>{readable(str.toLowerCase())}</span>}
export const displayDate=(v:any)=>v?new Date(v).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'—';
export const currencyValue=(v:number,currency='INR')=>new Intl.NumberFormat('en-IN',{style:'currency',currency,maximumFractionDigits:2}).format((v??0)/100);
export function Avatar({name,large=false,src}:{name:string;large?:boolean;src?:string|null}){const tones=['#e4edff','#dff4ee','#f4e9ff','#fff0da'];return <span className={'avatar '+(large?'large':'')+(src?' has-photo':'')} style={{background:tones[(name?.charCodeAt(0)??0)%4]}}>{src?<img src={src} alt={name+' profile photo'}/>:name?.split(' ').slice(0,2).map(s=>s[0]).join('').toUpperCase()}</span>}
export function Modal({title,children,onClose,wide=false}:{title:string;children:React.ReactNode;onClose:()=>void;wide?:boolean}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const d=ref.current;d?.showModal();return()=>d?.close()},[]);
  return <dialog ref={ref} className={'modal '+(wide?'wide':'')} onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===ref.current)onClose()}}><div className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>{children}</dialog>;
}
function Choice({field,value,onChange}:{field:Field;value:any;onChange:(v:any)=>void}){
 const data=useData(field.source??'',!!field.source);const rows=data.data?.items??[];
 return <select id={'field-'+field.key} required={field.required} value={value??''} onChange={e=>onChange(e.target.value)} disabled={!!field.source&&data.isLoading}>
  <option value="">{data.isLoading?'Loading…':data.isError?'Unable to load options':'Select '+field.label.toLowerCase()}</option>
  {field.source?rows.map((r:Row)=><option key={r.id} value={r.id}>{r.firstName?`${r.firstName} ${r.lastName} · ${r.employeeCode}`:r.name??r.title??r.number}</option>):field.options?.map(v=><option key={v} value={v}>{readable(v.toLowerCase())}</option>)}
 </select>;
}
const getPath=(obj:any,path:string)=>path.split('.').reduce((v,k)=>v?.[k],obj);
const setPath=(obj:any,path:string,value:any)=>{const keys=path.split('.');let cur=obj;for(let i=0;i<keys.length-1;i++){cur[keys[i]]=cur[keys[i]]&&typeof cur[keys[i]]==='object'?cur[keys[i]]:{};cur=cur[keys[i]];}cur[keys[keys.length-1]]=value;};
export function RecordForm({fields,initial,onSave,onCancel,submit='Save changes'}:{fields:Field[];initial?:Row;onSave:(data:Row)=>Promise<any>;onCancel:()=>void;submit?:string}){
 const[values,setValues]=useState<Row>(()=>Object.fromEntries(fields.map(f=>{let v=getPath(initial,f.key)??f.default??(f.type==='checkbox'?false:'');if(v&&f.type==='date')v=String(v).slice(0,10);if(v&&f.type==='datetime-local')v=new Date(new Date(v).getTime()-new Date(v).getTimezoneOffset()*60000).toISOString().slice(0,16);if(f.type==='money'&&v!=='')v=Number(v)/100;if(f.type==='time'&&v!=='')v=`${String(Math.floor(Number(v)/60)).padStart(2,'0')}:${String(Number(v)%60).padStart(2,'0')}`;if(f.type==='lines'&&Array.isArray(v))v=v.join('\n');return [f.key,v];})));
 const[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(e:React.FormEvent){e.preventDefault();setError('');setBusy(true);try{
  const body:Row={};for(const f of fields){let v=values[f.key];if(f.type==='checkbox')v=!!v;else if(v===''||v===undefined){if(f.required)throw new Error(`${f.label} is required.`);if(f.key.startsWith('personal.'))v='';else if(f.type==='select'||['date','datetime-local','money'].includes(f.type??'')){v=null;}else v='';}else if(f.type==='money')v=Math.round(Number(v)*100);else if(f.type==='number')v=Number(v);else if(f.type==='datetime-local')v=new Date(v).toISOString();else if(f.type==='time'){const[h,m]=v.split(':').map(Number);v=h*60+m;}else if(f.type==='lines')v=v.split('\n').map((s:string)=>s.trim()).filter(Boolean);setPath(body,f.key,v);}
  await onSave(body);
 }catch(e:any){setError(e.message);}finally{setBusy(false)}}
 return <form onSubmit={save} className="record-form"><div className="form-grid">{fields.map(f=><label key={f.key} className={'field '+(['textarea','lines'].includes(f.type??'')?'span-two':'')} htmlFor={'field-'+f.key}><span>{f.label}{f.required&&<i> *</i>}</span>{f.type==='select'?<Choice field={f} value={values[f.key]} onChange={v=>setValues({...values,[f.key]:v})}/>:f.type==='textarea'||f.type==='lines'?<textarea id={'field-'+f.key} required={f.required} value={values[f.key]} rows={4} onChange={e=>setValues({...values,[f.key]:e.target.value})}/>:f.type==='checkbox'?<input id={'field-'+f.key} type="checkbox" checked={!!values[f.key]} onChange={e=>setValues({...values,[f.key]:e.target.checked})}/>:f.type==='image'?<div className="image-field">{values[f.key]?<img src={values[f.key]} alt={f.label+' preview'}/>:<span>No photo</span>}<div><label className="btn secondary small">Choose photo<input id={'field-'+f.key} className="sr-only" type="file" accept="image/png,image/jpeg" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>5*1024*1024){setError('Choose a PNG or JPEG photo up to 5 MB.');return;}const reader=new FileReader();reader.onload=()=>setValues({...values,[f.key]:String(reader.result)});reader.readAsDataURL(file)}}/></label>{values[f.key]&&<button type="button" className="btn secondary small" onClick={()=>setValues({...values,[f.key]:''})}>Remove photo</button>}</div></div>:<input id={'field-'+f.key} type={f.type==='money'?'number':f.type??'text'} required={f.required} min={f.min} max={f.max} minLength={f.type==='password'?8:undefined} step={['money','number'].includes(f.type??'')?'any':undefined} value={values[f.key]} onChange={e=>setValues({...values,[f.key]:e.target.value})} autoComplete={f.type==='password'?'new-password':'off'}/>} {f.hint&&<small>{f.hint}</small>}</label>)}</div>{error&&<p className="form-error" role="alert">{error}</p>}<div className="form-footer"><button type="button" className="btn secondary" onClick={onCancel}>Cancel</button><button className="btn primary" disabled={busy}>{busy?<><LoaderCircle size={17} className="spin"/>Saving…</>:submit}</button></div></form>;
}
export function Confirm({title,description,onConfirm,onClose}:{title:string;description:string;onConfirm:()=>Promise<any>;onClose:()=>void}){const[busy,setBusy]=useState(false),[error,setError]=useState('');return <Modal title={title} onClose={onClose}><div className="modal-body"><p>{description}</p>{error&&<p role="alert" className="form-error">{error}</p>}<div className="form-footer"><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn danger" disabled={busy} onClick={async()=>{setBusy(true);try{await onConfirm();onClose()}catch(e:any){setError(e.message)}finally{setBusy(false)}}}>{busy?'Working…':'Confirm'}</button></div></div></Modal>}
export function PageTitle({title,subtitle,children}:{title:string;subtitle?:string;children?:React.ReactNode}){return <div className="page-title"><div><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div><div className="title-actions">{children}</div></div>}
export function Stat({label,value,detail,icon}:{label:string;value:React.ReactNode;detail?:string;icon?:React.ReactNode}){return <div className="stat"><div className="stat-label">{label}<span>{icon}</span></div><strong>{value}</strong>{detail&&<small>{detail}</small>}</div>}
export function Table({columns,rows,cell,actions}:{columns:string[];rows:Row[];cell?:(r:Row,k:string)=>React.ReactNode;actions?:(r:Row)=>React.ReactNode}){return <div className="table-scroll"><table><thead><tr>{columns.map(k=><th key={k}>{readable(k.replace('Id',''))}</th>)}{actions&&<th className="align-right">Actions</th>}</tr></thead><tbody>{rows.map(r=><tr key={r.id}>{columns.map(k=><td key={k}>{cell?.(r,k)??String(r[k]??'—')}</td>)}{actions&&<td className="row-actions">{actions(r)}</td>}</tr>)}</tbody></table></div>}
