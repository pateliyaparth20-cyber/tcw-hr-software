'use client';
import React,{useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {ArrowUpRight,BarChart3,BriefcaseBusiness,CalendarDays,Check,ChevronRight,Clock3,Download,Eye,FileText,FolderOpen,LockKeyhole,RefreshCw,Search,Sheet,ShieldCheck,SlidersHorizontal,Users,Wallet,X} from 'lucide-react';
import {useApp,useData,getLocalSessionToken,Loading,Failure,Empty,Table} from './core';
import {Row} from './config';
import './reports-center.css';
import './reports-maintenance.css';
const reports=[
 {name:'employees',label:'Employee directory',resource:'employees',category:'People',icon:Users,description:'Employee details, contact information and employment records.',date:'Current employee records',snapshot:true},
 {name:'attendance',label:'Attendance records',resource:'attendance',category:'Attendance',icon:Clock3,description:'Daily status, working hours, overtime and attendance exceptions.',date:'Attendance dates'},
 {name:'leave',label:'Time off & leave',resource:'leave',category:'Attendance',icon:CalendarDays,description:'Leave requests, days taken and approval decisions.',date:'Leave overlapping this period'},
 {name:'payroll-items',label:'Employee payroll',resource:'payroll',category:'Finance',icon:Wallet,description:'Employee earnings, deductions, net salary and payable days.',date:'Payroll months'},
 {name:'payroll',label:'Payroll runs',resource:'payroll',category:'Finance',icon:BarChart3,description:'Monthly payroll totals, employee counts and processing status.',date:'Payroll months'},
 {name:'expenses',label:'Expense claims',resource:'expenses',category:'Finance',icon:Wallet,description:'Employee claims, expense amounts and approval status.',date:'Expense dates'},
 {name:'assets',label:'Asset inventory',resource:'assets',category:'Operations',icon:BriefcaseBusiness,description:'Company equipment, ownership, assignments and asset status.',date:'Current asset assignments',snapshot:true},
 {name:'goals',label:'Performance goals',resource:'performance',category:'People',icon:BarChart3,description:'Employee goals, targets, progress and completion status.',date:'Goal due dates'},
 {name:'candidates',label:'Recruitment pipeline',resource:'recruitment',category:'People',icon:Users,description:'Candidate details, recruitment stages and interview information.',date:'Candidate creation dates'}
];
const categories=['All reports','People','Attendance','Finance','Operations'];
type Format='csv'|'xlsx'|'pdf';
const formats:Format[]=['pdf','xlsx','csv'];
const formatLabel=(f:Format)=>f==='xlsx'?'Excel':f.toUpperCase();
function today(){return new Date().toISOString().slice(0,10)}
function range(days:number){return {from:new Date(Date.now()-(days-1)*86400000).toISOString().slice(0,10),to:today()}}
function ReportHeader({maintenance=false}:{maintenance?:boolean}){return <header className="rc-header"><div><span className="rc-eyebrow">WORKFORCE INSIGHTS</span><h1>Reports & analytics</h1><p>Clear information. Better decisions. Every report in one place.</p></div><span className={'rc-status '+(maintenance?'maintenance':'')}><span/>{maintenance?'Temporarily unavailable':'Secure report center'}</span></header>}
export function ReportsPage(){
 const access=useData('reports/access');
 if(access.isLoading)return <div className="rc"><ReportHeader/><Loading/></div>;
 if(access.error)return <div className="rc"><ReportHeader/><Failure error={access.error} retry={()=>access.refetch()}/></div>;
 if(!access.data?.available)return <ReportsMaintenance recheck={()=>access.refetch()} checking={access.isFetching}/>;
 return <AvailableReportsPage/>;
}
function ReportsMaintenance({recheck,checking}:{recheck:()=>unknown;checking:boolean}){return <div className="rc"><ReportHeader maintenance/>
 <section className="reports-maintenance" aria-labelledby="reports-maintenance-title">
  <div className="reports-maintenance-backdrop" aria-hidden="true"><div className="rc-hero"><div><span className="rc-eyebrow">YOUR REPORT LIBRARY</span><h2>Turn HR records into useful insights.</h2><p>People · Attendance · Finance · Operations</p></div><BarChart3 size={58}/></div><div className="rc-cards">{reports.slice(0,6).map(r=><article className="rc-card" key={r.name}><span className="rc-card-icon"><r.icon size={23}/></span><small>{r.category}</small><h3>{r.label}</h3><div className="reports-maintenance-lines"><i/><i/><i/></div><div className="reports-maintenance-formats"><span>Preview</span><span>PDF</span><span>Excel</span></div></article>)}</div></div>
  <div className="reports-maintenance-overlay"><div className="reports-maintenance-message" role="status"><span className="reports-maintenance-icon"><LockKeyhole size={32}/></span><span className="reports-maintenance-label">REPORT CENTER</span><h2 id="reports-maintenance-title">Under Maintenance</h2><p>We’re improving your reports experience. Previews and downloads are temporarily unavailable.</p><div className="rc-maintenance-steps"><span><Check size={15}/>Your HR records stay available in their modules</span><span><ShieldCheck size={15}/>Report access is controlled securely</span></div><div className="rc-maintenance-actions"><Link href="/dashboard" className="btn primary">Back to dashboard<ArrowUpRight size={16}/></Link><button type="button" className="btn secondary" disabled={checking} onClick={recheck}><RefreshCw size={16}/>{checking?'Checking…':'Check availability'}</button></div><small className="rc-maintenance-footer">Thank you for your patience.</small></div></div>
 </section></div>}
function AvailableReportsPage(){
 const{can,notify}=useApp();const[search,setSearch]=useState(''),[category,setCategory]=useState('All reports'),[dates,setDates]=useState(()=>range(30)),[departmentId,setDepartmentId]=useState(''),[branchId,setBranchId]=useState(''),[preview,setPreview]=useState<string|null>(null),[busy,setBusy]=useState<string|null>(null);
 const previewRef=useRef<HTMLElement>(null);
 useEffect(()=>{if(preview)previewRef.current?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})},[preview]);
 const departments=useData('departments',can('organization')),branches=useData('branches',can('organization'));
 const allowed=reports.filter(r=>can('reports','EXPORT')&&can(r.resource,'EXPORT'));
 const visible=allowed.filter(r=>(category==='All reports'||r.category===category)&&`${r.label} ${r.description}`.toLowerCase().includes(search.trim().toLowerCase()));
 const validDates=!!dates.from&&!!dates.to&&dates.from<=dates.to;
 const active=allowed.find(r=>r.name===preview);
 const incompatible=active?.name==='candidates'&&!!branchId;
 const filters=new URLSearchParams({...dates,...(departmentId?{departmentId}:{}),...(branchId?{branchId}:{})});
 const q=useData(active?`reports/${active.name}?preview=true&${filters}`:'',!!active&&validDates&&!incompatible,false);
 async function download(name:string,format:Format){
  if(busy||!validDates||(name==='candidates'&&branchId))return;
  setBusy(`${name}:${format}`);const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),60000);
  try{
   const token=getLocalSessionToken();const response=await fetch(`/api/reports/${name}?${filters}&format=${format}`,{credentials:'include',cache:'no-store',signal:controller.signal,headers:token?{'X-TCW-Local-Session':token}:{}});
   if(!response.ok){let message='Could not download the report.';try{message=(await response.json()).message??message}catch{}throw new Error(message)}
   const blob=await response.blob();const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`tcw-hr-${name}-${today()}.${format}`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);notify(`${formatLabel(format)} report downloaded.`);
  }catch(error:any){notify(error.name==='AbortError'?'The download took too long. Please try again.':error.message??'Could not download the report.',true)}finally{clearTimeout(timeout);setBusy(null)}
 }
 const downloads=(name:string)=><div className="rc-downloads">{formats.map(f=><button type="button" key={f} disabled={!!busy||!validDates||(name==='candidates'&&!!branchId)} aria-label={`Download ${reports.find(r=>r.name===name)?.label} as ${formatLabel(f)}`} onClick={()=>download(name,f)}><Download size={14}/>{busy===`${name}:${f}`?'Preparing…':formatLabel(f)}</button>)}</div>;
 return <div className="rc"><ReportHeader/>
  <section className="rc-hero"><div><span className="rc-eyebrow">YOUR REPORT LIBRARY</span><h2>Turn HR records into useful insights.</h2><p>Choose a report, refine your filters and export the records you need.</p><span className="rc-hero-note"><ShieldCheck size={15}/>Only records allowed by your role and company access</span></div><div className="rc-hero-stats"><article><strong>{allowed.length}</strong><span>Available reports</span></article><article><strong>3</strong><span>PDF · Excel · CSV</span></article></div></section>
  <section className="rc-filter-panel" aria-label="Report filters"><div className="rc-filter-head"><div><SlidersHorizontal size={19}/><h2>Refine your report</h2></div><button type="button" className="text-button" onClick={()=>{setDates(range(30));setDepartmentId('');setBranchId('')}}><RefreshCw size={14}/>Reset filters</button></div><div className="rc-filter-fields"><label>From date<input type="date" value={dates.from} max={dates.to} onChange={e=>setDates({...dates,from:e.target.value})}/></label><label>To date<input type="date" value={dates.to} min={dates.from} onChange={e=>setDates({...dates,to:e.target.value})}/></label>{can('organization')&&<><label>Department<select value={departmentId} onChange={e=>setDepartmentId(e.target.value)}><option value="">All departments</option>{departments.data?.items?.map((r:Row)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label>Branch<select value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">All branches</option>{branches.data?.items?.map((r:Row)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label></>}</div><div className="rc-filter-foot"><div className="rc-presets">{[7,30,90].map(days=><button type="button" key={days} onClick={()=>setDates(range(days))}>Last {days} days</button>)}</div><span>Dates apply to period reports; directory and assets show current records.</span></div>{!validDates&&<p className="rc-error" role="alert">Choose a valid date range. From date must be on or before To date.</p>}{(departments.error||branches.error)&&<p className="rc-error" role="alert">Organization filters could not be loaded. <button type="button" onClick={()=>{departments.refetch();branches.refetch()}}>Retry</button></p>}</section>
  <div className="rc-library-head"><div><h2>Report library <span>{visible.length}</span></h2><p>Preview before you download.</p></div><label className="rc-search"><Search size={17}/><input aria-label="Search reports" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search reports…"/>{search&&<button type="button" aria-label="Clear report search" onClick={()=>setSearch('')}><X size={15}/></button>}</label></div>
  <div className="rc-categories" aria-label="Report categories">{categories.map(c=><button type="button" aria-pressed={category===c} className={category===c?'selected':''} key={c} onClick={()=>setCategory(c)}>{c}</button>)}</div>
  {active&&<section ref={previewRef} className="rc-preview" aria-label="Report preview"><div className="rc-preview-head"><div><span className="rc-eyebrow">REPORT PREVIEW</span><h2>{active.label}</h2><p>{active.snapshot?active.date:`${active.date} · ${dates.from} → ${dates.to}`}</p></div><button type="button" className="icon-button" aria-label="Close report preview" onClick={()=>setPreview(null)}><X size={19}/></button></div>{!validDates?<p className="rc-error">Choose a valid date range to preview this report.</p>:incompatible?<p className="rc-error">Recruitment has no branch assignments. Clear the branch filter to preview or download.</p>:q.isLoading?<Loading/>:q.error?<Failure error={q.error} retry={()=>q.refetch()}/>:q.data?.items?.length?<><div className="rc-preview-info"><span>Showing {Math.min(q.data.items.length,25)} of {q.data.total??q.data.items.length} records. Downloads include all matching records.</span>{downloads(active.name)}</div><Table rows={q.data.items.slice(0,25)} columns={Object.keys(q.data.items[0]).filter(k=>!['id','tenantId','personal','passwordHash','updatedAt','items'].includes(k))} cell={(r,k)=>typeof r[k]==='object'?r[k]===null?'—':JSON.stringify(r[k]):String(r[k]??'—')}/></>:<Empty title="No matching records" description="Try another date range, department or branch."/>}</section>}
  <div className="rc-cards">{visible.map(r=><article className={'rc-card '+(preview===r.name?'active':'')} key={r.name}><div className="rc-card-top"><span className={'rc-card-icon '+r.category.toLowerCase()}><r.icon size={22}/></span><span className="rc-card-category">{r.category}</span></div><h3>{r.label}</h3><p>{r.description}</p><span className="rc-card-period"><CalendarDays size={13}/>{r.snapshot?r.date:`${r.date} · Selected period`}</span>{r.name==='candidates'&&branchId&&<small className="rc-error">Clear the branch filter for recruitment.</small>}<button type="button" className="rc-preview-button" disabled={!validDates||(r.name==='candidates'&&!!branchId)} onClick={()=>setPreview(r.name)}><Eye size={16}/>Preview report<ChevronRight size={16}/></button>{downloads(r.name)}</article>)}</div>
  {!visible.length&&<div className="rc-empty"><FolderOpen size={30}/><Empty title={allowed.length?'No matching reports':'No report exports available'} description={allowed.length?'Try another search or category.':'Ask your administrator for Reports export and module export permissions.'}/>{allowed.length>0&&<button type="button" className="btn secondary" onClick={()=>{setSearch('');setCategory('All reports')}}>Clear search & category</button>}</div>}
  <footer className="rc-footer"><ShieldCheck size={15}/><span>Exports contain sensitive company information. Share them only with authorized people.</span></footer>
 </div>;
}
