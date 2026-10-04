'use client';
import React,{useEffect,useState} from 'react';
import {CalendarDays,Clock3,CheckCircle2,XCircle,Download,Plus,Search,MoreHorizontal,X,Check,ChevronLeft,ChevronRight,Settings2} from 'lucide-react';
import {modules,Row,readable} from './config';
import {useApp,useData,Avatar,Badge,Modal,RecordForm,Loading,Failure,Empty,displayDate} from './core';

const PAGE_SIZE=10;
const leaveRequestFields=modules.leave.fields;

function personName(row:Row|undefined,fallback='Employee'){
  if(!row)return fallback;
  const full=`${row.firstName??''} ${row.lastName??''}`.trim();
  return full||String(row.name??fallback);
}

function statusCopy(status:any){
  const value=String(status??'PENDING').toUpperCase();
  return value==='PENDING'?'Pending Approval':readable(value.toLowerCase());
}

export function TimeOffDashboard({onOpenPolicies}:{onOpenPolicies?:()=>void}){
  const {session,can,mutate}=useApp();
  const requests=useData('leave');
  const employees=useData('employees?pageSize=500',can('employees'));
  const leaveTypes=useData('leave-types',can('leave'));
  const [status,setStatus]=useState('ALL');
  const [search,setSearch]=useState('');
  const [page,setPage]=useState(1);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [detailClosed,setDetailClosed]=useState(false);
  const [requestOpen,setRequestOpen]=useState(false);
  const [requestKey,setRequestKey]=useState('');
  const [review,setReview]=useState<{row:Row;decision:'APPROVED'|'REJECTED'}|null>(null);

  const rows:Row[]=requests.data?.items??[];
  const people:Row[]=employees.data?.items??[];
  const types:Row[]=leaveTypes.data?.items??[];
  const employeeFor=(employeeId:any)=>people.find(r=>r.id===employeeId);
  const leaveTypeFor=(leaveTypeId:any)=>types.find(r=>r.id===leaveTypeId);

  const filtered=rows.filter(row=>{
    if(status!=='ALL'&&String(row.status??'').toUpperCase()!==status)return false;
    if(!search.trim())return true;
    const employee=employeeFor(row.employeeId);
    const type=leaveTypeFor(row.leaveTypeId);
    const haystack=[
      personName(employee,session.user.employeeId===row.employeeId?session.user.name:''),
      employee?.employeeCode,
      employee?.designation,
      type?.name,
      row.reason,
      row.status
    ].join(' ').toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });

  const pageCount=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const safePage=Math.min(page,pageCount);
  const visible=filtered.slice((safePage-1)*PAGE_SIZE,safePage*PAGE_SIZE);
  const selected=selectedId?rows.find(r=>r.id===selectedId)??null:null;

  useEffect(()=>{setPage(1)},[status,search]);
  useEffect(()=>{
    if(detailClosed||!visible.length)return;
    if(!selectedId||!visible.some(r=>r.id===selectedId))setSelectedId(visible[0].id);
  },[detailClosed,visible.length,safePage,status,search,selectedId]);

  const total=rows.length;
  const pending=rows.filter(r=>r.status==='PENDING').length;
  const approved=rows.filter(r=>r.status==='APPROVED').length;
  const rejected=rows.filter(r=>r.status==='REJECTED').length;
  const cancelled=rows.filter(r=>r.status==='CANCELLED').length;
  const tabs=[
    ['ALL',`All Requests (${total})`],
    ['PENDING',`Pending (${pending})`],
    ['APPROVED',`Approved (${approved})`],
    ['REJECTED',`Rejected (${rejected})`],
    ...(cancelled?[['CANCELLED',`Cancelled (${cancelled})`]]:[])
  ] as string[][];

  const pageStart=Math.max(1,Math.min(safePage-2,Math.max(1,pageCount-4)));
  const pageNumbers=Array.from({length:Math.min(5,pageCount)},(_,i)=>pageStart+i).filter(v=>v<=pageCount);
  const openRequest=()=>{setRequestKey(crypto.randomUUID());setRequestOpen(true)};
  const selectRequest=(row:Row)=>{setDetailClosed(false);setSelectedId(row.id)};

  if(requests.isLoading)return <Loading/>;
  if(requests.error)return <Failure error={requests.error as Error} retry={()=>requests.refetch()}/>;

  const selectedEmployee=selected?employeeFor(selected.employeeId):undefined;
  const selectedLeaveType=selected?leaveTypeFor(selected.leaveTypeId):undefined;
  const selectedName=selected?personName(selectedEmployee,session.user.employeeId===selected.employeeId?session.user.name:'Employee'):'';
  const selectedYear=selected?new Date(selected.startDate).getUTCFullYear():new Date().getUTCFullYear();
  const balances=selected?types.map(type=>{
    const used=rows.filter(r=>
      r.employeeId===selected.employeeId&&
      r.leaveTypeId===type.id&&
      ['PENDING','APPROVED'].includes(String(r.status))&&
      new Date(r.startDate).getUTCFullYear()===selectedYear
    ).reduce((n,r)=>n+Number(r.days??0),0);
    return {id:type.id,name:type.name,annual:Number(type.annualDays??0),remaining:Math.max(0,Number(type.annualDays??0)-used)};
  }):[];

  const canApproveSelected=!!selected&&selected.status==='PENDING'&&selected.employeeId!==session.user.employeeId&&can('leave','APPROVE');
  const canRejectSelected=!!selected&&selected.status==='PENDING'&&selected.employeeId!==session.user.employeeId&&can('leave','REJECT');

  return <div className="timeoff-v3">
    <div className="timeoff-v3-head">
      <div>
        <h1>Time Off</h1>
        <p>Manage employee time off requests and leave balances</p>
      </div>
      <div className="timeoff-v3-head-actions">
        {onOpenPolicies&&can('leave','MANAGE')&&<button className="btn secondary timeoff-v3-button" onClick={onOpenPolicies}><Settings2 size={18}/>Leave Policies</button>}
        {can('leave','EXPORT')&&can('reports','EXPORT')&&<a className="btn secondary timeoff-v3-button" href="/api/reports/leave?format=xlsx"><Download size={18}/>Export</a>}
        {can('leave','CREATE')&&<button className="btn primary timeoff-v3-button" onClick={openRequest}><Plus size={20}/>Request Time Off</button>}
      </div>
    </div>

    <div className="timeoff-v3-layout">
      <main className="timeoff-v3-main">
        <div className="timeoff-v3-stats">
          <article className="timeoff-v3-stat total"><span className="timeoff-v3-stat-icon"><CalendarDays size={22}/></span><div><small>Total Requests</small><strong>{total}</strong><p>All time-off records</p></div></article>
          <article className="timeoff-v3-stat pending"><span className="timeoff-v3-stat-icon"><Clock3 size={22}/></span><div><small>Pending Approval</small><strong>{pending}</strong><p>Waiting for review</p></div></article>
          <article className="timeoff-v3-stat approved"><span className="timeoff-v3-stat-icon"><CheckCircle2 size={22}/></span><div><small>Approved</small><strong>{approved}</strong><p>Approved requests</p></div></article>
          <article className="timeoff-v3-stat rejected"><span className="timeoff-v3-stat-icon"><XCircle size={22}/></span><div><small>Rejected</small><strong>{rejected}</strong><p>Declined requests</p></div></article>
        </div>

        <section className="timeoff-v3-list">
          <div className="timeoff-v3-filters">
            <div className="timeoff-v3-tabs" role="tablist" aria-label="Time off request status">
              {tabs.map(([value,label])=><button type="button" role="tab" aria-selected={status===value} className={status===value?'active':''} key={value} onClick={()=>setStatus(value)}>{label}</button>)}
            </div>
            <label className="timeoff-v3-search">
              <Search size={18}/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, leave type..."/>
            </label>
          </div>

          {!filtered.length?<Empty title={search||status!=='ALL'?'No matching time off requests':'No time off requests yet'} description={search||status!=='ALL'?'Try another status or search term.':'New requests will appear here.'} action={can('leave','CREATE')?<button className="btn primary" onClick={openRequest}><Plus size={18}/>Request Time Off</button>:undefined}/>:<>
            <div className="timeoff-v3-table-wrap">
              <table className="timeoff-v3-table">
                <thead><tr><th>Employee</th><th>Leave Type</th><th>Date Range</th><th>Days</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>{visible.map(row=>{
                  const employee=employeeFor(row.employeeId);
                  const name=personName(employee,session.user.employeeId===row.employeeId?session.user.name:'Employee');
                  const type=leaveTypeFor(row.leaveTypeId);
                  return <tr key={row.id} className={selectedId===row.id?'selected':''} onClick={()=>selectRequest(row)}>
                    <td><span className="timeoff-v3-person"><Avatar name={name} src={employee?.photo}/><span><strong>{name}</strong><small>{employee?.designation??employee?.employeeCode??''}</small></span></span></td>
                    <td>{type?.name??'Leave'}</td>
                    <td><span className="timeoff-v3-date-range">{displayDate(row.startDate)}{String(row.startDate).slice(0,10)!==String(row.endDate).slice(0,10)&&<><br/>{displayDate(row.endDate)}</>}</span></td>
                    <td>{Number(row.days??0)}</td>
                    <td><Badge value={row.status}/></td>
                    <td><button type="button" className="icon-button timeoff-v3-more" aria-label={`Open ${name} time off details`} onClick={e=>{e.stopPropagation();selectRequest(row)}}><MoreHorizontal size={20}/></button></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            <div className="timeoff-v3-pagination">
              <span>Showing {filtered.length?(safePage-1)*PAGE_SIZE+1:0}–{Math.min(safePage*PAGE_SIZE,filtered.length)} of {filtered.length} requests</span>
              <div>
                <button className="icon-button" disabled={safePage===1} onClick={()=>setPage(Math.max(1,safePage-1))} aria-label="Previous page"><ChevronLeft size={19}/></button>
                {pageNumbers.map(n=><button key={n} className={'timeoff-v3-page '+(n===safePage?'active':'')} onClick={()=>setPage(n)}>{n}</button>)}
                <button className="icon-button" disabled={safePage===pageCount} onClick={()=>setPage(Math.min(pageCount,safePage+1))} aria-label="Next page"><ChevronRight size={19}/></button>
              </div>
            </div>
          </>}
        </section>
      </main>

      {selected&&!detailClosed&&<aside className="timeoff-v3-detail">
        <div className="timeoff-v3-detail-head"><h2>Time Off Details</h2><button className="icon-button" aria-label="Close time off details" onClick={()=>{setDetailClosed(true);setSelectedId(null)}}><X size={20}/></button></div>
        <div className="timeoff-v3-detail-body">
          <div className={'timeoff-v3-status-line '+String(selected.status??'pending').toLowerCase()}><span className={'timeoff-v3-status-dot '+String(selected.status??'').toLowerCase()}/><strong>{statusCopy(selected.status)}</strong></div>
          <div className="timeoff-v3-detail-person"><Avatar large name={selectedName} src={selectedEmployee?.photo}/><div><h3>{selectedName}</h3><p>{selectedEmployee?.designation??selectedEmployee?.employeeCode??''}</p></div></div>

          <dl className="timeoff-v3-detail-grid">
            <dt>Leave Type</dt><dd>{selectedLeaveType?.name??'Leave'}</dd>
            <dt>Start Date</dt><dd>{displayDate(selected.startDate)}</dd>
            <dt>End Date</dt><dd>{displayDate(selected.endDate)}</dd>
            <dt>Total Days</dt><dd>{Number(selected.days??0)} {Number(selected.days??0)===1?'day':'days'}</dd>
            <dt>Reason</dt><dd className="wide">{selected.reason||'—'}</dd>
            <dt>Requested On</dt><dd>{selected.createdAt?new Date(selected.createdAt).toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}):'—'}</dd>
          </dl>

          {!!balances.length&&<section className="timeoff-v3-detail-section">
            <h4>Leave Balance</h4>
            <div className="timeoff-v3-balances">{balances.map((b,index)=><div key={b.id} className={'tone-'+(index%3)}><span>{b.name}</span><strong>{b.remaining} days remaining</strong></div>)}</div>
          </section>}

          <section className="timeoff-v3-detail-section">
            <h4>Notes & Comments</h4>
            <div className="timeoff-v3-note">
              <div className="timeoff-v3-note-person"><Avatar name={selectedName} src={selectedEmployee?.photo}/><span><strong>{selectedName}</strong><small>{selected.createdAt?displayDate(selected.createdAt):''}</small></span></div>
              <p>{selected.reason||'No reason was provided.'}</p>
              {selected.reviewNote&&<p className="timeoff-v3-review-note"><strong>Review note:</strong> {selected.reviewNote}</p>}
            </div>
          </section>

          {(canApproveSelected||canRejectSelected)&&<div className="timeoff-v3-review-actions">
            {canApproveSelected&&<button className="btn timeoff-v3-approve" onClick={()=>setReview({row:selected,decision:'APPROVED'})}><Check size={19}/>Approve</button>}
            {canRejectSelected&&<button className="btn danger timeoff-v3-reject" onClick={()=>setReview({row:selected,decision:'REJECTED'})}><X size={19}/>Reject</button>}
          </div>}
        </div>
      </aside>}
    </div>

    {requestOpen&&<Modal title={session.user.role==='EMPLOYEE'?'Request time off':'Request Time Off'} onClose={()=>setRequestOpen(false)} wide>
      <RecordForm
        fields={leaveRequestFields}
        initial={session.user.employeeId?{employeeId:session.user.employeeId}:undefined}
        formClassName="leave-request-form timeoff-v3-request-form"
        fieldFilter={field=>!(session.user.role==='EMPLOYEE'&&field.key==='employeeId')}
        onCancel={()=>setRequestOpen(false)}
        onSave={async body=>{
          const payload={...body,...(session.user.role==='EMPLOYEE'&&session.user.employeeId?{employeeId:session.user.employeeId}:{}),requestKey:requestKey||crypto.randomUUID()};
          await mutate('leave','POST',payload);
          setRequestOpen(false);
        }}
        submit="Submit Request"
      />
    </Modal>}

    {review&&<Modal title={(review.decision==='APPROVED'?'Approve':'Reject')+' request'} onClose={()=>setReview(null)}>
      <RecordForm
        fields={[{key:'note',label:'Review note',type:'textarea',required:false}]}
        onCancel={()=>setReview(null)}
        onSave={async body=>{await mutate(`leave/${review.row.id}/review`,'POST',{...body,decision:review.decision});setReview(null)}}
        submit={review.decision==='APPROVED'?'Approve Request':'Reject Request'}
      />
    </Modal>}
  </div>;
}
