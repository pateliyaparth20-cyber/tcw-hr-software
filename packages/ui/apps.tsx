'use client';
import React,{useEffect,useMemo,useState} from 'react';
import {AppWindow,CheckCircle2,Download,ExternalLink,Globe2,Monitor,ShieldCheck,Smartphone,Wifi,WifiOff,ArrowRight,Building2,Clock3,Users,Wallet,Sparkles,Cloud,RefreshCw} from 'lucide-react';

function isStandalone(){return typeof window!=='undefined'&&(window.matchMedia('(display-mode: standalone)').matches||(navigator as any).standalone===true)}

export function AppsPage(){
 const[installable,setInstallable]=useState(false),[installed,setInstalled]=useState(false),[online,setOnline]=useState(true),[message,setMessage]=useState(''),[origin,setOrigin]=useState('');
 const androidUrl=process.env.NEXT_PUBLIC_ANDROID_APK_URL??'';
 const windowsUrl=process.env.NEXT_PUBLIC_WINDOWS_INSTALLER_URL??'';
 const ios=useMemo(()=>typeof navigator!=='undefined'&&/iPad|iPhone|iPod/.test(navigator.userAgent),[]);
 useEffect(()=>{
  setOrigin(window.location.origin);
  const refresh=()=>{setInstallable(!!window.__tcwInstallPrompt);setInstalled(isStandalone());setOnline(navigator.onLine)};
  refresh();window.addEventListener('tcw-install-available',refresh);window.addEventListener('tcw-app-installed',refresh);window.addEventListener('online',refresh);window.addEventListener('offline',refresh);
  return()=>{window.removeEventListener('tcw-install-available',refresh);window.removeEventListener('tcw-app-installed',refresh);window.removeEventListener('online',refresh);window.removeEventListener('offline',refresh)};
 },[]);
 async function install(){
  const prompt=window.__tcwInstallPrompt;
  if(!prompt){setMessage(ios?'On iPhone/iPad: Safari → Share → Add to Home Screen.':'Open your browser menu and choose “Install TCW HR Software” or “Install app”.');return;}
  await prompt.prompt();const result=await prompt.userChoice;window.__tcwInstallPrompt=undefined;setInstallable(false);if(result?.outcome==='accepted')setMessage('TCW HR Software is being installed on this device.');
 }
 const platforms=[
  {kind:'PWA',title:'Install Mobile / Browser App',desc:'The fastest option for Android, iPhone, Windows and laptops. No app-store account required.',icon:<AppWindow/>,className:'pwa',state:installed?'Installed':installable?'Ready now':'Browser install',action:<button className="btn primary app-download-action" onClick={install} disabled={installed}>{installed?<><CheckCircle2 size={17}/>Installed</>:<><Download size={17}/>{installable?'Install now':'How to install'}</>}</button>},
  {kind:'ANDROID',title:'Android App',desc:'Use your company account from Android. When a signed APK URL is connected, this card becomes a direct native download.',icon:<Smartphone/>,className:'android',state:androidUrl?'Android release ready':'Mobile access ready',action:androidUrl?<a className="btn primary app-download-action" href={androidUrl} download><Download size={17}/>Download APK</a>:<a className="btn secondary app-download-action" href="/login"><Smartphone size={17}/>Open mobile access</a>},
  {kind:'WINDOWS',title:'Windows App',desc:'Use the same secure HR workspace on Windows. A configured signed installer becomes the direct desktop download.',icon:<Monitor/>,className:'windows',state:windowsUrl?'Windows release ready':'Desktop access ready',action:windowsUrl?<a className="btn primary app-download-action" href={windowsUrl} download><Download size={17}/>Download EXE</a>:<a className="btn secondary app-download-action" href="/login"><Monitor size={17}/>Open desktop access</a>}
 ];
 return <div className="app-download-page app-download-v10 page-stage">
  <header className="download-site-header"><a className="download-brand" href="/login"><span className="download-brand-mark">TCW</span><span><strong>TCW HR Software</strong><small>Official Apps & Downloads</small></span></a><div className="download-header-actions"><span className={'app-network '+(online?'online':'offline')}>{online?<Wifi size={16}/>:<WifiOff size={16}/>} {online?'Online':'Offline'}</span><a className="btn secondary" href="/login">Open Login <ArrowRight size={16}/></a></div></header>

  <section className="download-hero"><div className="download-hero-copy"><span className="eyebrow">ONE HR PLATFORM • EVERY DEVICE</span><h1>Install TCW HR Software on mobile, browser or Windows.</h1><p>Use one company account across devices. Attendance, leave, payroll and HR records stay connected to the same secure server.</p><div className="download-hero-actions"><button className="btn primary" onClick={install}><Download size={18}/>{installed?'App installed':installable?'Install this device':'Install app'}</button><a className="btn secondary" href="/login">Sign in to HR <ArrowRight size={17}/></a></div><div className="download-trust-row"><span><ShieldCheck/>Secure company login</span><span><Cloud/>Single live database</span><span><RefreshCw/>Updates from the server</span></div></div><div className="download-hero-visual"><div className="device-stack"><div className="device-card laptop"><div className="device-bar"><i/><i/><i/></div><div className="device-screen"><div className="mini-sidebar"/><div className="mini-main"><b>HR Dashboard</b><span/><span/><div className="mini-kpis"><i/><i/><i/></div></div></div></div><div className="device-card phone"><div className="phone-notch"/><div className="phone-screen"><b>TCW HR</b><span/><span/><div className="phone-nav"><i/><i/><i/><i/></div></div></div></div></div></section>

  <section className="download-section-heading"><span className="eyebrow">CHOOSE YOUR APP</span><h2>One account. Three installation options.</h2><p>Choose the experience that fits your device. Web/PWA access works with the same company account, and configured native releases appear here automatically.</p></section>
  <div className="app-platform-grid download-platform-grid">{platforms.map(c=><section className={'panel app-platform-card '+c.className} key={c.kind}><div className="app-platform-top"><div className="app-platform-icon">{c.icon}</div><span className="app-platform-kind">{c.kind}</span></div><h2>{c.title}</h2><p>{c.desc}</p><div className="app-platform-state"><ShieldCheck size={16}/>{c.state}</div>{c.action}</section>)}</div>
  {message&&<div className="notice app-install-notice">{message}</div>}

  <section className="download-feature-band"><div><Users/><strong>Employee Management</strong><span>A-to-Z employee records</span></div><div><Clock3/><strong>Biometric Attendance</strong><span>BioMax PUSH attendance</span></div><div><Wallet/><strong>Payroll</strong><span>Attendance-to-payroll workflow</span></div><div><Building2/><strong>Multi-company</strong><span>Tenant-scoped data</span></div></section>

  <section className="download-two-column"><div className="panel download-how"><span className="eyebrow">HOW IT WORKS</span><h2>Install once. Use the same live account everywhere.</h2><ol><li><span>1</span><div><strong>Open this download page</strong><small>Use your phone, laptop or Windows computer.</small></div></li><li><span>2</span><div><strong>Choose your device experience</strong><small>Install the web app or use the connected Android and Windows release options.</small></div></li><li><span>3</span><div><strong>Sign in with company credentials</strong><small>Your company code, user ID and password work against the same server.</small></div></li></ol></div><div className="panel download-security"><Sparkles/><span className="eyebrow">PRODUCTION READY FLOW</span><h2>Downloads stay separate from company data.</h2><p>The app package contains the client interface. HR data remains on your TCW server, so updating the server keeps mobile and desktop users on the same controlled workflow.</p><div className="download-url-box"><span>Current web address</span><strong>{origin||'Your live HR domain'}</strong></div><p className="download-small-note">Keep every client pointed at your production HTTPS HR URL for one consistent company workspace.</p></div></section>

  <section className="panel app-mobile-note"><div><Globe2 size={24}/><div><h2>Works across phones and laptops</h2><p>The HR portal adapts navigation, forms, tables, dialogs and touch targets for mobile. BioMax devices continue sending attendance to the server; the phone app does not store face or fingerprint templates.</p></div></div><div className="app-install-points"><span><CheckCircle2/>Responsive employee screens</span><span><CheckCircle2/>Touch-friendly attendance</span><span><CheckCircle2/>Secure company login</span><span><CheckCircle2/>PWA install support</span></div></section>

  <footer className="download-site-footer"><div><strong>TCW HR Software</strong><span>Official Apps & Downloads</span></div><div><a href="/login">Login</a><a href="/forgot-password">Reset password</a><a href="/downloads">Downloads</a></div></footer>
 </div>;
}
