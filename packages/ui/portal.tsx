'use client';
import React,{useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useQueryClient} from '@tanstack/react-query';
import {io} from 'socket.io-client';
import {LayoutDashboard,Users,Building2,CalendarDays,Clock3,Monitor,Activity,CalendarClock,Wallet,Briefcase,Target,GraduationCap,Package,Receipt,Plane,Files,DoorOpen,BarChart3,Sparkles,Headphones,Settings,ShieldCheck,ScrollText,Search,Bell,ChevronDown,PanelLeft,LogOut,ArrowUpRight,Layers,TrendingUp,CreditCard,Server,LockKeyhole,ArrowRight,Command,X,PhoneCall,Bot,Send,RefreshCw,AlertTriangle,CheckCircle2,UserCircle} from 'lucide-react';
import {adminNavigation,navigation,modules,Row,readable} from './config';
import {api,Providers,useApp,useData,Avatar,Modal,Session,Empty,Loading,Failure,Badge,currencyValue,displayDate,getLocalSessionToken,getLocalSessionSnapshot,clearLocalSessionState,isLocalBrowser} from './core';
import {ModulePage,Organization,Recruitment,LeavePage} from './modules';
import {TrialsPage} from './trials';
import {Dashboard} from './dashboard';
import {AttendancePage,PayrollPage,CalendarPage,WorkforcePage} from './workflows';
import {CompanySettings,UsersPage,SecurityPage,DocumentsPage,ReportsPage,AuditPage,SystemPage,NotificationsPage,PlatformProfilePage,MyProfilePage,PlatformSettingsPage} from './settings';
import {SupportPage} from './support';
const TCW_PRODUCT_LOGO='/tcw-logo.png';
function PlatformLogo({alt='TCW HR Software',className}:{alt?:string;className?:string}){
 const[src,setSrc]=useState(TCW_PRODUCT_LOGO);
 useEffect(()=>{let active=true;fetch('/api/branding',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(v=>{if(active&&v?.logo)setSrc(String(v.logo))}).catch(()=>{});return()=>{active=false}},[]);
 return <img src={src} alt={alt} className={className} decoding="async" draggable={false} onError={()=>{if(src!==TCW_PRODUCT_LOGO)setSrc(TCW_PRODUCT_LOGO)}}/>;
}
const icons:Record<string,any>={dashboard:LayoutDashboard,employees:Users,organization:Building2,calendar:CalendarDays,attendance:Clock3,devices:Monitor,workforce:Activity,leave:CalendarClock,payroll:Wallet,recruitment:Briefcase,goals:Target,courses:GraduationCap,assets:Package,expenses:Receipt,travel:Plane,documents:Files,exit:DoorOpen,reports:BarChart3,support:Headphones,settings:Settings,users:ShieldCheck,audit:ScrollText,security:LockKeyhole,companies:Building2,trials:PhoneCall,plans:Layers,leads:TrendingUp,invoices:Receipt,payments:CreditCard,system:Server,profile:UserCircle};
export function Portal({session,page}:{session:Session;page:string}){return <Providers session={session}><Shell page={page}/></Providers>}
export function ProtectedPortal({scope,page}:{scope:'TENANT'|'PLATFORM'|'ANY';page:string}){
 const router=useRouter();
 const[session,setSession]=useState<Session|null>(null),[error,setError]=useState(''),[checking,setChecking]=useState(true),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;let slowTimer:ReturnType<typeof setTimeout>|undefined;
  const activeKey=`tcw_active_window_${scope.toLowerCase()}`,rememberKey=`tcw_remember_${scope.toLowerCase()}`;
  let windowActive=false,remembered=false;
  try{windowActive=window.sessionStorage.getItem(activeKey)==='1';remembered=!!window.localStorage.getItem(rememberKey)}catch{}
  if(!windowActive&&!remembered&&!isLocalBrowser()){clearLocalSessionState();setSession(null);setChecking(false);router.replace(scope==='PLATFORM'?'/admin-login':'/login');return()=>{active=false};}
  const cached=getLocalSessionSnapshot(scope);
  const localToken=getLocalSessionToken();
  if(cached){setSession(cached);setChecking(false)}
  else if(isLocalBrowser()&&!localToken){setChecking(false);router.replace(scope==='PLATFORM'?'/admin-login':'/login');return()=>{active=false};}
  setError('');
  if(!cached){setChecking(true);const local=isLocalBrowser();slowTimer=setTimeout(()=>{if(active){setChecking(false);setError(local?'The local test server did not answer. Keep npm run demo running on the PC, then try again.':'The secure server is taking longer than expected. Please try again.')}},local?7000:18000)}
  (async()=>{try{
    let r:Session;
    try{r=await api('auth/me')}
    catch(e:any){
      if(isLocalBrowser()&&(cached||localToken)&&[401,403,502,503,504].includes(Number(e?.status??0))){await new Promise(resolve=>setTimeout(resolve,500));r=await api('auth/me')}
      else throw e;
    }
    if(!active)return;
    if(scope!=='ANY'&&r.user?.scope!==scope){clearLocalSessionState();setSession(null);setChecking(false);router.replace(scope==='PLATFORM'?'/admin-login':'/login');return;}
    try{window.localStorage.setItem('tcw_portal_scope',String(r.user?.scope??''));window.sessionStorage.setItem(`tcw_active_window_${String(r.user?.scope??scope).toLowerCase()}`,'1')}catch{}
    setSession(r);setError('');setChecking(false);
   }catch(e:any){
    if(!active)return;
    const status=Number(e?.status??0);
    if(cached&&![401,403].includes(status)){setChecking(false);return;}
    if(status===401){clearLocalSessionState();setSession(null);setError('');setChecking(false);router.replace(scope==='PLATFORM'?'/admin-login':'/login');return;}if(status===403){setSession(null);setError('Your access could not be verified. Please sign in again.');setChecking(false);return;}
    if(!cached){setError(e?.message??'Your session could not be verified.');setChecking(false)}
   }})();
  return()=>{active=false;if(slowTimer)clearTimeout(slowTimer)}
 },[scope,attempt,router]);
 if(session)return <Portal session={session} page={page}/>;
 if(!checking&&!error)return null;
 return <div className="auth-session-loader"><div className="auth-session-loader-card"><span className="auth-session-logo"><PlatformLogo/></span>{checking&&!error&&<span className="auth-spinner"/>}<strong>{error?'Unable to open workspace':'Opening your workspace'}</strong><small>{error||'Checking your secure session…'}</small>{error&&<div className="auth-session-actions"><button className="btn secondary" onClick={()=>{setError('');setChecking(true);setAttempt(v=>v+1)}}>Try again</button><button className="btn primary" onClick={()=>{clearLocalSessionState();router.replace(scope==='PLATFORM'?'/admin-login':'/login')}}>Sign in again</button></div>}</div></div>;
}
function FirstPasswordChange(){
 const{session}=useApp();const[currentPassword,setCurrent]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(e:React.FormEvent){e.preventDefault();if(password!==confirm){setError('New passwords do not match.');return;}setBusy(true);setError('');try{await api('auth/change-password','POST',{currentPassword,password},session.csrf);clearLocalSessionState();window.location.assign(session.user.scope==='PLATFORM'?'/admin-login':'/login')}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 async function signOut(){setBusy(true);try{await api('auth/logout','POST',{},session.csrf)}catch{}finally{clearLocalSessionState();window.location.assign(session.user.scope==='PLATFORM'?'/admin-login':'/login')}}
 return <div className="mandatory-overlay"><div className="mandatory-card"><div className="auth-text-brand"><strong>TCW HR Software</strong><small>SECURE ACCOUNT SETUP</small></div><span className="login-eyebrow">SECURE FIRST LOGIN</span><h2>Set your own password</h2><p>Your temporary password worked. Before using HR data, create a private password for this account.</p><form className="login-form" onSubmit={save}><label>Temporary password<input type="password" required value={currentPassword} onChange={e=>setCurrent(e.target.value)}/></label><label>New password<input type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Confirm new password<input type="password" required minLength={8} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>{error&&<p className="form-error">{error}</p>}<button className="btn primary login-submit" disabled={busy}>{busy?'Saving…':'Set password & continue'}<ArrowRight size={18}/></button><button type="button" className="btn secondary login-submit" disabled={busy} onClick={signOut}>Sign out & use another account</button></form></div></div>;
}
function SubscriptionLock(){
 const q=useData('subscription');const{currency,mutate,notify}=useApp();const[selected,setSelected]=useState('STARTER'),[busy,setBusy]=useState(false),[purchase,setPurchase]=useState<Row|null>(null);
 useEffect(()=>{if(q.data?.company?.plan)setSelected(q.data.company.plan)},[q.data?.company?.plan]);
 if(q.isLoading)return <Loading/>;if(q.error)return <Failure error={q.error}/>;
 const data=q.data??{},company=data.company??{},invoices=data.invoices??[],plans:Row[]=data.plans??[];
 const outstanding=invoices.reduce((n:number,r:Row)=>n+Math.max(0,(r.total??0)-(r.paidAmount??0)),0);
 const choose=async()=>{setBusy(true);try{const r=await mutate('subscription','POST',{plan:selected});setPurchase(r);if(r.checkoutUrl)window.location.assign(r.checkoutUrl);else notify('Payment request created. Complete the shown invoice/payment step to activate your subscription.')}catch(e:any){notify(e?.message??'Could not start payment.',true)}finally{setBusy(false)}};
 return <div className="subscription-lock upgrade-lock">
  <div className="lock-hero"><PlatformLogo/><span className="login-eyebrow">CHOOSE YOUR PLAN</span><h1>{company.status==='EXPIRED'?'Your free trial has ended':'Subscription payment required'}</h1><p>Select a plan and continue with payment to unlock your HR workspace.</p></div>
  <div className="upgrade-plan-grid">{plans.map((p:Row)=><button key={p.id} type="button" className={'upgrade-plan-card '+(selected===p.name?'selected':'')} onClick={()=>setSelected(p.name)}><span className="upgrade-plan-check">{selected===p.name?'✓':''}</span><small>{readable(String(p.name).toLowerCase())}</small><strong>{currencyValue(p.monthlyPrice,currency)}<em>/month</em></strong><span>{p.employeeLimit} employees · {p.deviceLimit} device(s)</span><ul>{(p.features??[]).slice(0,6).map((f:string)=><li key={f}>{f}</li>)}</ul></button>)}</div>
  <div className="upgrade-payment-card">
   <div><small>Selected plan</small><h2>{readable(selected.toLowerCase())}</h2><p>Payment is handled from this workspace. After verified payment, access is restored.</p></div>
   <button className="btn primary upgrade-pay-button" disabled={busy||!plans.length} onClick={choose}>{busy?'Preparing payment…':data.gatewayConfigured?'Continue to payment':'Create payment request'}<ArrowRight size={17}/></button>
  </div>
  {purchase?.invoice&&<div className="panel upgrade-invoice-result"><div><small>PAYMENT REQUEST READY</small><h3>{purchase.invoice.number}</h3><p>Amount due: <strong>{currencyValue(purchase.invoice.total,currency)}</strong></p></div><Badge value={purchase.invoice.status}/></div>}
  {invoices.length>0&&<div className="panel payment-panel"><div className="panel-heading"><div><h2>Billing history</h2><p>Recent subscription invoices for this company.</p></div></div><div className="table-scroll"><table><thead><tr><th>Invoice</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th></tr></thead><tbody>{invoices.slice(0,8).map((r:Row)=><tr key={r.id}><td>{r.number}</td><td>{currencyValue(r.total,currency)}</td><td>{currencyValue(r.paidAmount,currency)}</td><td>{displayDate(r.dueDate)}</td><td><Badge value={r.status}/></td></tr>)}</tbody></table></div></div>}
 </div>
}
function Shell({page}:{page:string}){
 const{session,can,notify}=useApp();const router=useRouter();const queryClient=useQueryClient();
 const[mobile,setMobile]=useState(false),[search,setSearch]=useState(false),[query,setQuery]=useState(''),[updateAvailable,setUpdateAvailable]=useState(false);
 const versionRef=useRef<string|null>(null);
 const allNavigation=session.user.scope==='PLATFORM'?adminNavigation:navigation;
 const nav=allNavigation.map(g=>({...g,items:g.items.filter(([, ,p])=>can(p)&&!(session.user.role==='EMPLOYEE'&&p==='support'))})).filter(g=>g.items.length);
 const flat=nav.flatMap(g=>g.items);const current=flat.find(([key])=>key===page);const navRef=useRef<HTMLElement>(null);
 const employees=useData('employees?q='+encodeURIComponent(query)+'&pageSize=6',search&&query.length>1&&session.user.scope==='TENANT'&&can('employees'));
 const notices=useData('notifications',session.user.scope==='TENANT');
 const lastNoticeRef=useRef<string|null>(null);
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();setSearch(v=>!v)}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[]);
 useEffect(()=>{if(session.user.scope!=='TENANT')return;const timer=window.setInterval(()=>notices.refetch().catch(()=>{}),30000);return()=>window.clearInterval(timer)},[session.user.scope,notices.refetch]);
 useEffect(()=>{if(session.user.scope!=='TENANT')return;const rows:Row[]=notices.data?.items??[];const latest=rows[0];if(!latest)return;const storageKey='tcw_last_status_notification';let previous=lastNoticeRef.current;try{previous=previous??window.localStorage.getItem(storageKey)}catch{}if(!previous){lastNoticeRef.current=latest.id;try{window.localStorage.setItem(storageKey,latest.id)}catch{}return;}if(previous!==latest.id){lastNoticeRef.current=latest.id;try{window.localStorage.setItem(storageKey,latest.id)}catch{};(window as any).__tcwSystemNotify?.(String(latest.title??'TCW HR Software'),String(latest.message??''),'/notifications','tcw-hr-'+latest.id)}},[notices.data,session.user.scope]);

 useEffect(()=>{const onExpired=()=>{queryClient.clear();router.replace(session.user.scope==='PLATFORM'?'/admin-login':'/login')};window.addEventListener('tcw-session-expired',onExpired);return()=>window.removeEventListener('tcw-session-expired',onExpired)},[queryClient,router,session.user.scope]);
 useEffect(()=>{if(page==='ai')router.replace('/dashboard')},[page,router]);
 useEffect(()=>{let active=true;const storageKey='tcw_last_deployment_version';const check=async()=>{try{const r=await fetch('/api/version?ts='+Date.now(),{cache:'no-store',credentials:'include',headers:{'Cache-Control':'no-cache'}});if(!r.ok)return;const data=await r.json();const next=String(data.version??'');if(!next)return;let previous=versionRef.current;try{previous=previous??window.localStorage.getItem(storageKey)}catch{}if(previous&&previous!==next&&active){setUpdateAvailable(true);(window as any).__tcwSystemNotify?.('TCW HR Software update available','A new software version is ready. Tap to update.','/dashboard','tcw-software-update')}versionRef.current=next;try{window.localStorage.setItem(storageKey,next)}catch{}}catch{}};check();const id=setInterval(check,60000);const onFocus=()=>check();const onVisible=()=>{if(document.visibilityState==='visible')check()};const onPageShow=()=>check();const onOnline=()=>check();const onSw=()=>setUpdateAvailable(true);window.addEventListener('focus',onFocus);window.addEventListener('pageshow',onPageShow);window.addEventListener('online',onOnline);document.addEventListener('visibilitychange',onVisible);window.addEventListener('tcw-update-available',onSw);return()=>{active=false;clearInterval(id);window.removeEventListener('focus',onFocus);window.removeEventListener('pageshow',onPageShow);window.removeEventListener('online',onOnline);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('tcw-update-available',onSw)}},[]);
 async function applySoftwareUpdate(){try{const reg=await navigator.serviceWorker?.getRegistration?.();await reg?.update?.();const cacheApi=(window as any).caches;if(cacheApi?.keys){for(const key of await cacheApi.keys())if(String(key).toLowerCase().includes('tcw'))await cacheApi.delete(key)}}catch{}const url=new URL(window.location.href);url.searchParams.set('tcw_update',String(Date.now()));window.location.replace(url.toString())}
 async function checkSoftwareUpdate(){try{
   const reg=await navigator.serviceWorker?.getRegistration?.();await reg?.update?.();
   const r=await fetch('/api/version?manual='+Date.now(),{cache:'no-store',credentials:'include',headers:{'Cache-Control':'no-cache'}});
   if(!r.ok)throw new Error('Unable to check for updates.');
   const data=await r.json(),next=String(data.version??'');if(!next)throw new Error('Version information is unavailable.');
   let previous=versionRef.current;try{previous=previous??window.localStorage.getItem('tcw_last_deployment_version')}catch{}
   if(previous&&previous!==next){setUpdateAvailable(true);notify('Software update available. Tap Update app to install it.');}
   else notify('TCW HR Software is up to date.');
   versionRef.current=next;try{window.localStorage.setItem('tcw_last_deployment_version',next)}catch{}
 }catch(e:any){notify(e?.message??'Unable to check for updates.',true)}}

 useEffect(()=>{if(session.user.scope==='PLATFORM'||process.env.NEXT_PUBLIC_REALTIME_ENABLED==='false')return;const localSession=getLocalSessionToken();const socket=io({path:'/socket.io',withCredentials:true,transports:['websocket','polling'],auth:localSession?{localSessionToken:localSession}:{}});socket.on('changed',()=>queryClient.invalidateQueries());return()=>{socket.disconnect()}},[queryClient,session.user.scope]);
 useEffect(()=>setMobile(false),[page]);
 useEffect(()=>{if(!mobile)return;const previous=document.body.style.overflow;const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setMobile(false)};document.body.style.overflow='hidden';window.addEventListener('keydown',onKey);return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',onKey)}},[mobile]);
 useEffect(()=>{const el=navRef.current;if(!el)return;const key=`tcw-sidebar-scroll:${session.user.scope}`;const saved=sessionStorage.getItem(key);if(saved!==null)el.scrollTop=Number(saved)||0;else requestAnimationFrame(()=>el.querySelector('[aria-current="page"]')?.scrollIntoView({block:'nearest'}));const save=()=>sessionStorage.setItem(key,String(el.scrollTop));el.addEventListener('scroll',save,{passive:true});return()=>el.removeEventListener('scroll',save)},[page,session.user.scope]);
 async function logout(){try{await api('auth/logout','POST',{},session.csrf)}finally{try{window.sessionStorage.removeItem(`tcw_active_window_${session.user.scope.toLowerCase()}`)}catch{}queryClient.clear();router.replace(session.user.scope==='PLATFORM'?'/admin-login':'/login')}}
 let content:React.ReactNode;
 if(current&&!can(current[2]))content=<Empty title="Access restricted"/>;
 else if(page==='dashboard')content=<Dashboard/>;
 else if(page==='trials')content=<TrialsPage/>;
 else if(page==='organization')content=<Organization/>;
 else if(page==='recruitment')content=<Recruitment/>;
 else if(page==='leave')content=<LeavePage/>;
 else if(page==='attendance')content=<AttendancePage/>;
 else if(page==='payroll')content=<PayrollPage/>;
 else if(page==='calendar')content=<CalendarPage/>;
 else if(page==='workforce')content=<WorkforcePage/>;
 else if(page==='settings')content=session.user.scope==='PLATFORM'?<PlatformSettingsPage/>:<CompanySettings/>;
 else if(page==='users')content=<UsersPage/>;
 else if(page==='security')content=<SecurityPage/>;
 else if(page==='documents')content=<DocumentsPage/>;
 else if(page==='reports')content=<ReportsPage/>;
 else if(page==='audit')content=<AuditPage/>;
 else if(page==='profile')content=session.user.scope==='PLATFORM'?<PlatformProfilePage/>:<MyProfilePage/>;
 else if(page==='system')content=<SystemPage/>;
 else if(page==='notifications')content=<NotificationsPage/>;
 else if(page==='support')content=<SupportPage/>;
 else if(modules[page])content=<ModulePage key={page} name={page}/>;
 else content=<Empty title="Page not found" description="Choose a workspace from the sidebar."/>;
 const isAllowed=page==='notifications'?session.user.scope==='TENANT':!!current;
 const billingLocked=session.user.scope==='TENANT'&&session.company&&!['ACTIVE','TRIAL'].includes(session.company.status);
 const unreadNotices=notices.data?.unread ?? 0;
 const searchEmployees=employees.data?.items ?? [];
 if(session.user.mustChangePassword)return <FirstPasswordChange/>;
 if(billingLocked)return <SubscriptionLock/>;
 return <div className={'app-shell '+(session.user.scope==='PLATFORM'?'platform-shell':'tenant-shell')} style={{'--primary':session.company?.profile?.primaryColor??'#3474ef'} as React.CSSProperties}>
 {mobile&&<button className="mobile-scrim" aria-label="Close navigation" onClick={()=>setMobile(false)}/>}
 <aside className={'sidebar '+(mobile?'open':'')}>
 <Link className="brand" href="/dashboard" onClick={()=>setMobile(false)}><span className="brand-mark brand-logo tcw-default-logo"><PlatformLogo/></span><span><strong>TCW HR <span>Software</span></strong><small>{session.user.scope==='PLATFORM'?'SUPER ADMIN':'HR MANAGEMENT'}</small></span></Link>
  <nav ref={navRef} aria-label="Main navigation">{nav.map(g=><div className="nav-group" key={g.group}><span className="nav-group-label">{g.group}</span>{g.items.map(([key,label])=>{const Icon=icons[key]??LayoutDashboard;return <Link href={'/'+key} key={key} className={'nav-item '+(page===key?'selected':'')} aria-current={page===key?'page':undefined} onClick={()=>setMobile(false)}><Icon size={19} strokeWidth={1.8}/><span>{label}</span></Link>})}</div>)}</nav>
 <div className="sidebar-bottom"><div className="account"><Link href="/profile" className="sidebar-profile-link" onClick={()=>setMobile(false)}><Avatar name={session.user.name} src={session.user.avatar}/><span><strong>{session.user.name}</strong><small>{session.user.roleName}</small></span></Link><button className="icon-button sidebar-signout" aria-label="Sign out" onClick={()=>logout().catch(()=>{})}><LogOut size={17}/></button></div></div>
 </aside>
 <div className="main-shell"><header className="topbar"><div className="header-left"><button className="icon-button mobile-toggle" aria-label={mobile?'Close navigation':'Open navigation'} aria-expanded={mobile} onClick={()=>setMobile(v=>!v)}><PanelLeft size={21}/></button><span className="breadcrumb">Workspace <span>/</span><strong>{current?.[1]??'Notifications'}</strong></span></div><div className="header-right"><button className="command-button" onClick={()=>setSearch(true)}><Search size={17}/><span>Search anything</span><kbd>⌘ K</kbd></button>{session.user.scope==='TENANT'&&<Link className="notification-button icon-button" href="/notifications" aria-label="Notifications"><Bell size={20}/></Link>}<span className="header-divider"/><Link href="/security" className="header-avatar" aria-label="My account security"><Avatar name={session.user.name} src={session.user.avatar}/></Link></div></header>{session.user.scope==='TENANT'&&session.company?.status==='TRIAL'&&session.company?.expiresAt&&<div className="trial-topline"><strong>Free trial active</strong><span>{Math.max(0,Math.ceil((new Date(session.company.expiresAt).getTime()-Date.now())/86400000))} day(s) remaining · ends {new Date(session.company.expiresAt).toLocaleDateString('en-IN')}</span></div>}<main className="workspace-main"><div key={page} className="page-stage">{isAllowed?content:<Empty title="Access restricted" description="Your role does not have access to this workspace."/>}</div><footer className="app-footer"><span>© TCW HR Software</span><span>{session.user.scope==='PLATFORM'?'Platform administration':'HR & workforce management'}</span></footer></main></div>
 <nav className="mobile-bottom-nav" aria-label="Mobile shortcuts">{(session.user.scope==='PLATFORM'?['dashboard','trials','companies','invoices']:['dashboard','employees','attendance','leave']).map(key=>{const item=flat.find(([k])=>k===key);if(!item)return null;const Icon=icons[key]??LayoutDashboard;return <Link key={key} href={'/'+key} className={page===key?'active':''} onClick={()=>setMobile(false)}><Icon size={20}/><span>{item[1]}</span></Link>})}<button type="button" className={mobile?'active':''} aria-expanded={mobile} aria-label={mobile?'Close menu':'Open menu'} onClick={()=>setMobile(v=>!v)}><PanelLeft size={20}/><span>{mobile?'Close':'More'}</span></button></nav>
 <TCWAgent/>
 {search&&<Modal title="Search your workspace" onClose={()=>setSearch(false)}><div className="command-search"><Search size={21}/><input autoFocus aria-label="Search pages and employees" placeholder="Search pages or employees…" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="command-results"><span className="nav-group-label">Pages</span>{flat.filter(([,title])=>title.toLowerCase().includes(query.toLowerCase())).map(([key,label])=>{const Icon=icons[key];return <button key={key} onClick={()=>{router.push('/'+key);setSearch(false)}}><Icon size={18}/><span>{label}</span><ArrowUpRight size={16}/></button>})}{searchEmployees.length>0&&<><span className="nav-group-label">People</span>{searchEmployees.map((e:Row)=><button key={e.id} onClick={()=>{router.push('/employees?search='+encodeURIComponent(e.employeeCode));setSearch(false)}}><Avatar name={e.firstName+' '+e.lastName} src={e.photo}/><span>{e.firstName} {e.lastName}<small>{e.email}</small></span><ArrowUpRight size={16}/></button>)}</>}</div></Modal>}
 </div>;
}
function TCWAgent(){
 const{session,notify}=useApp();const enabled=session.user.scope==='TENANT';const status=useData('agent/status',enabled);
 const[open,setOpen]=useState(false),[question,setQuestion]=useState(''),[messages,setMessages]=useState<Row[]>([]),[busy,setBusy]=useState(false),[localIssue,setLocalIssue]=useState('');
 const previousIssues=useRef<number|null>(null),errorHits=useRef<Record<string,{count:number;at:number}>>({});
 useEffect(()=>{if(!enabled)return;const count=Number(status.data?.issues?.length??0);if(previousIssues.current!==null&&count>previousIssues.current)notify('TCW Agent found '+count+' item(s) that need attention.',true);previousIssues.current=count},[enabled,status.data?.issues?.length,notify]);
 useEffect(()=>{if(!enabled)return;const onError=(event:any)=>{const path=String(event?.detail?.path??'request'),now=Date.now(),prev=errorHits.current[path],count=prev&&now-prev.at<60000?prev.count+1:1;errorHits.current[path]={count,at:now};if(count<2)return;const msg=String(event?.detail?.message??'A software request failed.').slice(0,180);setLocalIssue(msg);notify('TCW Agent detected a repeated software problem. Open the agent for details.',true)};window.addEventListener('tcw-app-error',onError);return()=>window.removeEventListener('tcw-app-error',onError)},[enabled,notify]);
 async function ask(text:string){if(!text.trim()||busy)return;const prompt=text.trim(),history=messages.filter(m=>m.role==='user'||m.role==='assistant').slice(-8).map(m=>({role:m.role,text:String(m.text??'')}));setQuestion('');setBusy(true);setMessages(m=>[...m,{role:'user',text:prompt}]);try{const r=await api('agent','POST',{question:prompt,history},session.csrf);setMessages(m=>[...m,{role:'assistant',text:r.answer,model:r.model}]);await status.refetch()}catch(e:any){setMessages(m=>[...m,{role:'error',text:e.message}])}finally{setBusy(false)}}
 if(!enabled)return null;
 const issues:Row[]=status.data?.issues??[];const issueCount=issues.length+(localIssue?1:0);
 return <div className={'tcw-agent '+(open?'open':'')}>
   {open&&<section className="tcw-agent-panel" aria-label="TCW AI Agent">
    <header><div><span className="tcw-agent-orb"><Bot size={19}/></span><span><strong>TCW AI Agent</strong><small>Help + software monitor</small></span></div><button className="icon-button" aria-label="Close agent" onClick={()=>setOpen(false)}><X size={17}/></button></header>
    <div className="tcw-agent-health"><span className={issueCount?'warn':'ok'}>{issueCount?<AlertTriangle size={14}/>:<CheckCircle2 size={14}/>} {issueCount?issueCount+' attention item(s)':'Software looks healthy'}</span><button onClick={()=>status.refetch()} aria-label="Refresh agent monitor"><RefreshCw size={14}/></button></div>
    {(localIssue||issues.length>0)&&<div className="tcw-agent-issues">{localIssue&&<div><strong>Recent app issue</strong><p>{localIssue}</p></div>}{issues.slice(0,4).map((r:Row,i:number)=><div key={r.code??i}><strong>{r.title}</strong><p>{r.message}</p></div>)}</div>}
    {!messages.length&&<div className="tcw-agent-welcome"><p>Ask about login, email, attendance, devices, payroll, updates, or any problem you see in TCW HR.</p><div><button onClick={()=>ask('Check software status')}>Check software</button><button onClick={()=>ask('Help with payroll')}>Payroll help</button><button onClick={()=>ask('Why is email not working?')}>Email help</button></div></div>}
    {!!messages.length&&<div className="tcw-agent-messages">{messages.slice(-8).map((m:Row,i:number)=><div className={m.role} key={i}><strong>{m.role==='user'?'You':m.role==='error'?'Agent error':'TCW Agent'}</strong><p>{m.text}</p></div>)}{busy&&<small>Checking…</small>}</div>}
    <form onSubmit={e=>{e.preventDefault();ask(question)}}><input value={question} onChange={e=>setQuestion(e.target.value)} maxLength={700} placeholder="Ask TCW Agent…" aria-label="Ask TCW Agent"/><button className="btn primary" disabled={busy||!question.trim()}><Send size={16}/></button></form>
   </section>}
   <button className="tcw-agent-fab" aria-label="Open TCW AI Agent" onClick={()=>setOpen(v=>!v)}><span className="tcw-agent-face"><Bot size={22}/></span>{issueCount>0&&<b>{issueCount>9?'9+':issueCount}</b>}</button>
 </div>;
}

export function Login({scope,mode='login',resetToken='',prefillCompanyCode='',prefillUser=''}:{scope:'TENANT'|'PLATFORM';mode?:string;resetToken?:string;prefillCompanyCode?:string;prefillUser?:string}){
 const router=useRouter();
 const[companyCode,setCompanyCode]=useState(prefillCompanyCode),[email,setEmail]=useState(prefillUser),[password,setPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState(''),[remember,setRemember]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[resetReady,setResetReady]=useState(mode!=='reset-password'),[resetChecking,setResetChecking]=useState(mode==='reset-password');
 const[companyName,setCompanyName]=useState(''),[ownerName,setOwnerName]=useState(''),[phone,setPhone]=useState(''),[plan,setPlan]=useState('STARTER'),[terms,setTerms]=useState(false),[contactConsent,setContactConsent]=useState(false),[created,setCreated]=useState<Row|null>(null);
 const signup=scope==='TENANT'&&mode==='signup';
 useEffect(()=>{if(mode!=='login')return;let active=true;const key=`tcw_remember_${scope.toLowerCase()}`,activeKey=`tcw_active_window_${scope.toLowerCase()}`;let shouldResume=false;try{const saved=JSON.parse(window.localStorage.getItem(key)??'null');const windowActive=window.sessionStorage.getItem(activeKey)==='1';shouldResume=!!saved||windowActive;if(saved){setRemember(true);if(scope==='TENANT'&&saved.companyCode)setCompanyCode(String(saved.companyCode));if(saved.email)setEmail(String(saved.email));}}catch{}
 if(!shouldResume)return()=>{active=false};
 (async()=>{try{const current=await api('auth/me');if(active&&current?.user?.scope===scope){try{window.localStorage.setItem('tcw_portal_scope',scope);window.sessionStorage.setItem(activeKey,'1')}catch{}router.replace('/dashboard')}}catch{}})();return()=>{active=false}},[mode,scope,router]);
 useEffect(()=>{if(mode!=='reset-password')return;let active=true;(async()=>{try{if(!resetToken)throw new Error('This reset link is invalid or expired.');await api('auth/reset-password/claim','POST',{token:resetToken});if(active){setResetReady(true);setResetChecking(false)}}catch(e:any){if(active){setResetReady(false);setResetChecking(false);setError(e?.message??'This reset link is invalid, expired, or already used.')}}})();return()=>{active=false}},[mode,resetToken]);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{
  if(signup){if(!terms)throw new Error('Accept the Terms and Privacy notice to start a trial.');if(!contactConsent)throw new Error('Please allow us to contact you about your trial.');const r=await api('auth/signup','POST',{companyName,ownerName,ownerEmail:email.trim(),phone:phone.trim(),plan,acceptTerms:true,contactConsent:true});setCreated(r);setMessage(`Your company workspace is ready. Your Company Code, User ID and temporary password have been sent to ${email.trim()}.`)}
  else if(mode==='reset-password'){if(password!==confirmPassword)throw new Error('Passwords do not match.');const r=await api('auth/reset-password','POST',{password});setMessage(r.message);setResetReady(false);setPassword('');setConfirmPassword('')}
  else if(mode==='forgot-password'){const r=await api('auth/forgot-password','POST',{email,...(scope==='TENANT'?{companyCode}: {})});setMessage(r.message)}
  else{const r=await api('auth/login','POST',{email:email.trim(),password,remember,...(scope==='TENANT'?{companyCode:companyCode.trim().toUpperCase()}: {})});if(r.user.scope!==scope){await api('auth/logout','POST',{},r.csrf);throw new Error('Use the correct portal for this account.')}try{window.localStorage.setItem('tcw_portal_scope',scope);window.sessionStorage.setItem(`tcw_active_window_${scope.toLowerCase()}`,'1');const key=`tcw_remember_${scope.toLowerCase()}`;if(remember)window.localStorage.setItem(key,JSON.stringify({companyCode:scope==='TENANT'?companyCode.trim().toUpperCase():'',email:email.trim()}));else window.localStorage.removeItem(key)}catch{}router.replace('/dashboard')}
 }catch(e:any){setError(e?.message??'Sign in failed. Please try again.')}finally{setBusy(false)}}
 const title=signup?'Create your company workspace':mode==='forgot-password'?'Forgot password':mode==='reset-password'?'Create password':'Sign in';
 const subtitle=signup?'Create your trial workspace. Your Company Code, User ID and temporary password will be sent securely to your email.':mode==='login'?(scope==='PLATFORM'?'Use your TCW platform administrator credentials.':'Enter your company code, login ID or email, and password.'):mode==='forgot-password'?'Reset access to your TCW HR Software account.':mode==='reset-password'?'Create and confirm your new password. This one-time link expires after 10 minutes.':'Secure access to your TCW HR Software account.';
 const portalName=scope==='PLATFORM'?'Super Admin':'HR & Company';
 const loginPath=scope==='PLATFORM'?'/admin-login':'/login';
 const forgotPath=scope==='PLATFORM'?'/admin-forgot-password':'/forgot-password';
 async function installApp(){const prompt=(window as any).__tcwInstallPrompt;if(prompt){await prompt.prompt();const choice=await prompt.userChoice;if(choice?.outcome==='accepted')(window as any).__tcwInstallPrompt=undefined;return;}const ios=/iPad|iPhone|iPod/.test(navigator.userAgent);window.alert(ios?'On iPhone/iPad: open this page in Safari, tap Share, then Add to Home Screen. Apple requires this manual step.':'Open the browser menu and choose Install TCW HR Software / Install app. Chrome or Edge works best on computers.');}
 return <div className={'auth-pro-shell '+(signup?'auth-pro-signup ':'')+(scope==='PLATFORM'?'auth-pro-platform':'auth-pro-tenant')}>
   <aside className="auth-pro-side">
    <Link className="auth-pro-brand" href={loginPath}><span className="auth-pro-logo"><PlatformLogo/></span><span><strong>{scope==='PLATFORM'?'Tech Cyber Warrior':'TCW HR Software'}</strong><small>{scope==='PLATFORM'?'TCW HR SOFTWARE · SUPER ADMIN':portalName.toUpperCase()+' PORTAL'}</small></span></Link>
    <div className="auth-pro-copy"><span className="auth-pro-kicker">{scope==='PLATFORM'?'PLATFORM CONTROL CENTER':'SMART HR OPERATIONS'}</span><h1>{scope==='PLATFORM'?'Run your HR platform with complete control.':'Your complete people workspace.'}</h1><p>{scope==='PLATFORM'?'Manage companies, subscriptions, billing, support and platform operations from one secure administration workspace.':'Employees, attendance, leave, payroll and workforce insights in one connected system.'}</p><div className="auth-pro-points">{scope==='PLATFORM'?<><span><Building2 size={17}/><b>Company oversight</b></span><span><CreditCard size={17}/><b>Billing & subscriptions</b></span><span><ShieldCheck size={17}/><b>Support & security</b></span></>:<><span><ShieldCheck size={17}/><b>Role-based access</b></span><span><Clock3 size={17}/><b>Attendance automation</b></span><span><BarChart3 size={17}/><b>Workforce insights</b></span></>}</div></div>
    <div className="auth-pro-side-foot"><span>{scope==='PLATFORM'?'Secure platform administration':'Secure workspace'}</span><span>{scope==='PLATFORM'?'Tech Cyber Warrior':'TCW HR Software'}</span></div>
   </aside>
   <main className="auth-pro-main"><div className="auth-pro-card">
    <div className="auth-pro-mobile-brand"><span className="auth-pro-logo"><PlatformLogo alt="TCW HR Software"/></span><span><strong>TCW HR Software</strong><small>{scope==='PLATFORM'?'SUPER ADMIN':'HR & COMPANY PORTAL'}</small></span></div>
    <div className="auth-pro-head"><span className="auth-pro-badge">{scope==='PLATFORM'?'SUPER ADMIN':signup?'START TRIAL':'COMPANY LOGIN'}</span><span className="auth-pro-secure"><LockKeyhole size={14}/> Secure access</span></div>
    <h2>{title}</h2><p className="auth-pro-subtitle">{subtitle}</p>
    {resetChecking?<section className="reset-success-panel"><span className="auth-spinner"/><h3>Checking reset link</h3><p>Please wait while we securely open this one-time password link.</p></section>:mode==='reset-password'&&!resetReady&&!message?<section className="reset-success-panel"><span className="reset-success-icon"><LockKeyhole size={24}/></span><h3>Link unavailable</h3><p>{error||'This reset link is invalid, expired, or has already been used.'}</p><Link className="btn primary" href={forgotPath}>Request a new link <ArrowRight size={16}/></Link></section>:message?(created?<section className="trial-success-panel"><div className="trial-success-head"><span className="trial-success-icon"><ShieldCheck size={22}/></span><div><small>TRIAL WORKSPACE READY</small><h3>Check your email for login details</h3><p>Your Company Code, User ID and temporary password were sent to <strong>{email}</strong>.</p></div></div><div className="signup-email-delivery"><ShieldCheck size={18}/><div><strong>Credentials sent securely by email</strong><small>Check Inbox and Spam/Junk. Use the temporary password once, then create your private password.</small></div></div><div className="signup-created-actions"><button className="btn primary" type="button" onClick={()=>router.push('/login')}>Continue to sign in <ArrowRight size={16}/></button></div></section>:mode==='forgot-password'?<section className="reset-success-panel"><span className="reset-success-icon"><ShieldCheck size={24}/></span><h3>Check your email</h3><p>If the details match an account, a reset link has been sent to your email.</p><Link className="btn primary" href={loginPath}>Back to sign in <ArrowRight size={16}/></Link></section>:mode==='reset-password'?<section className="reset-success-panel"><span className="reset-success-icon"><ShieldCheck size={24}/></span><h3>Password created</h3><p>Your reset link has been consumed and cannot be used again. Sign in with your new password.</p><Link className="btn primary" href={loginPath}>Go to sign in <ArrowRight size={16}/></Link></section>:<div className="notice success-notice">{message}{!signup&&<Link href={loginPath}>Back to sign in</Link>}</div>):
    <form onSubmit={submit} className="auth-pro-form">{signup?<><div className="signup-all-grid"><label>Company name<input required value={companyName} onChange={e=>setCompanyName(e.target.value)} autoComplete="organization" placeholder="Your company name"/></label><label>HR admin name<input required value={ownerName} onChange={e=>setOwnerName(e.target.value)} autoComplete="name" placeholder="HR admin full name"/></label><label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" placeholder="name@example.com"/></label><label>Mobile number<input required minLength={7} maxLength={30} value={phone} onChange={e=>setPhone(e.target.value)} autoComplete="tel" inputMode="tel" placeholder="+91 9876543210"/></label></div><label>Trial plan<select value={plan} onChange={e=>setPlan(e.target.value)}><option value="STARTER">Starter</option><option value="GROWTH">Growth</option><option value="ENTERPRISE">Enterprise</option></select></label><div className="notice compact-notice signup-short-note"><ShieldCheck size={17}/><p>Your first HR Admin account, TCW User ID and temporary password will be created securely for sign-in.</p></div><label className="terms-check"><input type="checkbox" checked={terms} onChange={e=>setTerms(e.target.checked)}/><span>I agree to the Terms and Privacy notice.</span></label><label className="terms-check"><input type="checkbox" checked={contactConsent} onChange={e=>setContactConsent(e.target.checked)}/><span>I agree that TCW HR Software may contact me by phone or email about this trial.</span></label>{error&&<div className="auth-pro-error" role="alert">{error}</div>}<button className="btn primary auth-pro-submit" disabled={busy}>{busy?'Creating workspace…':'Create trial workspace'}<ArrowRight size={17}/></button></>:<>{scope==='TENANT'&&mode!=='reset-password'&&<label>Company Code<input name="companyCode" required value={companyCode} onChange={e=>setCompanyCode(e.target.value.toUpperCase())} autoComplete="organization" placeholder="Example: TCW-123456"/></label>}{mode!=='reset-password'&&<label>{mode==='forgot-password'?'Email address':'User ID or email'}<input type={mode==='forgot-password'?'email':'text'} name="username" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder={mode==='forgot-password'?'name@example.com':scope==='PLATFORM'?'TCW-ADMIN':'TCW2104'}/></label>}{mode!=='forgot-password'&&<label>{mode==='reset-password'?'Create password':'Password'}<input type="password" name="password" required minLength={mode==='reset-password'?8:undefined} maxLength={128} autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password"/></label>}{mode==='reset-password'&&<label>Confirm password<input type="password" name="confirmPassword" required minLength={8} maxLength={128} autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Re-enter your new password"/></label>}{mode==='login'&&<div className="auth-pro-options"><label><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>Remember me</label><Link href={forgotPath}>Forgot password?</Link></div>}{error&&<div className="auth-pro-error" role="alert">{error}</div>}<button className="btn primary auth-pro-submit" disabled={busy}>{busy?'Signing in securely…':mode==='login'?'Sign in':mode==='forgot-password'?'Send reset link':'Create password'}<ArrowRight size={17}/></button>{mode!=='login'&&<Link className="back-login" href={loginPath}>Back to sign in</Link>}</>}</form>}
    {scope==='TENANT'&&mode==='login'&&<div className="auth-pro-signup-link"><span>New company?</span><Link href="/signup">Start a 3-day trial <ArrowRight size={14}/></Link></div>}
    <nav className="auth-pro-legal" aria-label="Account and legal links"><div className="auth-pro-legal-row"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link>{scope==='TENANT'&&<button type="button" className="auth-pro-install-link" onClick={installApp}>Install app</button>}<a className="auth-pro-company-link" href="https://techcyberwarrior.in" target="_blank" rel="noreferrer">Tech Cyber Warrior</a></div></nav>
   </div></main>
 </div>;
}
