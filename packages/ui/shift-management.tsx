'use client';
import React,{useEffect,useMemo,useState} from 'react';
import {AlarmClock,BriefcaseBusiness,Check,ChevronRight,Clock3,Edit3,Filter,Info,Layers3,Moon,MoreVertical,Plus,RotateCcw,Search,SunMedium,Trash2,Users,X} from 'lucide-react';
import {Confirm,Empty,Failure,Loading,useApp,useData} from './core';
import {Row,readable} from './config';

type ShiftDraft={
 name:string;startMinute:number;endMinute:number;graceMinutes:number;earlyOutGraceMinutes:number;
 workWeekMode:string;workingDays:string;alternateSaturdayMode:string;monthlyFlexibleOffDays:number;
 breakMinutes:number;breakMode:'AUTOMATIC_SCHEDULED'|'SCHEDULED_PUNCH'|'FLEXIBLE_PUNCH';
 breakStartMinute:number|null;breakEndMinute:number|null;fullDayMinutes:number;halfDayMinutes:number;
 overtimeAfterMinutes:number;timezone:string;
};
const week=[['1','Mon'],['2','Tue'],['3','Wed'],['4','Thu'],['5','Fri'],['6','Sat'],['0','Sun']] as const;
const minuteTime=(minute:any)=>{const n=Math.max(0,Math.min(1439,Number(minute)||0));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')};
const minuteClock=(minute:any)=>{const n=Math.max(0,Math.min(1439,Number(minute)||0)),h=Math.floor(n/60),m=n%60;return String(h%12||12).padStart(2,'0')+':'+String(m).padStart(2,'0')+' '+(h<12?'AM':'PM')};
const timeMinute=(value:string)=>{const [h,m]=value.split(':').map(Number);return Math.max(0,Math.min(1439,(h||0)*60+(m||0)))};
const spanMinutes=(start:number,end:number)=>end>start?end-start:1440-start+end;
const duration=(value:any)=>{const n=Math.max(0,Number(value)||0),h=Math.floor(n/60),m=n%60;return h&&m?`${h}h ${m}m`:h?`${h}h`:`${m}m`};
const breakMode=(row:Row):ShiftDraft['breakMode']=>row.flexibleBreakAnytime?'FLEXIBLE_PUNCH':row.punchDrivenBreaks?'SCHEDULED_PUNCH':'AUTOMATIC_SCHEDULED';
const breakModeLabel=(mode:string)=>mode==='AUTOMATIC_SCHEDULED'?'Fixed (Auto-scheduled)':mode==='SCHEDULED_PUNCH'?'Scheduled Punch':'Flexible Punch';
const workDaysFor=(row:Pick<ShiftDraft,'workWeekMode'|'workingDays'>)=>{
 if(row.workWeekMode==='MON_FRI')return ['1','2','3','4','5'];
 if(row.workWeekMode==='MON_SAT'||row.workWeekMode==='ALTERNATE_SATURDAY')return ['1','2','3','4','5','6'];
 if(row.workWeekMode==='ALL_DAYS')return ['0','1','2','3','4','5','6'];
 return String(row.workingDays||'').split(',').filter(Boolean);
};
const workWeekLabel=(row:Pick<ShiftDraft,'workWeekMode'|'workingDays'|'alternateSaturdayMode'>)=>{
 if(row.workWeekMode==='MON_FRI')return 'Mon - Fri';
 if(row.workWeekMode==='MON_SAT')return 'Mon - Sat';
 if(row.workWeekMode==='ALL_DAYS')return 'All days';
 if(row.workWeekMode==='ALTERNATE_SATURDAY')return row.alternateSaturdayMode==='ODD_OFF'?'Alternate Sat · odd off':row.alternateSaturdayMode==='EVEN_OFF'?'Alternate Sat · even off':'2nd & 4th Sat off';
 const selected=workDaysFor(row);return week.filter(([key])=>selected.includes(key)).map(([,label])=>label).join(', ')||'Custom';
};
const shiftKind=(row:Pick<ShiftDraft,'startMinute'|'endMinute'|'fullDayMinutes'>)=>{
 if(row.endMinute<=row.startMinute)return 'Night';
 if(row.fullDayMinutes<=300)return 'Half Day';
 if(row.startMinute<720)return 'Morning';
 if(row.startMinute>=780)return 'Evening';
 return 'Regular';
};
const defaultDraft=():ShiftDraft=>({
 name:'',startMinute:570,endMinute:1110,graceMinutes:10,earlyOutGraceMinutes:10,workWeekMode:'MON_SAT',
 workingDays:'1,2,3,4,5,6',alternateSaturdayMode:'SECOND_FOURTH_OFF',monthlyFlexibleOffDays:0,breakMinutes:30,
 breakMode:'AUTOMATIC_SCHEDULED',breakStartMinute:840,breakEndMinute:870,fullDayMinutes:480,halfDayMinutes:240,
 overtimeAfterMinutes:480,timezone:'Asia/Kolkata'
});
const toDraft=(row:Row):ShiftDraft=>({
 name:String(row.name??''),startMinute:Number(row.startMinute??570),endMinute:Number(row.endMinute??1110),
 graceMinutes:Number(row.graceMinutes??10),earlyOutGraceMinutes:Number(row.earlyOutGraceMinutes??10),
 workWeekMode:String(row.workWeekMode??'CUSTOM_WEEKLY'),workingDays:String(row.workingDays??'1,2,3,4,5'),
 alternateSaturdayMode:String(row.alternateSaturdayMode??'SECOND_FOURTH_OFF'),monthlyFlexibleOffDays:Number(row.monthlyFlexibleOffDays??0),
 breakMinutes:Number(row.breakMinutes??60),breakMode:breakMode(row),
 breakStartMinute:row.breakStartMinute==null?null:Number(row.breakStartMinute),breakEndMinute:row.breakEndMinute==null?null:Number(row.breakEndMinute),
 fullDayMinutes:Number(row.fullDayMinutes??480),halfDayMinutes:Number(row.halfDayMinutes??240),
 overtimeAfterMinutes:Number(row.overtimeAfterMinutes??480),timezone:String(row.timezone??'Asia/Kolkata')
});
const shiftPayload=(draft:ShiftDraft)=>({
 name:draft.name.trim(),startMinute:draft.startMinute,endMinute:draft.endMinute,graceMinutes:draft.graceMinutes,earlyOutGraceMinutes:draft.earlyOutGraceMinutes,
 workWeekMode:draft.workWeekMode,workingDays:draft.workingDays,alternateSaturdayMode:draft.alternateSaturdayMode,monthlyFlexibleOffDays:draft.monthlyFlexibleOffDays,
 breakMinutes:draft.breakMinutes,punchDrivenBreaks:draft.breakMode!=='AUTOMATIC_SCHEDULED',flexibleBreakAnytime:draft.breakMode==='FLEXIBLE_PUNCH',
 breakStartMinute:draft.breakMode==='FLEXIBLE_PUNCH'?null:draft.breakStartMinute,breakEndMinute:draft.breakMode==='FLEXIBLE_PUNCH'?null:draft.breakEndMinute,
 fullDayMinutes:draft.fullDayMinutes,halfDayMinutes:draft.halfDayMinutes,overtimeAfterMinutes:draft.overtimeAfterMinutes,timezone:draft.timezone
});

function NumberField({label,value,onChange,min=0,max=960,suffix='minutes'}:{label:string;value:number;onChange:(v:number)=>void;min?:number;max?:number;suffix?:string}){
 return <label className="shift-v3-field"><span>{label}</span><div className="shift-v3-number"><input type="number" min={min} max={max} value={value} onChange={e=>onChange(Math.max(min,Math.min(max,Number(e.target.value)||0)))}/><small>{suffix}</small></div></label>;
}
function TimeField({label,value,onChange,required=false}:{label:string;value:number|null;onChange:(v:number|null)=>void;required?:boolean}){
 return <label className="shift-v3-field"><span>{label}{required&&<b>*</b>}</span><div className="shift-v3-time"><Clock3 size={14}/><input type="time" value={value==null?'':minuteTime(value)} onChange={e=>onChange(e.target.value?timeMinute(e.target.value):null)}/></div></label>;
}

export function ShiftManagement(){
 const {can,mutate}=useApp();
 const query=useData('shifts?pageSize=500');
 const employeesQuery=useData('employees?pageSize=500',can('employees'));
 const rows:Row[]=query.data?.items??[],employees:Row[]=employeesQuery.data?.items??[];
 const canCreate=can('shifts','CREATE'),canEdit=can('shifts','EDIT'),canDelete=can('shifts','DELETE');
 const [search,setSearch]=useState(''),[kindFilter,setKindFilter]=useState(''),[assignmentFilter,setAssignmentFilter]=useState('');
 const [editor,setEditor]=useState<{id:string|null;draft:ShiftDraft}|null>(null),[remove,setRemove]=useState<Row|null>(null),[saving,setSaving]=useState(false);
 useEffect(()=>{if(!editor&&rows.length)setEditor({id:String(rows[0].id),draft:toDraft(rows[0])})},[rows.length]);
 const employeeCount=(shiftId:any)=>employees.filter(row=>String(row.shiftId??'')===String(shiftId)).length;
 const departmentCount=(shiftId:any)=>new Set(employees.filter(row=>String(row.shiftId??'')===String(shiftId)).map(row=>String(row.departmentId??'')).filter(Boolean)).size;
 const filtered=useMemo(()=>rows.filter(row=>{
  const text=search.trim().toLowerCase();if(text&&!String(row.name??'').toLowerCase().includes(text))return false;
  if(kindFilter&&shiftKind(toDraft(row))!==kindFilter)return false;
  const assigned=employeeCount(row.id)>0;if(assignmentFilter==='ASSIGNED'&&!assigned)return false;if(assignmentFilter==='UNASSIGNED'&&assigned)return false;
  return true;
 }),[rows,search,kindFilter,assignmentFilter,employees]);
 const assignedTotal=rows.filter(row=>employeeCount(row.id)>0).length,unassignedTotal=rows.length-assignedTotal;
 const editingRow=editor?.id?rows.find(row=>String(row.id)===editor.id):null,draft=editor?.draft;
 const update=(patch:Partial<ShiftDraft>)=>setEditor(current=>current?{...current,draft:{...current.draft,...patch}}:current);
 const selectedDays=draft?workDaysFor(draft):[];
 const toggleDay=(key:string)=>{
  if(!draft)return;
  let current=workDaysFor(draft),next=current.includes(key)?current.filter(day=>day!==key):[...current,key];
  if(!next.length)return;
  const order=['0','1','2','3','4','5','6'];next=order.filter(day=>next.includes(day));
  update({workWeekMode:'CUSTOM_WEEKLY',workingDays:next.join(',')});
 };
 const openRow=(row:Row)=>setEditor({id:String(row.id),draft:toDraft(row)});
 const add=()=>setEditor({id:null,draft:defaultDraft()});
 const resetFilters=()=>{setSearch('');setKindFilter('');setAssignmentFilter('')};
 async function save(){
  if(!editor||!draft||!draft.name.trim())return;
  setSaving(true);try{await mutate('shifts'+(editor.id?'/'+editor.id:''),editor.id?'PATCH':'POST',shiftPayload(draft));if(!editor.id)setEditor(null)}finally{setSaving(false)}
 }
 if(query.isLoading)return <Loading/>;
 if(query.error)return <Failure error={query.error} retry={()=>query.refetch()}/>;

 return <div className={'shift-v3 '+(editor?'has-editor':'')}>
  <main className="shift-v3-main">
   <div className="shift-v3-breadcrumb"><span>Attendance</span><ChevronRight size={13}/><strong>Shifts</strong></div>
   <header className="shift-v3-head"><div><span className="shift-v3-eyebrow">SHIFT MANAGEMENT</span><h1>Work Shifts</h1><p>Create and manage work shifts for your organization.</p></div>{canCreate&&<button className="btn primary" onClick={add}><Plus size={16}/>Add Shift</button>}</header>
   <div className="shift-v3-tabs">
    <button className={!assignmentFilter?'active':''} onClick={()=>setAssignmentFilter('')}>All Shifts <span>{rows.length}</span></button>
    <button className={assignmentFilter==='ASSIGNED'?'active':''} onClick={()=>setAssignmentFilter('ASSIGNED')}>Assigned <span>{assignedTotal}</span></button>
    <button className={assignmentFilter==='UNASSIGNED'?'active':''} onClick={()=>setAssignmentFilter('UNASSIGNED')}>Unassigned <span>{unassignedTotal}</span></button>
   </div>
   <section className="shift-v3-toolbar">
    <label><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search shift by name…"/></label>
    <div className="shift-v3-select"><Filter size={14}/><select value={kindFilter} onChange={e=>setKindFilter(e.target.value)}><option value="">All Types</option>{['Regular','Morning','Evening','Night','Half Day'].map(value=><option key={value}>{value}</option>)}</select></div>
    <div className="shift-v3-select"><Users size={14}/><select value={assignmentFilter} onChange={e=>setAssignmentFilter(e.target.value)}><option value="">All Assignments</option><option value="ASSIGNED">Assigned</option><option value="UNASSIGNED">Unassigned</option></select></div>
    <button className="shift-v3-reset" onClick={resetFilters}><RotateCcw size={14}/>Reset</button>
   </section>
   {!rows.length?<Empty title="No shifts yet" description="Add the first work shift to configure attendance timing and break rules." action={canCreate?<button className="btn primary" onClick={add}><Plus size={16}/>Add Shift</button>:undefined}/>:!filtered.length?<Empty title="No matching shifts" description="Change the search or filters to see other shifts."/>:<section className="shift-v3-grid">
    {filtered.map((row,index)=>{
     const d=toDraft(row),kind=shiftKind(d),count=employeeCount(row.id),deps=departmentCount(row.id),tone=['blue','teal','orange','violet'][index%4];
     return <article key={row.id} className={'shift-v3-card '+tone+(editor?.id===String(row.id)?' selected':'')} onClick={()=>openRow(row)}>
      <div className="shift-v3-card-top"><span className="shift-v3-card-icon">{kind==='Night'?<Moon/>:kind==='Evening'?<SunMedium/>:<Clock3/>}</span><span className="shift-v3-card-status">Active</span><button className="shift-v3-card-menu" aria-label={'Edit '+row.name} onClick={e=>{e.stopPropagation();openRow(row)}}><MoreVertical size={16}/></button></div>
      <div className="shift-v3-card-title"><h3>{row.name}</h3><strong>{minuteClock(d.startMinute)} - {minuteClock(d.endMinute)}</strong><span>({duration(spanMinutes(d.startMinute,d.endMinute))})</span></div>
      <div className="shift-v3-tags"><span>{kind}</span><span>{workWeekLabel(d)}</span><span>{d.breakMinutes?duration(d.breakMinutes)+' Break':'No Break'}</span></div>
      <div className="shift-v3-card-foot"><span><Users size={13}/><strong>{count}</strong> Employees</span><i/><span><Layers3 size={13}/><strong>{deps}</strong> Departments</span></div>
     </article>
    })}
   </section>}
  </main>

  {editor&&draft&&<aside className="shift-v3-editor">
   <div className="shift-v3-editor-head"><div><h2>{editor.id?'Edit Shift':'Add Shift'}</h2><p>{editor.id?'Update timing, break and attendance rules.':'Create a new attendance shift.'}</p></div><button className="icon-button" aria-label="Close shift editor" onClick={()=>setEditor(null)}><X size={18}/></button></div>
   <div className="shift-v3-editor-scroll">
    <section className="shift-v3-editor-summary"><span className="shift-v3-summary-icon"><Clock3/></span><div><strong>{draft.name||'New Shift'}</strong><small>{shiftKind(draft)} working shift · {duration(spanMinutes(draft.startMinute,draft.endMinute))}</small></div><span className="shift-v3-active-chip">Active</span></section>
    <div className="shift-v3-form-grid">
     <label className="shift-v3-field span-2"><span>Shift Name <b>*</b></span><input value={draft.name} maxLength={100} onChange={e=>update({name:e.target.value})} placeholder="e.g. General Shift"/></label>
     <label className="shift-v3-field"><span>Shift Type</span><input value={shiftKind(draft)} readOnly/></label>
     <label className="shift-v3-field"><span>Total Hours</span><input value={duration(spanMinutes(draft.startMinute,draft.endMinute))} readOnly/></label>
     <TimeField label="Start Time" required value={draft.startMinute} onChange={value=>update({startMinute:value??0})}/>
     <TimeField label="End Time" required value={draft.endMinute} onChange={value=>update({endMinute:value??0})}/>
     <NumberField label="Break Duration" value={draft.breakMinutes} max={180} onChange={breakMinutes=>update({breakMinutes})}/>
     <label className="shift-v3-field"><span>Break Type</span><select value={draft.breakMode} onChange={e=>update({breakMode:e.target.value as ShiftDraft['breakMode']})}><option value="AUTOMATIC_SCHEDULED">Fixed (Auto-scheduled)</option><option value="SCHEDULED_PUNCH">Scheduled Punch</option><option value="FLEXIBLE_PUNCH">Flexible Punch</option></select></label>
     {draft.breakMode!=='FLEXIBLE_PUNCH'&&<><TimeField label="Break Window Start" value={draft.breakStartMinute} onChange={breakStartMinute=>update({breakStartMinute})}/><TimeField label="Break Window End" value={draft.breakEndMinute} onChange={breakEndMinute=>update({breakEndMinute})}/></>}
     <NumberField label="Grace Time (Late)" value={draft.graceMinutes} max={120} onChange={graceMinutes=>update({graceMinutes})}/>
     <NumberField label="Grace Time (Early Out)" value={draft.earlyOutGraceMinutes} max={120} onChange={earlyOutGraceMinutes=>update({earlyOutGraceMinutes})}/>
    </div>

    <section className="shift-v3-form-section">
     <div className="shift-v3-section-title"><span><CalendarIcon/>Working Week</span><small>Choose a preset or customize individual days.</small></div>
     <label className="shift-v3-field"><span>Working Week Pattern</span><select value={draft.workWeekMode} onChange={e=>update({workWeekMode:e.target.value})}><option value="MON_FRI">Mon - Fri</option><option value="MON_SAT">Mon - Sat</option><option value="ALTERNATE_SATURDAY">Alternate Saturday</option><option value="ALL_DAYS">All Days</option><option value="CUSTOM_WEEKLY">Custom Weekly</option></select></label>
     {draft.workWeekMode==='ALTERNATE_SATURDAY'&&<label className="shift-v3-field"><span>Alternate Saturday Rule</span><select value={draft.alternateSaturdayMode} onChange={e=>update({alternateSaturdayMode:e.target.value})}><option value="SECOND_FOURTH_OFF">2nd & 4th Saturday Off</option><option value="ODD_OFF">Odd Saturdays Off</option><option value="EVEN_OFF">Even Saturdays Off</option></select></label>}
     <div className="shift-v3-days">{week.map(([key,label])=><button type="button" key={key} className={selectedDays.includes(key)?'active':''} onClick={()=>toggleDay(key)}><span>{selectedDays.includes(key)&&<Check size={12}/>}</span>{label}</button>)}</div>
     <NumberField label="Flexible Roster-off Days / Month" value={draft.monthlyFlexibleOffDays} max={15} suffix="days" onChange={monthlyFlexibleOffDays=>update({monthlyFlexibleOffDays})}/>
    </section>

    <section className="shift-v3-thresholds">
     <div className="shift-v3-section-title"><span><AlarmClock size={16}/>Attendance Thresholds</span><small>These rules determine half day, present and overtime.</small></div>
     <div className="shift-v3-form-grid three">
      <NumberField label="Half Day Time" value={draft.halfDayMinutes} min={1} max={600} onChange={halfDayMinutes=>update({halfDayMinutes})}/>
      <NumberField label="Full Working Time" value={draft.fullDayMinutes} min={1} max={960} onChange={fullDayMinutes=>update({fullDayMinutes})}/>
      <NumberField label="Overtime After" value={draft.overtimeAfterMinutes} min={1} max={960} onChange={overtimeAfterMinutes=>update({overtimeAfterMinutes})}/>
     </div>
     <label className="shift-v3-field"><span>Timezone</span><select value={draft.timezone} onChange={e=>update({timezone:e.target.value})}>{![ 'Asia/Kolkata','UTC','Asia/Dubai','Asia/Singapore','Europe/London','America/New_York'].includes(draft.timezone)&&<option value={draft.timezone}>{draft.timezone}</option>}<option value="Asia/Kolkata">Asia/Kolkata</option><option value="UTC">UTC</option><option value="Asia/Dubai">Asia/Dubai</option><option value="Asia/Singapore">Asia/Singapore</option><option value="Europe/London">Europe/London</option><option value="America/New_York">America/New_York</option></select></label>
    </section>

    <section className="shift-v3-preview">
     <div className="shift-v3-preview-title"><strong>Shift Preview</strong><small>{workWeekLabel(draft)} · {breakModeLabel(draft.breakMode)}</small></div>
     <div className="shift-v3-preview-times"><span><b>{minuteClock(draft.startMinute)}</b><small>IN</small></span>{draft.breakMode!=='FLEXIBLE_PUNCH'&&draft.breakStartMinute!=null&&draft.breakEndMinute!=null?<><span><b>{minuteClock(draft.breakStartMinute)}</b><small>BREAK</small></span><span><b>{minuteClock(draft.breakEndMinute)}</b><small>RESUME</small></span></>:<span><b>{duration(draft.breakMinutes)}</b><small>BREAK ALLOWANCE</small></span>}<span><b>{minuteClock(draft.endMinute)}</b><small>OUT</small></span></div>
     <div className="shift-v3-timeline"><i className="work"/><i className="break"/><i className="work"/></div>
     <div className="shift-v3-preview-legend"><span>Working</span><span>{draft.breakMode==='FLEXIBLE_PUNCH'?'Flexible break':duration(draft.breakMinutes)+' break'}</span><span>Working</span></div>
     <div className="shift-v3-preview-note"><Info size={14}/><span>Unused break allowance stays counted as working time. Final attendance follows the configured half/full-day thresholds.</span></div>
    </section>
   </div>
   <footer className="shift-v3-editor-foot">
    <div>{editor.id&&canDelete&&<button className="btn danger" disabled={employeeCount(editor.id)>0} title={employeeCount(editor.id)>0?'Reassign employees before deleting this shift.':'Delete shift'} onClick={()=>editingRow&&setRemove(editingRow)}><Trash2 size={15}/>Delete Shift</button>}</div>
    <div><button className="btn secondary" onClick={()=>setEditor(null)}>Cancel</button>{(editor.id?canEdit:canCreate)&&<button className="btn primary" disabled={saving||!draft.name.trim()} onClick={save}>{saving?'Saving…':editor.id?'Update Shift':'Create Shift'}</button>}</div>
   </footer>
  </aside>}
  {remove&&<Confirm title="Delete shift?" description="This permanently removes the shift. Employees must be reassigned first and attendance references can prevent deletion." onClose={()=>setRemove(null)} onConfirm={async()=>{await mutate('shifts/'+remove.id,'DELETE');setRemove(null);setEditor(null)}}/>}
 </div>;
}
function CalendarIcon(){return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 5h18v16H3z"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>}
