'use client';
import React,{useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useQueryClient} from '@tanstack/react-query';
import {io} from 'socket.io-client';
import {LayoutDashboard,Users,Building2,CalendarDays,Clock3,Monitor,Activity,CalendarClock,Wallet,Briefcase,Target,GraduationCap,Package,Receipt,Plane,Files,DoorOpen,BarChart3,Sparkles,Headphones,Settings,ShieldCheck,ScrollText,Search,Bell,ChevronDown,PanelLeft,LogOut,ArrowUpRight,Layers,TrendingUp,CreditCard,Server,LockKeyhole,ArrowRight,Command,X,Download,PhoneCall} from 'lucide-react';
import {adminNavigation,navigation,modules,Row} from './config';
import {api,Providers,useApp,useData,Avatar,Modal,Session,Empty,Loading,Badge,currencyValue,displayDate,getLocalSessionToken,getLocalSessionSnapshot,clearLocalSessionState,isLocalBrowser} from './core';
import {ModulePage,Organization,Recruitment,LeavePage} from './modules';
import {TrialsPage} from './trials';
import {Dashboard} from './dashboard';
import {AttendancePage,PayrollPage,CalendarPage,WorkforcePage} from './workflows';
import {CompanySettings,UsersPage,SecurityPage,DocumentsPage,ReportsPage,AuditPage,SystemPage,NotificationsPage,AIPage} from './settings';
import {AppsPage} from './apps';
import {SupportPage} from './support';
const icons:Record<string,any>={dashboard:LayoutDashboard,employees:Users,organization:Building2,calendar:CalendarDays,attendance:Clock3,devices:Monitor,workforce:Activity,leave:CalendarClock,payroll:Wallet,recruitment:Briefcase,goals:Target,courses:GraduationCap,assets:Package,expenses:Receipt,travel:Plane,documents:Files,exit:DoorOpen,reports:BarChart3,ai:Sparkles,support:Headphones,settings:Settings,users:ShieldCheck,audit:ScrollText,security:LockKeyhole,companies:Building2,trials:PhoneCall,plans:Layers,leads:TrendingUp,invoices:Receipt,payments:CreditCard,system:Server,apps:Download};
export function Portal({session,page}:{session:Session;page:string}){return <Providers session={session}><Shell page={page}/></Providers>}
export function ProtectedPortal({scope,page}:{scope:'TENANT'|'PLATFORM'|'ANY';page:string}){
 const router=useRouter();
 const[session,setSession]=useState<Session|null>(null),[error,setError]=useState(''),[checking,setChecking]=useState(true),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;let slowTimer:ReturnType<typeof setTimeout>|undefined;
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
    try{window.localStorage.setItem('tcw_portal_scope',String(r.user?.scope??''))}catch{}
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
 return <div className="auth-session-loader"><div className="auth-session-loader-card"><span className="auth-session-logo"><img src="/tcw-logo.png" alt="TCW HR Software"/></span>{checking&&!error&&<span className="auth-spinner"/>}<strong>{error?'Unable to open workspace':'Opening your workspace'}</strong><small>{error||'Checking your secure session…'}</small>{error&&<div className="auth-session-actions"><button className="btn secondary" onClick={()=>{setError('');setChecking(true);setAttempt(v=>v+1)}}>Try again</button><button className="btn primary" onClick={()=>{clearLocalSessionState();router.replace(scope==='PLATFORM'?'/admin-login':'/login')}}>Sign in again</button></div>}</div></div>;
}
function FirstPasswordChange(){
 const{session}=useApp();const[currentPassword,setCurrent]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(e:React.FormEvent){e.preventDefault();if(password!==confirm){setError('New passwords do not match.');return;}setBusy(true);setError('');try{await api('auth/change-password','POST',{currentPassword,password},session.csrf);window.location.assign(session.user.scope==='PLATFORM'?'/admin-login':'/login')}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 return <div className="mandatory-overlay"><div className="mandatory-card"><div className="auth-text-brand"><strong>TCW HR Software</strong><small>SECURE ACCOUNT SETUP</small></div><span className="login-eyebrow">SECURE FIRST LOGIN</span><h2>Set your own password</h2><p>Your temporary password worked. Before using HR data, create a private password for this account.</p><form className="login-form" onSubmit={save}><label>Temporary password<input type="password" required value={currentPassword} onChange={e=>setCurrent(e.target.value)}/></label><label>New password<input type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Confirm new password<input type="password" required minLength={8} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>{error&&<p className="form-error">{error}</p>}<button className="btn primary login-submit" disabled={busy}>{busy?'Saving…':'Set password & continue'}<ArrowRight size={18}/></button></form></div></div>;
}
function SubscriptionLock(){const q=useData('subscription');const{currency}=useApp();if(q.isLoading)return <Loading/>;const data=q.data??{},company=data.company??{},invoices=data.invoices??[];const outstanding=invoices.reduce((n:number,r:Row)=>n+Math.max(0,(r.total??0)-(r.paidAmount??0)),0);return <div className="subscription-lock"><div className="lock-hero"><img src="/tcw-logo.png" alt="TCW HR Software"/><span className="login-eyebrow">SUBSCRIPTION REQUIRED</span><h1>{company.status==='EXPIRED'?'Your trial has ended':'Payment is overdue'}</h1><p>HR records remain stored, but operational modules are locked until billing is confirmed.</p></div><div className="stats three"><div className="stat"><div className="stat-label">Company</div><strong>{company.name}</strong><small>{company.code}</small></div><div className="stat"><div className="stat-label">Outstanding</div><strong>{currencyValue(outstanding,currency)}</strong><small>{invoices.filter((r:Row)=>r.status==='OVERDUE').length} overdue invoice(s)</small></div><div className="stat"><div className="stat-label">Status</div><strong><Badge value={company.status}/></strong><small>{company.expiresAt?`Ended ${displayDate(company.expiresAt)}`:'Contact billing'}</small></div></div><div className="panel payment-panel"><h2>Complete payment to unlock</h2><p>{data.paymentMessage}</p>{invoices.length?<div className="table-scroll"><table><thead><tr><th>Invoice</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th></tr></thead><tbody>{invoices.slice(0,8).map((r:Row)=><tr key={r.id}><td>{r.number}</td><td>{currencyValue(r.total,currency)}</td><td>{currencyValue(r.paidAmount,currency)}</td><td>{displayDate(r.dueDate)}</td><td><Badge value={r.status}/></td></tr>)}</tbody></table></div>:<p className="subtle-note">No invoice has been issued yet. Contact TCW HR Software billing support.</p>}<p className="subtle-note">Online payment becomes active after a payment gateway is configured. Super Admin can record verified payments now; access is restored after confirmation.</p></div></div>}
function Shell({page}:{page:string}){
 const{session,can}=useApp();const router=useRouter();const queryClient=useQueryClient();
 const[mobile,setMobile]=useState(false),[search,setSearch]=useState(false),[query,setQuery]=useState('');
 const allNavigation=session.user.scope==='PLATFORM'?adminNavigation:navigation;
 const nav=allNavigation.map(g=>({...g,items:g.items.filter(([, ,p])=>can(p)&&!(session.user.role==='EMPLOYEE'&&p==='support'))})).filter(g=>g.items.length);
 const flat=nav.flatMap(g=>g.items);const current=flat.find(([key])=>key===page);const navRef=useRef<HTMLElement>(null);
 const employees=useData('employees?q='+encodeURIComponent(query)+'&pageSize=6',search&&query.length>1&&session.user.scope==='TENANT'&&can('employees'));
 const notices=useData('notifications',session.user.scope==='TENANT');
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();setSearch(v=>!v)}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[]);
 useEffect(()=>{const onExpired=()=>{queryClient.clear();router.replace(session.user.scope==='PLATFORM'?'/admin-login':'/login')};window.addEventListener('tcw-session-expired',onExpired);return()=>window.removeEventListener('tcw-session-expired',onExpired)},[queryClient,router,session.user.scope]);
 useEffect(()=>{const raw=(session as any).sessionExpiresAt;if(!raw)return;const target=new Date(raw).getTime();if(!Number.isFinite(target))return;let timer:ReturnType<typeof setTimeout>|undefined;let redirected=false;const go=()=>{if(redirected)return;redirected=true;clearLocalSessionState();queryClient.clear();router.replace(session.user.scope==='PLATFORM'?'/admin-login':'/login')};const schedule=()=>{const left=target-Date.now();if(left<=0){go();return;}timer=setTimeout(schedule,Math.min(left,3600000))};const check=()=>{if(Date.now()>=target)go()};schedule();document.addEventListener('visibilitychange',check);window.addEventListener('focus',check);return()=>{if(timer)clearTimeout(timer);document.removeEventListener('visibilitychange',check);window.removeEventListener('focus',check)}},[queryClient,router,session]);
 useEffect(()=>{if(process.env.NEXT_PUBLIC_REALTIME_ENABLED==='false')return;const localSession=getLocalSessionToken();const socket=io({path:'/socket.io',withCredentials:true,transports:['websocket','polling'],auth:localSession?{localSessionToken:localSession}:{}});socket.on('changed',()=>queryClient.invalidateQueries());return()=>{socket.disconnect()}},[queryClient]);
 useEffect(()=>setMobile(false),[page]);
 useEffect(()=>{if(!mobile)return;const previous=document.body.style.overflow;const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setMobile(false)};document.body.style.overflow='hidden';window.addEventListener('keydown',onKey);return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',onKey)}},[mobile]);
 useEffect(()=>{const el=navRef.current;if(!el)return;const key=`tcw-sidebar-scroll:${session.user.scope}`;const saved=sessionStorage.getItem(key);if(saved!==null)el.scrollTop=Number(saved)||0;else requestAnimationFrame(()=>el.querySelector('[aria-current="page"]')?.scrollIntoView({block:'nearest'}));const save=()=>sessionStorage.setItem(key,String(el.scrollTop));el.addEventListener('scroll',save,{passive:true});return()=>el.removeEventListener('scroll',save)},[page,session.user.scope]);
 async function logout(){try{await api('auth/logout','POST',{},session.csrf)}finally{queryClient.clear();router.replace(session.user.scope==='PLATFORM'?'/admin-login':'/login')}}
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
 else if(page==='settings')content=<CompanySettings/>;
 else if(page==='users')content=<UsersPage/>;
 else if(page==='security')content=<SecurityPage/>;
 else if(page==='documents')content=<DocumentsPage/>;
 else if(page==='reports')content=<ReportsPage/>;
 else if(page==='audit')content=<AuditPage/>;
 else if(page==='system')content=<SystemPage/>;
 else if(page==='notifications')content=<NotificationsPage/>;
 else if(page==='ai')content=<AIPage/>;
 else if(page==='support')content=<SupportPage/>;
 else if(page==='apps')content=<AppsPage/>;
 else if(modules[page])content=<ModulePage key={page} name={page}/>;
 else content=<Empty title="Page not found" description="Choose a workspace from the sidebar."/>;
 const isAllowed=page==='notifications'?session.user.scope==='TENANT':!!current;
 const billingLocked=session.user.scope==='TENANT'&&session.company&&!['ACTIVE','TRIAL'].includes(session.company.status);
 const unreadNotices=notices.data?.unread ?? 0;
 const searchEmployees=employees.data?.items ?? [];
 if(session.user.mustChangePassword)return <FirstPasswordChange/>;
 if(billingLocked)return <SubscriptionLock/>;
 return <div className="app-shell" style={{'--primary':session.company?.profile?.primaryColor??'#3474ef'} as React.CSSProperties}>
 {mobile&&<button className="mobile-scrim" aria-label="Close navigation" onClick={()=>setMobile(false)}/>}
 <aside className={'sidebar '+(mobile?'open':'')}>
 <Link className="brand" href="/dashboard"><span className="brand-mark brand-logo tcw-default-logo"><img src="/tcw-logo.png" alt="TCW HR Software"/></span><span><strong>TCW HR <span>Software</span></strong><small>{session.user.scope==='PLATFORM'?'SUPER ADMIN':'HR MANAGEMENT'}</small></span></Link>
 <div className="workspace-switch"><span className="workspace-icon">{session.company?.logo?<img src={session.company.logo} alt=""/>:<img src="/tcw-logo.png" alt=""/>}</span><div><strong>{session.company?.name??'TCW HR Software'}</strong><small>{session.user.scope==='PLATFORM'?'SaaS administration':'Company workspace'}</small></div></div>
 <nav ref={navRef} aria-label="Main navigation">{nav.map(g=><div className="nav-group" key={g.group}><span className="nav-group-label">{g.group}</span>{g.items.map(([key,label])=>{const Icon=icons[key]??LayoutDashboard;return <Link href={'/'+key} key={key} className={'nav-item '+(page===key?'selected':'')} aria-current={page===key?'page':undefined}><Icon size={19} strokeWidth={1.8}/><span>{label}</span>{key==='ai'&&<span className="new-label">AI</span>}</Link>})}</div>)}</nav>
 <div className="sidebar-bottom"><div className="account"><Avatar name={session.user.name}/><div><strong>{session.user.name}</strong><small>{session.user.roleName}</small></div><button className="icon-button" aria-label="Sign out" onClick={()=>logout().catch(()=>{})}><LogOut size={17}/></button></div></div>
 </aside>
 <div className="main-shell"><header className="topbar"><div className="header-left"><button className="icon-button mobile-toggle" aria-label="Open navigation" aria-expanded={mobile} onClick={()=>setMobile(true)}><PanelLeft size={21}/></button><span className="breadcrumb">Workspace <span>/</span><strong>{current?.[1]??'Notifications'}</strong></span></div><div className="header-right"><button className="command-button" onClick={()=>setSearch(true)}><Search size={17}/><span>Search anything</span><kbd>⌘ K</kbd></button>{session.user.scope==='TENANT'&&<Link className="notification-button icon-button" href="/notifications" aria-label={`Notifications${unreadNotices?` · ${unreadNotices} unread`:''}`}><Bell size={20}/>{unreadNotices>0&&<span className="notification-count">{unreadNotices>99?'99+':unreadNotices}</span>}</Link>}<span className="header-divider"/><Link href="/security" className="header-avatar" aria-label="My account security"><Avatar name={session.user.name}/></Link></div></header>{session.user.scope==='TENANT'&&session.company?.status==='TRIAL'&&session.company?.expiresAt&&<div className="trial-topline"><strong>Free trial active</strong><span>{Math.max(0,Math.ceil((new Date(session.company.expiresAt).getTime()-Date.now())/86400000))} day(s) remaining · ends {new Date(session.company.expiresAt).toLocaleDateString('en-IN')}</span></div>}<main className="workspace-main"><div key={page} className="page-stage">{isAllowed?content:<Empty title="Access restricted" description="Your role does not have access to this workspace."/>}</div><footer className="app-footer"><span>© TCW HR Software</span><span>{session.user.scope==='PLATFORM'?'Platform administration':'HR & workforce management'}</span></footer></main></div>
 <nav className="mobile-bottom-nav" aria-label="Mobile shortcuts">{(session.user.scope==='PLATFORM'?['dashboard','trials','companies','invoices']:['dashboard','employees','attendance','leave']).map(key=>{const item=flat.find(([k])=>k===key);if(!item)return null;const Icon=icons[key]??LayoutDashboard;return <Link key={key} href={'/'+key} className={page===key?'active':''}><Icon size={20}/><span>{item[1]}</span></Link>})}<button type="button" className={mobile?'active':''} aria-expanded={mobile} onClick={()=>setMobile(true)}><PanelLeft size={20}/><span>More</span></button></nav>
 {search&&<Modal title="Search your workspace" onClose={()=>setSearch(false)}><div className="command-search"><Search size={21}/><input autoFocus aria-label="Search pages and employees" placeholder="Search pages or employees…" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="command-results"><span className="nav-group-label">Pages</span>{flat.filter(([,title])=>title.toLowerCase().includes(query.toLowerCase())).map(([key,label])=>{const Icon=icons[key];return <button key={key} onClick={()=>{router.push('/'+key);setSearch(false)}}><Icon size={18}/><span>{label}</span><ArrowUpRight size={16}/></button>})}{searchEmployees.length>0&&<><span className="nav-group-label">People</span>{searchEmployees.map((e:Row)=><button key={e.id} onClick={()=>{router.push('/employees?search='+encodeURIComponent(e.employeeCode));setSearch(false)}}><Avatar name={e.firstName+' '+e.lastName}/><span>{e.firstName} {e.lastName}<small>{e.email}</small></span><ArrowUpRight size={16}/></button>)}</>}</div></Modal>}
 </div>;
}
export function Login({scope,mode='login',resetToken=''}:{scope:'TENANT'|'PLATFORM';mode?:string;resetToken?:string}){
 const router=useRouter();
 const[companyCode,setCompanyCode]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[remember,setRemember]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const[companyName,setCompanyName]=useState(''),[ownerName,setOwnerName]=useState(''),[phone,setPhone]=useState(''),[plan,setPlan]=useState('STARTER'),[terms,setTerms]=useState(false),[contactConsent,setContactConsent]=useState(false),[created,setCreated]=useState<Row|null>(null);
 const signup=scope==='TENANT'&&mode==='signup';
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{
  if(signup){if(!terms)throw new Error('Accept the Terms and Privacy notice to start a trial.');if(!contactConsent)throw new Error('Please allow us to contact you about your trial.');const r=await api('auth/signup','POST',{companyName,ownerName,ownerEmail:email.trim(),phone:phone.trim(),plan,acceptTerms:true,contactConsent:true});setCreated(r);setMessage(`Your company workspace is ready. Save the login details below. SMS and email delivery are queued automatically when the provider is configured.`)}
  else if(mode==='reset-password'){const r=await api('auth/reset-password','POST',{token:resetToken,password});setMessage(r.message)}
  else if(mode==='forgot-password'){const r=await api('auth/forgot-password','POST',{email,...(scope==='TENANT'?{companyCode}: {})});setMessage(r.message)}
  else{const r=await api('auth/login','POST',{email:email.trim(),password,remember,...(scope==='TENANT'?{companyCode:companyCode.trim().toUpperCase()}: {})});if(r.user.scope!==scope){await api('auth/logout','POST',{},r.csrf);throw new Error('Use the correct portal for this account.')}try{window.localStorage.setItem('tcw_portal_scope',scope)}catch{}router.replace('/dashboard')}
 }catch(e:any){setError(e?.message??'Sign in failed. Please try again.')}finally{setBusy(false)}}
 const title=signup?'Create your company workspace':mode==='forgot-password'?'Reset your password':mode==='reset-password'?'Choose a new password':'Sign in';
 const subtitle=signup?'Create your trial workspace. Your company code and login ID will appear on this screen immediately.':mode==='login'?(scope==='PLATFORM'?'Use your TCW platform administrator credentials.':'Enter your company code, login ID or email, and password.'):'Secure access to your TCW HR Software account.';
 const portalName=scope==='PLATFORM'?'Super Admin':'HR & Company';
 const loginPath=scope==='PLATFORM'?'/admin-login':'/login';
 const forgotPath=scope==='PLATFORM'?'/admin-forgot-password':'/forgot-password';
 return <div className={'auth-pro-shell '+(signup?'auth-pro-signup':'')}>
   <aside className="auth-pro-side">
    <Link className="auth-pro-brand" href={loginPath}><span className="auth-pro-logo"><img src="/tcw-logo.png" alt="TCW HR Software"/></span><span><strong>TCW HR Software</strong><small>{portalName.toUpperCase()} PORTAL</small></span></Link>
    <div className="auth-pro-copy"><span className="auth-pro-kicker">SMART HR OPERATIONS</span><h1>{scope==='PLATFORM'?'Your SaaS command center.':'Your complete people workspace.'}</h1><p>{scope==='PLATFORM'?'Companies, subscriptions, support and platform control in one secure workspace.':'Employees, attendance, leave, payroll and AI insights in one connected system.'}</p><div className="auth-pro-points"><span><ShieldCheck size={17}/><b>Role-based access</b></span><span><Clock3 size={17}/><b>Attendance automation</b></span><span><Sparkles size={17}/><b>AI-assisted insights</b></span></div></div>
    <div className="auth-pro-side-foot"><span>Secure workspace</span><span>TCW HR Software</span></div>
   </aside>
   <main className="auth-pro-main"><div className="auth-pro-card">
    <div className="auth-pro-mobile-brand"><span className="auth-pro-logo"><img src="/tcw-logo.png" alt=""/></span><span><strong>TCW HR Software</strong><small>{portalName.toUpperCase()} PORTAL</small></span></div>
    <div className="auth-pro-head"><span className="auth-pro-badge">{scope==='PLATFORM'?'SUPER ADMIN':signup?'START TRIAL':'COMPANY LOGIN'}</span><span className="auth-pro-secure"><LockKeyhole size={14}/> Secure access</span></div>
    <h2>{title}</h2><p className="auth-pro-subtitle">{subtitle}</p>
    {message?<div className="notice success-notice">{message}{created&&<div className="signup-created"><div><span>Company Code</span><strong>{created.companyCode}</strong></div><div><span>User ID</span><strong>{created.loginId}</strong></div><div><span>Temporary password</span><strong className="mono-secret">{created.temporaryPassword}</strong></div><div><span>Email</span><strong>{email}</strong></div><div className="signup-created-actions"><button className="btn secondary" type="button" onClick={()=>navigator.clipboard?.writeText(`Company Code: ${created.companyCode}\nUser ID: ${created.loginId}\nTemporary Password: ${created.temporaryPassword}\nEmail: ${email}`)}>Copy login details</button><button className="btn primary" type="button" onClick={()=>router.replace('/dashboard')}>Open dashboard <ArrowRight size={16}/></button></div></div>}{!signup&&<Link href={loginPath}>Back to sign in</Link>}</div>:
    <form onSubmit={submit} className="auth-pro-form">{signup?<><div className="signup-grid"><label>Company name<input required value={companyName} onChange={e=>setCompanyName(e.target.value)} autoComplete="organization" placeholder="Your company name"/></label><label>Your full name<input required value={ownerName} onChange={e=>setOwnerName(e.target.value)} autoComplete="name" placeholder="Owner / HR admin"/></label></div><div className="signup-grid"><label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" placeholder="Gmail, Yahoo or company email"/></label><label>Mobile number<input required minLength={7} maxLength={30} value={phone} onChange={e=>setPhone(e.target.value)} autoComplete="tel" inputMode="tel" placeholder="+91 9876543210"/></label></div><label>Trial plan<select value={plan} onChange={e=>setPlan(e.target.value)}><option value="STARTER">Starter</option><option value="GROWTH">Growth</option><option value="ENTERPRISE">Enterprise</option></select></label><div className="notice compact-notice"><ShieldCheck size={17}/><p>We will generate a short TCW User ID and secure 8-character temporary password. They will be shown here and queued for SMS/email. You will set your private password after first sign-in.</p></div><label className="terms-check"><input type="checkbox" checked={terms} onChange={e=>setTerms(e.target.checked)}/><span>I agree to the Terms and Privacy notice.</span></label><label className="terms-check"><input type="checkbox" checked={contactConsent} onChange={e=>setContactConsent(e.target.checked)}/><span>I agree that TCW HR Software may contact me by phone or email about this trial.</span></label></>:<>{scope==='TENANT'&&mode!=='reset-password'&&<label>Company Code<input required value={companyCode} onChange={e=>setCompanyCode(e.target.value.toUpperCase())} autoComplete="organization" placeholder="TCW-DEMO"/></label>}{mode!=='reset-password'&&<label>{mode==='forgot-password'?'Email address':'User ID or email'}<input type={mode==='forgot-password'?'email':'text'} required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder={mode==='forgot-password'?'name@example.com':scope==='PLATFORM'?'TCW-ADMIN':'TCW2104'}/></label>}{mode!=='forgot-password'&&<label>Password<input type="password" required minLength={mode==='reset-password'?8:undefined} maxLength={128} autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password"/></label>}{mode==='login'&&<div className="auth-pro-options"><label><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>Remember me</label><Link href={forgotPath}>Forgot password?</Link></div>}</>}{error&&<div className="auth-pro-error" role="alert">{error}</div>}<button className="btn primary auth-pro-submit" disabled={busy}>{busy?'Signing in securely…':signup?'Create trial workspace':mode==='login'?'Sign in':mode==='forgot-password'?'Send reset link':'Set password'}<ArrowRight size={17}/></button>{mode!=='login'&&<Link className="back-login" href={loginPath}>Back to sign in</Link>}</form>}
    {scope==='TENANT'&&mode==='login'&&<div className="auth-pro-signup-link"><span>New company?</span><Link href="/signup">Start a 3-day trial <ArrowRight size={14}/></Link></div>}
    <div className="auth-pro-legal"><Link href="/privacy">Privacy</Link><Link href="/cookies">Cookies</Link><Link href="/terms">Terms</Link><a href="https://techcyberwarrior.in" target="_blank" rel="noreferrer">Tech Cyber Warrior</a></div>
   </div></main>
 </div>;
}
