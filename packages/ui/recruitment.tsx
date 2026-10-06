'use client';
import React,{useMemo,useState} from 'react';
import {ArrowUpRight,Briefcase,CalendarDays,CheckCircle2,Clock3,Download,GripVertical,Mail,MapPin,MoreHorizontal,Phone,Plus,Search,TrendingUp,UserPlus,Users,X} from 'lucide-react';
import {modules,Row,readable} from './config';
import {Avatar,Badge,Empty,Failure,Loading,Modal,RecordForm,displayDate,useApp,useData} from './core';

const PIPELINE=[
 {key:'APPLIED',label:'Applied',accepts:['APPLIED'],tone:'blue'},
 {key:'SCREENING',label:'Screening',accepts:['SCREENING','SHORTLISTED'],tone:'violet'},
 {key:'INTERVIEW',label:'Interview',accepts:['INTERVIEW','TECHNICAL','HR'],tone:'amber'},
 {key:'OFFER',label:'Offer',accepts:['OFFER'],tone:'emerald'},
 {key:'HIRED',label:'Hired',accepts:['HIRED'],tone:'green'},
 {key:'REJECTED',label:'Rejected',accepts:['REJECTED'],tone:'rose'}
] as const;
type PipelineStage=(typeof PIPELINE)[number];

const candidatePayload=(row:Row,stage?:string)=>({
 name:String(row.name??''),
 email:String(row.email??''),
 phone:String(row.phone??''),
 jobId:String(row.jobId??''),
 stage:stage??String(row.stage??'APPLIED'),
 notes:String(row.notes??''),
 interviewAt:row.interviewAt?new Date(row.interviewAt).toISOString():null
});

const monthKey=(date:Date)=>date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');
const todayKey=()=>new Date().toLocaleDateString('en-CA');
const sameLocalDay=(value:any)=>{
 if(!value)return false;
 const d=new Date(value);
 return !Number.isNaN(d.getTime())&&d.toLocaleDateString('en-CA')===todayKey();
};

function pipelineForStage(stage:string){return PIPELINE.find(item=>item.accepts.includes(stage as never))??PIPELINE[0];}

function MetricCard({icon,label,value,detail,tone}:{icon:React.ReactNode;label:string;value:React.ReactNode;detail:string;tone:string}){
 return <article className={'recruit-v3-metric '+tone}><span className="recruit-v3-metric-icon">{icon}</span><div><small>{label}</small><strong>{value}</strong><em><TrendingUp size={12}/>{detail}</em></div></article>;
}

function CandidateCard({candidate,jobTitle,canMove,onOpen,onDragStart,onDragEnd}:{candidate:Row;jobTitle:string;canMove:boolean;onOpen:()=>void;onDragStart:(e:React.DragEvent)=>void;onDragEnd:()=>void}){
 const stage=pipelineForStage(String(candidate.stage??'APPLIED'));
 return <article
   className="recruit-v3-candidate"
   draggable={canMove}
   onDragStart={onDragStart}
   onDragEnd={onDragEnd}
   onClick={onOpen}
   tabIndex={0}
   onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onOpen()}}}
 >
  <div className="recruit-v3-candidate-top">
   <span className="recruit-v3-person"><Avatar name={String(candidate.name??'Candidate')}/><span><strong>{candidate.name}</strong><small>{jobTitle||'Unassigned position'}</small></span></span>
   <span className="recruit-v3-drag" title={canMove?'Drag candidate to another stage':'View only'}>{canMove?<GripVertical size={15}/>:<MoreHorizontal size={15}/>}</span>
  </div>
  <div className="recruit-v3-candidate-meta"><span><Mail size={12}/>{candidate.email}</span>{candidate.interviewAt&&<span><CalendarDays size={12}/>{new Date(candidate.interviewAt).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span>}</div>
  <div className="recruit-v3-candidate-foot"><span className={'recruit-v3-stage-chip '+stage.tone}>{stage.label}</span><span>{candidate.phone||'Profile ready'}</span></div>
 </article>;
}

export function RecruitmentDashboard(){
 const {can,mutate}=useApp();
 const candidatesQuery=useData('candidates?pageSize=500');
 const jobsQuery=useData('jobs?pageSize=500');
 const departmentsQuery=useData('departments?pageSize=500',can('organization'));
 const candidates:Row[]=candidatesQuery.data?.items??[];
 const jobs:Row[]=jobsQuery.data?.items??[];
 const departments:Row[]=departmentsQuery.data?.items??[];
 const canCreate=can('recruitment','CREATE');
 const canEdit=can('recruitment','EDIT');
 const canExport=can('recruitment','EXPORT')&&can('reports','EXPORT');
 const [search,setSearch]=useState('');
 const [jobFilter,setJobFilter]=useState('');
 const [departmentFilter,setDepartmentFilter]=useState('');
 const [stageFilter,setStageFilter]=useState('');
 const [selectedId,setSelectedId]=useState('');
 const [candidateEdit,setCandidateEdit]=useState<Row|null|undefined>(undefined);
 const [jobEdit,setJobEdit]=useState<Row|null|undefined>(undefined);
 const [dragId,setDragId]=useState('');
 const [dragOver,setDragOver]=useState('');
 const jobById=useMemo(()=>new Map(jobs.map(job=>[String(job.id),job])),[jobs]);
 const departmentById=useMemo(()=>new Map(departments.map(row=>[String(row.id),String(row.name??'')])),[departments]);

 const filtered=useMemo(()=>candidates.filter(candidate=>{
  const job=jobById.get(String(candidate.jobId));
  const hay=[candidate.name,candidate.email,candidate.phone,candidate.notes,job?.title,job?.location].map(v=>String(v??'').toLowerCase()).join(' ');
  if(search&& !hay.includes(search.toLowerCase()))return false;
  if(jobFilter&&String(candidate.jobId)!==jobFilter)return false;
  if(departmentFilter&&String(job?.departmentId??'')!==departmentFilter)return false;
  if(stageFilter&&!pipelineForStage(String(candidate.stage)).accepts.includes(String(candidate.stage) as never))return false;
  if(stageFilter&&pipelineForStage(String(candidate.stage)).key!==stageFilter)return false;
  return true;
 }),[candidates,departmentFilter,jobById,jobFilter,search,stageFilter]);

 const selected=(selectedId?candidates.find(row=>String(row.id)===selectedId):undefined)??filtered[0]??candidates[0]??null;
 const selectedJob=selected?jobById.get(String(selected.jobId)):undefined;
 const openJobs=jobs.filter(job=>job.status==='OPEN');
 const interviewToday=candidates.filter(row=>pipelineForStage(String(row.stage)).key==='INTERVIEW'&&sameLocalDay(row.interviewAt)).length;
 const offers=candidates.filter(row=>row.stage==='OFFER').length;
 const thisMonth=monthKey(new Date());
 const hiresThisMonth=candidates.filter(row=>row.stage==='HIRED'&&String(row.updatedAt??row.createdAt??'').slice(0,7)===thisMonth).length;

 const months=useMemo(()=>Array.from({length:6},(_,index)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-(5-index));return {key:monthKey(d),label:d.toLocaleDateString('en-US',{month:'short'})};}),[]);
 const trend=months.map(m=>candidates.filter(row=>String(row.createdAt??'').slice(0,7)===m.key).length);
 const trendMax=Math.max(1,...trend);
 const trendPoints=trend.map((value,index)=>`${index*56},${92-(value/trendMax)*72}`).join(' ');
 const stageCounts=PIPELINE.map(stage=>({stage,count:candidates.filter(row=>stage.accepts.includes(String(row.stage) as never)).length}));
 const pipelineTotal=Math.max(1,candidates.length);
 let cursor=0;
 const mixSegments=stageCounts.map(({stage,count})=>{const start=cursor,end=cursor+(count/pipelineTotal)*100;cursor=end;return {stage,count,start,end};});
 const mixColors:Record<string,string>={APPLIED:'#38bdf8',SCREENING:'#7c3aed',INTERVIEW:'#f59e0b',OFFER:'#10b981',HIRED:'#22c55e',REJECTED:'#ef4444'};
 const donut=mixSegments.map(s=>`${mixColors[s.stage.key]} ${s.start}% ${s.end}%`).join(',');

 async function moveCandidate(candidate:Row,target:PipelineStage){
  if(!canEdit||target.accepts.includes(String(candidate.stage) as never))return;
  await mutate(`candidates/${candidate.id}`,'PATCH',candidatePayload(candidate,target.key));
  setSelectedId(String(candidate.id));
 }

 const applicantCount=(jobId:any)=>candidates.filter(candidate=>String(candidate.jobId)===String(jobId)).length;
 const profileScore=selected?Math.round([selected.name,selected.email,selected.phone,selected.jobId,selected.notes,selected.interviewAt].filter(Boolean).length/6*100):0;
 const nextAction=selected?.stage==='HIRED'?'Candidate hired':selected?.stage==='OFFER'?'Follow up on offer':pipelineForStage(String(selected?.stage??'')).key==='INTERVIEW'?(selected?.interviewAt?'Review scheduled interview':'Schedule interview'):'Advance candidate';

 if(candidatesQuery.isLoading||jobsQuery.isLoading)return <Loading/>;
 if(candidatesQuery.error)return <Failure error={candidatesQuery.error}/>;
 if(jobsQuery.error)return <Failure error={jobsQuery.error}/>;

 return <div className="recruit-v3">
  <div className="recruit-v3-head">
   <div><span className="recruit-v3-eyebrow">TALENT ACQUISITION</span><h1>Recruitment</h1><p>Find, engage and hire the right people from one focused workspace.</p></div>
   <div className="recruit-v3-head-actions">
    {canExport&&<a className="btn secondary small" href="/api/reports/candidates?format=xlsx"><Download size={16}/>Export</a>}
    {canCreate&&<button className="btn secondary small" onClick={()=>setCandidateEdit(null)}><UserPlus size={16}/>Add Candidate</button>}
    {canCreate&&<button className="btn primary small" onClick={()=>setJobEdit(null)}><Plus size={16}/>Create Job</button>}
   </div>
  </div>

  <section className="recruit-v3-metrics">
   <MetricCard tone="blue" icon={<Briefcase/>} label="Open Positions" value={openJobs.length} detail={openJobs.reduce((n,row)=>n+Number(row.openings??1),0)+' openings'}/>
   <MetricCard tone="indigo" icon={<Users/>} label="Total Applicants" value={candidates.length} detail="live pipeline"/>
   <MetricCard tone="violet" icon={<CalendarDays/>} label="Interviews Today" value={interviewToday} detail="scheduled today"/>
   <MetricCard tone="amber" icon={<ArrowUpRight/>} label="Offers Sent" value={offers} detail="awaiting outcome"/>
   <MetricCard tone="green" icon={<CheckCircle2/>} label="Hires This Month" value={hiresThisMonth} detail="completed hires"/>
  </section>

  <section className="recruit-v3-filterbar">
   <label className="recruit-v3-search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search candidates, jobs, email…"/></label>
   <select value={jobFilter} onChange={e=>setJobFilter(e.target.value)}><option value="">All Jobs</option>{jobs.map(job=><option key={job.id} value={job.id}>{job.title}</option>)}</select>
   <select value={departmentFilter} onChange={e=>setDepartmentFilter(e.target.value)}><option value="">All Departments</option>{departments.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select>
   <select value={stageFilter} onChange={e=>setStageFilter(e.target.value)}><option value="">All Stages</option>{PIPELINE.map(stage=><option key={stage.key} value={stage.key}>{stage.label}</option>)}</select>
   <span className="recruit-v3-live"><i/>Live pipeline</span>
  </section>

  <div className="recruit-v3-main-grid">
   <main className="recruit-v3-left">
    <section className="recruit-v3-panel recruit-v3-pipeline-panel">
     <div className="recruit-v3-section-head"><div><h2>Hiring Pipeline</h2><span>{filtered.length} candidates</span></div><small>Drag a candidate to any stage to update it instantly.</small></div>
     {!candidates.length?<Empty title="No candidates yet" description="Add your first candidate to start the hiring pipeline." action={canCreate?<button className="btn primary small" onClick={()=>setCandidateEdit(null)}>Add Candidate</button>:undefined}/>:<div className="recruit-v3-board">
      {PIPELINE.filter(stage=>!stageFilter||stage.key===stageFilter).map(stage=>{
       const rows=filtered.filter(row=>stage.accepts.includes(String(row.stage) as never));
       return <section
         className={'recruit-v3-column '+stage.tone+(dragOver===stage.key?' is-over':'')}
         key={stage.key}
         onDragOver={e=>{if(!canEdit)return;e.preventDefault();e.dataTransfer.dropEffect='move';setDragOver(stage.key)}}
         onDragLeave={e=>{if(e.currentTarget===e.target)setDragOver('')}}
         onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('text/candidate')||dragId;const row=candidates.find(item=>String(item.id)===id);setDragOver('');setDragId('');if(row)void moveCandidate(row,stage)}}
       >
        <header><strong>{stage.label}</strong><span>{rows.length}</span></header>
        <div className="recruit-v3-drop-note">{dragOver===stage.key?'Drop to move here':' '}</div>
        <div className="recruit-v3-column-list">{rows.map(candidate=><CandidateCard
          key={candidate.id}
          candidate={candidate}
          jobTitle={String(jobById.get(String(candidate.jobId))?.title??'')}
          canMove={canEdit}
          onOpen={()=>setSelectedId(String(candidate.id))}
          onDragStart={e=>{setDragId(String(candidate.id));e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/candidate',String(candidate.id))}}
          onDragEnd={()=>{setDragId('');setDragOver('')}}
        />)}{!rows.length&&<div className="recruit-v3-empty-stage">Drop candidates here</div>}</div>
       </section>
      })}
     </div>}
    </section>

    <div className="recruit-v3-bottom-grid">
     <section className="recruit-v3-panel recruit-v3-jobs">
      <div className="recruit-v3-section-head"><div><h2>Open Positions</h2><span>{openJobs.length} active</span></div>{canCreate&&<button className="text-button" onClick={()=>setJobEdit(null)}>Create job <Plus size={14}/></button>}</div>
      <div className="recruit-v3-table-wrap"><table><thead><tr><th>Job Title</th><th>Department</th><th>Location</th><th>Applicants</th><th>Status</th><th>Posted</th></tr></thead><tbody>{jobs.slice(0,6).map(job=><tr key={job.id} onClick={()=>setJobFilter(String(job.id))}><td><strong>{job.title}</strong></td><td>{departmentById.get(String(job.departmentId))||'—'}</td><td><MapPin size={12}/>{job.location}</td><td>{applicantCount(job.id)}</td><td><Badge value={job.status}/></td><td>{displayDate(job.createdAt)}</td></tr>)}</tbody></table></div>
     </section>

     <section className="recruit-v3-panel recruit-v3-trend">
      <div className="recruit-v3-section-head"><div><h2>Applicants Trend</h2><span>Last 6 months</span></div></div>
      <div className="recruit-v3-chart">
       <svg viewBox="0 0 280 112" role="img" aria-label="Applicants trend">
        <defs><linearGradient id="recruitArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#38bdf8" stopOpacity=".24"/><stop offset="100%" stopColor="#38bdf8" stopOpacity=".02"/></linearGradient></defs>
        <line x1="0" y1="92" x2="280" y2="92" stroke="#dbe4f0" strokeWidth="1"/>
        <polygon points={`0,92 ${trendPoints} 280,92`} fill="url(#recruitArea)"/>
        <polyline points={trendPoints} fill="none" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        {trend.map((value,index)=><g key={months[index].key}><circle cx={index*56} cy={92-(value/trendMax)*72} r="3.5" fill="#fff" stroke="#38bdf8" strokeWidth="2"/><text x={index*56} y="108" textAnchor={index===0?'start':index===5?'end':'middle'}>{months[index].label}</text></g>)}
       </svg>
      </div>
     </section>

     <section className="recruit-v3-panel recruit-v3-mix">
      <div className="recruit-v3-section-head"><div><h2>Pipeline Mix</h2><span>All candidates</span></div></div>
      <div className="recruit-v3-mix-body">
       <div className="recruit-v3-donut" style={{background:`conic-gradient(${donut||'#e2e8f0 0 100%'})`}}><span><strong>{candidates.length}</strong><small>Applicants</small></span></div>
       <div className="recruit-v3-legend">{stageCounts.slice(0,5).map(({stage,count})=><div key={stage.key}><i style={{background:mixColors[stage.key]}}/><span>{stage.label}</span><strong>{count}</strong></div>)}</div>
      </div>
     </section>
    </div>
   </main>

   <aside className="recruit-v3-panel recruit-v3-detail">
    {!selected?<Empty title="Select a candidate" description="Candidate details will appear here."/>:<>
     <div className="recruit-v3-detail-top">
      <span className="recruit-v3-person large"><Avatar name={String(selected.name??'Candidate')} large/><span><strong>{selected.name}</strong><small>{selectedJob?.title??'Candidate'}</small></span></span>
      <button className="icon-button" aria-label="Close candidate details" onClick={()=>setSelectedId('')}><X size={16}/></button>
     </div>
     <div className="recruit-v3-detail-status"><Badge value={selected.stage}/><span>{selectedJob?.location&&<><MapPin size={13}/>{selectedJob.location}</>}</span></div>
     <div className="recruit-v3-contact"><span><Mail size={14}/>{selected.email}</span>{selected.phone&&<span><Phone size={14}/>{selected.phone}</span>}</div>
     <nav className="recruit-v3-detail-tabs"><button className="active">Overview</button><button onClick={()=>setCandidateEdit(selected)}>Edit profile</button></nav>
     <section className="recruit-v3-score">
      <div className="recruit-v3-score-ring" style={{'--score':profileScore} as React.CSSProperties}><span>{profileScore}%</span></div>
      <div><small>Profile score</small><strong>{profileScore>=80?'Strong profile':profileScore>=60?'Good profile':'Needs details'}</strong><p>Based on the candidate information currently saved in TCW HR.</p></div>
     </section>
     <section className="recruit-v3-detail-cards">
      <article><Briefcase size={16}/><span><small>Position</small><strong>{selectedJob?.title??'—'}</strong><em>{selectedJob?.employmentType?readable(String(selectedJob.employmentType).toLowerCase()):'—'}</em></span></article>
      <article><Clock3 size={16}/><span><small>Interview</small><strong>{selected.interviewAt?new Date(selected.interviewAt).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):'Not scheduled'}</strong><em>{selected.interviewAt?'Upcoming / planned':'Set a date and time'}</em></span></article>
     </section>
     <section className="recruit-v3-notes"><small>RECRUITER NOTES</small><p>{selected.notes||'No recruiter notes added yet.'}</p></section>
     <section className="recruit-v3-next">
      <span className="recruit-v3-next-icon"><CalendarDays size={17}/></span><div><small>Next Action</small><strong>{nextAction}</strong><p>{selected.interviewAt?'Interview: '+new Date(selected.interviewAt).toLocaleString('en-IN'):'Keep the candidate moving through the pipeline.'}</p></div>
     </section>
     {canEdit&&<button className="btn primary recruit-v3-wide-action" onClick={()=>setCandidateEdit(selected)}>{pipelineForStage(String(selected.stage)).key==='INTERVIEW'?'Schedule / Update Interview':'Update Candidate'} <ArrowUpRight size={16}/></button>}
    </>}
   </aside>
  </div>

  {candidateEdit!==undefined&&<Modal title={candidateEdit?'Update candidate':'Add candidate'} onClose={()=>setCandidateEdit(undefined)} wide><RecordForm fields={modules.candidates.fields} initial={candidateEdit??undefined} onCancel={()=>setCandidateEdit(undefined)} onSave={async body=>{const result=await mutate('candidates'+(candidateEdit?'/'+candidateEdit.id:''),candidateEdit?'PATCH':'POST',body);if(result?.id)setSelectedId(String(result.id));setCandidateEdit(undefined)}} submit={candidateEdit?'Save candidate':'Add candidate'}/></Modal>}
  {jobEdit!==undefined&&<Modal title={jobEdit?'Update job':'Create job'} onClose={()=>setJobEdit(undefined)} wide><RecordForm fields={modules.jobs.fields} initial={jobEdit??undefined} onCancel={()=>setJobEdit(undefined)} onSave={async body=>{await mutate('jobs'+(jobEdit?'/'+jobEdit.id:''),jobEdit?'PATCH':'POST',body);setJobEdit(undefined)}} submit={jobEdit?'Save job':'Create job'}/></Modal>}
 </div>;
}
