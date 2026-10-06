'use client';
import React,{useEffect,useState} from 'react';
import Link from 'next/link';
import {Users,UserCheck,Clock3,CalendarDays,ArrowUpRight,Plus,Briefcase,Building2,Wallet,TrendingUp,ChevronRight,Sparkles,RefreshCw,Server,Headphones,Bell,AlertTriangle,CircleDollarSign,Activity as ActivityIcon,PhoneCall,Receipt,CreditCard,Camera,Menu,Home} from 'lucide-react';
import {useApp,useData,api,Loading,Failure,PageTitle,Stat,Avatar,Badge,Empty,BrandLogo,currencyValue,displayDate} from './core';
import {Row,readable} from './config';
import {attendanceTrendData} from './dashboard-chart';
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

function Trend({attendance,timezone}:{attendance:Row[];timezone:string}){
 const {days,values,max}=attendanceTrendData(attendance.map(r=>({date:String(r.date),status:String(r.status)})),timezone);const points=values.map((v,i)=>`${42+i*88},${170-v/max*125}`).join(' ');
 return <div className="trend-chart"><svg viewBox="0 0 610 215" role="img" aria-label="Present employee count over the last seven days"><defs><linearGradient id="attendance-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3874f6" stopOpacity=".2"/><stop offset="100%" stopColor="#3874f6" stopOpacity="0"/></linearGradient></defs>{[0,.25,.5,.75,1].map(v=><g key={v}><line x1="42" x2="575" y1={170-v*125} y2={170-v*125} stroke="#eaf0f6" strokeDasharray="4 5"/><text x="26" y={175-v*125} textAnchor="end" fill="#8090a7" fontSize="12">{Math.round(max*v)}</text></g>)}<polygon points={`42,170 ${points} 570,170`} fill="url(#attendance-fill)"/><polyline points={points} fill="none" stroke="#3977f4" strokeWidth="3" strokeLinejoin="round"/>{values.map((v,i)=><g key={i}><circle cx={42+i*88} cy={170-v/max*125} r="4" fill="#fff" stroke="#3977f4" strokeWidth="2"/><text x={42+i*88} y="204" textAnchor="middle" fill="#7a879c" fontSize="12">{new Date(days[i]).toLocaleDateString('en',{weekday:'short',timeZone:'UTC'})}</text></g>)}</svg></div>;
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
function DigitalMetric({label,value,detail,icon,tone='blue'}:{label:string;value:React.ReactNode;detail:string;icon:React.ReactNode;tone?:'blue'|'green'|'amber'|'violet'}){
 return <div className={'digital-kpi-card '+tone}><div className="digital-kpi-top"><span>{label}</span><i>{icon}</i></div><strong>{value}</strong><small>{detail}</small></div>;
}
function MainDashboardKpi({label,value,detail,icon,tone}:{label:string;value:React.ReactNode;detail:string;icon:React.ReactNode;tone:'green'|'orange'|'blue'|'red'|'violet'|'amber'}){
 return <div className={'main-dash-kpi '+tone}><span className="main-dash-kpi-icon">{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></div>;
}
function dashboardMinuteLabel(value:number){
 const minute=Math.max(0,Number(value)||0)%1440,h=Math.floor(minute/60),m=minute%60,h12=h%12||12;
 return `${String(h12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${h<12?'AM':'PM'}`;
}
function DashboardWeekBars({attendance,timezone,total}:{attendance:Row[];timezone:string;total:number}){
 const {days,values,max}=attendanceTrendData(attendance.map(r=>({date:String(r.date),status:String(r.status)})),timezone),ceiling=Math.max(max,total,1);
 return <div className="main-dash-bars" aria-label="Seven day attendance overview">{values.map((value,i)=><div className="main-dash-bar-col" key={days[i]}><div className="main-dash-bar-track"><span style={{height:`${Math.max(value?8:2,(value/ceiling)*100)}%`}}/></div><strong>{value}</strong><small>{new Date(days[i]).toLocaleDateString('en',{weekday:'short',timeZone:'UTC'})}</small></div>)}</div>;
}
function DashboardAvailability({present,notChecked,onLeave,absent,total}:{present:number;notChecked:number;onLeave:number;absent:number;total:number}){
 const base=Math.max(total,1),p1=present/base*100,p2=notChecked/base*100,p3=onLeave/base*100,p4=absent/base*100,p5=Math.max(0,100-p1-p2-p3-p4);
 const style={background:`conic-gradient(#22b760 0 ${p1}%,#ff9f1c ${p1}% ${p1+p2}%,#3b82f6 ${p1+p2}% ${p1+p2+p3}%,#ef4444 ${p1+p2+p3}% ${p1+p2+p3+p4}%,#e8eef6 ${p1+p2+p3+p4}% 100%)`} as React.CSSProperties;
 const rows=[['Present',present,'green'],['Not Checked In',notChecked,'orange'],['On Leave',onLeave,'blue'],['Absent',absent,'red'],...(p5>0?[['Off / No shift',Math.max(0,total-present-notChecked-onLeave-absent),'neutral']]:[])] as Array<[string,number,string]>;
 return <div className="main-dash-availability"><div className="main-dash-donut" style={style}><div><strong>{total}</strong><small>Employees</small></div></div><div className="main-dash-availability-list">{rows.map(([label,value,tone])=><div key={label}><span className={'availability-dot '+tone}/><small>{label}</small><strong>{value}</strong><em>{Math.round(value/base*100)}%</em></div>)}</div></div>;
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
  ['ai','AI Insights','Assistant',<span className="quick-ai-orb"><Sparkles size={20}/></span>,'violet']
 ] as const;
 const latestEmployee=people[0];
 return <section className="hr-mobile-dashboard">
  <div className="mobile-unified-hero mobile-unified-hero-tenant mobile-hero-profile-only">
   <div className="mobile-unified-user"><Avatar name={session.user.name} src={session.user.avatar}/><div><small>{greeting} 👋</small><strong>{firstName}!</strong><span>{session.user.roleName}</span></div><div className="mobile-hero-date"><LiveClock timezone={d.company?.timezone}/><small>{d.company?.city??d.company?.location??'Your workspace'}</small></div></div>
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
 const leaveDayType=['PAID_LEAVE','UNPAID_LEAVE'].includes(String(todayRecord?.dayType??''))?String(todayRecord?.dayType??'APPROVED'):'APPROVED';
 const payslip:Row|null=d.payroll??null;
 const firstName=String(session.user.name??employee.firstName??'Employee').split(' ')[0];
 const greeting=useTimeGreeting(timezone);
 const working=!fullDayLeaveToday&&(currentPunch?.punchType?currentPunch.punchType==='IN':!!todayRecord?.firstIn&&!todayRecord?.lastOut);
 const completed=!fullDayLeaveToday&&!working&&!!todayRecord?.firstIn&&(currentPunch?.punchType==='OUT'||!!todayRecord?.lastOut);
 const workingSince=working?(currentPunch?.punchType==='IN'?currentPunch.punchTime:todayRecord?.firstIn):null;
 const attendanceLabel=fullDayLeaveToday?(leaveDayType==='APPROVED'?'On leave':readable(leaveDayType.toLowerCase())):working?'Working':completed?'Checked out':todayRecord?readable(String(todayRecord.status??'').toLowerCase()):'Not checked in';
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
   <div className="employee-work-clock">{fullDayLeaveToday?<><small>TIME OFF</small><strong>On leave</strong></>:working?<><small>WORKED TODAY · LIVE</small><strong><WorkingTimer since={workingSince} baseMinutes={Number(todayRecord?.workMinutes??0)}/></strong></>:completed?<><small>WORKED TODAY</small><strong>{Math.floor(Number(todayRecord?.workMinutes??0)/60)}h {Number(todayRecord?.workMinutes??0)%60}m</strong></>:<LiveClock timezone={timezone}/>}</div>
   <button type="button" className="btn primary" disabled={fullDayLeaveToday||working} onClick={()=>{setFaceIntent('IN');setFaceOpen(true)}}><Camera size={18}/>{fullDayLeaveToday?'Leave active':'Check IN'}</button><button type="button" className="btn secondary" disabled={fullDayLeaveToday||!working} onClick={()=>{setFaceIntent('OUT');setFaceOpen(true)}}><Camera size={18}/>Check OUT</button>
  </section>

  <div className="employee-home-quick">{quick.map(item=><Link href={item.href} key={item.href}><span>{item.icon}</span><div><strong>{item.title}</strong><small>{item.sub}</small></div><ChevronRight size={17}/></Link>)}</div>

  <div className="employee-home-grid">
   <section className="employee-home-card"><div className="employee-home-card-head"><div><small>ATTENDANCE</small><h2>Recent days</h2></div><Link href="/attendance">View all <ArrowUpRight size={15}/></Link></div>{attendance.length?<div className="employee-attendance-list">{[...attendance].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,5).map(r=>{const isToday=String(r.date).slice(0,10)===today;return <div key={r.id}><span><strong>{displayDate(r.date)}</strong><small>{r.firstIn?new Date(r.firstIn).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:timezone}):'—'} → {isToday&&fullDayLeaveToday?'On leave':isToday&&working?'Working':r.lastOut?new Date(r.lastOut).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:timezone}):'—'}</small></span><Badge value={isToday&&fullDayLeaveToday?leaveDayType:isToday&&working?'WORKING':r.firstIn&&!r.lastOut?'WORKING':r.status}/></div>})}</div>:<Empty title="No attendance yet" description="Your attendance will appear here after the first Face Scan."/>}</section>
   <section className="employee-home-card"><div className="employee-home-card-head"><div><small>YOUR DAY</small><h2>What’s next</h2></div></div><div className="employee-home-next"><div><span><CalendarDays size={18}/></span><div><strong>{approvedUpcoming.length?'Approved time off':'No upcoming leave'}</strong><small>{approvedUpcoming.length?displayDate(approvedUpcoming[0].startDate):'You are scheduled to work normally.'}</small></div></div><div><span><Wallet size={18}/></span><div><strong>{payslip?currencyValue(payslip.net,currency):'Payslip not available'}</strong><small>{payslip?.run?.month?'Latest locked payslip · '+payslip.run.month:'Locked payslips will appear here.'}</small></div></div><div><span><CalendarDays size={18}/></span><div><strong>{events[0]?.title??'No company event'}</strong><small>{events[0]?.date?displayDate(events[0].date):'Nothing upcoming on the company calendar.'}</small></div></div></div></section>
  </div>

  {events.length>1&&<section className="employee-home-card employee-home-events"><div className="employee-home-card-head"><div><small>COMPANY CALENDAR</small><h2>Upcoming</h2></div><Link href="/calendar">Open calendar <ArrowUpRight size={15}/></Link></div><div>{events.slice(0,4).map((e:Row)=><Link href="/calendar" key={e.id}><div className="event-date"><small>{new Date(e.date).toLocaleDateString('en',{month:'short'})}</small><strong>{new Date(e.date).getUTCDate()}</strong></div><span><strong>{e.title}</strong><small>{readable(String(e.kind??'HR_EVENT').toLowerCase())}</small></span><ChevronRight size={16}/></Link>)}</div></section>}
  {faceOpen&&!fullDayLeaveToday&&<FaceScanAttendanceModal intent={faceIntent} onClose={()=>setFaceOpen(false)} onComplete={async result=>{if(result)setLivePunch(result);await onRefresh()}}/>}
 </div>;
}

export function Dashboard(){
 const{session,can,currency}=useApp();const q=useData('dashboard');const calendarQ=useData('calendar?pageSize=500',can('calendar'));
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
 const activePeople=people.filter(p=>String(p.status??'ACTIVE')!=='INACTIVE'),departments:Row[]=d.departments??[],shifts:Row[]=d.shifts??[];
 const peopleById=new Map(people.map(p=>[p.id,p])),shiftById=new Map(shifts.map(s=>[s.id,s])),todayByEmployee=new Map(records.map(r=>[r.employeeId,r]));
 const approvedLeaveToday=new Set(leave.filter(r=>r.status==='APPROVED'&&String(r.startDate).slice(0,10)<=today&&String(r.endDate).slice(0,10)>=today).map(r=>r.employeeId));
 const approvedFullLeaveToday=new Set(leave.filter(r=>r.status==='APPROVED'&&Number(r.days??0)>=1&&String(r.startDate).slice(0,10)<=today&&String(r.endDate).slice(0,10)>=today).map(r=>r.employeeId));
 const fullLeaveToday=new Set(records.filter(r=>['PAID_LEAVE','UNPAID_LEAVE'].includes(String(r.dayType))).map(r=>r.employeeId));
 const leaveTodayIds=new Set([...approvedFullLeaveToday,...fullLeaveToday]),notChecked=records.filter(r=>r.status==='NOT_CLOCKED_IN'&&!leaveTodayIds.has(r.employeeId)).length;
 const physicalAbsent=records.filter(r=>r.status==='ABSENT'&&!leaveTodayIds.has(r.employeeId)).length,overtimePeople=records.filter(r=>Number(r.overtimeMinutes??0)>0).length;
 const approvedCount=leave.filter(r=>r.status==='APPROVED').length,cancelledCount=leave.filter(r=>r.status==='CANCELLED').length;
 const departmentRows=departments.map(dep=>({id:dep.id,name:dep.name,count:activePeople.filter(p=>p.departmentId===dep.id).length})).filter(r=>r.count>0).sort((a,b)=>b.count-a.count),maxDepartment=Math.max(1,...departmentRows.map(r=>r.count));
 const shiftSchedule=activePeople.filter(p=>p.shiftId&&shiftById.has(p.shiftId)).sort((a,b)=>(shiftById.get(a.shiftId)?.startMinute??0)-(shiftById.get(b.shiftId)?.startMinute??0)).slice(0,5);
 const attendanceEvents=records.map(r=>{const person=peopleById.get(r.employeeId);if(!person)return null;const at=r.lastOut??r.firstIn;if(!at)return null;return {id:r.id,person,name:`${person.firstName} ${person.lastName}`,at:new Date(at),kind:r.lastOut?'Checked out':'Checked in'};}).filter(Boolean).sort((a:any,b:any)=>+b.at-+a.at).slice(0,5) as any[];
 const upcoming=mergeUpcomingEvents(calendarQ.data?.items??d.events??[]).slice(0,3),weekStart=new Date(Date.now()-6*86400000),weekEnd=new Date();
 const weekLabel=`${weekStart.toLocaleDateString('en-IN',{day:'2-digit',month:'short',timeZone:timezone})} – ${weekEnd.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric',timeZone:timezone})}`;
 return <>
  <MobileTenantDashboard session={session} can={can} currency={currency} d={d} people={people} present={present} onLeave={onLeave} pending={pending} payroll={payroll} attendanceRate={attendanceRate}/>
  <div className="hr-desktop-dashboard main-dashboard-v2">
   <header className="main-dash-header"><div><h1>Main Dashboard</h1><p>Live workforce overview</p></div><div className="main-dash-header-tools"><span className="main-dash-live"><i/>Live</span><span className="main-dash-week"><CalendarDays size={16}/>{weekLabel}</span><LiveClock timezone={timezone}/></div></header>

   <div className="main-dash-kpis">
    <MainDashboardKpi label="Present Today" value={present} detail={`of ${activePeople.length} employees`} icon={<UserCheck size={22}/>} tone="green"/>
    <MainDashboardKpi label="Not Checked In" value={notChecked} detail="Shift active, no punch yet" icon={<Clock3 size={22}/>} tone="orange"/>
    <MainDashboardKpi label="On Leave" value={approvedLeaveToday.size} detail="Approved leave today" icon={<CalendarDays size={22}/>} tone="blue"/>
    <MainDashboardKpi label="Absent" value={physicalAbsent} detail="No punch after shift end" icon={<AlertTriangle size={22}/>} tone="red"/>
    <MainDashboardKpi label="Overtime Today" value={overtimePeople} detail={`${otMinutes} total minutes`} icon={<Clock3 size={22}/>} tone="violet"/>
    <MainDashboardKpi label="Open Requests" value={pending.length} detail="Leave requests awaiting review" icon={<Briefcase size={22}/>} tone="amber"/>
   </div>

   <div className="main-dash-top-grid">
    <section className="panel main-dash-panel main-dash-attendance"><div className="main-dash-panel-head"><div><h2>Attendance Overview</h2><p>Present employees across the last 7 days</p></div><span>{weekLabel}</span></div><DashboardWeekBars attendance={attendance} timezone={timezone} total={activePeople.length}/><div className="main-dash-chart-legend"><span><i className="present"/>Present</span><span><i className="capacity"/>Team capacity</span></div></section>
    <section className="panel main-dash-panel"><div className="main-dash-panel-head"><div><h2>Team Availability</h2><p>Today’s workforce state</p></div></div><DashboardAvailability present={present} notChecked={notChecked} onLeave={leaveTodayIds.size} absent={physicalAbsent} total={activePeople.length}/></section>
    <section className="panel main-dash-panel main-dash-timeoff"><div className="main-dash-panel-head"><div><h2>Time Off Requests</h2><p>Latest leave activity</p></div>{can('leave')&&<Link href="/leave">View All</Link>}</div><div className="main-dash-request-tabs"><span className="active">Pending <b>{pending.length}</b></span><span>Approved <b>{approvedCount}</b></span><span>Cancelled <b>{cancelledCount}</b></span></div><div className="main-dash-request-list">{pending.slice(0,4).map(r=>{const e=peopleById.get(r.employeeId),name=e?`${e.firstName} ${e.lastName}`:'Employee';return <Link href="/leave" key={r.id}><Avatar name={name} src={e?.photo}/><div><strong>{name}</strong><small>{displayDate(r.startDate)}{String(r.startDate)!==String(r.endDate)?` – ${displayDate(r.endDate)}`:''}</small></div><Badge value="PENDING"/></Link>})}{!pending.length&&<Empty title="No pending requests" description="Approved and future requests stay available in Time Off."/>}</div></section>
   </div>

   <div className="main-dash-middle-grid">
    <section className="panel main-dash-panel"><div className="main-dash-panel-head"><div><h2>Today’s Shift Schedule</h2><p>Assigned employee shifts</p></div>{can('shifts')&&<Link href="/shifts">View All</Link>}</div><div className="main-dash-shift-list">{shiftSchedule.map(p=>{const s=shiftById.get(p.shiftId),r=todayByEmployee.get(p.id),isLeave=leaveTodayIds.has(p.id),state=isLeave?'ON_LEAVE':r?.status==='NOT_CLOCKED_IN'?'NOT_CHECKED_IN':r?.firstIn&&!r?.lastOut?'IN_PROGRESS':r?.lastOut?'COMPLETED':'SCHEDULED';return <div key={p.id}><Avatar name={`${p.firstName} ${p.lastName}`} src={p.photo}/><span><strong>{p.firstName} {p.lastName}</strong><small>{departments.find(x=>x.id===p.departmentId)?.name??p.designation??'Employee'}</small></span><time>{s?`${dashboardMinuteLabel(s.startMinute)} – ${dashboardMinuteLabel(s.endMinute)}`:'—'}</time><Badge value={state}/></div>})}{!shiftSchedule.length&&<Empty title="No shifts assigned" description="Assigned shifts will appear here."/>}</div></section>
    <section className="panel main-dash-panel"><div className="main-dash-panel-head"><div><h2>Recent Attendance Activity</h2><p>Latest punch activity today</p></div><span className="main-dash-live small"><i/>Live</span></div><div className="main-dash-activity-list">{attendanceEvents.map((event:any)=><div key={event.id}><Avatar name={event.name} src={event.person.photo}/><span><strong>{event.name}</strong><small><i className={event.kind==='Checked in'?'in':'out'}/>{event.kind}</small></span><time>{event.at.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:timezone})}</time></div>)}{!attendanceEvents.length&&<Empty title="No punch activity yet" description="Today’s check-ins and check-outs will appear here live."/>}</div></section>
    <section className="panel main-dash-panel"><div className="main-dash-panel-head"><div><h2>Department Summary</h2><p>Active employees by department</p></div>{can('organization')&&<Link href="/organization">View All</Link>}</div><div className="main-dash-departments">{departmentRows.slice(0,8).map((row,i)=><div key={row.id}><span>{row.name}</span><div><i style={{width:`${Math.max(8,row.count/maxDepartment*100)}%`}}/></div><strong>{row.count}</strong></div>)}{!departmentRows.length&&<Empty title="No department data" description="Department distribution will appear here."/>}</div></section>
   </div>

   <section className="panel main-dash-panel main-dash-announcements"><div className="main-dash-panel-head"><div><h2>Announcements & Upcoming</h2><p>Company calendar highlights</p></div>{can('calendar')&&<Link href="/calendar">View All</Link>}</div><div className="main-dash-announcement-grid">{upcoming.map((e:Row)=><Link href="/calendar" key={e.id}><span className="main-dash-announcement-icon"><Bell size={18}/></span><div><strong>{e.title}</strong><small>{displayDate(e.date)} · {readable(String(e.kind??'HR_EVENT').toLowerCase())}</small>{e.description&&<p>{String(e.description).slice(0,120)}</p>}</div><ChevronRight size={17}/></Link>)}{!upcoming.length&&<Empty title="Nothing upcoming" description="Holidays, interviews, training and company events will appear here."/>}</div></section>
  </div>
 </>;
}
function Activity({rows}:{rows:Row[]}){return <section className="panel activity-panel"><div className="panel-heading"><h2>Recent activity</h2><span className="muted">Latest recorded changes</span></div>{rows.length?<div className="activity-list">{rows.slice(0,6).map(r=><div key={r.id}><span className="activity-marker"/><div><strong>{readable(r.action.toLowerCase())}</strong><small>{readable(r.entity)} · {new Date(r.createdAt).toLocaleString('en-IN')}</small></div></div>)}</div>:<p className="quiet-empty">Workspace changes will appear here as your team gets started.</p>}</section>}
