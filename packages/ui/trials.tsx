'use client';
import React,{useMemo,useState} from 'react';
import {PhoneCall,Mail,Search,SlidersHorizontal,Clock3,Users,UserCheck,ArrowUpRight,CalendarClock} from 'lucide-react';
import {useApp,useData,PageTitle,Stat,Modal,RecordForm,Loading,Failure,Empty,Badge,Avatar,displayDate} from './core';
import {Row,readable} from './config';

const followupFields:any[]=[
 {key:'followupStatus',label:'Follow-up status',type:'select',required:true,options:['PENDING','CALL_DUE','CONTACTED','NO_ANSWER','FOLLOW_UP','INTERESTED','NOT_INTERESTED']},
 {key:'nextFollowupAt',label:'Next follow-up',type:'datetime-local',required:false},
 {key:'contactPhone',label:'Contact mobile',required:false},
 {key:'notes',label:'Follow-up notes',type:'textarea',required:false}
];
const fmtDateTime=(value:any)=>value?new Date(value).toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}):'—';

export function TrialsPage(){
 const {mutate}=useApp();const q=useData('platform/trials');
 const [search,setSearch]=useState(''),[filter,setFilter]=useState('ALL'),[detail,setDetail]=useState<Row|null>(null),[followup,setFollowup]=useState<Row|null>(null);
 const data=q.data??{},summary=data.summary??{},all:Row[]=data.items??[];
 const rows=useMemo(()=>all.filter(r=>{
   const hay=`${r.company} ${r.companyCode} ${r.contactName} ${r.email} ${r.phone} ${r.plan} ${r.followupStatus}`.toLowerCase();
   const match=!search||hay.includes(search.toLowerCase());
   const state=filter==='ALL'||(filter==='CALL_DUE'&&r.needsCall)||(filter==='ACTIVE'&&r.tenantStatus==='TRIAL')||(filter==='EXPIRED'&&r.tenantStatus==='EXPIRED')||r.followupStatus===filter;
   return match&&state;
 }).sort((a,b)=>Number(b.needsCall)-Number(a.needsCall)||new Date(a.trialEndsAt??0).getTime()-new Date(b.trialEndsAt??0).getTime()),[all,search,filter]);
 const openFollowup=(row:Row)=>setFollowup(row);
 if(q.isLoading)return <Loading/>;
 if(q.error)return <Failure error={q.error as Error} retry={()=>q.refetch()}/>;
 return <>
  <PageTitle title="Trial follow-up" subtitle="See every free trial, who is using it, when it ends, and who needs a sales follow-up call."/>
  <div className="stats four power-stats"><Stat label="Trials tracked" value={summary.total??0} detail={`${summary.active??0} currently active`} icon={<Users size={20}/>}/><Stat label="Expiring soon" value={summary.expiringSoon??0} detail="Ends within 2 days" icon={<Clock3 size={20}/>}/><Stat label="Calls due" value={summary.callDue??0} detail="Expired and ready for follow-up" icon={<PhoneCall size={20}/>}/><Stat label="Converted" value={summary.converted??0} detail={`${summary.contacted??0} contacted / interested`} icon={<UserCheck size={20}/>}/></div>
  <section className="panel trial-panel">
   <div className="toolbar"><label className="search-field"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search company, person, email or mobile…" aria-label="Search trials"/></label><div className="toolbar-actions"><label className="filter"><SlidersHorizontal size={16}/><select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filter trials"><option value="ALL">All trials</option><option value="CALL_DUE">Calls due</option><option value="ACTIVE">Active trials</option><option value="EXPIRED">Expired</option><option value="CONTACTED">Contacted</option><option value="NO_ANSWER">No answer</option><option value="FOLLOW_UP">Follow-up booked</option><option value="INTERESTED">Interested</option><option value="NOT_INTERESTED">Not interested</option><option value="CONVERTED">Converted</option></select></label></div></div>
   {!rows.length?<Empty title="No matching trials" description="New free-trial registrations will appear here."/>:<div className="trial-list">{rows.map(row=><article className={'trial-card '+(row.needsCall?'call-due':'')} key={row.id}>
    <button className="trial-company" onClick={()=>setDetail(row)}><Avatar name={row.company}/><span><strong>{row.company}</strong><small>{row.companyCode} · {row.plan} · {readable(String(row.source??'legacy').toLowerCase())}</small></span></button>
    <div className="trial-contact"><strong>{row.contactName||'Owner / HR admin'}</strong><a href={`mailto:${row.email}`}>{row.email||'No email'}</a><span>{row.phone||'No mobile recorded'}</span></div>
    <div className="trial-time"><span>Trial end</span><strong>{displayDate(row.trialEndsAt)}</strong><small>{row.tenantStatus==='TRIAL'?(row.daysRemaining>0?`${row.daysRemaining} day(s) left`:'Ends today'):row.daysSinceExpired?`${row.daysSinceExpired} day(s) ago`:readable(String(row.tenantStatus).toLowerCase())}</small></div>
    <div className="trial-usage"><span>Usage</span><strong>{row.employeesUsed}/{row.employeeLimit}</strong><small>{row.lastLoginAt?`Last login ${displayDate(row.lastLoginAt)}`:'No login recorded'}</small></div>
    <div className="trial-state"><Badge value={row.needsCall?'CALL_DUE':row.followupStatus}/><small>{row.nextFollowupAt?`Next: ${fmtDateTime(row.nextFollowupAt)}`:'No next follow-up'}</small></div>
    <div className="trial-actions">{row.phone&&<a className="btn secondary small" href={`tel:${row.phone}`}><PhoneCall size={15}/>Call</a>}{row.email&&<a className="btn secondary small" href={`mailto:${row.email}?subject=${encodeURIComponent('Your TCW HR Software trial')}`}><Mail size={15}/>Email</a>}<button className="btn primary small" onClick={()=>openFollowup(row)}>Follow up <ArrowUpRight size={15}/></button></div>
   </article>)}</div>}
  </section>
  {detail&&<Modal title="Trial details" onClose={()=>setDetail(null)} wide><div className="modal-body trial-detail">
   <div className="trial-detail-head"><Avatar name={detail.company} large/><div><h3>{detail.company}</h3><p>{detail.companyCode} · {detail.plan}</p><div className="trial-badges"><Badge value={detail.tenantStatus}/><Badge value={detail.needsCall?'CALL_DUE':detail.followupStatus}/></div></div></div>
   <div className="trial-detail-grid">
    <div><span>Contact person</span><strong>{detail.contactName||'—'}</strong></div><div><span>Mobile</span><strong>{detail.phone||'—'}</strong></div><div><span>Email</span><strong>{detail.email||'—'}</strong></div><div><span>Login ID</span><strong>{detail.loginId||'—'}</strong></div>
    <div><span>Signup source</span><strong>{readable(String(detail.source??'legacy').toLowerCase())}</strong></div><div><span>Contact consent</span><strong>{detail.contactConsent?`Recorded ${displayDate(detail.contactConsentAt)}`:'Not recorded'}</strong></div><div><span>Trial started</span><strong>{displayDate(detail.trialStartedAt)}</strong></div><div><span>Trial ends</span><strong>{displayDate(detail.trialEndsAt)}</strong></div>
    <div><span>Employees used</span><strong>{detail.employeesUsed} / {detail.employeeLimit}</strong></div><div><span>Last login</span><strong>{fmtDateTime(detail.lastLoginAt)}</strong></div><div><span>Sales stage</span><strong>{detail.leadStage?readable(String(detail.leadStage).toLowerCase()):'—'}</strong></div><div><span>Last contacted</span><strong>{fmtDateTime(detail.lastContactedAt)}</strong></div>
   </div>
   {detail.followupNotes&&<div className="trial-notes"><span>Follow-up notes</span><p>{detail.followupNotes}</p></div>}
   <div className="trial-modal-actions">{detail.phone&&<a className="btn secondary" href={`tel:${detail.phone}`}><PhoneCall size={16}/>Call {detail.contactName?.split(' ')[0]||'contact'}</a>}{detail.email&&<a className="btn secondary" href={`mailto:${detail.email}`}><Mail size={16}/>Email</a>}<button className="btn primary" onClick={()=>{setDetail(null);openFollowup(detail)}}><CalendarClock size={16}/>Update follow-up</button></div>
  </div></Modal>}
  {followup&&<Modal title={`Follow up · ${followup.company}`} onClose={()=>setFollowup(null)}><RecordForm fields={followupFields} initial={{followupStatus:followup.needsCall?'CALL_DUE':followup.followupStatus,nextFollowupAt:followup.nextFollowupAt,contactPhone:followup.phone,notes:followup.followupNotes}} onCancel={()=>setFollowup(null)} submit="Save follow-up" onSave={async body=>{await mutate(`platform/trials/${followup.id}`,'PATCH',body);setFollowup(null)}}/></Modal>}
 </>;
}
