'use client';
import {ApprovalSettings} from './hr-operations';
import React,{useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useQueryClient} from '@tanstack/react-query';
import {io} from 'socket.io-client';
import {LayoutDashboard,Users,Building2,CalendarDays,Clock3,Monitor,Activity,CalendarClock,Wallet,Briefcase,Target,GraduationCap,Package,Receipt,Plane,Files,DoorOpen,BarChart3,Sparkles,Headphones,Settings,ShieldCheck,ScrollText,Search,Bell,ChevronDown,ChevronRight,PanelLeft,LogOut,ArrowUpRight,Layers,TrendingUp,CreditCard,Server,LockKeyhole,ArrowRight,Command,X,PhoneCall,Send,RefreshCw,AlertTriangle,CheckCircle2,UserCircle,History,Trash2,Plus,UserCheck,Eye,EyeOff,UserRound,FileText} from 'lucide-react';
import {adminNavigation,navigation,employeeNavigation,modules,Row,readable} from './config';
import {api,Providers,useApp,useData,Avatar,Modal,Confirm,Session,Empty,Loading,Failure,Badge,BrandLogo,TCW_PRODUCT_LOGO,notificationTarget,currencyValue,displayDate,getLocalSessionToken,getLocalSessionSnapshot,saveLocalSessionSnapshot,clearLocalSessionState,isLocalBrowser} from './core';
import {PerformanceDashboard} from './performance';
import {ModulePage,Organization,Recruitment,LeavePage} from './modules';
import {PeopleDirectory} from './people';
import {TrialsPage} from './trials';
import {Dashboard} from './dashboard';
import {AttendancePage,PayrollPage,CalendarPage,WorkforcePage} from './workflows';
import {FieldWorkPage,EmployeeFieldTracker} from './field-work';
import {DeviceManagement} from './device-management';
import {EmployeeFaceEnrollmentGate,preloadFaceEngine} from './face';
import {CompanySettings,UsersPage,SecurityPage,DocumentsPage,ReportsPage,AuditPage,SystemPage,NotificationsPage,MyProfilePage,PlatformSettingsPage,SoftwareUpdatePage} from './settings';
import {SupportPage} from './support';
import {MEGHNA_AVATAR} from './meghna-avatar';
import './auth-design.css';
const icons:Record<string,any>={'field-work':Briefcase,dashboard:LayoutDashboard,employees:Users,organization:Building2,calendar:CalendarDays,attendance:Clock3,devices:Monitor,workforce:Activity,leave:CalendarClock,payroll:Wallet,recruitment:Briefcase,goals:Target,courses:GraduationCap,assets:Package,expenses:Receipt,travel:Plane,documents:Files,exit:DoorOpen,reports:BarChart3,support:Headphones,settings:Settings,users:ShieldCheck,audit:ScrollText,security:LockKeyhole,companies:Building2,trials:PhoneCall,plans:Layers,leads:TrendingUp,invoices:Receipt,payments:CreditCard,system:Server,profile:UserCircle,subscription:CreditCard,'software-update':RefreshCw};

const HR_PORTAL_HOST='hr.techcyberwarrior.in';
const EMPLOYEE_PORTAL_HOST='employee.techcyberwarrior.in';
function currentPortalHost(){if(typeof window==='undefined')return '';try{return window.location.hostname.toLowerCase()}catch{return ''}}
function isHrPortalHost(){return currentPortalHost()===HR_PORTAL_HOST}
function isEmployeePortalHost(){return currentPortalHost()===EMPLOYEE_PORTAL_HOST}
function portalLoginUrl(portal:'HR'|'EMPLOYEE',companyCode='',user=''){
 const url=new URL('/login',portal==='EMPLOYEE'?'https://'+EMPLOYEE_PORTAL_HOST:'https://'+HR_PORTAL_HOST);
 if(companyCode.trim())url.searchParams.set('companyCode',companyCode.trim().toUpperCase());
 if(user.trim())url.searchParams.set('user',user.trim());
 return url.toString();
}
function isEmployeeNativeApp(){if(typeof window==='undefined')return false;try{const bridge=(window as any).TCWNative;return bridge?.isEmployeeApp?.()===true||bridge?.getAppMode?.()==='EMPLOYEE'||isEmployeePortalHost()}catch{return false}}
export function Portal({session,page}:{session:Session;page:string}){return <Providers session={session}><Shell page={page}/></Providers>}
export function ProtectedPortal({scope,page}:{scope:'TENANT'|'PLATFORM'|'ANY';page:string}){
 const router=useRouter();
 const[session,setSession]=useState<Session|null>(null),[error,setError]=useState(''),[checking,setChecking]=useState(true),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;let slowTimer:ReturnType<typeof setTimeout>|undefined;
  const activeKey=`tcw_active_window_${scope.toLowerCase()}`,rememberKey=`tcw_remember_${scope.toLowerCase()}`;
  let windowActive=false,remembered=false;
  try{windowActive=window.sessionStorage.getItem(activeKey)==='1';remembered=!!window.localStorage.getItem(rememberKey)}catch{}
  if(!windowActive&&!remembered&&!isLocalBrowser()&&new URLSearchParams(window.location.search).get('proxy')!=='1'){clearLocalSessionState();setSession(null);setChecking(false);router.replace(scope==='PLATFORM'?'/admin-login':'/login');return()=>{active=false};}
  const cached=getLocalSessionSnapshot(scope);
  const localToken=getLocalSessionToken();
  if(cached&&scope==='TENANT'&&isHrPortalHost()&&cached.user?.role==='EMPLOYEE'){
    const companyCode=String(cached.company?.code??''),user=String(cached.user?.loginId??cached.user?.email??'');
    clearLocalSessionState();setSession(null);setChecking(false);
    void api('auth/logout','POST',{},cached.csrf).catch(()=>{}).finally(()=>{window.location.replace(portalLoginUrl('EMPLOYEE',companyCode,user))});
    return()=>{active=false};
  }
  if(cached&&scope==='TENANT'&&isEmployeePortalHost()&&cached.user?.role!=='EMPLOYEE'){
    const companyCode=String(cached.company?.code??''),user=String(cached.user?.loginId??cached.user?.email??'');
    clearLocalSessionState();setSession(null);setChecking(false);
    void api('auth/logout','POST',{},cached.csrf).catch(()=>{}).finally(()=>{window.location.replace(portalLoginUrl('HR',companyCode,user))});
    return()=>{active=false};
  }
  if(cached&&isEmployeeNativeApp()&&cached.user?.role!=='EMPLOYEE'){clearLocalSessionState();setSession(null);setChecking(false);setError('TCW Employee APK is only for Employee accounts. Use the TCW HR Software app for HR/Admin access.');return()=>{active=false};}
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
    if(scope==='TENANT'&&isHrPortalHost()&&r.user?.role==='EMPLOYEE'){
      const companyCode=String(r.company?.code??''),user=String(r.user?.loginId??r.user?.email??'');
      try{await api('auth/logout','POST',{},r.csrf)}catch{}
      clearLocalSessionState();setSession(null);setChecking(false);window.location.replace(portalLoginUrl('EMPLOYEE',companyCode,user));return;
    }
    if(scope==='TENANT'&&isEmployeePortalHost()&&r.user?.role!=='EMPLOYEE'){
      const companyCode=String(r.company?.code??''),user=String(r.user?.loginId??r.user?.email??'');
      try{await api('auth/logout','POST',{},r.csrf)}catch{}
      clearLocalSessionState();setSession(null);setChecking(false);window.location.replace(portalLoginUrl('HR',companyCode,user));return;
    }
    if(isEmployeeNativeApp()&&r.user?.role!=='EMPLOYEE'){try{await api('auth/logout','POST',{},r.csrf)}catch{}clearLocalSessionState();setSession(null);setError('TCW Employee APK is only for Employee accounts. Use the TCW HR Software app for HR/Admin access.');setChecking(false);return;}
    try{window.localStorage.setItem('tcw_portal_scope',String(r.user?.scope??''));window.sessionStorage.setItem(`tcw_active_window_${String(r.user?.scope??scope).toLowerCase()}`,'1')}catch{}
    if(r.proxy&&new URLSearchParams(window.location.search).has('proxy'))window.history.replaceState(null,'',window.location.pathname);
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
 return <div className="auth-session-loader"><div className="auth-session-loader-card"><span className="auth-session-logo"><BrandLogo/></span>{checking&&!error&&<span className="auth-spinner"/>}<strong>{error?'Unable to open workspace':'Opening your workspace'}</strong><small>{error||'Checking your secure session…'}</small>{error&&<div className="auth-session-actions"><button className="btn secondary" onClick={()=>{setError('');setChecking(true);setAttempt(v=>v+1)}}>Try again</button><button className="btn primary" onClick={()=>{clearLocalSessionState();router.replace(scope==='PLATFORM'?'/admin-login':'/login')}}>Sign in again</button></div>}</div></div>;
}
function FirstPasswordChange(){
 const{session}=useApp();const branding=useData('company/branding',session.user.scope==='TENANT');
 useEffect(()=>{if(session.user.role==='EMPLOYEE')preloadFaceEngine()},[session.user.role]);const brand=branding.data??session.company??{};const brandLogo=String(brand.logo??TCW_PRODUCT_LOGO);const brandName=String(brand.name??(session.user.scope==='TENANT'?'TCW HR Software':'Tech Cyber Warrior'));const brandColor=String(brand.primaryColor??brand.profile?.primaryColor??'#0369a1');const[currentPassword,setCurrent]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(e:React.FormEvent){e.preventDefault();if(password!==confirm){setError('New passwords do not match.');return;}setBusy(true);setError('');try{await api('auth/change-password','POST',{currentPassword,password},session.csrf);if(session.user.role==='EMPLOYEE'){window.location.reload();return;}clearLocalSessionState();window.location.assign(session.user.scope==='PLATFORM'?'/admin-login':'/login')}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 async function signOut(){setBusy(true);try{await api('auth/logout','POST',{},session.csrf)}catch{}finally{clearLocalSessionState();window.location.assign(session.user.scope==='PLATFORM'?'/admin-login':'/login')}}
 return <div className="mandatory-overlay" style={{'--primary':brandColor} as React.CSSProperties}><div className="mandatory-card"><div className="auth-text-brand first-login-brand"><img src={brandLogo} alt={brandName+' logo'} onError={e=>{e.currentTarget.src=TCW_PRODUCT_LOGO}}/><span><strong>{brandName}</strong><small>SECURE ACCOUNT SETUP</small></span></div><span className="login-eyebrow">SECURE FIRST LOGIN</span><h2>Set your own password</h2><p>Your temporary password worked. Before using HR data, create a private password for this account.</p><form className="login-form" onSubmit={save}><label>Temporary password<input type="password" required value={currentPassword} onChange={e=>setCurrent(e.target.value)}/></label><label>New password<input type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Confirm new password<input type="password" required minLength={8} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>{error&&<p className="form-error">{error}</p>}<button className="btn primary login-submit" disabled={busy}>{busy?'Saving…':session.user.role==='EMPLOYEE'?'Set password & Add Face':'Set password & continue'}<ArrowRight size={18}/></button><button type="button" className="btn secondary login-submit" disabled={busy} onClick={signOut}>Sign out & use another account</button></form></div></div>;
}
function SubscriptionLock({manage=false}:{manage?:boolean}){
 const q=useData('subscription');const{currency,mutate,notify}=useApp();const[selected,setSelected]=useState('STARTER'),[busy,setBusy]=useState(false),[purchase,setPurchase]=useState<Row|null>(null),[utr,setUtr]=useState(''),[proofBusy,setProofBusy]=useState(false),[proofSent,setProofSent]=useState(false);
 useEffect(()=>{if(q.data?.company?.plan)setSelected(q.data.company.plan)},[q.data?.company?.plan]);
 if(q.isLoading)return <Loading/>;if(q.error)return <Failure error={q.error}/>;
 const data=q.data??{},company=data.company??{},plans:Row[]=data.plans??[],invoices:Row[]=data.invoices??[],usage=data.usage??{};
 const currentPlan=plans.find((p:Row)=>p.name===company.plan),employeeLimit=company.employeeLimit??currentPlan?.employeeLimit,deviceLimit=currentPlan?.deviceLimit;
 const employeesUsed=Number(usage.employeesUsed??0),devicesUsed=Number(usage.devicesUsed??0),latestInvoice=invoices[0],pendingProof=company.profile?.pendingPaymentProof;
 const usagePercent=(used:number,limit:any)=>Number(limit)>0?Math.min(100,Math.round((used/Number(limit))*100)):0;
 const expiryLabel=company.expiresAt?displayDate(company.expiresAt):'Not set';
 const startPayment=async(planName:string)=>{setSelected(planName);setBusy(true);setProofSent(false);setPurchase(null);setUtr('');try{const r=await mutate('subscription','POST',{plan:planName,mode:'UPI'});setPurchase(r)}catch(e:any){notify(e?.message??'Could not prepare payment.',true)}finally{setBusy(false)}};
 const openUpiApp=(app:'gpay'|'phonepe'|'paytm'|'bhim')=>{
  const source=String(purchase?.upiUrl??'');if(!source)return;
  const query=source.includes('?')?source.slice(source.indexOf('?')+1):'';
  const android=/Android/i.test(navigator.userAgent);
  const packages:{[key:string]:string}={gpay:'com.google.android.apps.nbu.paisa.user',phonepe:'com.phonepe.app',paytm:'net.one97.paytm',bhim:'in.org.npci.upiapp'};
  const iosSchemes:{[key:string]:string}={gpay:'gpay://upi/pay?',phonepe:'phonepe://pay?',paytm:'paytmmp://pay?',bhim:'bhim://upi/pay?'};
  const target=android?`intent://pay?${query}#Intent;scheme=upi;package=${packages[app]};end`:`${iosSchemes[app]}${query}`;
  window.location.href=target;
 };
 const submitProof=async()=>{if(!purchase?.invoice?.id||utr.trim().length<6)return;setProofBusy(true);try{const r=await mutate('subscription/manual-payment','POST',{invoiceId:purchase.invoice.id,utr:utr.trim()});setProofSent(true);notify(r.message??'Payment reference submitted for verification.');await q.refetch()}catch(e:any){notify(e?.message??'Could not submit payment reference.',true)}finally{setProofBusy(false)}};
 if(purchase?.mode==='UPI')return <div className="subscription-lock upgrade-lock payment-checkout-screen">
  <div className="lock-hero payment-lock-hero"><BrandLogo/><span className="login-eyebrow">SECURE SUBSCRIPTION PAYMENT</span><h1>Complete your payment</h1><p>Choose a UPI payment app or scan the secure QR. Your subscription activates after the transaction reference is verified.</p></div>
  <div className="checkout-layout checkout-layout-pro">
   <section className="panel checkout-summary-card">
    <div className="checkout-summary-top"><button className="checkout-back" type="button" onClick={()=>{setPurchase(null);setProofSent(false);setUtr('')}}>← Change plan</button><span className="secure-pill"><ShieldCheck size={14}/> Secure checkout</span></div>
    <small>SELECTED PLAN</small><h2>{readable(String(purchase.plan?.name??selected).toLowerCase())}</h2>
    <div className="checkout-price-lines"><div><span>Plan amount</span><strong>{currencyValue(purchase.breakdown?.subtotal??purchase.invoice?.amount??0,currency)}</strong></div><div><span>GST ({purchase.gstPercent??data.gstPercent??18}%)</span><strong>{currencyValue(purchase.breakdown?.tax??purchase.invoice?.tax??0,currency)}</strong></div><div className="checkout-total"><span>Total payable</span><strong>{currencyValue(purchase.breakdown?.total??purchase.invoice?.total??0,currency)}</strong></div></div>
    <div className="checkout-invoice-row"><span>Invoice</span><strong>{purchase.invoice?.number}</strong></div>
    <div className="checkout-trust"><ShieldCheck size={17}/><span><strong>Protected payment flow</strong><small>Receiver details stay hidden on this screen. Pay only the exact total shown above.</small></span></div>
   </section>
   <section className="panel upi-checkout-card direct-upi-card payment-choice-card">
    <div className="upi-qr-wrap"><img src={purchase.qrUrl} alt="Secure UPI payment QR code"/><small>Scan using any UPI payment app</small></div>
    <div className="upi-checkout-copy"><small>PAY SECURELY</small><h2>{currencyValue(purchase.breakdown?.total??purchase.invoice?.total??0,currency)}</h2><p className="payment-payee">Payee: <strong>{purchase.upi?.payeeName??'TCW HR Software'}</strong></p>
     <div className="payment-app-chooser"><span>Choose payment app</span><div className="payment-app-grid">
      <button type="button" className="payment-app-button gpay" onClick={()=>openUpiApp('gpay')}><b>G</b><span>Google Pay</span></button>
      <button type="button" className="payment-app-button phonepe" onClick={()=>openUpiApp('phonepe')}><b>P</b><span>PhonePe</span></button>
      <button type="button" className="payment-app-button paytm" onClick={()=>openUpiApp('paytm')}><b>₹</b><span>Paytm</span></button>
      <button type="button" className="payment-app-button bhim" onClick={()=>openUpiApp('bhim')}><b>B</b><span>BHIM</span></button>
     </div></div>
     <p className="payment-safety-note">Payment complete thaya pachi bank/UPI app ma malelo UTR / transaction reference niche enter karo.</p>
     <div className="payment-proof-card"><label><span>Transaction reference / UTR</span><input value={utr} onChange={e=>setUtr(e.target.value.replace(/\s/g,''))} placeholder="Example: 412345678901" maxLength={100}/></label><button className="btn primary" disabled={proofBusy||utr.trim().length<6||proofSent} onClick={submitProof}>{proofBusy?'Submitting…':proofSent?'Reference submitted':'Submit for verification'}</button></div>
     {proofSent&&<div className="notice success-notice"><CheckCircle2 size={17}/><span><strong>Payment reference received.</strong><small>Verification complete thaya pachi software access automatically unlock thase.</small></span></div>}
    </div>
   </section>
  </div>
 </div>;
 const featureRows=[
  {label:'Employee Management',keys:['Core HR','All modules']},
  {label:'Attendance & Leave',keys:['Attendance','Leave','All modules']},
  {label:'Payroll',keys:['Payroll','All modules']},
  {label:'Recruitment (ATS)',keys:['Recruitment','All modules']},
  {label:'Performance Management',keys:['All modules']},
  {label:'Training Management',keys:['All modules']},
  {label:'Asset Management',keys:['All modules']},
  {label:'Advanced Reports',keys:['All modules']},
  {label:'Multi-Location',keys:['All modules']},
  {label:'API Access',keys:['All modules']},
  {label:'Dedicated Support',keys:['Priority support','All modules']}
 ];
 const includesFeature=(plan:Row|undefined,keys:string[])=>{const features=(plan?.features??[]).map((v:any)=>String(v).toLowerCase());return keys.some(key=>features.includes(key.toLowerCase()))};
 const planTone=(name:string)=>name==='STARTER'?'starter':name==='GROWTH'?'growth':'enterprise';
 const planDescription=(name:string)=>name==='STARTER'?'Best for small teams':name==='GROWTH'?'Ideal for growing businesses':'For medium to large teams';
 const activeFeatures=currentPlan?.features?.length??0;
 const customFeatures=['All Enterprise features','Unlimited employee capacity','Custom integrations','Advanced security','Dedicated account support','Custom SLA options'];
 const paymentButton=(p:Row)=>busy&&selected===p.name?'Preparing payment…':p.name===company.plan?'Renew / Pay':'Get Started';
 return <div className={'subscription-plans-v3 '+(manage?'subscription-plans-v3-manage':'subscription-plans-v3-locked')}>
  <div className="subscription-v3-breadcrumb"><span>Home</span><ChevronRight size={13}/><strong>Subscription</strong></div>
  <header className="subscription-v3-head">
   <div><h1>Subscription Plans</h1><p>{manage?'Choose the best plan for your organization and unlock the full potential of TCW HR Software.':company.status==='EXPIRED'?'Your subscription has ended. Choose a plan to restore your TCW HR workspace.':'Choose a plan to continue using TCW HR Software.'}</p></div>
   <div className="subscription-v3-cycle" aria-label="Billing cycle"><button className="active" type="button">Monthly</button><button type="button" disabled title="Yearly billing is coming soon">Yearly</button><span>Monthly billing</span></div>
  </header>

  <section id="subscription-plans" className="subscription-v3-plan-grid">
   {plans.map((p:Row,index:number)=><article key={p.id} className={'subscription-v3-plan '+planTone(String(p.name))+(p.name===company.plan?' current':'')+(p.name==='GROWTH'?' popular':'')}>
    {p.name==='GROWTH'&&<span className="subscription-v3-popular">Most Popular</span>}
    <div className="subscription-v3-plan-title"><span className="subscription-v3-plan-icon">{p.name==='STARTER'?<ArrowUpRight/>:p.name==='GROWTH'?<Sparkles/>:<BarChart3/>}</span><div><h2>{readable(String(p.name).toLowerCase())}</h2><p>{planDescription(String(p.name))}</p></div></div>
    <div className="subscription-v3-price"><strong>{currencyValue(p.monthlyPrice,currency)}</strong><span>/ month</span></div>
    <p className="subscription-v3-capacity">Up to {p.employeeLimit} Employees</p>
    <button className={'subscription-v3-plan-cta '+(p.name==='GROWTH'?'primary':'')} type="button" disabled={busy||!data.upiConfigured} onClick={()=>startPayment(String(p.name))}>{paymentButton(p)}</button>
    <ul>{(p.features??[]).slice(0,7).map((feature:string)=><li key={feature}><CheckCircle2 size={15}/>{feature}</li>)}</ul>
    {p.name===company.plan&&<span className="subscription-v3-current-label">Current plan</span>}
   </article>)}
   <article className="subscription-v3-plan custom">
    <div className="subscription-v3-plan-title"><span className="subscription-v3-plan-icon"><Layers/></span><div><h2>Custom Enterprise</h2><p>For large organizations</p></div></div>
    <div className="subscription-v3-price custom-price"><strong>Custom Pricing</strong></div>
    <p className="subscription-v3-capacity">Tailored capacity & support</p>
    <button className="subscription-v3-plan-cta" type="button" onClick={()=>notify('Contact TCW HR Software support for a custom enterprise plan.')}>Contact Sales</button>
    <ul>{customFeatures.map(feature=><li key={feature}><CheckCircle2 size={15}/>{feature}</li>)}</ul>
   </article>
  </section>

  {!data.upiConfigured&&<div className="subscription-v3-warning"><AlertTriangle size={17}/><span><strong>UPI payment is temporarily unavailable.</strong><small>Plan comparison is available, but checkout will resume when payment configuration is ready.</small></span></div>}

  <section className="subscription-v3-lower">
   <div className="subscription-v3-comparison">
    <div className="subscription-v3-card-head"><div><h2>Feature Comparison</h2><p>Compare what is included in every available plan.</p></div></div>
    <div className="subscription-v3-table-wrap"><table><thead><tr><th>Features</th>{plans.map((p:Row)=><th key={p.id} className={p.name==='GROWTH'?'focus':''}>{readable(String(p.name).toLowerCase())}</th>)}<th>Custom</th></tr></thead><tbody>{featureRows.map(row=><tr key={row.label}><td>{row.label}</td>{plans.map((p:Row)=><td key={p.id}>{includesFeature(p,row.keys)?<CheckCircle2 className="yes" size={15}/>:<X className="no" size={14}/>}</td>)}<td><CheckCircle2 className="yes" size={15}/></td></tr>)}</tbody></table></div>
   </div>

   <aside className="subscription-v3-side">
    <section className="subscription-v3-current">
     <div className="subscription-v3-card-head"><div><h2>Your Current Plan</h2><p>Live company subscription details.</p></div><Badge value={company.status??'ACTIVE'}/></div>
     <div className="subscription-v3-current-main"><span className="subscription-v3-current-icon"><Sparkles/></span><div><small>{readable(String(company.plan??'starter').toLowerCase())} Plan</small><strong>{currentPlan?currencyValue(currentPlan.monthlyPrice,currency)+'/ month':'Pricing unavailable'}</strong><span>Up to {employeeLimit??'—'} Employees</span><em>{company.status==='TRIAL'?'Trial ends: ':'Next billing / expiry: '}{expiryLabel}</em></div>{currentPlan&&<button type="button" onClick={()=>startPayment(String(currentPlan.name))} disabled={busy||!data.upiConfigured}>Manage Plan</button>}</div>
     <div className="subscription-v3-usage">
      <div><span><Users size={16}/></span><small>Employees Used</small><strong>{employeesUsed} / {employeeLimit??'—'}</strong>{Number(employeeLimit)>0&&<><div><i style={{width:usagePercent(employeesUsed,employeeLimit)+'%'}}/></div><em>{usagePercent(employeesUsed,employeeLimit)}%</em></>}</div>
      <div><span><Monitor size={16}/></span><small>Devices Used</small><strong>{devicesUsed} / {deviceLimit??'—'}</strong>{Number(deviceLimit)>0&&<><div><i style={{width:usagePercent(devicesUsed,deviceLimit)+'%'}}/></div><em>{usagePercent(devicesUsed,deviceLimit)}%</em></>}</div>
      <div><span><Layers size={16}/></span><small>Plan Features</small><strong>{activeFeatures}</strong><div><i style={{width:Math.min(100,activeFeatures*14)+'%'}}/></div><em>Active</em></div>
     </div>
    </section>

    <section className="subscription-v3-addons">
     <div className="subscription-v3-card-head"><div><h2>Available Add-ons</h2><p>Optional capabilities for larger HR operations.</p></div><button type="button" onClick={()=>document.getElementById('subscription-plans')?.scrollIntoView({behavior:'smooth'})}>View All</button></div>
     <div className="subscription-v3-addon-grid">
      <article><span><BarChart3 size={17}/></span><div><strong>Advanced Analytics</strong><small>Enterprise capability</small></div><button type="button" onClick={()=>document.getElementById('subscription-plans')?.scrollIntoView({behavior:'smooth'})}>View</button></article>
      <article><span><Monitor size={17}/></span><div><strong>Biometric Integration</strong><small>Device-ready HR</small></div><button type="button" onClick={()=>document.getElementById('subscription-plans')?.scrollIntoView({behavior:'smooth'})}>View</button></article>
      <article><span><Sparkles size={17}/></span><div><strong>Custom Branding</strong><small>Professional workspace</small></div><button type="button" onClick={()=>document.getElementById('subscription-plans')?.scrollIntoView({behavior:'smooth'})}>View</button></article>
     </div>
    </section>

    {manage&&<section className="subscription-v3-billing">
     <div className="subscription-v3-card-head"><div><h2>Recent Billing</h2><p>{pendingProof?.status==='AWAITING_VERIFICATION'?'Payment verification is pending.':'Latest subscription invoices.'}</p></div>{latestInvoice&&<Badge value={latestInvoice.status}/>}</div>
     {pendingProof?.status==='AWAITING_VERIFICATION'&&<div className="subscription-v3-proof"><Clock3 size={16}/><span><strong>UTR verification pending</strong><small>Reference {pendingProof.utr}</small></span></div>}
     <div className="subscription-v3-invoices">{invoices.slice(0,3).map((invoice:Row)=><div key={invoice.id}><span><strong>{invoice.number}</strong><small>{displayDate(invoice.createdAt)}</small></span><span><strong>{currencyValue(invoice.total,currency)}</strong><Badge value={invoice.status}/></span></div>)}{!invoices.length&&<div className="subscription-v3-no-invoice"><Receipt size={18}/><span>No invoices yet</span></div>}</div>
    </section>}
   </aside>
  </section>
 </div>;
}
function Shell({page}:{page:string}){
 const{session,can,notify}=useApp();const router=useRouter();const queryClient=useQueryClient();
 const[mobile,setMobile]=useState(false),[search,setSearch]=useState(false),[query,setQuery]=useState(''),[logoutConfirm,setLogoutConfirm]=useState(false);
 const allNavigation=session.user.scope==='PLATFORM'?adminNavigation:session.user.role==='EMPLOYEE'?employeeNavigation:navigation;
 const nav=allNavigation.map(g=>({...g,items:g.items.filter(([, ,p])=>can(p)&&!(session.user.role==='EMPLOYEE'&&p==='support'))})).filter(g=>g.items.length);
 const flat=nav.flatMap(g=>g.items);const current=flat.find(([key])=>key===page);const navRef=useRef<HTMLElement>(null);
 const employees=useData('employees?q='+encodeURIComponent(query)+'&pageSize=6',search&&query.length>1&&session.user.scope==='TENANT'&&can('employees'));
 const notices=useData('notifications',session.user.scope==='TENANT');
 const faceProfile=useData('attendance/face-profile',session.user.role==='EMPLOYEE'&&!session.user.mustChangePassword&&(!session.company||['ACTIVE','TRIAL'].includes(session.company.status)));
 const faceEnrollmentKey='tcw_face_enrolled:'+String(session.user.employeeId??session.user.id);
 const[faceEnrollmentHint,setFaceEnrollmentHint]=useState(()=>{if(typeof window==='undefined')return false;try{return window.localStorage.getItem(faceEnrollmentKey)==='1'}catch{return false}});const faceFalseRetryRef=useRef(false);
 const branding=useData('company/branding',session.user.scope==='TENANT');
 useEffect(()=>{if(session.user.scope!=='TENANT'||!branding.data)return;const mergedCompany={...(session.company??{}),...branding.data,profile:{...(session.company?.profile??{}),primaryColor:branding.data.primaryColor??session.company?.profile?.primaryColor}};saveLocalSessionSnapshot({...session,company:mergedCompany})},[branding.data,session.user.scope]);
 useEffect(()=>{if(session.user.scope!=='TENANT')return;const refresh=()=>{branding.refetch().catch(()=>{})};const timer=window.setInterval(refresh,10000);window.addEventListener('focus',refresh);return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh)}},[session.user.scope,branding.refetch]);
 const lastNoticeRef=useRef<string|null>(null);
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();setSearch(v=>!v)}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[]);
 useEffect(()=>{if(session.user.scope!=='TENANT')return;const timer=window.setInterval(()=>notices.refetch().catch(()=>{}),30000);return()=>window.clearInterval(timer)},[session.user.scope,notices.refetch]);
 useEffect(()=>{if(session.user.scope!=='TENANT')return;const rows:Row[]=notices.data?.items??[];const latest=rows[0];if(!latest)return;const storageKey='tcw_last_status_notification:'+session.user.id;let previous=lastNoticeRef.current;try{previous=previous??window.localStorage.getItem(storageKey)}catch{}if(!previous){lastNoticeRef.current=latest.id;try{window.localStorage.setItem(storageKey,latest.id)}catch{}return;}if(previous!==latest.id){lastNoticeRef.current=latest.id;try{window.localStorage.setItem(storageKey,latest.id)}catch{};if(!(window as any).__tcwPushActive)(window as any).__tcwSystemNotify?.(String(latest.title??'TCW HR Software'),String(latest.message??''),notificationTarget(latest),'tcw-'+latest.id)}},[notices.data,session.user.scope,session.user.id]);

 useEffect(()=>{const onExpired=()=>{queryClient.clear();router.replace(session.user.scope==='PLATFORM'?'/admin-login':'/login')};window.addEventListener('tcw-session-expired',onExpired);return()=>window.removeEventListener('tcw-session-expired',onExpired)},[queryClient,router,session.user.scope]);
 useEffect(()=>{if(page==='ai')router.replace('/dashboard')},[page,router]);
 useEffect(()=>{if(session.user.role!=='EMPLOYEE')return;preloadFaceEngine();try{setFaceEnrollmentHint(window.localStorage.getItem(faceEnrollmentKey)==='1')}catch{}},[session.user.role,faceEnrollmentKey]);
 useEffect(()=>{
  if(session.user.role!=='EMPLOYEE')return;
  const enrolled=faceProfile.data?.enrolled;
  if(enrolled===true){
   faceFalseRetryRef.current=false;setFaceEnrollmentHint(true);
   try{window.localStorage.setItem(faceEnrollmentKey,'1')}catch{}
   return;
  }
  if(enrolled!==false)return;
  if(faceEnrollmentHint&&!faceFalseRetryRef.current){
   faceFalseRetryRef.current=true;
   const timer=window.setTimeout(()=>faceProfile.refetch().catch(()=>{}),350);
   return()=>window.clearTimeout(timer);
  }
  faceFalseRetryRef.current=false;setFaceEnrollmentHint(false);
  try{window.localStorage.removeItem(faceEnrollmentKey)}catch{}
 },[session.user.role,faceEnrollmentKey,faceEnrollmentHint,faceProfile.data?.enrolled,faceProfile.dataUpdatedAt]);
 
 useEffect(()=>{if(session.user.scope==='PLATFORM'||process.env.NEXT_PUBLIC_REALTIME_ENABLED==='false')return;const localSession=getLocalSessionToken();const socket=io({path:'/socket.io',withCredentials:true,transports:['websocket','polling'],auth:localSession?{localSessionToken:localSession}:{}});socket.on('changed',()=>queryClient.invalidateQueries());return()=>{socket.disconnect()}},[queryClient,session.user.scope]);
 useEffect(()=>{if(session.user.role!=='EMPLOYEE')return;const refresh=()=>queryClient.invalidateQueries();const visible=()=>{if(document.visibilityState==='visible')refresh()};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',visible);return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visible)}},[queryClient,session.user.role]);
 useEffect(()=>setMobile(false),[page]);
 useEffect(()=>{if(!mobile)return;const previous=document.body.style.overflow;const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setMobile(false)};document.body.style.overflow='hidden';window.addEventListener('keydown',onKey);return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',onKey)}},[mobile]);
 useEffect(()=>{const el=navRef.current;if(!el)return;const key=`tcw-sidebar-scroll:${session.user.scope}`;const saved=sessionStorage.getItem(key);if(saved!==null)el.scrollTop=Number(saved)||0;else requestAnimationFrame(()=>el.querySelector('[aria-current="page"]')?.scrollIntoView({block:'nearest'}));const save=()=>sessionStorage.setItem(key,String(el.scrollTop));el.addEventListener('scroll',save,{passive:true});return()=>el.removeEventListener('scroll',save)},[page,session.user.scope]);
 async function logout(){try{if(session.user.role==='EMPLOYEE')await api('field-work/session','DELETE',{},session.csrf).catch(()=>{});await api('auth/logout','POST',{},session.csrf)}finally{try{window.sessionStorage.removeItem(`tcw_active_window_${session.user.scope.toLowerCase()}`)}catch{}queryClient.clear();router.replace(session.user.scope==='PLATFORM'?'/admin-login':'/login')}}
 let content:React.ReactNode;
 if(current&&!can(current[2]))content=<Empty title="Access restricted"/>;
 else if(page==='dashboard')content=<Dashboard/>;
 else if(page==='trials')content=<TrialsPage/>;
 else if(page==='organization')content=<Organization/>;
 else if(page==='recruitment')content=<Recruitment/>;
 else if(page==='goals')content=<PerformanceDashboard/>;
 else if(page==='leave')content=<LeavePage/>;
 else if(page==='attendance')content=<AttendancePage/>;
 else if(page==='devices')content=<DeviceManagement/>;
 else if(page==='payroll')content=<PayrollPage/>;
 else if(page==='calendar')content=<CalendarPage/>;
 else if(page==='field-work')content=<FieldWorkPage/>;
 else if(page==='workforce')content=<WorkforcePage/>;
 else if(page==='settings')content=session.user.scope==='PLATFORM'?<PlatformSettingsPage/>:<><CompanySettings/><ApprovalSettings/></>;
 else if(page==='subscription')content=<SubscriptionLock manage/>;
 else if(page==='software-update')content=<SoftwareUpdatePage/>;
 else if(page==='users')content=<UsersPage/>;
 else if(page==='security')content=<SecurityPage/>;
 else if(page==='documents')content=<DocumentsPage/>;
 else if(page==='reports')content=<ReportsPage/>;
 else if(page==='audit')content=<AuditPage/>;
 else if(page==='profile')content=<MyProfilePage/>;
 else if(page==='system')content=<SystemPage/>;
 else if(page==='notifications')content=<NotificationsPage/>;
 else if(page==='support')content=<SupportPage/>;
 else if(page==='employees')content=<PeopleDirectory/>;
 else if(modules[page])content=<ModulePage key={page} name={page}/>;
 else content=<Empty title="Page not found" description="Choose a workspace from the sidebar."/>;
 const isAllowed=page==='notifications'?session.user.scope==='TENANT':!!current;
 const workspaceBrand=branding.data??session.company??{};
 const primaryColor=String(workspaceBrand.primaryColor??workspaceBrand.profile?.primaryColor??'#0369a1');
 const companyLogo=String(workspaceBrand.logo??session.company?.logo??TCW_PRODUCT_LOGO);
 const billingLocked=session.user.scope==='TENANT'&&workspaceBrand&&!['ACTIVE','TRIAL'].includes(String(workspaceBrand.status??session.company?.status??'ACTIVE'));
 const unreadNotices=notices.data?.unread ?? (notices.data?.items??[]).filter((row:Row)=>!row.readAt).length;
 const searchEmployees=employees.data?.items ?? [];
 if(session.user.mustChangePassword)return <FirstPasswordChange/>;
 if(billingLocked&&!can('company','VIEW'))return <div className="employee-access-paused"><div className="employee-access-paused-card"><BrandLogo/><span>{session.user.role==='EMPLOYEE'?'EMPLOYEE SELF SERVICE':'COMPANY WORKSPACE'}</span><h1>Company access is temporarily paused</h1><p>Your company subscription needs attention. Billing details are available only to authorized company administrators. Please contact your HR administrator.</p><button className="btn secondary" type="button" onClick={logout}><LogOut size={16}/>Sign out</button></div></div>;
 if(billingLocked)return <SubscriptionLock/>;
 if(session.user.role==='EMPLOYEE'&&!faceProfile.isLoading&&!faceProfile.error&&faceProfile.data?.enrolled===false&&!faceEnrollmentHint){
  return <EmployeeFaceEnrollmentGate logo={companyLogo} companyName={workspaceBrand.name??session.company?.name} onComplete={async()=>{setFaceEnrollmentHint(true);faceFalseRetryRef.current=false;try{window.localStorage.setItem(faceEnrollmentKey,'1')}catch{}await faceProfile.refetch()}} onSignOut={logout}/>;
 }
 if(session.user.role==='EMPLOYEE'){
  const primaryKeys=['dashboard','attendance','leave','payroll'];
  const moreItems=flat.filter(([key])=>!primaryKeys.includes(key)&&!['profile','security','notifications'].includes(key));
  return <div className="employee-app-shell" style={{'--primary':primaryColor} as React.CSSProperties}>
   <header className="employee-app-header">
    <Link href="/dashboard" className="employee-app-brand" onClick={()=>setMobile(false)}><span><img src={companyLogo} alt={(workspaceBrand.name??'Company')+' logo'} onError={e=>{e.currentTarget.src=TCW_PRODUCT_LOGO}}/></span><div><strong>{workspaceBrand.name??session.company?.name??'TCW Employee'}</strong><small>Employee</small></div></Link>
    <nav className="employee-desktop-nav" aria-label="Employee navigation">{primaryKeys.map(key=>{const item=flat.find(([k])=>k===key);if(!item)return null;const Icon=icons[key]??LayoutDashboard;return <Link key={key} href={'/'+key} className={page===key?'active':''}><Icon size={17}/>{item[1]}</Link>})}</nav>
    <div className="employee-app-header-actions"><Link href="/notifications" className="employee-header-icon" aria-label="Notifications"><Bell size={20}/>{unreadNotices>0&&<i>{Math.min(unreadNotices,9)}</i>}</Link><Link href="/profile" className="employee-header-avatar" aria-label="My profile"><Avatar name={session.user.name} src={session.user.avatar}/></Link></div>
   </header>
   {session.company?.status==='TRIAL'&&session.company?.expiresAt&&<div className="employee-trial-strip">Trial · {Math.max(0,Math.ceil((new Date(session.company.expiresAt).getTime()-Date.now())/86400000))} day(s) remaining</div>}
   {faceProfile.data?.status==='PENDING'&&<div className="employee-face-status-warning">Face setup awaits HR approval. Attendance will be enabled after approval.</div>}
   {faceProfile.error&&<button className="employee-face-status-warning" type="button" onClick={()=>faceProfile.refetch()}>Face status unavailable · tap to retry</button>}
   <EmployeeFieldTracker/><main className="employee-app-main"><div key={page} className="employee-page-stage">{isAllowed?content:<Empty title="Access restricted" description="This section is not available for your Employee account."/>}</div></main>
   <nav className="employee-app-bottom-nav" aria-label="Employee shortcuts">{primaryKeys.map(key=>{const item=flat.find(([k])=>k===key);if(!item)return null;const Icon=icons[key]??LayoutDashboard;return <Link key={key} href={'/'+key} className={page===key?'active':''} onClick={()=>setMobile(false)}><Icon size={21}/><span>{key==='dashboard'?'Home':key==='leave'?'Time off':key==='payroll'?'Payslips':item[1]}</span></Link>})}<button type="button" className={mobile?'active':''} onClick={()=>setMobile(v=>!v)} aria-expanded={mobile}><PanelLeft size={21}/><span>More</span></button></nav>
   {mobile&&<><button className="employee-more-scrim" aria-label="Close menu" onClick={()=>setMobile(false)}/><section className="employee-more-sheet"><div className="employee-more-handle"/><div className="employee-more-profile"><Avatar name={session.user.name} src={session.user.avatar}/><div><strong>{session.user.name}</strong><small>{session.user.roleName}</small></div></div><div className="employee-more-links">{moreItems.map(([key,label])=>{const Icon=icons[key]??LayoutDashboard;return <Link href={'/'+key} key={key} onClick={()=>setMobile(false)}><Icon size={19}/><span>{label}</span><ChevronRight size={16}/></Link>})}<Link href="/profile" onClick={()=>setMobile(false)}><UserCircle size={19}/><span>My profile</span><ChevronRight size={16}/></Link><Link href="/security" onClick={()=>setMobile(false)}><LockKeyhole size={19}/><span>Security</span><ChevronRight size={16}/></Link><Link href="/notifications" onClick={()=>setMobile(false)}><Bell size={19}/><span>Notifications</span><ChevronRight size={16}/></Link><button type="button" onClick={()=>{setMobile(false);setLogoutConfirm(true)}}><LogOut size={19}/><span>Sign out</span><ChevronRight size={16}/></button></div></section></>}
   {logoutConfirm&&<Confirm title="Sign out?" description="You will need your Employee login details to sign in again." onClose={()=>setLogoutConfirm(false)} onConfirm={logout}/>}
  </div>;
 }

 return <div className={'app-shell '+(session.user.scope==='PLATFORM'?'platform-shell':'tenant-shell')} style={{'--primary':primaryColor} as React.CSSProperties}>
 {mobile&&<button className="mobile-scrim" aria-label="Close navigation" onClick={()=>setMobile(false)}/>}
 <aside className={'sidebar '+(mobile?'open':'')}>
 <Link className="brand" href="/dashboard" onClick={()=>setMobile(false)}><span className="brand-mark brand-logo tcw-default-logo">{session.user.scope==='TENANT'?<img src={companyLogo} alt={(workspaceBrand.name??'Company')+' logo'} onError={e=>{e.currentTarget.src=TCW_PRODUCT_LOGO}}/>:<BrandLogo/>}</span><span><strong>{session.user.scope==='TENANT'?(workspaceBrand.name??session.company?.name??'TCW HR Software'):<><span>TCW HR</span> <span>Software</span></>}</strong><small>{session.user.scope==='PLATFORM'?'SUPER ADMIN':'HR MANAGEMENT'}</small></span></Link>
  <nav ref={navRef} aria-label="Main navigation">{nav.map(g=><div className="nav-group" key={g.group}><span className="nav-group-label">{g.group}</span>{g.items.map(([key,label])=>{const Icon=icons[key]??LayoutDashboard;return <Link href={'/'+key} key={key} className={'nav-item '+(page===key?'selected':'')} aria-current={page===key?'page':undefined} onClick={()=>setMobile(false)}><Icon size={19} strokeWidth={1.8}/><span>{label}</span></Link>})}</div>)}</nav>
 <div className="sidebar-bottom"><div className="account"><Link href="/profile" className="sidebar-profile-link" onClick={()=>setMobile(false)}><Avatar name={session.user.name} src={session.user.avatar}/><span><strong>{session.user.name}</strong><small>{session.user.roleName}</small></span></Link><button className="icon-button sidebar-signout" aria-label="Sign out" onClick={()=>setLogoutConfirm(true)}><LogOut size={17}/></button></div></div>
 </aside>
 <div className="main-shell"><header className="topbar"><div className="header-left"><button className="icon-button mobile-toggle" aria-label={mobile?'Close navigation':'Open navigation'} aria-expanded={mobile} onClick={()=>setMobile(v=>!v)}><PanelLeft size={21}/></button><span className="breadcrumb">Workspace <span>/</span><strong>{current?.[1]??'Notifications'}</strong></span></div><div className="header-right"><button className="command-button compact-search-button" onClick={()=>setSearch(true)} aria-label="Search workspace" title="Search workspace"><Search size={18}/><span>Search</span></button>{session.user.scope==='TENANT'&&<Link className="notification-button icon-button" href="/notifications" aria-label="Notifications"><Bell size={20}/></Link>}<span className="header-divider"/><Link href="/security" className="header-avatar" aria-label="My account security"><Avatar name={session.user.name} src={session.user.avatar}/></Link></div></header>{session.user.scope==='TENANT'&&session.company?.status==='TRIAL'&&session.company?.expiresAt&&<div className="trial-topline"><strong>Free trial active</strong><span>{Math.max(0,Math.ceil((new Date(session.company.expiresAt).getTime()-Date.now())/86400000))} day(s) remaining · ends {new Date(session.company.expiresAt).toLocaleDateString('en-IN')}</span></div>}{session.proxy&&<div className="company-proxy-banner" role="status"><ShieldCheck size={18}/><div><strong>Super Admin proxy · {session.company?.name}</strong><small>Actions are recorded as {session.proxy.actorName}. Ends at {new Date(session.proxy.expiresAt).toLocaleTimeString()}.</small></div><button type="button" className="btn secondary small" onClick={async()=>{try{await api("auth/logout","POST",{},session.csrf)}finally{clearLocalSessionState();window.location.assign(session.proxy!.returnUrl)}}}>End proxy / Super Admin</button></div>}<main className="workspace-main"><div key={page} className="page-stage">{isAllowed?content:<Empty title="Access restricted" description="Your role does not have access to this workspace."/>}</div><footer className="app-footer"><span>© TCW HR Software</span><span>{session.user.scope==='PLATFORM'?'Platform administration':session.user.role==='EMPLOYEE'?'Employee self service':'HR & workforce management'}</span></footer></main></div>
 <nav className="mobile-bottom-nav" aria-label="Mobile shortcuts">{(session.user.scope==='PLATFORM'?['dashboard','trials','companies','invoices']:session.user.role==='EMPLOYEE'?['dashboard','attendance','leave','payroll']:['dashboard','employees','attendance','leave']).map(key=>{const item=flat.find(([k])=>k===key);if(!item)return null;const Icon=icons[key]??LayoutDashboard;return <Link key={key} href={'/'+key} className={page===key?'active':''} onClick={()=>setMobile(false)}><Icon size={20}/><span>{item[1]}</span></Link>})}<button type="button" className={mobile?'active':''} aria-expanded={mobile} aria-label={mobile?'Close menu':'Open menu'} onClick={()=>setMobile(v=>!v)}><PanelLeft size={20}/><span>{mobile?'Close':'More'}</span></button></nav>
 <TCWAgent/>
 {logoutConfirm&&<Confirm title="Sign out of TCW HR Software?" description="You will be signed out on this device and will need to sign in again to continue." onClose={()=>setLogoutConfirm(false)} onConfirm={logout}/>}
 {search&&<Modal title="Search your workspace" onClose={()=>setSearch(false)}><div className="command-search"><Search size={21}/><input autoFocus aria-label="Search pages and employees" placeholder="Search pages or employees…" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="command-results"><span className="nav-group-label">Pages</span>{flat.filter(([,title])=>title.toLowerCase().includes(query.toLowerCase())).map(([key,label])=>{const Icon=icons[key]??LayoutDashboard;return <button key={key} onClick={()=>{router.push('/'+key);setSearch(false)}}><Icon size={18}/><span>{label}</span><ArrowUpRight size={16}/></button>})}{searchEmployees.length>0&&<><span className="nav-group-label">People</span>{searchEmployees.map((e:Row)=><button key={e.id} onClick={()=>{router.push('/employees?search='+encodeURIComponent(e.employeeCode));setSearch(false)}}><Avatar name={e.firstName+' '+e.lastName} src={e.photo}/><span>{e.firstName} {e.lastName}<small>{e.email}</small></span><ArrowUpRight size={16}/></button>)}</>}</div></Modal>}
 </div>;
}
function TCWAgent(){
 const{session,notify}=useApp();const enabled=session.user.scope==='TENANT';const status=useData('agent/status',enabled);const historyQ=useData('agent/history',enabled);
 const[open,setOpen]=useState(false),[historyOpen,setHistoryOpen]=useState(false),[question,setQuestion]=useState(''),[messages,setMessages]=useState<Row[]>([]),[currentConversationId,setCurrentConversationId]=useState<string|null>(null),[busy,setBusy]=useState(false),[savingChat,setSavingChat]=useState(false),[localIssue,setLocalIssue]=useState('');
 const previousIssues=useRef<number|null>(null),errorHits=useRef<Record<string,{count:number;at:number}>>({}),chatEpochRef=useRef(0),messagesEndRef=useRef<HTMLSpanElement>(null);
 const serializableMessages=(rows:Row[]=messages)=>rows.filter(m=>m.role==='user'||m.role==='assistant').map(m=>({role:m.role,text:String(m.text??'').slice(0,4000)})).filter(m=>m.text.trim());
 const persistChat=async(rows:Row[]=messages,showSaving=false)=>{const clean=serializableMessages(rows);if(!clean.length)return null;if(showSaving)setSavingChat(true);try{const saved=await api(currentConversationId?'agent/history/'+currentConversationId:'agent/history',currentConversationId?'PUT':'POST',{messages:clean},session.csrf);if(!currentConversationId&&saved?.id)setCurrentConversationId(saved.id);await historyQ.refetch();return saved}catch(e:any){if(showSaving)notify(e?.message??'Could not save Meghna conversation.',true);return null}finally{if(showSaving)setSavingChat(false)}};
 const clearActiveChat=()=>{chatEpochRef.current+=1;setMessages([]);setQuestion('');setCurrentConversationId(null);setHistoryOpen(false);setBusy(false)};
 const closeAgent=async()=>{try{if(messages.some(m=>m.role==='user'||m.role==='assistant'))await persistChat(messages,true)}finally{clearActiveChat();setOpen(false)}};
 const newChat=async()=>{if(messages.some(m=>m.role==='user'||m.role==='assistant'))await persistChat(messages,true);clearActiveChat();setHistoryOpen(false);setOpen(true)};
 const loadConversation=async(idValue:string)=>{try{const row=await api('agent/history/'+idValue);const rows=Array.isArray(row?.messages)?row.messages:[];chatEpochRef.current+=1;setMessages(rows.filter((m:any)=>m&&['user','assistant'].includes(m.role)&&typeof m.text==='string'));setCurrentConversationId(idValue);setQuestion('');setHistoryOpen(false);setOpen(true)}catch(e:any){notify(e?.message??'Could not open conversation.',true)}};
 const deleteConversation=async(idValue:string)=>{try{await api('agent/history/'+idValue,'DELETE',{},session.csrf);if(currentConversationId===idValue)clearActiveChat();await historyQ.refetch();notify('Conversation deleted.')}catch(e:any){notify(e?.message??'Could not delete conversation.',true)}};
 useEffect(()=>{if(!enabled)return;const count=Number(status.data?.issues?.length??0);if(previousIssues.current!==null&&count>previousIssues.current)notify('Meghna found '+count+' item(s) that need attention.',true);previousIssues.current=count},[enabled,status.data?.issues?.length,notify]);
 useEffect(()=>{if(!enabled)return;const onError=(event:any)=>{const path=String(event?.detail?.path??'request'),now=Date.now(),prev=errorHits.current[path],count=prev&&now-prev.at<60000?prev.count+1:1;errorHits.current[path]={count,at:now};if(count<2)return;const msg=String(event?.detail?.message??'A software request failed.').slice(0,180);setLocalIssue(msg);notify('Meghna detected a repeated software problem. Open Meghna for details.',true)};window.addEventListener('tcw-app-error',onError);return()=>window.removeEventListener('tcw-app-error',onError)},[enabled,notify]);
 useEffect(()=>{if(open)requestAnimationFrame(()=>messagesEndRef.current?.scrollIntoView({block:'end',behavior:'smooth'}))},[open,messages.length,busy]);
 useEffect(()=>{if(!open)return;const body=document.body,html=document.documentElement;const previousBodyOverflow=body.style.overflow,previousHtmlOverflow=html.style.overflow,previousTouch=body.style.touchAction;const scrollY=window.scrollY;body.classList.add('tcw-ai-open');body.style.overflow='hidden';html.style.overflow='hidden';body.style.touchAction='none';return()=>{body.classList.remove('tcw-ai-open');body.style.overflow=previousBodyOverflow;html.style.overflow=previousHtmlOverflow;body.style.touchAction=previousTouch;window.scrollTo(0,scrollY)}},[open]);
 async function ask(text:string){if(!text.trim()||busy)return;const prompt=text.trim(),epoch=chatEpochRef.current,history=messages.filter(m=>m.role==='user'||m.role==='assistant').slice(-12).map(m=>({role:m.role,text:String(m.text??'')})),userRow:Row={role:'user',text:prompt},baseRows=[...messages,userRow];setQuestion('');setBusy(true);setMessages(baseRows);try{const r=await api('agent','POST',{question:prompt,history},session.csrf);if(epoch!==chatEpochRef.current)return;const nextRows=[...baseRows,{role:'assistant',text:r.answer,model:r.model}];setMessages(nextRows);await persistChat(nextRows,false);if(r.action?.type==='navigate'&&r.action.href)setTimeout(()=>window.location.assign(r.action.href),450);if(r.action?.type==='refresh')setTimeout(()=>window.location.reload(),450);await status.refetch()}catch(e:any){if(epoch===chatEpochRef.current)setMessages(m=>[...m,{role:'error',text:e.message}])}finally{if(epoch===chatEpochRef.current)setBusy(false)}}
 if(!enabled)return null;
 const issues:Row[]=status.data?.issues??[];const issueCount=issues.length+(localIssue?1:0),historyRows:Row[]=historyQ.data?.items??[];
 return <div className={'tcw-agent '+(open?'open':'')}>
  <section className={'tcw-agent-panel '+(open?'is-open':'is-closed')+(!messages.length&&!historyOpen?' empty-chat':'')} aria-label="Meghna AI Assistant" aria-hidden={!open}>
   <header><div><span className="tcw-agent-orb meghna-avatar"><img src={MEGHNA_AVATAR} alt="Meghna"/></span><span><strong>Meghna</strong><small>AI companion · HR assistant</small></span></div><div className="meghna-header-actions"><button className="icon-button" aria-label="New chat" title="New chat" onClick={newChat} disabled={savingChat}><Plus size={17}/></button><button className={'icon-button '+(historyOpen?'active':'')} aria-label="Chat history" title="Chat history" onClick={()=>setHistoryOpen(v=>!v)}><History size={17}/></button><button className="icon-button" aria-label="Close Meghna" onClick={closeAgent} disabled={savingChat}><X size={17}/></button></div></header>
   {historyOpen&&<div className="meghna-history"><div className="meghna-history-head"><strong>Chat history</strong><small>{historyRows.length} saved conversation{historyRows.length===1?'':'s'}</small></div>{historyQ.isLoading?<small className="meghna-history-empty">Loading history…</small>:historyRows.length?<div className="meghna-history-list">{historyRows.map(r=><div className={'meghna-history-row '+(currentConversationId===r.id?'active':'')} key={r.id}><button type="button" onClick={()=>loadConversation(String(r.id))}><strong>{r.title}</strong><small>{new Date(r.updatedAt).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})} · {r.messageCount} messages</small></button><button type="button" className="history-delete" aria-label="Delete conversation" onClick={()=>deleteConversation(String(r.id))}><Trash2 size={14}/></button></div>)}</div>:<small className="meghna-history-empty">No saved chats yet.</small>}</div>}
   <div className="meghna-mode-strip"><span><span className="meghna-live-dot"/>Text AI</span><small>{savingChat?'Saving chat…':'Chats save to History automatically'}</small></div>
   {(localIssue||issues.length>0)&&<div className="tcw-agent-issues">{localIssue&&<div><strong>Recent app issue</strong><p>{localIssue}</p></div>}{issues.slice(0,3).map((r:Row,i:number)=><div key={r.code??i}><strong>{r.title}</strong><p>{r.message}</p></div>)}</div>}
   {!messages.length&&<div className="tcw-agent-welcome"><span className="meghna-welcome-mark"><Sparkles size={19}/></span><h3>How can Meghna help?</h3><p>Ask about employees, attendance, leave, payroll, reports, devices, billing, settings, updates, or a software problem. Each conversation is saved separately in History.</p><div><button onClick={()=>ask('Check software status')}>Check software</button><button onClick={()=>ask('Help me with HR tasks')}>HR help</button><button onClick={()=>ask('What needs my attention?')}>Needs attention</button></div></div>}
   {!!messages.length&&<div className="tcw-agent-messages">{messages.slice(-40).map((m:Row,i:number)=><div className={m.role} key={i}><strong>{m.role==='user'?'You':m.role==='error'?'Error':'Meghna'}</strong><p>{m.text}</p></div>)}{busy&&<span className="meghna-thinking"><i/><i/><i/><em>Meghna is thinking</em></span>}<span ref={messagesEndRef} className="meghna-scroll-anchor"/></div>}
   <form className="meghna-compose" onSubmit={e=>{e.preventDefault();ask(question)}}><textarea rows={1} value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask(question)}}} maxLength={1400} placeholder="Message Meghna…" aria-label="Message Meghna"/><button className="btn primary" aria-label="Send message" disabled={busy||!question.trim()}><Send size={17}/></button></form>
  </section>
  <button className="tcw-agent-fab" aria-label={open?'Close Meghna AI Assistant':'Open Meghna AI Assistant'} onClick={()=>{if(open)closeAgent();else setOpen(true)}} disabled={savingChat}><span className="tcw-agent-face meghna-avatar"><img src={MEGHNA_AVATAR} alt="Meghna"/></span>{issueCount>0&&<b>{issueCount>9?'9+':issueCount}</b>}</button>
 </div>;
}

export function Login({scope,mode='login',resetToken='',prefillCompanyCode='',prefillUser=''}:{scope:'TENANT'|'PLATFORM';mode?:string;resetToken?:string;prefillCompanyCode?:string;prefillUser?:string}){
 const router=useRouter();
 const[twoFactorRequired,setTwoFactorRequired]=useState(false),[twoFactorCode,setTwoFactorCode]=useState('');
 const[companyCode,setCompanyCode]=useState(prefillCompanyCode),[email,setEmail]=useState(prefillUser),[password,setPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState(''),[showPassword,setShowPassword]=useState(false),[remember,setRemember]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[resetReady,setResetReady]=useState(mode!=='reset-password'),[resetChecking,setResetChecking]=useState(mode==='reset-password');
 const[companyName,setCompanyName]=useState(''),[ownerName,setOwnerName]=useState(''),[phone,setPhone]=useState(''),[plan,setPlan]=useState('STARTER'),[terms,setTerms]=useState(false),[contactConsent,setContactConsent]=useState(false),[created,setCreated]=useState<Row|null>(null),[employeeApp,setEmployeeApp]=useState(false),[loginBrand,setLoginBrand]=useState<Row|null>(null);
 const signup=scope==='TENANT'&&mode==='signup';
 const loginBrandLogo=String(loginBrand?.logo??TCW_PRODUCT_LOGO),loginBrandName=String(loginBrand?.name??(employeeApp?'TCW Employee':'TCW HR Software')),loginBrandColor=String(loginBrand?.primaryColor??'#0369a1');
 useEffect(()=>{setEmployeeApp(scope==='TENANT'&&isEmployeeNativeApp())},[scope]);
 useEffect(()=>{if(scope!=='TENANT'||signup||mode==='reset-password'){setLoginBrand(null);return;}const code=companyCode.trim().toUpperCase();if(code.length<3){setLoginBrand(null);return;}let active=true;const timer=window.setTimeout(()=>{api('tenant-branding/'+encodeURIComponent(code)).then(r=>{if(active)setLoginBrand(r?.found?r:null)}).catch(()=>{if(active)setLoginBrand(null)})},280);return()=>{active=false;window.clearTimeout(timer)}},[scope,signup,mode,companyCode]);
 useEffect(()=>{if(scope==='TENANT'&&mode==='login'&&isEmployeeNativeApp())preloadFaceEngine()},[scope,mode]);
 useEffect(()=>{if(scope==='TENANT'&&mode==='signup'&&isEmployeeNativeApp())router.replace('/login')},[scope,mode,router]);
 useEffect(()=>{if(mode!=='login')return;let active=true;const key=`tcw_remember_${scope.toLowerCase()}`,activeKey=`tcw_active_window_${scope.toLowerCase()}`;let shouldResume=false;try{const saved=JSON.parse(window.localStorage.getItem(key)??'null');const windowActive=window.sessionStorage.getItem(activeKey)==='1';shouldResume=!!saved||windowActive;if(saved){setRemember(true);if(scope==='TENANT'&&saved.companyCode)setCompanyCode(String(saved.companyCode));if(saved.email)setEmail(String(saved.email));}}catch{}
 if(!shouldResume)return()=>{active=false};
 (async()=>{try{const current=await api('auth/me');if(active&&current?.user?.scope===scope){
   if(scope==='TENANT'&&isHrPortalHost()&&current.user?.role==='EMPLOYEE'){const code=String(current.company?.code??''),user=String(current.user?.loginId??current.user?.email??'');try{await api('auth/logout','POST',{},current.csrf)}catch{}clearLocalSessionState();window.location.replace(portalLoginUrl('EMPLOYEE',code,user));return;}
   if(scope==='TENANT'&&isEmployeePortalHost()&&current.user?.role!=='EMPLOYEE'){const code=String(current.company?.code??''),user=String(current.user?.loginId??current.user?.email??'');try{await api('auth/logout','POST',{},current.csrf)}catch{}clearLocalSessionState();window.location.replace(portalLoginUrl('HR',code,user));return;}
   if(isEmployeeNativeApp()&&current.user?.role!=='EMPLOYEE'){try{await api('auth/logout','POST',{},current.csrf)}catch{}clearLocalSessionState();setError('This is the TCW Employee app. Sign in with an Employee account.');return;}
   try{window.localStorage.setItem('tcw_portal_scope',scope);window.sessionStorage.setItem(activeKey,'1')}catch{}router.replace('/dashboard')}}catch{}})();return()=>{active=false}},[mode,scope,router]);
 useEffect(()=>{if(mode!=='reset-password')return;let active=true;(async()=>{try{if(!resetToken)throw new Error('This reset link is invalid or expired.');await api('auth/reset-password/claim','POST',{token:resetToken});if(active){setResetReady(true);setResetChecking(false)}}catch(e:any){if(active){setResetReady(false);setResetChecking(false);setError(e?.message??'This reset link is invalid, expired, or already used.')}}})();return()=>{active=false}},[mode,resetToken]);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{
  if(signup){if(!terms)throw new Error('Accept the Terms and Privacy notice to start a trial.');if(!contactConsent)throw new Error('Please allow us to contact you about your trial.');const r=await api('auth/signup','POST',{companyName,ownerName,ownerEmail:email.trim(),phone:phone.trim(),plan,acceptTerms:true,contactConsent:true});setCreated(r);setMessage(`Your company workspace is ready. Your Company Code, User ID and temporary password have been sent to ${email.trim()}.`)}
  else if(mode==='reset-password'){if(password!==confirmPassword)throw new Error('Passwords do not match.');const r=await api('auth/reset-password','POST',{password});setMessage(r.message);setResetReady(false);setPassword('');setConfirmPassword('')}
  else if(mode==='forgot-password'){const r=await api('auth/forgot-password','POST',{email,...(scope==='TENANT'?{companyCode}: {})});setMessage(r.message)}
  else{const r=await api('auth/login','POST',{email:email.trim(),password,remember,...(twoFactorRequired?{twoFactorCode}:{}),...(scope==='TENANT'?{companyCode:companyCode.trim().toUpperCase()}: {})});if(r.twoFactorRequired){setTwoFactorRequired(true);return;}if(r.user.scope!==scope){await api('auth/logout','POST',{},r.csrf);throw new Error('Use the correct portal for this account.')}
   if(scope==='TENANT'&&isHrPortalHost()&&r.user.role==='EMPLOYEE'){await api('auth/logout','POST',{},r.csrf).catch(()=>{});clearLocalSessionState();window.location.replace(portalLoginUrl('EMPLOYEE',companyCode,email));return;}
   if(scope==='TENANT'&&isEmployeePortalHost()&&r.user.role!=='EMPLOYEE'){await api('auth/logout','POST',{},r.csrf).catch(()=>{});clearLocalSessionState();window.location.replace(portalLoginUrl('HR',companyCode,email));return;}
   if(isEmployeeNativeApp()&&r.user.role!=='EMPLOYEE'){await api('auth/logout','POST',{},r.csrf).catch(()=>{});clearLocalSessionState();throw new Error('This is the TCW Employee app. Sign in with your Employee account.')}try{window.localStorage.setItem('tcw_portal_scope',scope);window.sessionStorage.setItem(`tcw_active_window_${scope.toLowerCase()}`,'1');const key=`tcw_remember_${scope.toLowerCase()}`;if(remember)window.localStorage.setItem(key,JSON.stringify({companyCode:scope==='TENANT'?companyCode.trim().toUpperCase():'',email:email.trim()}));else window.localStorage.removeItem(key)}catch{}router.replace('/dashboard')}
 }catch(e:any){setError(e?.message??'Sign in failed. Please try again.')}finally{setBusy(false)}}
 const title=signup?'Create your company workspace':mode==='forgot-password'?'Forgot password':mode==='reset-password'?'Create password':'Sign in';
 const subtitle=signup?'Start your 3-day trial. We’ll email your company code and sign-in details.':mode==='login'?(scope==='PLATFORM'?'Use your TCW platform administrator credentials.':employeeApp?'Use your Company Code, Employee ID and password to access your personal attendance and self-service workspace.':'Welcome back. Sign in to your company workspace.'):mode==='forgot-password'?'Reset access to your TCW HR Software account.':mode==='reset-password'?'Create and confirm your new password. This one-time link expires after 10 minutes.':'Secure access to your TCW HR Software account.';
 const loginPath=scope==='PLATFORM'?'/admin-login':'/login';
 const forgotPath=scope==='PLATFORM'?'/admin-forgot-password':'/forgot-password';
 async function installApp(){const prompt=(window as any).__tcwInstallPrompt;if(prompt){await prompt.prompt();const choice=await prompt.userChoice;if(choice?.outcome==='accepted')(window as any).__tcwInstallPrompt=undefined;return;}const ios=/iPad|iPhone|iPod/.test(navigator.userAgent);window.alert(ios?'On iPhone/iPad: open this page in Safari, tap Share, then Add to Home Screen. Apple requires this manual step.':employeeApp?'Open the browser menu and choose Install TCW Employee / Install app. Chrome or Edge works best on computers.':'Open the browser menu and choose Install TCW HR Software / Install app. Chrome or Edge works best on computers.');}
 return <div className={'auth-refresh '+(signup?'entry-signup ':'')+(scope==='PLATFORM'?'entry-platform':'entry-tenant')} style={{'--primary':scope==='TENANT'?loginBrandColor:'#0369a1'} as React.CSSProperties}>
   <aside className="entry-side">
    <Link className="entry-brand" href={loginPath}><span className="entry-logo">{scope==='TENANT'?<img src={loginBrandLogo} alt={loginBrandName+' logo'} onError={e=>{e.currentTarget.src=TCW_PRODUCT_LOGO}}/>:<BrandLogo/>}</span><span><strong>{scope==='PLATFORM'?'Tech Cyber Warrior':loginBrandName}</strong><small>{scope==='PLATFORM'?'TCW HR SOFTWARE · SUPER ADMIN':employeeApp?'EMPLOYEE SELF SERVICE':'HR & ADMIN PORTAL'}</small></span></Link>
    <div className="entry-copy"><span className="entry-kicker"><i/>{scope==='PLATFORM'?'PLATFORM ADMINISTRATION':employeeApp?'EMPLOYEE SELF SERVICE':'YOUR PEOPLE. YOUR WORKSPACE.'}</span>
     <h1>{scope==='PLATFORM'?<>A clear view.<br/><em>Better control.</em></>:employeeApp?<>Your workday.<br/><em>Made simpler.</em></>:<>Great teams start<br/>with <em>better HR.</em></>}</h1>
     <p>{scope==='PLATFORM'?'Manage companies, subscriptions and support from one connected platform.':employeeApp?'Attendance, time off, payslips and your profile—everything you need for the day ahead.':'Bring your people, attendance and payroll together. Less everyday admin. More time for your team.'}</p>
     <div className="entry-preview" aria-hidden="true"><div className="entry-preview-header"><span><span className="entry-preview-mark"><LayoutDashboard size={17}/></span>Your workspace</span><small>PRODUCT PREVIEW</small></div><div className="entry-preview-title">Everything in one place<span>Built around your workday</span></div><div className="entry-preview-modules">{(scope==='PLATFORM'?[[Building2,'Companies'],[CreditCard,'Billing'],[Headphones,'Support']]:[[Users,'People'],[Clock3,'Attendance'],[Wallet,'Payroll']]).map(([Icon,label]:any)=><div key={label}><Icon size={21}/><span>{label}</span></div>)}</div><div className="entry-preview-row"><span className="entry-preview-avatar">TC</span><div><strong>A connected team</strong><small>One organized workspace</small></div><CheckCircle2 size={21}/></div></div>
     <div className="entry-benefits"><span><CheckCircle2 size={16}/>Clear daily workflows</span><span><ShieldCheck size={16}/>Access by role</span><span><Monitor size={16}/>Desktop & mobile</span></div>
    </div>
    <div className="entry-side-foot"><span>{scope==='PLATFORM'?'Secure platform administration':employeeApp?'Secure employee workspace':'Secure workspace'}</span><span>{scope==='PLATFORM'?'Tech Cyber Warrior':employeeApp?'TCW Employee':'TCW HR Software'}</span></div>
   </aside>
   <main className="entry-main"><div className="entry-card">
    <div className="entry-mobile-brand"><span className="entry-logo">{scope==='TENANT'?<img src={loginBrandLogo} alt={loginBrandName+' logo'} onError={e=>{e.currentTarget.src=TCW_PRODUCT_LOGO}}/>:<BrandLogo alt="TCW HR Software"/>}</span><span><strong>{scope==='PLATFORM'?'TCW HR Software':loginBrandName}</strong><small>{scope==='PLATFORM'?'SUPER ADMIN':employeeApp?'EMPLOYEE SELF SERVICE':'HR & ADMIN PORTAL'}</small></span></div>
    <div className="entry-head"><span className="entry-badge">{scope==='PLATFORM'?'SECURE LOGIN':signup?'HR ADMIN SIGNUP':employeeApp?'EMPLOYEE APP':'COMPANY PORTAL'}</span><span className="entry-secure"><LockKeyhole size={14}/> Secure access</span></div>
    <h2>{title}</h2><p className="entry-subtitle">{subtitle}</p>
    {resetChecking?<section className="reset-success-panel"><span className="auth-spinner"/><h3>Checking reset link</h3><p>Please wait while we securely open this one-time password link.</p></section>:mode==='reset-password'&&!resetReady&&!message?<section className="reset-success-panel"><span className="reset-success-icon"><LockKeyhole size={24}/></span><h3>Link unavailable</h3><p>{error||'This reset link is invalid, expired, or has already been used.'}</p><Link className="btn primary" href={forgotPath}>Request a new link <ArrowRight size={16}/></Link></section>:message?(created?<section className="trial-success-panel"><div className="trial-success-head"><span className="trial-success-icon"><ShieldCheck size={22}/></span><div><small>TRIAL WORKSPACE READY</small><h3>Check your email for login details</h3><p>Your Company Code, User ID and temporary password were sent to <strong>{email}</strong>.</p></div></div><div className="signup-email-delivery"><ShieldCheck size={18}/><div><strong>Credentials sent securely by email</strong><small>Check Inbox and Spam/Junk. Use the temporary password once, then create your private password.</small></div></div><div className="signup-created-actions"><button className="btn primary" type="button" onClick={()=>router.push('/login')}>Continue to sign in <ArrowRight size={16}/></button></div></section>:mode==='forgot-password'?<section className="reset-success-panel"><span className="reset-success-icon"><ShieldCheck size={24}/></span><h3>Check your email</h3><p>If the details match an account, a reset link has been sent to your email.</p><Link className="btn primary" href={loginPath}>Back to sign in <ArrowRight size={16}/></Link></section>:mode==='reset-password'?<section className="reset-success-panel"><span className="reset-success-icon"><ShieldCheck size={24}/></span><h3>Password created</h3><p>Your reset link has been consumed and cannot be used again. Sign in with your new password.</p><Link className="btn primary" href={loginPath}>Go to sign in <ArrowRight size={16}/></Link></section>:<div className="notice success-notice">{message}{!signup&&<Link href={loginPath}>Back to sign in</Link>}</div>):
    <form onSubmit={submit} className="entry-form" aria-label={signup?'Company signup':mode==='login'?'Account sign in':'Account recovery'}>{signup?<><div className="entry-section-heading"><Building2 size={17}/><span>Company & administrator</span></div><div className="entry-signup-grid"><label>Company name<input required value={companyName} onChange={e=>setCompanyName(e.target.value)} autoComplete="organization" placeholder="Your company name"/></label><label>HR admin name<input required value={ownerName} onChange={e=>setOwnerName(e.target.value)} autoComplete="name" placeholder="HR admin full name"/></label><label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" placeholder="name@example.com"/></label><label>Mobile number<input required minLength={7} maxLength={30} value={phone} onChange={e=>setPhone(e.target.value)} autoComplete="tel" inputMode="tel" placeholder="+91 9876543210"/></label></div><div className="entry-section-heading"><Layers size={17}/><span>Your trial workspace</span><small>3 days</small></div><label>Trial plan<select aria-label="Trial plan" value={plan} onChange={e=>setPlan(e.target.value)}><option value="STARTER">Starter</option><option value="GROWTH">Growth</option><option value="ENTERPRISE">Enterprise</option></select></label><div className="notice compact-notice signup-short-note"><ShieldCheck size={17}/><p>Your first HR Admin account, TCW User ID and temporary password will be created securely for sign-in.</p></div><label className="entry-terms-check"><input type="checkbox" checked={terms} onChange={e=>setTerms(e.target.checked)}/><span>I agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy notice</Link>.</span></label><label className="entry-terms-check"><input type="checkbox" checked={contactConsent} onChange={e=>setContactConsent(e.target.checked)}/><span>I agree that TCW HR Software may contact me by phone or email about this trial.</span></label>{error&&<div className="entry-error" role="alert">{error}</div>}<button className="btn primary entry-submit" disabled={busy}>{busy?'Creating workspace…':'Create trial workspace'}<ArrowRight size={17}/></button></>:<>{scope==='TENANT'&&mode!=='reset-password'&&<label>{employeeApp?'Company Code':'Company Code'}<span className="entry-field-control"><Building2 size={18}/><input name="companyCode" required value={companyCode} onChange={e=>setCompanyCode(e.target.value.toUpperCase())} autoComplete="organization" placeholder="Example: TCW-123456"/></span>{employeeApp&&mode==='login'&&<small className="entry-field-hint">Your HR team provides this company code.</small>}</label>}{mode!=='reset-password'&&<label>{mode==='forgot-password'?(employeeApp?'Registered employee email':'Email address'):(employeeApp?'Employee ID / Employee Code':'User ID or email')}<span className="entry-field-control"><UserRound size={18}/><input type={mode==='forgot-password'?'email':'text'} name="username" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder={mode==='forgot-password'?'name@example.com':scope==='PLATFORM'?'TCW-ADMIN':employeeApp?'EMP-001':'TCW2104'}/></span>{employeeApp&&mode==='login'&&<small className="entry-field-hint">Use the Employee Code shown in your HR employee profile.</small>}</label>}{mode!=='forgot-password'&&<label>{mode==='reset-password'?'Create password':'Password'}<span className="entry-password-control"><LockKeyhole size={18}/><input type={showPassword?'text':'password'} name="password" required minLength={mode==='reset-password'?8:undefined} maxLength={128} autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password"/><button type="button" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?'Hide password':'Show password'} title={showPassword?'Hide password':'Show password'}>{showPassword?<EyeOff size={19}/>:<Eye size={19}/>}</button></span></label>}{mode==='reset-password'&&<label>Confirm password<input type="password" name="confirmPassword" required minLength={8} maxLength={128} autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Re-enter your new password"/></label>}{mode==='login'&&<div className="entry-options"><label className="entry-remember"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/><span>Remember me</span></label><Link className="entry-forgot-link" href={forgotPath}>Forgot password?</Link></div>}{error&&<div className="entry-error" role="alert">{error}</div>}{mode==='login'&&twoFactorRequired&&<label>Authenticator or recovery code<input name="twoFactorCode" required autoComplete="one-time-code" value={twoFactorCode} onChange={e=>setTwoFactorCode(e.target.value)} placeholder="6-digit code or recovery code"/><small>Use your authenticator app or one saved recovery code.</small></label>}<button className="btn primary entry-submit" disabled={busy}>{busy?(mode==='login'?'Signing in securely…':mode==='forgot-password'?'Sending reset link…':'Creating password…'):mode==='login'?'Sign in':mode==='forgot-password'?'Send reset link':'Create password'}<ArrowRight size={17}/></button>{mode!=='login'&&<Link className="back-login" href={loginPath}>Back to sign in</Link>}</>}</form>}
    {scope==='TENANT'&&mode==='login'&&!employeeApp&&<div className="entry-signup-link"><span>New company?</span><Link href="/signup">Start a 3-day trial <ArrowRight size={14}/></Link></div>}
    {signup&&<div className="entry-signup-link"><span>Already have a workspace?</span><Link href={loginPath}>Sign in <ArrowRight size={14}/></Link></div>}
    <nav className="entry-legal" aria-label="Account and legal links"><div className="entry-legal-row"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link>{scope==='TENANT'&&<button type="button" className="entry-install-link" onClick={installApp}>Install app</button>}<a className="entry-company-link" href="https://techcyberwarrior.in" target="_blank" rel="noreferrer">Tech Cyber Warrior</a></div></nav>
   </div></main>
 </div>;
}
