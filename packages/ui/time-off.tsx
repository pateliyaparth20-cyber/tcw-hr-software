'use client';
import React,{useEffect,useState} from 'react';
import {CalendarDays,Clock3,CheckCircle2,XCircle,Download,Plus,Search,MoreHorizontal,X,Check,ChevronLeft,ChevronRight,Settings2,RefreshCw,Plane} from 'lucide-react';
import './time-off-design.css';
import {modules,Row,readable} from './config';
import {useApp,useData,Avatar,Badge,Modal,RecordForm,Loading,Failure,Empty,displayDate} from './core';

const PAGE_SIZE=10;
const ACTION_MENU_WIDTH=220;
const ACTION_MENU_ESTIMATED_HEIGHT=224;
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
  const [leaveTypeFilter,setLeaveTypeFilter]=useState(''),[yearFilter,setYearFilter]=useState(''),[sort,setSort]=useState('RECENT');
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [detailClosed,setDetailClosed]=useState(false);
  const [requestOpen,setRequestOpen]=useState(false);
  const [requestKey,setRequestKey]=useState('');
  const [review,setReview]=useState<{row:Row;decision:'APPROVED'|'REJECTED'}|null>(null);
  const [cancelLeave,setCancelLeave]=useState<Row|null>(null);
  const [actionMenu,setActionMenu]=useState<{id:string;top:number;left:number;focusLast:boolean}|null>(null);

  const rows:Row[]=requests.data?.items??[];
  const people:Row[]=employees.data?.items??[];
  const types:Row[]=leaveTypes.data?.items??[];
  const employeeFor=(employeeId:any)=>people.find(r=>r.id===employeeId)??rows.find(r=>r.employeeId===employeeId)?.employee;
  const leaveTypeFor=(leaveTypeId:any)=>types.find(r=>r.id===leaveTypeId);

  const filtered=rows.filter(row=>{
    if(status!=='ALL'&&String(row.status??'').toUpperCase()!==status)return false;
    if(leaveTypeFilter&&row.leaveTypeId!==leaveTypeFilter)return false;
    if(yearFilter&&String(row.startDate).slice(0,4)!==yearFilter)return false;
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
  }).sort((a,b)=>sort==='START'?+new Date(a.startDate)-+new Date(b.startDate):+new Date(b.createdAt)-+new Date(a.createdAt));

  const pageCount=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const safePage=Math.min(page,pageCount);
  const visible=filtered.slice((safePage-1)*PAGE_SIZE,safePage*PAGE_SIZE);
  const selected=selectedId?rows.find(r=>r.id===selectedId)??null:null;

  const balanceYear=selected?new Date(selected.startDate).getUTCFullYear():new Date().getUTCFullYear();
  const balanceQuery=useData('leave/balances?employeeId='+encodeURIComponent(selected?.employeeId??'')+'&year='+balanceYear,!!selected&&can('leave'));
  const resetFilters=()=>{setStatus('ALL');setSearch('');setLeaveTypeFilter('');setYearFilter('');setSort('RECENT');setPage(1)};
  useEffect(()=>{setPage(1)},[status,search,leaveTypeFilter,yearFilter,sort]);
  useEffect(()=>{
    if(!actionMenu)return;
    const menuId=`timeoff-actions-menu-${actionMenu.id}`,triggerId=`timeoff-actions-trigger-${actionMenu.id}`;
    const closeForLayout=()=>setActionMenu(null);
    const closeForOutside=(event:PointerEvent)=>{
      const target=event.target as Node|null,menu=document.getElementById(menuId),trigger=document.getElementById(triggerId);
      if(target&&(menu?.contains(target)||trigger?.contains(target)))return;
      setActionMenu(null);
    };
    const closeForEscape=(event:KeyboardEvent)=>{
      if(event.key!=='Escape')return;
      event.preventDefault();
      setActionMenu(null);
      requestAnimationFrame(()=>document.getElementById(triggerId)?.focus());
    };
    window.addEventListener('pointerdown',closeForOutside);
    window.addEventListener('resize',closeForLayout);
    window.addEventListener('scroll',closeForLayout,true);
    window.addEventListener('keydown',closeForEscape);
    requestAnimationFrame(()=>{
      const items=Array.from(document.querySelectorAll<HTMLButtonElement>(`#${menuId} [role="menuitem"]`));
      (actionMenu.focusLast?items.at(-1):items[0])?.focus();
    });
    return()=>{
      window.removeEventListener('pointerdown',closeForOutside);
      window.removeEventListener('resize',closeForLayout);
      window.removeEventListener('scroll',closeForLayout,true);
      window.removeEventListener('keydown',closeForEscape);
    };
  },[actionMenu?.id,actionMenu?.focusLast]);
  useEffect(()=>{
    if(detailClosed||!visible.length)return;
    if(!selectedId||!visible.some(r=>r.id===selectedId))setSelectedId(visible[0].id);
  },[detailClosed,visible.length,safePage,status,search,leaveTypeFilter,yearFilter,sort,selectedId]);

  const total=Number(requests.data?.total??rows.length);
  const pending=Number(requests.data?.summary?.PENDING??rows.filter(r=>r.status==='PENDING').length);
  const approved=Number(requests.data?.summary?.APPROVED??rows.filter(r=>r.status==='APPROVED').length);
  const rejected=Number(requests.data?.summary?.REJECTED??rows.filter(r=>r.status==='REJECTED').length);
  const cancelled=Number(requests.data?.summary?.CANCELLED??rows.filter(r=>r.status==='CANCELLED').length);
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
  const openActionMenu=(rowId:string,button:HTMLButtonElement,focusLast=false)=>{
    const rect=button.getBoundingClientRect();
    const below=rect.bottom+6,top=below+ACTION_MENU_ESTIMATED_HEIGHT<=window.innerHeight-12?below:Math.max(12,rect.top-ACTION_MENU_ESTIMATED_HEIGHT-6);
    const left=Math.max(12,Math.min(window.innerWidth-ACTION_MENU_WIDTH-12,rect.right-ACTION_MENU_WIDTH));
    setActionMenu({id:rowId,top,left,focusLast});
  };
  const handleActionMenuKeyDown=(event:React.KeyboardEvent<HTMLDivElement>)=>{
    const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    if(!items.length)return;
    const index=items.indexOf(document.activeElement as HTMLButtonElement);
    if(event.key==='ArrowDown'){event.preventDefault();items[(index+1+items.length)%items.length].focus();}
    else if(event.key==='ArrowUp'){event.preventDefault();items[(index-1+items.length)%items.length].focus();}
    else if(event.key==='Home'){event.preventDefault();items[0].focus();}
    else if(event.key==='End'){event.preventDefault();items[items.length-1].focus();}
  };

  if(requests.isLoading)return <Loading/>;
  if(requests.error)return <Failure error={requests.error as Error} retry={()=>requests.refetch()}/>;

  const selectedEmployee=selected?employeeFor(selected.employeeId):undefined;
  const selectedLeaveType=selected?leaveTypeFor(selected.leaveTypeId):undefined;
  const selectedName=selected?personName(selectedEmployee,session.user.employeeId===selected.employeeId?session.user.name:'Employee'):'';
  const selectedYear=selected?new Date(selected.startDate).getUTCFullYear():new Date().getUTCFullYear();
  const balances:Row[]=balanceQuery.data?.items??[];
  const balanceReady=!!balanceQuery.data&&!balanceQuery.error;
  const paidLeaveTaken=balanceReady?Number(balanceQuery.data?.paidTaken??0):'—';
  const unpaidLeaveTaken=balanceReady?Number(balanceQuery.data?.unpaidTaken??0):'—';
  const totalLeaveBalance=balanceReady?balances.reduce((n,b)=>n+Number(b.remaining??0),0):'—';

  const selectedIsSelf=!!selected&&selected.employeeId===session.user.employeeId;
  const canApproveSelected=!!selected&&selected.status==='PENDING'&&!selectedIsSelf&&can('leave','APPROVE');
  const canRejectSelected=!!selected&&selected.status==='PENDING'&&!selectedIsSelf&&can('leave','REJECT');
  const canCancelSelected=!!selected&&['PENDING','APPROVED'].includes(String(selected.status))&&(selectedIsSelf?can('leave','CREATE'):can('leave','EDIT'));

  return <div className="timeoff-v3 timeoff-v4">
    <div className="timeoff-v3-head">
      <div>
        <span className="timeoff-v4-eyebrow"><Plane size={15}/>TEAM · TIME OFF</span><h1>Time Off</h1>
        <p>Plan time away. Keep every request, approval and balance clear.</p>
      </div>
      <div className="timeoff-v3-head-actions"><button className="btn secondary timeoff-v3-button" disabled={requests.isFetching} onClick={()=>{void requests.refetch();if(selected)void balanceQuery.refetch()}}><RefreshCw size={16}/>Refresh</button>
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
              <input aria-label="Search time off requests" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, leave type..."/>
            </label>
          </div>

          <div className="timeoff-v4-filter-row"><label><span>Leave type</span><select aria-label="Filter leave type" value={leaveTypeFilter} onChange={e=>setLeaveTypeFilter(e.target.value)}><option value="">All leave types</option>{types.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label><span>Year</span><select aria-label="Filter leave year" value={yearFilter} onChange={e=>setYearFilter(e.target.value)}><option value="">All years</option>{[...new Set(rows.map(r=>String(r.startDate).slice(0,4)))].sort().reverse().map(y=><option key={y}>{y}</option>)}</select></label><label><span>Sort by</span><select aria-label="Sort time off requests" value={sort} onChange={e=>setSort(e.target.value)}><option value="RECENT">Newest requests</option><option value="START">Upcoming dates</option></select></label><button type="button" className="text-button" onClick={resetFilters}>Reset filters</button></div>
          {rows.length<total&&<p className="timeoff-v4-list-note">Showing the latest {rows.length} requests. Leave balances include all requests for the selected year.</p>}
          {!filtered.length?<Empty title={search||status!=='ALL'?'No matching time off requests':'No time off requests yet'} description={search||status!=='ALL'?'Try another status or search term.':'New requests will appear here.'} action={can('leave','CREATE')?<button className="btn primary" onClick={openRequest}><Plus size={18}/>Request Time Off</button>:undefined}/>:<>
            <div className="timeoff-v3-table-wrap">
              <table className="timeoff-v3-table">
                <thead><tr><th>Employee</th><th>Leave Type</th><th>Date Range</th><th>Days</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>{visible.map(row=>{
                  const employee=employeeFor(row.employeeId);
                  const name=personName(employee,session.user.employeeId===row.employeeId?session.user.name:'Employee');
                  const type=leaveTypeFor(row.leaveTypeId);
                  return <tr key={row.id} tabIndex={0} aria-label={'View time off request for '+personName(employeeFor(row.employeeId),'Employee')} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selectRequest(row)}}} className={selectedId===row.id?'selected':''} onClick={()=>selectRequest(row)}>
                    <td><span className="timeoff-v3-person"><Avatar name={name} src={employee?.photo}/><span><strong>{name}</strong><small>{employee?.designation??employee?.employeeCode??''}</small></span></span></td>
                    <td>{type?.name??'Leave'}</td>
                    <td><span className="timeoff-v3-date-range">{displayDate(row.startDate)}{String(row.startDate).slice(0,10)!==String(row.endDate).slice(0,10)&&<><br/>{displayDate(row.endDate)}</>}</span></td>
                    <td>{Number(row.days??0)}</td>
                    <td><Badge value={row.status}/></td>
                    <td className="timeoff-v3-actions-cell">
                      <button
                        id={`timeoff-actions-trigger-${row.id}`}
                        type="button"
                        className="icon-button timeoff-v3-more"
                        aria-label={`Open actions for ${name} time off request`}
                        aria-haspopup="menu"
                        aria-controls={actionMenu?.id===row.id?`timeoff-actions-menu-${row.id}`:undefined}
                        aria-expanded={actionMenu?.id===row.id}
                        onClick={e=>{e.stopPropagation();if(actionMenu?.id===row.id){setActionMenu(null);return;}openActionMenu(row.id,e.currentTarget)}}
                        onKeyDown={e=>{
                          if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
                          e.preventDefault();
                          e.stopPropagation();
                          openActionMenu(row.id,e.currentTarget,e.key==='ArrowUp');
                        }}
                      ><MoreHorizontal size={20}/></button>
                      {actionMenu?.id===row.id&&(()=>{
                        const rowIsSelf=row.employeeId===session.user.employeeId;
                        const approve=row.status==='PENDING'&&!rowIsSelf&&can('leave','APPROVE');
                        const reject=row.status==='PENDING'&&!rowIsSelf&&can('leave','REJECT');
                        const cancel=['PENDING','APPROVED'].includes(String(row.status))&&(rowIsSelf?can('leave','CREATE'):can('leave','EDIT'));
                        return <div
                          id={`timeoff-actions-menu-${row.id}`}
                          className="timeoff-v3-actions-menu"
                          role="menu"
                          aria-label={`Actions for ${name} time off request`}
                          style={{top:actionMenu!.top,left:actionMenu!.left}}
                          onClick={e=>e.stopPropagation()}
                          onKeyDown={handleActionMenuKeyDown}
                          onBlur={e=>{const next=e.relatedTarget as Node|null;if(next&&!e.currentTarget.contains(next))setActionMenu(null)}}
                        >
                          <button type="button" role="menuitem" tabIndex={-1} onClick={()=>{selectRequest(row);setActionMenu(null)}}><Search size={17}/><span>View Details</span></button>
                          {approve&&<button type="button" role="menuitem" tabIndex={-1} onClick={()=>{setReview({row,decision:'APPROVED'});setActionMenu(null)}}><Check size={17}/><span>Approve</span></button>}
                          {reject&&<button type="button" role="menuitem" tabIndex={-1} className="danger" onClick={()=>{setReview({row,decision:'REJECTED'});setActionMenu(null)}}><X size={17}/><span>Reject</span></button>}
                          {cancel&&<button type="button" role="menuitem" tabIndex={-1} className="danger" onClick={()=>{setCancelLeave(row);setActionMenu(null)}}><XCircle size={17}/><span>{row.status==='APPROVED'?'Cancel Leave':'Cancel Request'}</span></button>}
                        </div>;
                      })()}
                    </td>
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

          <section className="timeoff-v3-employee-summary" aria-label={`${selectedYear} leave summary`}>
            <article><small>Paid Leave Taken</small><strong>{paidLeaveTaken}</strong><span>days · {selectedYear}</span></article>
            <article><small>Unpaid Leave Taken</small><strong>{unpaidLeaveTaken}</strong><span>days · {selectedYear}</span></article>
            <article><small>Total Leave Balance</small><strong>{totalLeaveBalance}</strong><span>days remaining</span></article>
          </section>

          <dl className="timeoff-v3-detail-grid">
            <dt>Leave Type</dt><dd>{selectedLeaveType?.name??'Leave'}</dd>
            <dt>Start Date</dt><dd>{displayDate(selected.startDate)}</dd>
            <dt>End Date</dt><dd>{displayDate(selected.endDate)}</dd>
            <dt>Total Days</dt><dd>{Number(selected.days??0)} {Number(selected.days??0)===1?'day':'days'}</dd>
            <dt>Reason</dt><dd className="wide">{selected.reason||'—'}</dd>
            <dt>Requested On</dt><dd>{selected.createdAt?new Date(selected.createdAt).toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}):'—'}</dd>
          </dl>

          {balanceQuery.isLoading&&<p className="timeoff-v4-balance-note">Loading current leave balances…</p>}{balanceQuery.error&&<Failure error={balanceQuery.error as Error} retry={()=>balanceQuery.refetch()}/>}
          {!!balances.length&&<section className="timeoff-v3-detail-section">
            <h4>Leave Balance · {selectedYear}</h4><p className="timeoff-v4-balance-note">Pending requests reserve your allowance until reviewed or cancelled.</p>
            <div className="timeoff-v3-balances">{balances.map((b,index)=><div key={b.id} className={'tone-'+(index%3)}><span>{b.name}</span><strong>{b.remaining} days remaining</strong><small>{b.approved} approved · {b.pending} pending / {b.annual} annual</small></div>)}</div>
          </section>}

          <section className="timeoff-v3-detail-section">
            <h4>Notes & Comments</h4>
            <div className="timeoff-v3-note">
              <div className="timeoff-v3-note-person"><Avatar name={selectedName} src={selectedEmployee?.photo}/><span><strong>{selectedName}</strong><small>{selected.createdAt?displayDate(selected.createdAt):''}</small></span></div>
              <p>{selected.reason||'No reason was provided.'}</p>
              {selected.reviewNote&&<p className="timeoff-v3-review-note"><strong>Review note:</strong> {selected.reviewNote}</p>}
            </div>
          </section>

          {(canApproveSelected||canRejectSelected||canCancelSelected)&&<div className="timeoff-v3-review-actions">
            {canApproveSelected&&<button className="btn timeoff-v3-approve" onClick={()=>setReview({row:selected,decision:'APPROVED'})}><Check size={19}/>Approve</button>}
            {canRejectSelected&&<button className="btn danger timeoff-v3-reject" onClick={()=>setReview({row:selected,decision:'REJECTED'})}><X size={19}/>Reject</button>}
            {canCancelSelected&&<button className="btn secondary timeoff-v3-cancel" onClick={()=>setCancelLeave(selected)}><XCircle size={19}/>{selected.status==='APPROVED'?'Cancel Leave':'Cancel Request'}</button>}
          </div>}
        </div>
      </aside>}
    </div>

    {requestOpen&&<Modal title={session.user.role==='EMPLOYEE'?'Request time off':'Request Time Off'} onClose={()=>setRequestOpen(false)} wide>
      <RecordForm
        fields={leaveRequestFields}
        initial={session.user.employeeId?{employeeId:session.user.employeeId}:undefined}
        formClassName="leave-request-form timeoff-v3-request-form"
        sections={[{title:'Employee & leave type',description:'Choose who needs time away and the applicable policy.',keys:['employeeId','leaveTypeId']},{title:'Dates & duration',description:'Half-day requests use one working date. Holidays and roster offs do not consume leave.',keys:['startDate','endDate','halfDay']},{title:'Reason',description:'A short explanation helps the reviewer understand your request.',keys:['reason']}]}
        fieldFilter={field=>!(session.user.role==='EMPLOYEE'&&field.key==='employeeId')}
        onCancel={()=>setRequestOpen(false)}
        onSave={async body=>{
          const payload={...body,...(session.user.role==='EMPLOYEE'&&session.user.employeeId?{employeeId:session.user.employeeId}:{}),requestKey:requestKey||crypto.randomUUID()};
          const created=await mutate('leave','POST',payload);
          setDetailClosed(false);setSelectedId(created.id);setRequestOpen(false);
        }}
        submit="Submit Request"
      />
    </Modal>}

    {review&&<Modal title={(review.decision==='APPROVED'?'Approve':'Reject')+' request'} onClose={()=>setReview(null)}>
      <div className="timeoff-v4-confirm-summary"><strong>{review.decision==='APPROVED'?'Approve this time away?':'Decline this request?'}</strong><p>{personName(employeeFor(review.row.employeeId))} · {displayDate(review.row.startDate)} – {displayDate(review.row.endDate)} · {Number(review.row.days)} days</p></div><RecordForm
        formClassName="timeoff-v4-action-form" fields={[{key:'note',label:'Review note',type:'textarea',required:false}]}
        onCancel={()=>setReview(null)}
        onSave={async body=>{await mutate(`leave/${review.row.id}/review`,'POST',{...body,decision:review.decision});setReview(null)}}
        submit={review.decision==='APPROVED'?'Approve Request':'Reject Request'}
      />
    </Modal>}

    {cancelLeave&&<Modal title={cancelLeave.status==='APPROVED'?'Cancel approved leave':'Cancel time off request'} onClose={()=>setCancelLeave(null)}>
      <div className="timeoff-v4-confirm-summary"><strong>Cancel this time-off request?</strong><p>{displayDate(cancelLeave.startDate)} – {displayDate(cancelLeave.endDate)} · {Number(cancelLeave.days)} days</p><small>Cancellation releases the reserved allowance. Locked attendance must be unlocked first.</small></div><RecordForm
        formClassName="timeoff-v4-action-form" fields={[{key:'note',label:'Cancellation note',type:'textarea',required:false,hint:'Optional note explaining why this time off is being cancelled.'}]}
        onCancel={()=>setCancelLeave(null)}
        onSave={async body=>{await mutate(`leave/${cancelLeave.id}/cancel`,'POST',body);setCancelLeave(null)}}
        submit={cancelLeave.status==='APPROVED'?'Cancel Leave':'Cancel Request'}
      />
    </Modal>}
  </div>;
}
