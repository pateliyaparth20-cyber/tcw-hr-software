'use client';
import React,{useEffect,useState} from 'react';
import Link from 'next/link';
import {Users,UserCheck,Clock3,CalendarDays,ArrowUpRight,Plus,Briefcase,Building2,Wallet,TrendingUp,ChevronRight,Sparkles,RefreshCw,Server,Headphones,Bell,AlertTriangle,CircleDollarSign,Activity as ActivityIcon,PhoneCall,Receipt,CreditCard,Camera} from 'lucide-react';
import {useApp,useData,api,Loading,Failure,PageTitle,Stat,Avatar,Badge,Empty,BrandLogo,currencyValue,displayDate} from './core';
import {Row,readable} from './config';
import {FaceScanAttendanceModal} from './face';
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

function Trend({attendance}:{attendance:Row[]}){
 const days=Array.from({length:7},(_,i)=>new Date(Date.now()-(6-i)*86400000).toISOString().slice(0,10));
 const values=days.map(d=>attendance.filter(r=>r.date.startsWith(d)&&r.status==='PRESENT').length);
 const max=Math.max(...values,1);const points=values.map((v,i)=>`${42+i*88},${170-v/max*125}`).join(' ');
 return <div className="trend-chart"><svg viewBox="0 0 610 215" role="img" aria-label="Present employee count over the last seven days"><defs><linearGradient id="attendance-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3874f6" stopOpacity=".2"/><stop offset="100%" stopColor="#3874f6" stopOpacity="0"/></linearGradient></defs>{[0,.25,.5,.75,1].map(v=><g key={v}><line x1="42" x2="575" y1={170-v*125} y2={170-v*125} stroke="#eaf0f6" strokeDasharray="4 5"/><text x="26" y={175-v*125} textAnchor="end" fill="#8090a7" fontSize="12">{Math.round(max*v)}</text></g>)}<polygon points={`42,170 ${points} 570,170`} fill="url(#attendance-fill)"/><polyline points={points} fill="none" stroke="#3977f4" strokeWidth="3" strokeLinejoin="round"/>{values.map((v,i)=><g key={i}><circle cx={42+i*88} cy={170-v/max*125} r="4" fill="#fff" stroke="#3977f4" strokeWidth="2"/><text x={42+i*88} y="204" textAnchor="middle" fill="#7a879c" fontSize="12">{new Date(days[i]).toLocaleDateString('en',{weekday:'short'})}</text></g>)}</svg></div>;
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
function DigitalMetric({label,value,detail,icon,tone='blue'}:{label:string;value:React.ReactNode;detail:string;icon:React.ReactNode;tone?:'blue'|'green'|'amber'|'violet'}){
 return <div className={'digital-kpi-card '+tone}><div className="digital-kpi-top"><span>{label}</span><i>{icon}</i></div><strong>{value}</strong><small>{detail}</small></div>;
}

function MobileTenantDashboard({session,can,currency,d,people,present,onLeave,pending,payroll,attendanceRate}:{session:any;can:(resource:string)=>boolean;currency:string;d:Row;people:Row[];present:number;onLeave:number;pending:Row[];payroll:Row|null;attendanceRate:number}){
 const firstName=String(session.user.name??'User').split(' ')[0];
 const greeting=useTimeGreeting(d.company?.timezone);
 const quick=[
  ['employees','Employees','Team',<Users size={23}/>,'blue'],
  ['attendance','Attendance','Today',<Clock3 size={23}/>,'green'],
  ['leave','Leave','Requests',<CalendarDays size={23}/>,'violet'],
  ['payroll','Payroll','Salary',<Wallet size={23}/>,'amber'],
  ['reports','Reports','Insights',<ActivityIcon size={23}/>,'blue'],
  ['ai','AI Insights','Assistant',<Sparkles size={23}/>,'violet']
 ] as const;
 const latestEmployee=people[0];
 return <section className="hr-mobile-dashboard">
  <div className="mobile-unified-hero mobile-unified-hero-tenant">
   <div className="mobile-unified-brand"><span className="mobile-unified-logo">{d.company?.logo?<img src={d.company.logo} alt={d.company?.name??'Company'}/>:<BrandLogo alt="TCW HR Software"/>}</span><div className="mobile-unified-brand-copy"><strong>TCW HR Software</strong><small>{d.company?.name??'HR Management'}</small></div><Link href="/notifications" className="mobile-unified-action" aria-label="Notifications"><Bell size={20}/></Link></div>
   <div className="mobile-unified-user"><Avatar name={session.user.name} src={session.user.avatar}/><div><small>{greeting}</small><strong>{firstName}!</strong><span>{session.user.roleName}</span></div></div>
  </div>

  <div className="mobile-app-welcome"><div><small>WELCOME BACK</small><strong>Let’s make today productive.</strong></div><span><ActivityIcon size={21}/></span></div>

  <div className="mobile-app-stats">
   <div><span className="mobile-stat-icon blue"><Users size={19}/></span><strong>{people.length}</strong><small>Total Employees</small></div>
   <div><span className="mobile-stat-icon green"><UserCheck size={19}/></span><strong>{present}</strong><small>Present Today · {attendanceRate}%</small></div>
   <div><span className="mobile-stat-icon violet"><CalendarDays size={19}/></span><strong>{onLeave}</strong><small>On Leave</small></div>
   <div><span className="mobile-stat-icon amber"><Wallet size={19}/></span><strong>{payroll?currencyValue(payroll.totalNet,currency):'—'}</strong><small>Payroll Processed</small></div>
  </div>

  <section className="mobile-app-section">
   <div className="mobile-app-section-head"><strong>Quick Actions</strong><span>Open</span></div>
   <div className="mobile-quick-grid">{quick.filter(([key])=>can(key)).map(([key,title,sub,icon,tone])=><Link href={'/'+key} key={key} className="mobile-quick-action"><span className={'mobile-quick-icon '+tone}>{icon}</span><strong>{title}</strong><small>{sub}</small></Link>)}</div>
  </section>

  <section className="mobile-app-section mobile-updates">
   <div className="mobile-app-section-head"><strong>Today’s Updates</strong><Link href="/notifications">See All</Link></div>
   {pending.length>0&&<Link href="/leave" className="mobile-update-row"><span className="mobile-update-icon violet"><CalendarDays size={18}/></span><div><strong>{pending.length} leave request{pending.length===1?'':'s'} pending</strong><small>Review approval requests</small></div><ChevronRight size={17}/></Link>}
   {payroll&&<Link href="/payroll" className="mobile-update-row"><span className="mobile-update-icon amber"><Wallet size={18}/></span><div><strong>{payroll.month} payroll</strong><small>{readable(String(payroll.status??'review').toLowerCase())}</small></div><ChevronRight size={17}/></Link>}
   {latestEmployee&&<Link href="/employees" className="mobile-update-row"><span className="mobile-update-icon blue"><Users size={18}/></span><div><strong>{latestEmployee.firstName} {latestEmployee.lastName}</strong><small>{latestEmployee.departmentName??latestEmployee.employeeCode??'Employee directory'}</small></div><ChevronRight size={17}/></Link>}
   {!pending.length&&!payroll&&!latestEmployee&&<div className="mobile-update-empty">No updates yet. Your HR activity will appear here.</div>}
  </section>
 </section>;
}
function MobilePlatformDashboard({session,companies,trials,trialSummary,paid,outstanding,openTickets,currency,support}:{session:any;companies:Row[];trials:number;trialSummary:Row;paid:number;outstanding:number;openTickets:number;currency:string;support:Row[]}){
 const active=companies.filter(c=>c.status==='ACTIVE').length;
 const firstName=String(session.user.name??'Admin').split(' ')[0];
 const greeting=useTimeGreeting('Asia/Kolkata');
 return <section className="platform-mobile-dashboard">
  <div className="mobile-unified-hero mobile-unified-hero-platform">
   <div className="mobile-unified-brand"><span className="mobile-unified-logo"><BrandLogo alt="TCW HR Software"/></span><div className="mobile-unified-brand-copy"><strong>TCW HR Software</strong><small>Super Admin</small></div><Link href="/system" className="mobile-unified-action" aria-label="System health"><Server size={19}/></Link></div>
   <div className="mobile-unified-user"><Avatar name={session.user.name} src={session.user.avatar}/><div><small>{greeting}</small><strong>{firstName}!</strong><span>Platform administrator</span></div></div>
  </div>
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


function WorkingTimer({since}:{since?:string|null}){
 const[now,setNow]=useState(()=>Date.now());
 useEffect(()=>{if(!since)return;const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer)},[since]);
 if(!since)return <>00:00:00</>;
 const total=Math.max(0,Math.floor((now-new Date(since).getTime())/1000)),h=Math.floor(total/3600),m=Math.floor(total%3600/60),s=total%60;
 return <>{String(h).padStart(2,'0')}:{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}</>;
}

function EmployeeDashboard({session,currency,d,onRefresh}:{session:any;currency:string;d:Row;onRefresh:()=>void}){
 const[faceOpen,setFaceOpen]=useState(false),[livePunch,setLivePunch]=useState<Row|null>(null);const employee:Row=d.employees?.[0]??{},attendance:Row[]=d.attendance??[],leave:Row[]=d.leave??[],events:Row[]=d.events??[];
 const timezone=d.company?.timezone??'Asia/Kolkata';
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const serverTodayRecord=attendance.find(r=>String(r.date).slice(0,10)===today);
 const todayRecord=livePunch?{...(serverTodayRecord??{}),...(livePunch.punchType==='IN'?{firstIn:livePunch.firstIn??livePunch.punchTime,lastOut:null,status:livePunch.status??serverTodayRecord?.status??'PRESENT'}:{firstIn:livePunch.firstIn??serverTodayRecord?.firstIn,lastOut:livePunch.lastOut??livePunch.punchTime,status:livePunch.status??serverTodayRecord?.status??'PRESENT',workMinutes:livePunch.workMinutes??serverTodayRecord?.workMinutes??0})}:serverTodayRecord;
 const latestPunch:Row|null=d.latestPunch??null;
 const latestPunchDay=latestPunch?.punchTime?new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(latestPunch.punchTime)):'';
 const persistedPunch=latestPunchDay===today?latestPunch:null,currentPunch=livePunch??persistedPunch;
 useEffect(()=>{if(!livePunch||!latestPunch?.punchTime)return;const sameType=latestPunch.punchType===livePunch.punchType,sameTime=Math.abs(new Date(latestPunch.punchTime).getTime()-new Date(livePunch.punchTime).getTime())<5000;if(sameType&&sameTime)setLivePunch(null)},[livePunch,latestPunch?.punchType,latestPunch?.punchTime]);
 const pending=leave.filter(r=>r.status==='PENDING');
 const approvedUpcoming=leave.filter(r=>r.status==='APPROVED'&&String(r.endDate).slice(0,10)>=today).sort((a,b)=>String(a.startDate).localeCompare(String(b.startDate)));
 const approvedLeaveToday=approvedUpcoming.find(r=>String(r.startDate).slice(0,10)<=today&&String(r.endDate).slice(0,10)>=today);
 const fullDayLeaveToday=!!approvedLeaveToday&&Number(approvedLeaveToday.days)!==0.5;
 const leaveDayType=['PAID_LEAVE','UNPAID_LEAVE'].includes(String(todayRecord?.dayType??''))?String(todayRecord.dayType):'APPROVED';
 const payslip:Row|null=d.payroll??null;
 const firstName=String(session.user.name??employee.firstName??'Employee').split(' ')[0];
 const greeting=useTimeGreeting(timezone);
 const working=!fullDayLeaveToday&&(currentPunch?.punchType?currentPunch.punchType==='IN':!!todayRecord?.firstIn&&!todayRecord?.lastOut);
 const completed=!fullDayLeaveToday&&!working&&!!todayRecord?.firstIn&&(currentPunch?.punchType==='OUT'||!!todayRecord?.lastOut);
 const workingSince=working?(currentPunch?.punchType==='IN'?currentPunch.punchTime:todayRecord?.firstIn):null;
 const attendanceLabel=fullDayLeaveToday?(leaveDayType==='APPROVED'?'On leave':readable(leaveDayType.toLowerCase())):working?'Working':completed?'Day completed':todayRecord?readable(String(todayRecord.status??'').toLowerCase()):'Not checked in';
 const quick=[
  {href:'/leave',title:'Time off',sub:fullDayLeaveToday?'On leave today':pending.length?pending.length+' pending':'Apply leave',icon:<CalendarDays size={21}/>},
  {href:'/payroll',title:'Payslips',sub:payslip?.run?.month??'Salary records',icon:<Wallet size={21}/>},
  {href:'/expenses',title:'Expenses',sub:'Submit claim',icon:<Receipt size={21}/>},
  {href:'/calendar',title:'Calendar',sub:events.length?events.length+' upcoming':'Company events',icon:<CalendarDays size={21}/>}
 ];
 return <div className="employee-home-dashboard">
  <section className="employee-home-hero">
   <div className="employee-home-person"><Avatar name={session.user.name} src={session.user.avatar||employee.photo}/><div><span>{greeting}</span><h1>{firstName}</h1><p>{employee.designation||'Employee'}{employee.departmentName?' · '+employee.departmentName:''}</p></div></div>
   <button className="employee-home-face-button" type="button" disabled={fullDayLeaveToday} onClick={()=>setFaceOpen(true)}><UserCheck size={22}/><span><strong>{fullDayLeaveToday?'On leave':working?'Check out':'Face Scan'}</strong><small>{fullDayLeaveToday?'Approved leave today':working?'End work session':'Check in / check out'}</small></span><ChevronRight size={18}/></button>
  </section>

  <section className={'employee-work-status '+(fullDayLeaveToday?'leave':working?'working':completed?'complete':'idle')}>
   <div className="employee-work-status-main"><span className="employee-work-dot"/><div><small>TODAY</small><strong>{attendanceLabel}</strong><em>{fullDayLeaveToday?'HR-approved leave is active today.':workingSince?'Started '+new Date(workingSince).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:timezone}):todayRecord?.firstIn?'Started '+new Date(todayRecord.firstIn).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:timezone}):'Scan your face to start work'}</em></div></div>
   <div className="employee-work-clock">{fullDayLeaveToday?<><small>TIME OFF</small><strong>On leave</strong></>:working?<><small>WORKING TIME</small><strong><WorkingTimer since={workingSince}/></strong></>:completed?<><small>WORKED TODAY</small><strong>{((todayRecord?.workMinutes??0)/60).toFixed(2)}h</strong></>:<LiveClock timezone={timezone}/>}</div>
   <button type="button" className="btn primary" disabled={fullDayLeaveToday} onClick={()=>setFaceOpen(true)}><Camera size={18}/>{fullDayLeaveToday?'Leave active':working?'Face Scan & check out':'Face Scan & check in'}</button>
  </section>

  <div className="employee-home-quick">{quick.map(item=><Link href={item.href} key={item.href}><span>{item.icon}</span><div><strong>{item.title}</strong><small>{item.sub}</small></div><ChevronRight size={17}/></Link>)}</div>

  <div className="employee-home-grid">
   <section className="employee-home-card"><div className="employee-home-card-head"><div><small>ATTENDANCE</small><h2>Recent days</h2></div><Link href="/attendance">View all <ArrowUpRight size={15}/></Link></div>{attendance.length?<div className="employee-attendance-list">{[...attendance].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,5).map(r=>{const isToday=String(r.date).slice(0,10)===today;return <div key={r.id}><span><strong>{displayDate(r.date)}</strong><small>{r.firstIn?new Date(r.firstIn).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:timezone}):'—'} → {isToday&&fullDayLeaveToday?'On leave':isToday&&working?'Working':r.lastOut?new Date(r.lastOut).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:timezone}):'—'}</small></span><Badge value={isToday&&fullDayLeaveToday?leaveDayType:isToday&&working?'WORKING':r.firstIn&&!r.lastOut?'WORKING':r.status}/></div>})}</div>:<Empty title="No attendance yet" description="Your attendance will appear here after the first Face Scan."/>}</section>
   <section className="employee-home-card"><div className="employee-home-card-head"><div><small>YOUR DAY</small><h2>What’s next</h2></div></div><div className="employee-home-next"><div><span><CalendarDays size={18}/></span><div><strong>{approvedUpcoming.length?'Approved time off':'No upcoming leave'}</strong><small>{approvedUpcoming.length?displayDate(approvedUpcoming[0].startDate):'You are scheduled to work normally.'}</small></div></div><div><span><Wallet size={18}/></span><div><strong>{payslip?currencyValue(payslip.net,currency):'Payslip not available'}</strong><small>{payslip?.run?.month?'Latest locked payslip · '+payslip.run.month:'Locked payslips will appear here.'}</small></div></div><div><span><CalendarDays size={18}/></span><div><strong>{events[0]?.title??'No company event'}</strong><small>{events[0]?.date?displayDate(events[0].date):'Nothing upcoming on the company calendar.'}</small></div></div></div></section>
  </div>

  {events.length>1&&<section className="employee-home-card employee-home-events"><div className="employee-home-card-head"><div><small>COMPANY CALENDAR</small><h2>Upcoming</h2></div><Link href="/calendar">Open calendar <ArrowUpRight size={15}/></Link></div><div>{events.slice(0,4).map((e:Row)=><Link href="/calendar" key={e.id}><div className="event-date"><small>{new Date(e.date).toLocaleDateString('en',{month:'short'})}</small><strong>{new Date(e.date).getUTCDate()}</strong></div><span><strong>{e.title}</strong><small>{readable(String(e.kind??'HR_EVENT').toLowerCase())}</small></span><ChevronRight size={16}/></Link>)}</div></section>}
  {faceOpen&&!fullDayLeaveToday&&<FaceScanAttendanceModal onClose={()=>setFaceOpen(false)} onComplete={async result=>{if(result)setLivePunch(result);await onRefresh()}}/>}
 </div>;
}

export function Dashboard(){
 const{session,can,currency}=useApp();const q=useData('dashboard');
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
 if(session.user.role==='EMPLOYEE')return <EmployeeDashboard session={session} currency={currency} d={d} onRefresh={()=>q.refetch()}/>;
  const people:Row[]=d.employees??[],attendance:Row[]=d.attendance??[],leave:Row[]=d.leave??[],devices:Row[]=d.devices??[],support:Row[]=d.support??[];
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:d.company?.timezone??'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const records=attendance.filter(r=>r.date.slice(0,10)===today),present=records.filter(r=>r.status==='PRESENT').length;
 const pending=leave.filter(r=>r.status==='PENDING'),onLeave=leave.filter(r=>r.status==='APPROVED'&&r.startDate.slice(0,10)<=today&&r.endDate.slice(0,10)>=today).length;
 const late=records.filter(r=>(r.lateMinutes??0)>0).length,exceptions=records.filter(r=>r.exceptionCode).length,deviceOffline=devices.filter(r=>!['ONLINE','CONNECTED'].includes(r.status)).length;
 const salaryBase=people.reduce((n,p)=>n+(p.monthlySalary??0),0),payroll=d.payroll??null;
 const absent=records.filter(r=>r.status==='ABSENT').length,otMinutes=records.reduce((n,r)=>n+(r.overtimeMinutes??0),0);
 const attendanceRate=people.length?Math.min(100,Math.round((present/people.length)*100)):0;
 const deviceOnline=Math.max(0,devices.length-deviceOffline),deviceRate=devices.length?Math.round((deviceOnline/devices.length)*100):100;
 const timezone=d.company?.timezone??'Asia/Kolkata';
 return <>
  <MobileTenantDashboard session={session} can={can} currency={currency} d={d} people={people} present={present} onLeave={onLeave} pending={pending} payroll={payroll} attendanceRate={attendanceRate}/>
  <div className="hr-desktop-dashboard">
  <section className="hr-welcome-card">
   <div className="hr-welcome-copy"><span className="hr-welcome-kicker">TCW HR WORKSPACE</span><h1>Welcome back, {session.user.name.split(' ')[0]}!</h1><p>Here’s what’s happening with your team today.</p><div className="hr-welcome-company"><span>{d.company?.name??'Company workspace'}</span><small>{deviceOffline?`${deviceOffline} attendance device(s) need attention`:'Workforce systems are operating normally'}</small></div></div>
   <div className="hr-welcome-tools"><LiveClock timezone={timezone}/><div className="hr-welcome-actions">{can('employees')&&<Link className="btn primary" href="/employees"><Users size={16}/>Employees</Link>}{can('attendance')&&<Link className="btn secondary" href="/attendance"><Clock3 size={16}/>Attendance</Link>}</div></div>
  </section>

  <div className="digital-kpi-grid">
   <DigitalMetric label="Total employees" value={people.length} detail={`${present} present today · ${attendanceRate}% attendance`} icon={<Users size={20}/>} tone="blue"/>
   <DigitalMetric label="Attendance alerts" value={late+exceptions} detail={`${late} late arrivals · ${exceptions} flagged records`} icon={<AlertTriangle size={20}/>} tone={late+exceptions?'amber':'green'}/>
   <DigitalMetric label="Leave today" value={onLeave} detail={`${pending.length} request(s) waiting for approval`} icon={<CalendarDays size={20}/>} tone="violet"/>
   <DigitalMetric label="Latest net payroll" value={payroll?currencyValue(payroll.totalNet,currency):'Not prepared'} detail={payroll?`${payroll.month} · ${readable(payroll.status.toLowerCase())}`:`Salary base ${currencyValue(salaryBase,currency)}`} icon={<Wallet size={20}/>} tone="green"/>
  </div>

  <div className="digital-dashboard-grid">
   <section className="panel digital-panel digital-pulse-panel"><div className="panel-heading"><div><span className="digital-section-label">WORKFORCE SIGNAL</span><h2>7-day attendance pulse</h2><p>Present employee count and today’s operating snapshot.</p></div><span className="digital-signal-chip"><ActivityIcon size={14}/> Live data</span></div><Trend attendance={attendance}/><div className="digital-signal-strip"><div><span>Attendance</span><strong>{attendanceRate}%</strong></div><div><span>Present</span><strong>{present}</strong></div><div><span>Late</span><strong>{late}</strong></div><div><span>Absent</span><strong>{absent}</strong></div><div><span>OT minutes</span><strong>{otMinutes}</strong></div></div></section>
   <section className="panel digital-panel"><div className="panel-heading"><div><span className="digital-section-label">SYSTEM STATUS</span><h2>Operational health</h2><p>Fast signals from devices, notifications and payroll.</p></div><Server size={19}/></div><div className="digital-health-list"><Link href="/devices"><span className="digital-health-icon"><Server size={18}/></span><div><strong>Attendance devices</strong><small>{deviceOnline} online · {deviceOffline} attention</small></div><b>{deviceRate}%</b></Link><Link href="/notifications"><span className="digital-health-icon"><Bell size={18}/></span><div><strong>Notifications</strong><small>Unread workspace updates</small></div><b>{d.unreadNotifications??0}</b></Link><Link href="/support"><span className="digital-health-icon"><Headphones size={18}/></span><div><strong>Support queue</strong><small>Open support tickets</small></div><b>{support.length}</b></Link><Link href="/payroll"><span className="digital-health-icon"><CircleDollarSign size={18}/></span><div><strong>Payroll status</strong><small>{payroll?`${payroll.month} payroll run`:'No payroll run prepared'}</small></div><Badge value={payroll?.status??'REVIEW'}/></Link></div></section>
  </div>

  <div className="dashboard-grid three digital-lower-grid"><section className="panel"><div className="panel-heading"><div><span className="digital-section-label">ACTION CENTER</span><h2>Pending approvals <span className="count-label">{pending.length}</span></h2></div>{can('leave')&&<Link href="/leave"><ArrowUpRight size={17}/><span className="sr-only">Open leave</span></Link>}</div>{pending.length?pending.slice(0,4).map(r=>{const e=people.find(p=>p.id===r.employeeId);const name=e?e.firstName+' '+e.lastName:'Employee';return <div className="list-row" key={r.id}><Avatar name={name} src={e?.photo}/><div className="grow"><strong>{name}</strong><small>{displayDate(r.startDate)} · {r.days} day(s)</small></div><Badge value="PENDING"/></div>}):<Empty title="No approvals waiting" description="New leave requests will appear here."/>}</section><section className="panel"><div className="panel-heading"><div><span className="digital-section-label">NEXT UP</span><h2>Upcoming calendar</h2></div><CalendarDays size={18}/></div>{d.events?.length?d.events.slice(0,4).map((e:Row)=><div className="list-row" key={e.id}><div className="event-date"><small>{new Date(e.date).toLocaleDateString('en',{month:'short'})}</small><strong>{new Date(e.date).getUTCDate()}</strong></div><div className="grow"><strong>{e.title}</strong><small>{readable(e.kind.toLowerCase())}</small></div></div>):<Empty title="Calendar is clear" description="Holidays, interviews, training and payroll dates will appear here."/>}<Link href="/calendar" className="panel-bottom-link">Open full calendar <ChevronRight size={16}/></Link></section><section className="panel quick-panel digital-quick-panel"><div className="panel-heading"><div><span className="digital-section-label">SHORTCUTS</span><h2>Quick actions</h2></div></div>{[['employees','People directory','Manage employee records'],['attendance','Attendance','Review daily attendance'],['payroll','Payroll','Review salary calculations'],['reports','Reports','Export HR information']].filter(([r])=>can(r)).map(([href,title,sub])=><Link href={'/'+href} className="quick-link" key={href}><span><strong>{title}</strong><small>{sub}</small></span><ArrowUpRight size={18}/></Link>)}</section></div>
  </div>
 </>;
}
function Activity({rows}:{rows:Row[]}){return <section className="panel activity-panel"><div className="panel-heading"><h2>Recent activity</h2><span className="muted">Latest recorded changes</span></div>{rows.length?<div className="activity-list">{rows.slice(0,6).map(r=><div key={r.id}><span className="activity-marker"/><div><strong>{readable(r.action.toLowerCase())}</strong><small>{readable(r.entity)} · {new Date(r.createdAt).toLocaleString('en-IN')}</small></div></div>)}</div>:<p className="quiet-empty">Workspace changes will appear here as your team gets started.</p>}</section>}
