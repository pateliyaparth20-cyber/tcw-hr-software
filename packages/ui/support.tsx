'use client';
import React,{useMemo,useState} from 'react';
import {Headphones,Plus,Search,Clock3,ShieldAlert,CheckCircle2,Building2,MessageSquare,ArrowUpRight,Send} from 'lucide-react';
import {Badge,Empty,Failure,Loading,Modal,PageTitle,RecordForm,Stat,useApp,useData,displayDate} from './core';
import {Field,Row,readable} from './config';

const createFields:Field[]=[
 {key:'subject',label:'Subject',required:true},
 {key:'category',label:'Category',type:'select',required:true,default:'GENERAL',options:['TECHNICAL','LOGIN','BILLING','ATTENDANCE','PAYROLL','LEAVE','GENERAL']},
 {key:'priority',label:'Priority',type:'select',required:true,default:'NORMAL',options:['LOW','NORMAL','HIGH','URGENT']},
 {key:'message',label:'Describe the issue',type:'textarea',required:true,hint:'Include the exact screen, error and what you expected to happen.'}
];

function TicketThread({ticket,platform}:{ticket:Row;platform:boolean}){
 const q=useData(`support/${ticket.id}/messages`);const{mutate}=useApp();const[reply,setReply]=useState(''),[sending,setSending]=useState(false);
 async function send(e:React.FormEvent){e.preventDefault();if(!reply.trim())return;setSending(true);try{await mutate(`support/${ticket.id}/messages`,'POST',{message:reply.trim(),internal:false});setReply('')}finally{setSending(false)}}
 const messages:Row[]=q.data?.items??[];
 return <section className="ticket-thread"><div className="ticket-thread-head"><div><span className="detail-label">Conversation</span><strong>{messages.length} update{messages.length===1?'':'s'}</strong></div><MessageSquare size={19}/></div>{q.isLoading?<Loading/>:q.error?<Failure error={q.error}/>:messages.length?<div className="ticket-thread-list">{messages.map(m=><article key={m.id} className={'ticket-message-bubble '+(m.authorScope==='PLATFORM'?'support':'customer')+(m.internal?' internal':'')}><div className="ticket-message-meta"><strong>{m.authorName}</strong><span>{m.authorScope==='PLATFORM'?'TCW Support':'Company'} · {new Date(m.createdAt).toLocaleString('en-IN')}</span>{m.internal&&<Badge value="INTERNAL"/>}</div><p>{m.message}</p></article>)}</div>:<Empty title="No conversation yet" description="Updates to this ticket will appear here."/>}{!platform&&ticket.status!=='RESOLVED'&&<form className="ticket-reply" onSubmit={send}><textarea value={reply} onChange={e=>setReply(e.target.value)} maxLength={5000} placeholder="Reply to TCW Support…" required/><button className="btn primary" disabled={sending||!reply.trim()}>{sending?'Sending…':<><Send size={16}/>Send reply</>}</button></form>}</section>
}

export function SupportPage(){
 const{session,mutate,can}=useApp();const platform=session.user.scope==='PLATFORM';
 const q=useData(platform?'platform/support':'support?pageSize=250');
 const[open,setOpen]=useState(false),[detail,setDetail]=useState<Row|null>(null),[review,setReview]=useState<Row|null>(null),[status,setStatus]=useState('ACTIVE'),[priority,setPriority]=useState(''),[query,setQuery]=useState('');
 const rows:Row[]=q.data?.items??[];
 const filtered=useMemo(()=>rows.filter(r=>{
   const active=status==='ACTIVE'?!['RESOLVED'].includes(r.status):status==='ALL'||r.status===status;
   const p=!priority||r.priority===priority;
   const needle=query.trim().toLowerCase();
   const text=`${r.ticketNumber??''} ${r.subject??''} ${r.category??''} ${r.company?.name??''}`.toLowerCase();
   return active&&p&&(!needle||text.includes(needle));
 }),[rows,status,priority,query]);
 const openCount=rows.filter(r=>r.status==='OPEN').length,inProgress=rows.filter(r=>r.status==='IN_PROGRESS').length,urgent=rows.filter(r=>r.priority==='URGENT'&&r.status!=='RESOLVED').length,resolved=rows.filter(r=>r.status==='RESOLVED').length;
 return <>
  <PageTitle title={platform?'Support command center':'Support center'} subtitle={platform?'Prioritize customer issues, track SLA pressure and close the loop with each company.':'Create, track and review every request you send to TCW Support.'}>{!platform&&can('support','CREATE')&&<button className="btn primary" onClick={()=>setOpen(true)}><Plus size={18}/>New ticket</button>}</PageTitle>
  <div className="stats four support-stats"><Stat label="Open" value={openCount} detail="Awaiting first action" icon={<Headphones size={20}/>}/><Stat label="In progress" value={inProgress} detail="Currently being handled" icon={<Clock3 size={20}/>}/><Stat label="Urgent" value={urgent} detail="Highest response priority" icon={<ShieldAlert size={20}/>}/><Stat label="Resolved" value={resolved} detail="Closed requests" icon={<CheckCircle2 size={20}/>}/></div>
  <section className="panel support-board">
   <div className="support-toolbar"><div className="support-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search ticket, subject or company…"/></div><div className="toolbar-actions"><select value={status} onChange={e=>setStatus(e.target.value)}><option value="ACTIVE">Active tickets</option><option value="ALL">All tickets</option><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option></select><select value={priority} onChange={e=>setPriority(e.target.value)}><option value="">All priorities</option>{['URGENT','HIGH','NORMAL','LOW'].map(v=><option key={v}>{v}</option>)}</select></div></div>
   {q.isLoading?<Loading/>:q.error?<Failure error={q.error}/>:filtered.length?<div className="support-ticket-list">{filtered.map(r=>{
    const overdue=r.slaDueAt&&new Date(r.slaDueAt)<new Date()&&r.status!=='RESOLVED';
    return <article className={'support-ticket '+(overdue?'sla-overdue':'')} key={r.id} onClick={()=>setDetail(r)}>
      <div className="support-ticket-main"><div className="ticket-number">{r.ticketNumber??'TCW SUPPORT'}</div><h3>{r.subject}</h3><p>{r.message}</p><div className="ticket-meta">{platform&&r.company&&<span><Building2 size={14}/>{r.company.name} · {r.company.code}</span>}<span><MessageSquare size={14}/>{readable(String(r.category??'GENERAL').toLowerCase())}</span><span><Clock3 size={14}/>{displayDate(r.createdAt)}</span></div></div>
      <div className="support-ticket-side"><Badge value={r.priority}/><Badge value={r.status}/>{overdue&&<span className="sla-chip overdue">SLA due</span>}{!overdue&&r.slaDueAt&&<span className="sla-chip">SLA {new Date(r.slaDueAt).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}</span>}<button className="text-button" onClick={e=>{e.stopPropagation();platform?setReview(r):setDetail(r)}}>{platform?'Work ticket':'View details'} <ArrowUpRight size={14}/></button></div>
    </article>})}</div>:<Empty title="No tickets in this view" description={platform?'The support queue is clear for the selected filters.':'Create a ticket whenever your team needs product or billing help.'}/>}
  </section>
  {open&&<Modal title="Create support ticket" onClose={()=>setOpen(false)}><RecordForm fields={createFields} onCancel={()=>setOpen(false)} onSave={async body=>{await mutate('support','POST',body);setOpen(false)}} submit="Create ticket"/></Modal>}
  {detail&&<Modal title={`${detail.ticketNumber??'Support ticket'} · ${detail.subject}`} onClose={()=>setDetail(null)} wide><div className="modal-body support-detail"><div className="support-detail-grid"><section><span className="detail-label">Request</span><p className="ticket-message">{detail.message}</p></section><aside><div><span>Category</span><strong>{readable(String(detail.category??'GENERAL').toLowerCase())}</strong></div><div><span>Priority</span><Badge value={detail.priority}/></div><div><span>Status</span><Badge value={detail.status}/></div><div><span>Created</span><strong>{new Date(detail.createdAt).toLocaleString('en-IN')}</strong></div>{detail.assignedTo&&<div><span>Assigned to</span><strong>{detail.assignedTo}</strong></div>}</aside></div><TicketThread ticket={detail} platform={platform}/>{platform&&<div className="form-footer"><button className="btn primary" onClick={()=>{setDetail(null);setReview(detail)}}>Update ticket</button></div>}</div></Modal>}
  {review&&<Modal title={`Update ${review.ticketNumber}`} onClose={()=>setReview(null)}><RecordForm fields={[{key:'status',label:'Status',type:'select',required:true,options:['OPEN','IN_PROGRESS','RESOLVED']},{key:'assignedTo',label:'Assigned agent',required:false},{key:'response',label:'Customer response',type:'textarea',required:true}]} initial={review} onCancel={()=>setReview(null)} onSave={async body=>{await mutate(`platform/support/${review.id}`,'PATCH',body);setReview(null)}} submit="Save ticket update"/></Modal>}
 </>;
}
