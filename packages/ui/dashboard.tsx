'use client';
import React,{useEffect,useState} from 'react';
import Link from 'next/link';
import {Users,UserCheck,Clock3,CalendarDays,ArrowUpRight,Plus,Briefcase,Building2,Wallet,TrendingUp,ChevronRight,Sparkles,RefreshCw,Server,Headphones,Bell,AlertTriangle,CircleDollarSign,Activity as ActivityIcon,PhoneCall,Receipt,CreditCard,Camera,Menu,Home} from 'lucide-react';
import {useApp,useData,api,Loading,Failure,PageTitle,Stat,Avatar,Badge,Empty,BrandLogo,currencyValue,displayDate} from './core';
import {Row,readable} from './config';
import {HROverview} from './hr-overview';
import {FaceScanAttendanceModal} from './face';
import {attendanceDurationSeconds,attendanceLiveBreakState,attendanceLiveBreakUsage} from './attendance-format';
function useTimeGreeting(timeZone?:string){
 const[greeting,setGreeting]=useState('GOOD MORNING');
 useEffect(()=>{
  const update=()=>{
   let hour=new Date().getHours();
   if(timeZone)try{hour=Number(new Intl.DateTimeFormat('en-US',{hour:'2-digit',hourCycle:'h23',timeZone}).format(new Date()))}catch{}
   setGreeting(hour<12?'GOOD MORNING':hour<17?'GOOD AFTERNOON':'GOOD EVENING');
  };
  update();
  const timer=window.setInterval(update,60_000);
  return()=>window.clearInterval(timer);
 },[timeZone]);
 return greeting;
}

function DashboardAI(){
 const{session,can}=useApp();const status=useData('ai/status',can('ai'));const[answer,setAnswer]=useState(''),[busy,setBusy]=useState(false);
 if(!can('ai'))return null;
 async function generate(){setBusy(true);setAnswer('');try{const r=await api('ai','POST',{question:'Give me a concise HR morning brief. Highlight attendance exceptions, current leave activity, and anything that should be reviewed before payroll. Use only the provided facts.'},session.csrf);setAnswer(r.answer)}catch(e:any){setAnswer(e.message)}finally{setBusy(false)}}
 return <section className="panel dashboard-ai"><div className="dashboard-ai-head"><span className="ai-orb small"><Sparkles size={19}/></span><div><h2>AI morning brief</h2><p>On-demand summary of the HR facts available to your role.</p></div><Link href="/ai" className="text-button">Open assistant <ArrowUpRight size={15}/></Link></div>{status.isLoading?<Loading/>:status.data?.configured?<div className="dashboard-ai-body">{answer?<p>{answer}</p>:<div><strong>Ready when you are.</strong><span>Generate a concise review before you start approvals or payroll work.</span></div>}<button className="btn primary small" disabled={busy} onClick={generate}>{busy?<RefreshCw size={16} className="spin"/>:<Sparkles size={16}/>} {busy?'Generating…':answer?'Refresh brief':'Generate brief'}</button></div>:<div className="dashboard-ai-body muted-ai"><div><strong>AI setup required</strong><span>Enhanced AI is not enabled for this workspace. Core HR tools and reports remain available.</span></div></div>}</section>;
}
function LiveClock({timezone}:{timezone?:string}){
 const[now,setNow]=useState(()=>new Date());
 useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),30000);return()=>clearInterval(timer)},[]);
 const time=now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:timezone??'Asia/Kolkata'});
 const date=now.toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric',timeZone:timezone??'Asia/Kolkata'});
 return <div className="digital-clock"><span>{date}</span><strong>{time}</strong></div>;
}
function dashboardHolidayEvents(){const year=new Date().getFullYear(),next=year+1,fixed=[['01-01','New Year'],['01-14','Makar Sankranti'],['01-26','Republic Day'],['03-08','International Women’s Day'],['04-14','Dr. Ambedkar Jayanti'],['05-01','Gujarat Foundation Day'],['08-15','Independence Day'],['10-02','Gandhi Jayanti'],['10-31','Sardar Patel Jayanti'],['12-25','Christmas']];return [year,next].flatMap(y=>fixed.map(([md,title])=>({id:`festival-${y}-${md}`,title,date:`${y}-${md}`,kind:'HOLIDAY'})))}
function mergeUpcomingEvents(events:Row[]=[]){const today=new Date().toISOString().slice(0,10),all=[...events,...dashboardHolidayEvents().filter(f=>!events.some(e=>String(e.date).slice(0,10)===f.date&&String(e.title).toLowerCase()===f.title.toLowerCase()))];return all.filter(e=>String(e.date).slice(0,10)>=today).sort((a,b)=>String(a.date).localeCompare(String(b.date)))}
function MobilePlatformDashboard({session,companies,trials,trialSummary,paid,outstanding,openTickets,currency,support}:{session:any;companies:Row[];trials:number;trialSummary:Row;paid:number;outstanding:number;openTickets:number;currency:string;support:Row[]}){
 const active=companies.filter(c=>c.status==='ACTIVE').length;
 const firstName=String(session.user.name??'Admin').split(' ')[0];
 const greeting=useTimeGreeting('Asia/Kolkata');
 return <section className="platform-mobile-dashboard">
  <div className="mobile-unified-hero mobile-unified-hero-platform">
   <div className="mobile-unified-brand"><span className="mobile-unified-logo"><BrandLogo alt="TCW HR Software"/></span><div className="mobile-unified-brand-copy"><strong>TCW HR Software</strong><small>Super Admin</small></div><div className="mobile-hero-actions"><Link href="/notifications" className="mobile-unified-action" aria-label="Notifications"><Bell size={19}/><i>3</i></Link><Link href="/settings" className="mobile-unified-action" aria-label="Menu"><Menu size={20}/></Link></div></div>
   <div className="mobile-unified-user"><Avatar name={session.user.name} src={session.user.avatar}/><div><small>{greeting} 👋</small><strong>{firstName}!</strong><span>Platform Administrator</span></div><div className="mobile-hero-date"><span>{new Date().toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})}</span><strong>☀️ 26°C</strong><small>Ahmedabad</small></div></div>
  </div>
  <Link href="/companies" className="mobile-business-banner"><div><strong>Manage Your<br/>Business Smarter</strong><small>All-in-One HR Management Platform</small></div><TrendingUp size={52}/><ChevronRight size={20}/></Link>
  <div className="platform-mobile-stats">
   <Link href="/companies"><span className="mobile-stat-icon blue"><Building2 size={19}/></span><strong>{companies.length}</strong><small>Companies · {active} active</small></Link>
   <Link href="/trials"><span className="mobile-stat-icon violet"><PhoneCall size={19}/></span><strong>{trialSummary.callDue??0}</strong><small>Trial calls due</small></Link>
   <Link href="/invoices"><span className="mobile-stat-icon green"><CircleDollarSign size={19}/></span><strong>{currencyValue(paid,currency)}</strong><small>Payments received</small></Link>
   <Link href="/support"><span className="mobile-stat-icon amber"><Headphones size={19}/></span><strong>{openTickets}</strong><small>Open support</small></Link>
  </div>
  <section className="mobile-app-section"><div className="mobile-app-section-head"><strong>Quick Actions</strong><span>Platform</span></div><div className="mobile-quick-grid">
   <Link href="/companies" className="mobile-quick-action"><span className="mobile-quick-icon blue"><Building2 size={23}/></span><strong>Companies</strong><small>Customers</small></Link>
   <Link href="/trials" className="mobile-quick-action"><span className="mobile-quick-icon violet"><PhoneCall size={23}/></span><strong>Trials</strong><small>Follow-ups</small></Link>
   <Link href="/invoices" className="mobile-quick-action"><span className="mobile-quick-icon green"><Receipt size={23}/></span><strong>Invoices</strong><small>Billing</small></Link>
   <Link href="/payments" className="mobile-quick-action"><span className="mobile-quick-icon amber"><CreditCard size={23}/></span><strong>Payments</strong><small>Revenue</small></Link>
   <Link href="/support" className="mobile-quick-action"><span className="mobile-quick-icon blue"><Headphones size={23}/></span><strong>Support</strong><small>Tickets</small></Link>
   <Link href="/system" className="mobile-quick-action"><span className="mobile-quick-icon violet"><Server size={23}/></span><strong>System</strong><small>Health</small></Link>
  </div></section>
  <section className="mobile-app-section mobile-updates"><div className="mobile-app-section-head"><strong>Platform Updates</strong><Link href="/support">See All</Link></div>
   <Link href="/invoices" className="mobile-update-row"><span className="mobile-update-icon green"><CircleDollarSign size={18}/></span><div><strong>{currencyValue(outstanding,currency)} outstanding</strong><small>Review billing and invoices</small></div><ChevronRight size={17}/></Link>
   <Link href="/trials" className="mobile-update-row"><span className="mobile-update-icon violet"><PhoneCall size={18}/></span><div><strong>{trials} companies on trial</strong><small>{trialSummary.expiringSoon??0} expiring soon</small></div><ChevronRight size={17}/></Link>
   <Link href="/support" className="mobile-update-row"><span className="mobile-update-icon amber"><Headphones size={18}/></span><div><strong>{openTickets} open support ticket{openTickets===1?'':'s'}</strong><small>{support.filter(r=>r.priority==='URGENT'&&r.status!=='RESOLVED').length} urgent</small></div><ChevronRight size={17}/></Link>
  </section>
 </section>;
}


function WorkingTimer({since,baseMinutes=0}:{since?:string|null;baseMinutes?:number}){
 const[now,setNow]=useState(()=>Date.now());
 useEffect(()=>{if(!since)return;const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer)},[since]);
 const sessionSeconds=since?Math.max(0,Math.floor((now-new Date(since).getTime())/1000)):0,total=Math.max(0,Math.floor(baseMinutes*60+sessionSeconds)),h=Math.floor(total/3600),m=Math.floor(total%3600/60),s=total%60;
 return <>{String(h).padStart(2,'0')}:{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}</>;
}

function EmployeeDashboard({session,currency,d,calendarEvents,onRefresh}:{session:any;currency:string;d:Row;calendarEvents?:Row[];onRefresh:()=>void}){
 const[faceOpen,setFaceOpen]=useState(false),[faceIntent,setFaceIntent]=useState<'IN'|'OUT'>('IN'),[livePunch,setLivePunch]=useState<Row|null>(null);const employee:Row=d.employees?.[0]??{},attendance:Row[]=d.attendance??[],leave:Row[]=d.leave??[],events:Row[]=mergeUpcomingEvents(calendarEvents??d.events??[]);
 const timezone=d.company?.timezone??'Asia/Kolkata';
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const previousDay=new Date(Date.parse(today)-86400000).toISOString().slice(0,10),attendanceQ=useData(`attendance?from=${previousDay}&to=${today}&employeeId=${employee.id??''}`,!!employee.id,15000);
 const[now,setNow]=useState(Date.now());useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[]);
 const liveRecord=(attendanceQ.data?.items??[]).find((r:Row)=>r.employeeId===employee.id&&(String(r.date).slice(0,10)===today||new Date(r.shiftEndTime??0).getTime()>now));
 const serverTodayRecord=liveRecord??attendance.find(r=>String(r.date).slice(0,10)===today);
 const todayRecord=livePunch?{...(serverTodayRecord??{}),...(livePunch.punchType==='IN'?{firstIn:livePunch.firstIn??livePunch.punchTime,lastOut:null,status:livePunch.status??serverTodayRecord?.status??'PRESENT'}:{firstIn:livePunch.firstIn??serverTodayRecord?.firstIn,lastOut:livePunch.lastOut??livePunch.punchTime,status:livePunch.status??serverTodayRecord?.status??'PRESENT',workMinutes:livePunch.workMinutes??serverTodayRecord?.workMinutes??0})}:serverTodayRecord;
 const latestPunch:Row|null=d.latestPunch??null;
 const latestPunchDay=latestPunch?.punchTime?new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(latestPunch.punchTime)):'';
 const persistedPunch=latestPunchDay===today?latestPunch:null,currentPunch=livePunch??persistedPunch;
 useEffect(()=>{if(!livePunch||!latestPunch?.punchTime)return;const sameType=latestPunch.punchType===livePunch.punchType,sameTime=Math.abs(new Date(latestPunch.punchTime).getTime()-new Date(livePunch.punchTime).getTime())<5000;if(sameType&&sameTime)setLivePunch(null)},[livePunch,latestPunch?.punchType,latestPunch?.punchTime]);
 const pending=leave.filter(r=>r.status==='PENDING');
 const approvedUpcoming=leave.filter(r=>r.status==='APPROVED'&&String(r.endDate).slice(0,10)>=today).sort((a,b)=>String(a.startDate).localeCompare(String(b.startDate)));
 const approvedLeaveToday=approvedUpcoming.find(r=>String(r.startDate).slice(0,10)<=today&&String(r.endDate).slice(0,10)>=today);
 const fullDayLeaveToday=!!approvedLeaveToday&&Number(approvedLeaveToday.days)!==0.5;
 const leaveDayType=['PAID_LEAVE','UNPAID_LEAVE'].includes(String(todayRecord?.dayType??''))?String(todayRecord?.dayType??'APPROVED'):'APPROVED';
 const payslip:Row|null=d.payroll??null;
 const firstName=String(session.user.name??employee.firstName??'Employee').split(' ')[0];
 const greeting=useTimeGreeting(timezone);
 const working=!fullDayLeaveToday&&(!livePunch&&typeof liveRecord?.workingNow==='boolean'?liveRecord.workingNow:currentPunch?.punchType?currentPunch.punchType==='IN':!!todayRecord?.firstIn&&!todayRecord?.lastOut);
 const breakState=!livePunch&&liveRecord?(attendanceLiveBreakState(liveRecord,now)??(['BREAK','OVER_BREAK'].includes(liveRecord.liveState)?liveRecord.liveState:null)):null,onBreak=!!breakState,breakUsage=liveRecord?attendanceLiveBreakUsage(liveRecord,now):null;
 const completed=!fullDayLeaveToday&&!onBreak&&!working&&!!todayRecord?.firstIn&&(currentPunch?.punchType==='OUT'||!!todayRecord?.lastOut);
 const workingSince=working?(currentPunch?.punchType==='IN'?currentPunch.punchTime:todayRecord?.firstIn):null;
 const attendanceLabel=fullDayLeaveToday?(leaveDayType==='APPROVED'?'On leave':readable(leaveDayType.toLowerCase())):onBreak?(breakState==='OVER_BREAK'?'Over Break':'Break'):working?'Working':completed?'Checked out':todayRecord?readable(String(todayRecord.status??'').toLowerCase()):'Not checked in';
 const quick=[
  {href:'/leave',title:'Time off',sub:fullDayLeaveToday?'On leave today':pending.length?pending.length+' pending':'Apply leave',icon:<CalendarDays size={21}/>},
  {href:'/payroll',title:'Payslips',sub:payslip?.run?.month??'Salary records',icon:<Wallet size={21}/>},
  {href:'/expenses',title:'Expenses',sub:'Submit claim',icon:<Receipt size={21}/>},
  {href:'/calendar',title:'Calendar',sub:events.length?events.length+' upcoming':'Company events',icon:<CalendarDays size={21}/>}
 ];
 return <div className="employee-home-dashboard">
  <section className="employee-home-hero">
   <div className="employee-home-person"><Avatar name={session.user.name} src={session.user.avatar||employee.photo}/><div><span>{greeting}</span><h1>{firstName}</h1><p>{employee.designation||'Employee'}{employee.departmentName?' · '+employee.departmentName:''}</p></div></div>
   <button className="employee-home-face-button" type="button" disabled={fullDayLeaveToday} onClick={()=>{setFaceIntent(working?'OUT':'IN');setFaceOpen(true)}}><UserCheck size={22}/><span><strong>{fullDayLeaveToday?'On leave':working?'Check OUT':'Check IN'}</strong><small>{fullDayLeaveToday?'Approved leave today':working?'Record exact OUT time':'Start work timer now'}</small></span><ChevronRight size={18}/></button>
  </section>

  <section className={'employee-work-status '+(fullDayLeaveToday?'leave':working?'working':completed?'complete':'idle')}>
   <div className="employee-work-status-main"><span className="employee-work-dot"/><div><small>TODAY</small><strong>{attendanceLabel}</strong><em>{fullDayLeaveToday?'HR-approved leave is active today.':workingSince?'Started '+new Date(workingSince).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:timezone}):todayRecord?.firstIn?'Started '+new Date(todayRecord.firstIn).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:timezone}):'Scan your face to start work'}</em></div></div>
   <div className="employee-work-clock">{fullDayLeaveToday?<><small>TIME OFF</small><strong>On leave</strong></>:onBreak?<><small>{breakState==='OVER_BREAK'?'OVER BREAK':'BREAK · LIVE'}</small><strong>{attendanceDurationSeconds(breakState==='OVER_BREAK'?breakUsage?.overBreakSeconds:breakUsage?.breakSeconds)}</strong></>:working?<><small>WORKED TODAY · LIVE</small><strong><WorkingTimer since={workingSince} baseMinutes={Number(todayRecord?.workMinutes??0)}/></strong></>:completed?<><small>WORKED TODAY</small><strong>{Math.floor(Number(todayRecord?.workMinutes??0)/60)}h {Number(todayRecord?.workMinutes??0)%60}m</strong></>:<LiveClock timezone={timezone}/>}</div>
   <button type="button" className="btn primary" disabled={fullDayLeaveToday||working} onClick={()=>{setFaceIntent('IN');setFaceOpen(true)}}><Camera size={18}/>{fullDayLeaveToday?'Leave active':'Check IN'}</button><button type="button" className="btn secondary" disabled={fullDayLeaveToday||!working} onClick={()=>{setFaceIntent('OUT');setFaceOpen(true)}}><Camera size={18}/>Check OUT</button>
  </section>

  <div className="employee-home-quick">{quick.map(item=><Link href={item.href} key={item.href}><span>{item.icon}</span><div><strong>{item.title}</strong><small>{item.sub}</small></div><ChevronRight size={17}/></Link>)}</div>

  <div className="employee-home-grid">
   <section className="employee-home-card"><div className="employee-home-card-head"><div><small>ATTENDANCE</small><h2>Recent days</h2></div><Link href="/attendance">View all <ArrowUpRight size={15}/></Link></div>{attendance.length?<div className="employee-attendance-list">{[...attendance].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,5).map(r=>{const isToday=String(r.date).slice(0,10)===today;return <div key={r.id}><span><strong>{displayDate(r.date)}</strong><small>{r.firstIn?new Date(r.firstIn).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:timezone}):'—'} → {isToday&&fullDayLeaveToday?'On leave':isToday&&working?'Working':r.lastOut?new Date(r.lastOut).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:timezone}):'—'}</small></span><Badge value={isToday&&fullDayLeaveToday?leaveDayType:isToday&&onBreak?breakState:isToday&&working?'WORKING':r.firstIn&&!r.lastOut?'WORKING':r.status}/></div>})}</div>:<Empty title="No attendance yet" description="Your attendance will appear here after the first Face Scan."/>}</section>
   <section className="employee-home-card"><div className="employee-home-card-head"><div><small>YOUR DAY</small><h2>What’s next</h2></div></div><div className="employee-home-next"><div><span><CalendarDays size={18}/></span><div><strong>{approvedUpcoming.length?'Approved time off':'No upcoming leave'}</strong><small>{approvedUpcoming.length?displayDate(approvedUpcoming[0].startDate):'You are scheduled to work normally.'}</small></div></div><div><span><Wallet size={18}/></span><div><strong>{payslip?currencyValue(payslip.net,currency):'Payslip not available'}</strong><small>{payslip?.run?.month?'Latest locked payslip · '+payslip.run.month:'Locked payslips will appear here.'}</small></div></div><div><span><CalendarDays size={18}/></span><div><strong>{events[0]?.title??'No company event'}</strong><small>{events[0]?.date?displayDate(events[0].date):'Nothing upcoming on the company calendar.'}</small></div></div></div></section>
  </div>

  {events.length>1&&<section className="employee-home-card employee-home-events"><div className="employee-home-card-head"><div><small>COMPANY CALENDAR</small><h2>Upcoming</h2></div><Link href="/calendar">Open calendar <ArrowUpRight size={15}/></Link></div><div>{events.slice(0,4).map((e:Row)=><Link href="/calendar" key={e.id}><div className="event-date"><small>{new Date(e.date).toLocaleDateString('en',{month:'short'})}</small><strong>{new Date(e.date).getUTCDate()}</strong></div><span><strong>{e.title}</strong><small>{readable(String(e.kind??'HR_EVENT').toLowerCase())}</small></span><ChevronRight size={16}/></Link>)}</div></section>}
  {faceOpen&&!fullDayLeaveToday&&<FaceScanAttendanceModal intent={faceIntent} onClose={()=>setFaceOpen(false)} onComplete={async result=>{if(result)setLivePunch(result);await onRefresh();await attendanceQ.refetch();setLivePunch(null)}}/>}
 </div>;
}

export function Dashboard(){
 const{session,can,currency}=useApp();const q=useData('dashboard');const calendarQ=useData('calendar?pageSize=500',can('calendar'));
 const dashboardTimezone=q.data?.company?.timezone??'Asia/Kolkata';
 const dashboardGreeting=useTimeGreeting(dashboardTimezone);
 if(q.isLoading)return <Loading/>;if(q.error)return <Failure error={q.error} retry={()=>q.refetch()}/>;
 const d=q.data!;
 if(session.user.scope==='PLATFORM'){
  const companies:Row[]=d.companies??[],leads:Row[]=d.leads??[],invoices:Row[]=d.invoices??[],support:Row[]=d.support??[],trialRows:Row[]=d.trials??[],trialSummary:Row=d.trialSummary??{};
  const active=companies.filter(c=>c.status==='ACTIVE').length,trials=companies.filter(c=>c.status==='TRIAL').length,suspended=companies.filter(c=>['SUSPENDED','EXPIRED'].includes(c.status)).length;
  const paid=invoices.reduce((n,r)=>n+(r.paidAmount??0),0),outstanding=invoices.reduce((n,r)=>n+Math.max(0,(r.total??0)-(r.paidAmount??0)),0),openTickets=support.filter(r=>r.status!=='RESOLVED').length;
  const weekAgo=Date.now()-7*86400000,newSignups=companies.filter(c=>new Date(c.createdAt).getTime()>=weekAgo).length;
  return <>
   <MobilePlatformDashboard session={session} companies={companies} trials={trials} trialSummary={trialSummary} paid={paid} outstanding={outstanding} openTickets={openTickets} currency={currency} support={support}/>
   <div className="platform-desktop-dashboard">
   <div className="platform-hero"><div className="platform-hero-user"><Avatar name={session.user.name} src={session.user.avatar}/><div><span className="hero-kicker">TCW PLATFORM COMMAND CENTER</span><h1>Welcome back, {session.user.name.split(' ')[0]}!</h1><p>Here’s what’s happening across your TCW HR platform today.</p></div></div><div className="platform-hero-pulse"><span className="pulse-dot"/><strong>{active} companies live</strong><small>{newSignups} new signup(s) in the last 7 days</small></div></div>
   <div className="stats four power-stats"><Stat label="Customer companies" value={companies.length} icon={<Building2 size={20}/>} detail={`${active} active · ${trials} trial`}/><Stat label="Trial calls due" value={trialSummary.callDue??0} icon={<PhoneCall size={20}/>} detail={`${trialSummary.expiringSoon??0} expiring within 2 days`}/><Stat label="Payments received" value={currencyValue(paid,currency)} icon={<CircleDollarSign size={20}/>} detail={`${currencyValue(outstanding,currency)} outstanding`}/><Stat label="Support pressure" value={openTickets} icon={<Headphones size={20}/>} detail={`${support.filter(r=>r.priority==='URGENT'&&r.status!=='RESOLVED').length} urgent ticket(s)`}/></div>
   <div className="dashboard-grid admin-command-grid"><section className="panel command-panel"><div className="panel-heading"><div><h2>Company portfolio</h2><p>Live tenant health and onboarding status</p></div>{can('tenants')&&<Link href="/companies">Manage all <ArrowUpRight size={16}/></Link>}</div><div className="portfolio-summary"><div><strong>{active}</strong><span>Active</span></div><div><strong>{trials}</strong><span>Trial</span></div><div><strong>{suspended}</strong><span>Attention</span></div></div>{companies.length?companies.slice(0,6).map(c=><div className="list-row premium-row" key={c.id}><Avatar name={c.name}/><div className="grow"><strong>{c.name}</strong><small>{c.code} · {c.plan} · {new Date(c.createdAt).toLocaleDateString('en-IN')}</small></div><Badge value={c.status}/></div>):<Empty title="No customer companies yet" description="Self-service signups and companies you create will appear here."/>}</section><section className="panel command-panel"><div className="panel-heading"><div><h2>Revenue & billing</h2><p>Collected and outstanding invoice value</p></div><Wallet size={19}/></div><div className="billing-hero"><span>Collected</span><strong>{currencyValue(paid,currency)}</strong><small>{invoices.filter(r=>r.status==='PAID').length} paid invoice(s)</small></div><div className="billing-bars"><div><span>Outstanding</span><strong>{currencyValue(outstanding,currency)}</strong></div><progress value={paid} max={Math.max(paid+outstanding,1)}/></div><Link href="/invoices" className="panel-bottom-link">Open billing workspace <ChevronRight size={16}/></Link></section></div>
   <div className="dashboard-grid three"><section className="panel"><div className="panel-heading"><div><h2>Trial follow-ups</h2><p>{trialSummary.callDue??0} call(s) due · {trialSummary.expiringSoon??0} expiring soon</p></div>{can('tenants')&&<Link href="/trials"><ArrowUpRight size={17}/><span className="sr-only">Open trial follow-up</span></Link>}</div>{trialRows.filter(r=>r.needsCall||r.tenantStatus==='TRIAL').slice(0,5).map(r=><Link className="list-row" href="/trials" key={r.id}><Avatar name={r.company}/><div className="grow"><strong>{r.company}</strong><small>{r.contactName||r.email} · {r.phone||'No mobile'} · ends {displayDate(r.trialEndsAt)}</small></div><Badge value={r.needsCall?'CALL_DUE':r.followupStatus}/></Link>)}{!trialRows.length&&<Empty title="No trial follow-ups" description="Free-trial registrations will appear here automatically."/>}<Link href="/trials" className="panel-bottom-link">Open trial follow-up <ChevronRight size={16}/></Link></section><section className="panel"><div className="panel-heading"><h2>Support queue</h2><Headphones size={18}/></div>{support.filter(r=>r.status!=='RESOLVED').slice(0,5).map(r=><Link className="list-row" href="/support" key={r.id}><span className={'priority-dot '+String(r.priority).toLowerCase()}/><div className="grow"><strong>{r.ticketNumber} · {r.subject}</strong><small>{readable(String(r.category??'GENERAL').toLowerCase())}</small></div><Badge value={r.status}/></Link>)}{!openTickets&&<Empty title="Support queue is clear" description="Customer tickets will appear here."/>}</section><section className="panel"><div className="panel-heading"><h2>Sales pipeline</h2><TrendingUp size={18}/></div><div className="department-list">{['LEAD','CONTACTED','DEMO','QUOTATION','NEGOTIATION','WON'].map(stage=>{const count=leads.filter(l=>l.stage===stage).length;return <div className="department-row" key={stage}><div><span>{readable(stage.toLowerCase())}</span><strong>{count}</strong></div><progress value={count} max={Math.max(leads.length,1)}/></div>})}</div></section></div>
   <Activity rows={d.activity??[]}/>
   </div>
  </>;
 }
 if(session.user.role==='EMPLOYEE')return <EmployeeDashboard session={session} currency={currency} d={d} calendarEvents={calendarQ.data?.items} onRefresh={()=>q.refetch()}/>;
 return <HROverview session={session} data={d} events={calendarQ.data?.items??d.events??[]} currency={currency} can={can} greeting={dashboardGreeting} clock={<LiveClock timezone={dashboardTimezone}/>} onRefresh={async()=>{await Promise.all([q.refetch(),...(can('calendar')?[calendarQ.refetch()]:[])])}}/>;
}
function Activity({rows}:{rows:Row[]}){return <section className="panel activity-panel"><div className="panel-heading"><h2>Recent activity</h2><span className="muted">Latest recorded changes</span></div>{rows.length?<div className="activity-list">{rows.slice(0,6).map(r=><div key={r.id}><span className="activity-marker"/><div><strong>{readable(r.action.toLowerCase())}</strong><small>{readable(r.entity)} · {new Date(r.createdAt).toLocaleString('en-IN')}</small></div></div>)}</div>:<p className="quiet-empty">Workspace changes will appear here as your team gets started.</p>}</section>}
