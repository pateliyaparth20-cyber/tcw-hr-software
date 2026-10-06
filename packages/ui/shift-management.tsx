'use client';
import React,{useEffect,useMemo,useState} from 'react';
import './shift-design.css';
import {AlarmClock,Check,ChevronLeft,ChevronRight,Clock3,Filter,Info,Layers3,Moon,MoreVertical,Plus,RotateCcw,Search,SunMedium,Trash2,Users} from 'lucide-react';
import {Confirm,Empty,Failure,Loading,useApp,useData} from './core';
import {Row} from './config';

type ShiftType='REGULAR'|'MORNING'|'EVENING'|'NIGHT'|'HALF_DAY';
type ShiftDraft={
 name:string;shiftType:ShiftType;startMinute:number;endMinute:number;graceMinutes:number;earlyOutGraceMinutes:number;
 workWeekMode:string;workingDays:string;alternateSaturdayMode:string;monthlyFlexibleOffDays:number;
 breakMinutes:number;breakMode:'AUTOMATIC_SCHEDULED'|'SCHEDULED_PUNCH'|'FLEXIBLE_PUNCH';
 breakStartMinute:number|null;breakEndMinute:number|null;fullDayMinutes:number;halfDayMinutes:number;
 overtimeAfterMinutes:number;timezone:string;
};
const week=[['1','Mon'],['2','Tue'],['3','Wed'],['4','Thu'],['5','Fri'],['6','Sat'],['0','Sun']] as const;
const minuteClock=(minute:any)=>{const n=Math.max(0,Math.min(1439,Number(minute)||0)),h=Math.floor(n/60),m=n%60;return String(h%12||12).padStart(2,'0')+':'+String(m).padStart(2,'0')+' '+(h<12?'AM':'PM')};
const spanMinutes=(start:number,end:number)=>end>start?end-start:1440-start+end;
const minuteOffset=(start:number,target:number)=>target>=start?target-start:1440-start+target;
const duration=(value:any)=>{const n=Math.max(0,Number(value)||0),h=Math.floor(n/60),m=n%60;return h&&m?`${h}h ${m}m`:h?`${h}h`:`${m}m`};
const breakMode=(row:Row):ShiftDraft['breakMode']=>row.flexibleBreakAnytime?'FLEXIBLE_PUNCH':row.punchDrivenBreaks?'SCHEDULED_PUNCH':'AUTOMATIC_SCHEDULED';
const breakModeLabel=(mode:string)=>mode==='AUTOMATIC_SCHEDULED'?'Auto · Fixed schedule':mode==='SCHEDULED_PUNCH'?'Manual · Scheduled punch':'Manual · Flexible punch';
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
const inferShiftType=(row:{startMinute?:any;endMinute?:any;name?:any}):ShiftType=>{
 const start=Number(row.startMinute??0),end=Number(row.endMinute??0),name=String(row.name??'').toLowerCase();
 if(name.includes('half'))return 'HALF_DAY';
 if(end<=start)return 'NIGHT';
 if(start<720)return 'MORNING';
 if(start>=780)return 'EVENING';
 return 'REGULAR';
};
const shiftTypeLabel=(type:string)=>type==='HALF_DAY'?'Half Day':type==='MORNING'?'Morning':type==='EVENING'?'Evening':type==='NIGHT'?'Night':'Regular';
const shiftKind=(row:Pick<ShiftDraft,'shiftType'>)=>shiftTypeLabel(row.shiftType);
const defaultDraft=():ShiftDraft=>({
 name:'',shiftType:'REGULAR',startMinute:570,endMinute:1110,graceMinutes:10,earlyOutGraceMinutes:10,workWeekMode:'MON_SAT',
 workingDays:'1,2,3,4,5,6',alternateSaturdayMode:'SECOND_FOURTH_OFF',monthlyFlexibleOffDays:0,breakMinutes:30,
 breakMode:'AUTOMATIC_SCHEDULED',breakStartMinute:840,breakEndMinute:870,fullDayMinutes:480,halfDayMinutes:240,
 overtimeAfterMinutes:480,timezone:'Asia/Kolkata'
});
const toDraft=(row:Row):ShiftDraft=>({
 name:String(row.name??''),shiftType:(String(row.shiftType??inferShiftType(row)) as ShiftType),startMinute:Number(row.startMinute??570),endMinute:Number(row.endMinute??1110),
 graceMinutes:Number(row.graceMinutes??10),earlyOutGraceMinutes:Number(row.earlyOutGraceMinutes??10),
 workWeekMode:String(row.workWeekMode??'CUSTOM_WEEKLY'),workingDays:String(row.workingDays??'1,2,3,4,5'),
 alternateSaturdayMode:String(row.alternateSaturdayMode??'SECOND_FOURTH_OFF'),monthlyFlexibleOffDays:Number(row.monthlyFlexibleOffDays??0),
 breakMinutes:Number(row.breakMinutes??60),breakMode:breakMode(row),
 breakStartMinute:row.breakStartMinute==null?null:Number(row.breakStartMinute),breakEndMinute:row.breakEndMinute==null?null:Number(row.breakEndMinute),
 fullDayMinutes:Number(row.fullDayMinutes??480),halfDayMinutes:Number(row.halfDayMinutes??240),
 overtimeAfterMinutes:Number(row.overtimeAfterMinutes??480),timezone:String(row.timezone??'Asia/Kolkata')
});
const shiftPayload=(draft:ShiftDraft)=>({
 name:draft.name.trim(),shiftType:draft.shiftType,startMinute:draft.startMinute,endMinute:draft.endMinute,graceMinutes:draft.graceMinutes,earlyOutGraceMinutes:draft.earlyOutGraceMinutes,
 workWeekMode:draft.workWeekMode,workingDays:draft.workingDays,alternateSaturdayMode:draft.alternateSaturdayMode,monthlyFlexibleOffDays:draft.monthlyFlexibleOffDays,
 breakMinutes:draft.breakMinutes,punchDrivenBreaks:draft.breakMode!=='AUTOMATIC_SCHEDULED',flexibleBreakAnytime:draft.breakMode==='FLEXIBLE_PUNCH',
 breakStartMinute:draft.breakMode==='FLEXIBLE_PUNCH'||!draft.breakMinutes?null:draft.breakStartMinute,breakEndMinute:draft.breakMode==='FLEXIBLE_PUNCH'||!draft.breakMinutes?null:draft.breakEndMinute,
 fullDayMinutes:draft.fullDayMinutes,halfDayMinutes:draft.halfDayMinutes,overtimeAfterMinutes:draft.overtimeAfterMinutes,timezone:draft.timezone
});

function NumberField({label,value,onChange,min=0,max=960,suffix='minutes',help}:{label:string;value:number;onChange:(v:number)=>void;min?:number;max?:number;suffix?:string;help?:string}){
 const[draft,setDraft]=useState(String(value));
 useEffect(()=>setDraft(String(value)),[value]);
 const apply=(raw:string)=>{const clean=raw.replace(/[^0-9]/g,'');setDraft(clean);if(clean==='')return;const parsed=Number(clean);if(Number.isFinite(parsed))onChange(Math.max(min,Math.min(max,parsed)))};
 const commit=()=>{const parsed=Number(draft);const next=Math.max(min,Math.min(max,Number.isFinite(parsed)&&draft!==''?parsed:min));onChange(next);setDraft(String(next))};
 return <label className="shift-v5-field"><span>{label}</span><div className="shift-v5-number-input"><input aria-label={label} type="text" inputMode="numeric" value={draft} onChange={e=>apply(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commit();e.currentTarget.blur()}}}/><strong>{suffix}</strong></div>{help&&<small className="shift-v5-field-help">{help}</small>}</label>;
}
function DurationField({label,value,onChange,min=1,max=960,help}:{label:string;value:number;onChange:(v:number)=>void;min?:number;max?:number;help?:string}){
 const safe=Math.max(min,Math.min(max,Number(value)||0));
 const formatted=`${String(Math.floor(safe/60)).padStart(2,'0')}:${String(safe%60).padStart(2,'0')}`;
 const[draft,setDraft]=useState(formatted);
 useEffect(()=>setDraft(formatted),[formatted]);
 const parseAndApply=(raw:string,final=false)=>{
  const clean=raw.replace(/[^0-9:]/g,'').slice(0,5);setDraft(clean);
  const match=/^(\d{1,2}):([0-5]\d)$/.exec(clean.trim());
  if(!match){if(final)setDraft(formatted);return;}
  const next=Math.max(min,Math.min(max,Number(match[1])*60+Number(match[2])));
  onChange(next);
  if(final)setDraft(`${String(Math.floor(next/60)).padStart(2,'0')}:${String(next%60).padStart(2,'0')}`);
 };
 const commit=()=>parseAndApply(draft,true);
 return <label className="shift-v5-field shift-v5-duration-field"><span>{label}</span><div className="shift-v5-duration-clock"><Clock3 size={18}/><input aria-label={label+' in HH:MM'} type="text" inputMode="numeric" placeholder="HH:MM" value={draft} onChange={e=>parseAndApply(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commit();e.currentTarget.blur()}}}/><strong>HH:MM</strong></div>{help&&<small className="shift-v5-field-help">{help}</small>}</label>;
}
function parseClockText(value:string){
 const raw=value.trim().toUpperCase().replace(/\s+/g,' ');
 let match=/^(\d{1,2}):(\d{2})\s*(AM|PM)$/.exec(raw);
 if(match){
  let hour=Number(match[1]),minute=Number(match[2]);if(hour<1||hour>12||minute<0||minute>59)return null;
  hour%=12;if(match[3]==='PM')hour+=12;return hour*60+minute;
 }
 match=/^(\d{1,2}):(\d{2})$/.exec(raw);
 if(match){const hour=Number(match[1]),minute=Number(match[2]);if(hour<0||hour>23||minute<0||minute>59)return null;return hour*60+minute;}
 return null;
}
function TimeField({label,value,onChange,required=false}:{label:string;value:number|null;onChange:(v:number|null)=>void;required?:boolean}){
 const[open,setOpen]=useState(false),formatted=value==null?'':minuteClock(value),baseMinuteOfDay=value==null?540:Math.max(0,Math.min(1439,Number(value)||0)),baseHour24=Math.floor(baseMinuteOfDay/60),pickerMinute=baseMinuteOfDay%60,pickerHour=((baseHour24+11)%12)+1,pickerPeriod:('AM'|'PM')=baseHour24>=12?'PM':'AM';
 const[draft,setDraft]=useState(formatted);useEffect(()=>setDraft(formatted),[formatted]);
 const apply=(raw:string,final=false)=>{
  const clean=raw.replace(/[^0-9aApPmM:\s]/g,'').slice(0,11);setDraft(clean);
  if(clean.trim()===''){if(!required)onChange(null);return;}
  const parsed=parseClockText(clean);if(parsed==null){if(final)setDraft(formatted);return;}
  onChange(parsed);if(final)setDraft(minuteClock(parsed));
 };
 const choose=(hour:number,minute:number,period:'AM'|'PM')=>{let h=hour%12;if(period==='PM')h+=12;const next=h*60+minute;onChange(next);setDraft(minuteClock(next));};
 return <label className="shift-v5-field"><span>{label}{required&&<b>*</b>}</span><div className={'shift-v5-time-input '+(open?'open':'')} onBlur={e=>{const next=e.relatedTarget as Node|null;if(next&&e.currentTarget.contains(next))return;setOpen(false)}}>
  <Clock3 size={18}/><input aria-label={label} type="text" inputMode="text" autoComplete="off" spellCheck={false} placeholder="08:30 AM" value={draft} onChange={e=>apply(e.target.value)} onBlur={()=>apply(draft,true)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();apply(draft,true);e.currentTarget.blur()}}}/>
  <span className="shift-v5-time-dropdown-button" role="button" tabIndex={0} aria-label={'Open '+label.toLowerCase()+' picker'} aria-expanded={open} onMouseDown={e=>e.preventDefault()} onClick={()=>setOpen(v=>!v)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setOpen(v=>!v)}}}><ChevronRight size={16} className="shift-v5-time-chevron"/></span>
  {open&&<div className="shift-v5-time-popover">
   <div><span>Hour</span><select aria-label={label+' hour'} value={pickerHour} onChange={e=>choose(Number(e.target.value),pickerMinute,pickerPeriod)}>{Array.from({length:12},(_,i)=>i+1).map(v=><option key={v} value={v}>{String(v).padStart(2,'0')}</option>)}</select></div>
   <div><span>Minute</span><select aria-label={label+' minute'} value={pickerMinute} onChange={e=>choose(pickerHour,Number(e.target.value),pickerPeriod)}>{Array.from({length:60},(_,i)=>i).map(v=><option key={v} value={v}>{String(v).padStart(2,'0')}</option>)}</select></div>
   <div><span>AM / PM</span><select aria-label={label+' AM or PM'} value={pickerPeriod} onChange={e=>choose(pickerHour,pickerMinute,e.target.value as 'AM'|'PM')}><option>AM</option><option>PM</option></select></div>
  </div>}
 </div></label>;
}

export function ShiftManagement(){
 const {can,mutate,session}=useApp();
 const query=useData('shifts?pageSize=500');
 const employeesQuery=useData('employees?pageSize=500',can('employees'));
 const rows:Row[]=query.data?.items??[],employees:Row[]=employeesQuery.data?.items??[];
 const canCreate=can('shifts','CREATE'),canEdit=can('shifts','EDIT'),canDelete=can('shifts','DELETE');
 const [search,setSearch]=useState(''),[kindFilter,setKindFilter]=useState(''),[assignmentFilter,setAssignmentFilter]=useState('');
 const [editor,setEditor]=useState<{id:string|null;draft:ShiftDraft}|null>(null),[remove,setRemove]=useState<Row|null>(null),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState('');
 useEffect(()=>{if(!editor)return;const onKeyDown=(event:KeyboardEvent)=>{if(event.key!=='Escape')return;if(remove)return;event.preventDefault();setEditor(null)};window.addEventListener('keydown',onKeyDown);return()=>window.removeEventListener('keydown',onKeyDown)},[editor,remove]);
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
 const openRow=(row:Row)=>{setSaveError('');setEditor({id:String(row.id),draft:toDraft(row)})};
 const add=()=>{setSaveError('');setEditor({id:null,draft:{...defaultDraft(),timezone:session.company?.timezone??'Asia/Kolkata'}})};
 const preset=(kind:ShiftType)=>{const timing=kind==='NIGHT'?{startMinute:1320,endMinute:420,breakStartMinute:120,breakEndMinute:150}:kind==='EVENING'?{startMinute:840,endMinute:1380,breakStartMinute:1080,breakEndMinute:1110}:kind==='HALF_DAY'?{startMinute:540,endMinute:810,breakStartMinute:660,breakEndMinute:690}:{startMinute:540,endMinute:1080,breakStartMinute:780,breakEndMinute:810};update({...timing,breakMinutes:30,fullDayMinutes:kind==='HALF_DAY'?240:480,halfDayMinutes:kind==='HALF_DAY'?120:240,overtimeAfterMinutes:kind==='HALF_DAY'?240:480,shiftType:kind});setSaveError('')};
 const resetFilters=()=>{setSearch('');setKindFilter('');setAssignmentFilter('')};
 async function save(){
  if(!editor||!draft||saving)return;
  const span=spanMinutes(draft.startMinute,draft.endMinute);
  let error='';
  if(!draft.name.trim())error='Enter a shift name.';
  else if(draft.halfDayMinutes>draft.fullDayMinutes)error='The partial-day threshold must not exceed the full-day threshold.';
  else if(draft.breakMinutes>=span)error='Break duration must be shorter than the shift.';
  else if(draft.breakMode!=='FLEXIBLE_PUNCH'&&((draft.breakStartMinute==null)!==(draft.breakEndMinute==null)))error='Set both break window times, or leave both blank.';
  else if(draft.breakMinutes>0&&draft.breakMode!=='FLEXIBLE_PUNCH'&&draft.breakStartMinute!=null&&draft.breakEndMinute!=null){const start=minuteOffset(draft.startMinute,draft.breakStartMinute),length=spanMinutes(draft.breakStartMinute,draft.breakEndMinute);if(length>180||start+length>span)error='The break window must fit inside the shift and be no longer than 3 hours.';}
  if(error){setSaveError(error);return;}
  setSaveError('');setSaving(true);
  try{await mutate('shifts'+(editor.id?'/'+editor.id:''),editor.id?'PATCH':'POST',shiftPayload(draft));setEditor(null)}catch(e:any){setSaveError(e.message??'Unable to save this shift. Try again.')}finally{setSaving(false)}
 }
 if(query.isLoading)return <Loading/>;
 if(query.error)return <Failure error={query.error} retry={()=>query.refetch()}/>;

 if(editor&&draft){
  const totalShiftSpan=spanMinutes(draft.startMinute,draft.endMinute);
  const previewWorkingMinutes=Math.max(0,totalShiftSpan-Math.min(Math.max(0,draft.breakMinutes),totalShiftSpan));
  const previewBreakStart=draft.breakMinutes>0&&draft.breakMode!=='FLEXIBLE_PUNCH'&&draft.breakStartMinute!=null?draft.breakStartMinute:null;
  const previewBreakEnd=draft.breakMinutes>0&&draft.breakMode!=='FLEXIBLE_PUNCH'&&draft.breakEndMinute!=null?draft.breakEndMinute:null;
  const previewBreakMinutes=Math.min(Math.max(0,draft.breakMinutes),totalShiftSpan);
  const scheduledBreakOffset=previewBreakStart==null?null:Math.min(minuteOffset(draft.startMinute,previewBreakStart),Math.max(0,totalShiftSpan-previewBreakMinutes));
  const previewBreakOffset=scheduledBreakOffset==null?Math.max(0,(totalShiftSpan-previewBreakMinutes)/2):scheduledBreakOffset;
  const previewBeforeBreak=Math.max(0,previewBreakOffset);
  const previewAfterBreak=Math.max(0,totalShiftSpan-previewBeforeBreak-previewBreakMinutes);
  const previewManual=draft.breakMode!=='AUTOMATIC_SCHEDULED';
  return <div className="shift-v5-page">
   <div className="shift-v5-breadcrumb"><button type="button" onClick={()=>setEditor(null)}>Workspace</button><ChevronRight size={14}/><button type="button" onClick={()=>setEditor(null)}>Attendance</button><ChevronRight size={14}/><strong>{editor.id?'Edit Shift':'Add Shift'}</strong></div>

   <div className="shift-v5-layout">
    <aside className="shift-v5-shift-list">
     <div className="shift-v5-list-head"><div><h2>Shifts</h2><p>Select a shift to edit.</p></div>{canCreate&&<button className="btn primary" onClick={add}><Plus size={16}/>Add Shift</button>}</div>
     <div className="shift-v5-list-scroll">
      {rows.map(row=>{const rowDraft=toDraft(row),active=editor.id===String(row.id);return <button type="button" key={row.id} className={'shift-v5-list-item '+(active?'active':'')} onClick={()=>openRow(row)}>
       <span className="shift-v5-list-dot"/>
       <span className="shift-v5-list-copy"><strong title={row.name}>{row.name}</strong><span className="shift-design-kind">{shiftTypeLabel(rowDraft.shiftType)}</span><small>{minuteClock(rowDraft.startMinute)} - {minuteClock(rowDraft.endMinute)}</small><em>{duration(spanMinutes(rowDraft.startMinute,rowDraft.endMinute))} · {workWeekLabel(rowDraft)}</em></span>
       <MoreVertical size={17}/>
      </button>})}
      {!rows.length&&<div className="shift-v5-list-empty">No shifts created yet.</div>}
     </div>
    </aside>

    <form aria-label="Shift configuration" className="shift-v5-form-panel" onSubmit={e=>{e.preventDefault();void save()}}>
     <header className="shift-v5-form-head"><div><span className="shift-design-eyebrow">ATTENDANCE RULES</span><h1>{editor.id?'Edit shift':'Add shift'}</h1><p>{editor.id?'Configure this shift schedule and attendance rules.':'Create a complete shift schedule and attendance rules.'}</p></div><span className="shift-v5-active-chip">{editor.id?'Existing shift':'New shift'}</span></header>

     <div className="shift-design-presets"><div className="shift-design-preset-heading"><strong>Choose a shift schedule</strong><span>Templates set timings, break allowance and duration thresholds. Your weekly pattern and grace rules stay as configured.</span></div><div className="shift-design-preset-grid">{(['REGULAR','MORNING','EVENING','NIGHT','HALF_DAY'] as ShiftType[]).map(type=><button type="button" key={type} aria-label={shiftTypeLabel(type)+' shift preset'} aria-pressed={draft.shiftType===type} onClick={()=>preset(type)}>{type==='NIGHT'?<Moon size={20}/>:type==='EVENING'?<SunMedium size={20}/>:<Clock3 size={20}/>}<span><strong>{shiftTypeLabel(type)}</strong><small>{type==='NIGHT'?'10 PM – 7 AM':type==='EVENING'?'2 PM – 11 PM':type==='HALF_DAY'?'9 AM – 1:30 PM':'9 AM – 6 PM'}</small>{type==='NIGHT'&&<em>Ends next day</em>}</span>{draft.shiftType===type&&<Check size={15}/>}</button>)}</div></div>
     <div className="shift-v5-form-body">
      <section className="shift-v5-section">
       <div className="shift-v5-section-head"><div><h2>01 · Shift details & timing</h2><p>Name your shift and set its local start and finish times.</p></div><Clock3 size={20}/></div>
       <div className="shift-v5-grid two">
        <label className="shift-v5-field"><span>Shift Name <b>*</b></span><input aria-label="Shift Name" value={draft.name} maxLength={100} onChange={e=>update({name:e.target.value})} placeholder="e.g. General Shift"/></label>
        <label className="shift-v5-field"><span>Shift Type <b>*</b></span><select aria-label="Shift Type" value={draft.shiftType} onChange={e=>update({shiftType:e.target.value as ShiftType})}><option value="REGULAR">Regular</option><option value="MORNING">Morning</option><option value="EVENING">Evening</option><option value="NIGHT">Night</option><option value="HALF_DAY">Half Day</option></select></label>
        <DurationField label="Total Shift Span" value={totalShiftSpan} min={1} max={1440} help="Manual HH:MM. Changing this automatically adjusts End Time." onChange={minutes=>update({endMinute:(draft.startMinute+minutes)%1440})}/>
        <label className="shift-v5-field"><span>Timezone <b>*</b></span><select value={draft.timezone} onChange={e=>update({timezone:e.target.value})}>{!['Asia/Kolkata','UTC','Asia/Dubai','Asia/Singapore','Europe/London','America/New_York'].includes(draft.timezone)&&<option value={draft.timezone}>{draft.timezone}</option>}<option value="Asia/Kolkata">Asia/Kolkata (GMT +5:30)</option><option value="UTC">UTC</option><option value="Asia/Dubai">Asia/Dubai</option><option value="Asia/Singapore">Asia/Singapore</option><option value="Europe/London">Europe/London</option><option value="America/New_York">America/New_York</option></select></label>
        <TimeField label="Start Time" required value={draft.startMinute} onChange={value=>update({startMinute:value??0})}/>
        <TimeField label="End Time" required value={draft.endMinute} onChange={value=>update({endMinute:value??0})}/>
        </div></section><section className="shift-v5-section"><div className="shift-v5-section-head"><div><h2>02 · Break & grace rules</h2><p>Choose how breaks are recorded and allow a small arrival or departure grace.</p></div><AlarmClock size={20}/></div><div className="shift-v5-grid two"><NumberField label="Break Duration" value={draft.breakMinutes} max={180} onChange={breakMinutes=>update({breakMinutes,...(draft.breakMode!=='FLEXIBLE_PUNCH'&&draft.breakStartMinute!=null?{breakEndMinute:(draft.breakStartMinute+breakMinutes)%1440}:{})})}/>
        <label className="shift-v5-field"><span>Break Type</span><select aria-label="Break Type" value={draft.breakMode} onChange={e=>update({breakMode:e.target.value as ShiftDraft['breakMode']})}><option value="AUTOMATIC_SCHEDULED">Auto — Fixed scheduled break</option><option value="SCHEDULED_PUNCH">Manual — Scheduled punch break</option><option value="FLEXIBLE_PUNCH">Manual — Flexible punch break</option></select><small className="shift-v5-field-help">{draft.breakMode==='AUTOMATIC_SCHEDULED'?'Auto mode follows the configured break window.':'Manual mode starts from the employee OUT punch; flexible manual break can be taken any time in the shift.'}</small></label>
        {draft.breakMode!=='FLEXIBLE_PUNCH'&&<><TimeField label="Break Window Start" value={draft.breakStartMinute} onChange={breakStartMinute=>update({breakStartMinute,...(breakStartMinute!=null&&draft.breakEndMinute!=null?{breakMinutes:Math.min(180,spanMinutes(breakStartMinute,draft.breakEndMinute))}:{})})}/><TimeField label="Break Window End" value={draft.breakEndMinute} onChange={breakEndMinute=>update({breakEndMinute,...(draft.breakStartMinute!=null&&breakEndMinute!=null?{breakMinutes:Math.min(180,spanMinutes(draft.breakStartMinute,breakEndMinute))}:{})})}/></>}
        <NumberField label="Late Grace" value={draft.graceMinutes} max={120} onChange={graceMinutes=>update({graceMinutes})}/>
        <NumberField label="Early-out Grace" value={draft.earlyOutGraceMinutes} max={120} onChange={earlyOutGraceMinutes=>update({earlyOutGraceMinutes})}/>
       </div>
      </section>

      <section className="shift-v5-section">
       <div className="shift-v5-section-head"><div><h2>03 · Working week & attendance</h2><p>Select the days this shift is active.</p></div><CalendarIcon/></div>
       <div className="shift-v5-grid two">
        <label className="shift-v5-field span-2"><span>Working Week Pattern</span><select aria-label="Working Week Pattern" value={draft.workWeekMode} onChange={e=>update({workWeekMode:e.target.value})}><option value="MON_FRI">Mon - Fri</option><option value="MON_SAT">Mon - Sat</option><option value="ALTERNATE_SATURDAY">Alternate Saturday</option><option value="ALL_DAYS">All Days</option><option value="CUSTOM_WEEKLY">Custom Weekly</option></select></label>
        {draft.workWeekMode==='ALTERNATE_SATURDAY'&&<label className="shift-v5-field span-2"><span>Alternate Saturday Rule</span><select value={draft.alternateSaturdayMode} onChange={e=>update({alternateSaturdayMode:e.target.value})}><option value="SECOND_FOURTH_OFF">2nd & 4th Saturday Off</option><option value="ODD_OFF">Odd Saturdays Off</option><option value="EVEN_OFF">Even Saturdays Off</option></select></label>}
       </div>
       <div className="shift-v5-days">{week.map(([key,label])=><button type="button" key={key} aria-pressed={selectedDays.includes(key)} className={selectedDays.includes(key)?'active':''} onClick={()=>toggleDay(key)}><span>{selectedDays.includes(key)&&<Check size={14}/>}</span><strong>{label}</strong></button>)}</div>
       <div className="shift-v5-thresholds">
        <div className="shift-v5-roster-field">
         <NumberField label="Flexible Roster-off Days / Month" value={draft.monthlyFlexibleOffDays} max={15} suffix="days" help="0 disables flexible roster-off. Example: 4 lets HR mark any 4 dates as roster off in a month." onChange={monthlyFlexibleOffDays=>update({monthlyFlexibleOffDays})}/>
        </div>
        <div className="shift-v5-duration-heading"><strong>Attendance Duration Rules</strong><span>Type values manually in HH:MM clock format. Exact minutes are saved in the backend.</span></div>
        <div className="shift-v5-duration-grid">
         <DurationField label="Half Day Time" value={draft.halfDayMinutes} min={1} max={600} help="Worked time for Half Day. Other durations below Full working time are Insufficient Time." onChange={halfDayMinutes=>update({halfDayMinutes})}/>
         <DurationField label="Full Day Time" value={draft.fullDayMinutes} min={1} max={960} help="Minimum worked time for Full Day" onChange={fullDayMinutes=>update({fullDayMinutes})}/>
         <DurationField label="Overtime After" value={draft.overtimeAfterMinutes} min={1} max={960} help="Worked-time threshold used for overtime" onChange={overtimeAfterMinutes=>update({overtimeAfterMinutes})}/>
        </div>
       </div>
      </section>
     </div>

     {saveError&&<div className="shift-design-error" role="alert"><Info size={18}/><span>{saveError}</span></div>}
     <footer className="shift-v5-form-footer">
      <div>{editor.id&&canDelete&&<button type="button" className="btn danger" disabled={employeeCount(editor.id)>0} title={employeeCount(editor.id)>0?'Reassign employees before deleting this shift.':'Delete shift'} onClick={()=>editingRow&&setRemove(editingRow)}><Trash2 size={16}/>Delete Shift</button>}</div>
      <div><button type="button" className="btn secondary" disabled={saving} onClick={()=>setEditor(null)}>Cancel</button>{(editor.id?canEdit:canCreate)&&<button type="submit" className="btn primary" disabled={saving}>{saving?'Saving…':editor.id?'Save Changes':'Create Shift'}</button>}</div>
     </footer>
    </form>

    <aside className="shift-v5-preview-panel">
     <header className="shift-v5-preview-head"><div><h2>Shift Preview</h2><p>Preview of this shift schedule and break flow.</p></div><span className="shift-v5-active-chip">Live preview</span></header>
     <div className="shift-v5-preview-timeline">
      <div className="shift-v5-preview-points">
       <span><strong>{minuteClock(draft.startMinute)}</strong><small>IN</small></span>
       {previewBreakStart!=null&&<span className={previewManual?'manual-break-point':''}><strong>{minuteClock(previewBreakStart)}</strong><small>{previewManual?'MANUAL BREAK':'AUTO BREAK'}</small></span>}
       {previewBreakEnd!=null&&<span><strong>{minuteClock(previewBreakEnd)}</strong><small>RESUME</small></span>}
       {draft.breakMode==='FLEXIBLE_PUNCH'&&<span className="manual-break-point flexible"><strong>{duration(draft.breakMinutes)}</strong><small>MANUAL BREAK</small></span>}
       <span><strong>{minuteClock(draft.endMinute)}</strong><small>OUT</small></span>
      </div>
      <div className="shift-v5-bar" aria-label={`${previewManual?'Manual':'Automatic'} break ${duration(previewBreakMinutes)} of ${duration(totalShiftSpan)} shift`}>
       <i className="work" style={{flexGrow:previewBeforeBreak}}/>
       {previewBreakMinutes>0&&<i className={'break '+(previewManual?'manual':'auto')} style={{flexGrow:previewBreakMinutes}} title={`${previewManual?'Manual':'Automatic'} break · ${duration(previewBreakMinutes)}`}/>}
       <i className="work" style={{flexGrow:previewAfterBreak}}/>
      </div>
      <div className={'shift-v5-break-caption '+(previewManual?'manual':'auto')}>
       <strong>{previewManual?'Manual':'Automatic'} Break</strong>
       <span>{draft.breakMode==='FLEXIBLE_PUNCH'?duration(draft.breakMinutes)+' flexible allowance':duration(draft.breakMinutes)+' break'}</span>
      </div>
     </div>

     <div className="shift-v5-preview-metrics"><div><small>Total Shift</small><strong>{duration(totalShiftSpan)}</strong></div><div><small>Work Duration</small><strong>{duration(previewWorkingMinutes)}</strong></div><div><small>Break Duration</small><strong>{duration(previewBreakMinutes)}</strong></div></div>

     <section className="shift-v5-rule-summary">
      <h3>Shift Rules & Summary</h3>
      <div><CalendarIcon/><span>Working Days</span><strong>{workWeekLabel(draft)}</strong></div>
      <div><Clock3 size={18}/><span>Shift Type</span><strong>{shiftKind(draft)}</strong></div>
      <div><Clock3 size={18}/><span>Late Grace</span><strong>{draft.graceMinutes} minute{draft.graceMinutes===1?'':'s'}</strong></div>
      <div><Clock3 size={18}/><span>Early-out Grace</span><strong>{draft.earlyOutGraceMinutes} minute{draft.earlyOutGraceMinutes===1?'':'s'}</strong></div>
      <div><Layers3 size={18}/><span>Break Type</span><strong>{breakModeLabel(draft.breakMode)}</strong></div>
      <div><CalendarIcon/><span>Roster-off / Month</span><strong>{draft.monthlyFlexibleOffDays} day{draft.monthlyFlexibleOffDays===1?'':'s'}</strong></div>
      <div><Clock3 size={18}/><span>Half Day Time</span><strong>{duration(draft.halfDayMinutes)}</strong></div>
      <div><Clock3 size={18}/><span>Full Day</span><strong>{duration(draft.fullDayMinutes)}</strong></div>
      <div><AlarmClock size={18}/><span>Overtime After</span><strong>{duration(draft.overtimeAfterMinutes)}</strong></div>
      <div><Clock3 size={18}/><span>Timezone</span><strong>{draft.timezone}</strong></div>
     </section>

     <div className="shift-v5-info"><Info size={18}/><div><strong>Preview uses the configured shift span minus configured break duration.</strong><p>{draft.breakMode==='AUTOMATIC_SCHEDULED'?'Automatic scheduled break is deducted by policy.':'For manual break modes, actual attendance still deducts the employee\'s real OUT/IN break usage; this preview shows the configured planned duration.'}</p></div></div>
    </aside>
   </div>

   {remove&&<Confirm title="Delete shift?" description="This permanently removes the shift. Employees must be reassigned first and attendance references can prevent deletion." onClose={()=>setRemove(null)} onConfirm={async()=>{await mutate('shifts/'+remove.id,'DELETE');setRemove(null);setEditor(null)}}/>}
  </div>;
 }

 return <div className="shift-v3 shift-v3-dashboard">
  <main className="shift-v3-main">
   <div className="shift-v3-breadcrumb"><span>Attendance</span><ChevronRight size={13}/><strong>Shifts</strong></div>
   <header className="shift-v3-head"><div><span className="shift-v3-eyebrow">SHIFT MANAGEMENT</span><h1>Attendance rules</h1><p>Build clear schedules, breaks, weekly offs and overtime rules for every team.</p></div>{canCreate&&<button className="btn primary" onClick={add}><Plus size={17}/>Add Shift</button>}</header>
   <div className="shift-design-stats"><article><Clock3 size={21}/><div><span>Total shifts</span><strong>{rows.length}</strong></div></article><article><Users size={21}/><div><span>Assigned shifts</span><strong>{assignedTotal}</strong></div></article><article><Moon size={21}/><div><span>Night schedules</span><strong>{rows.filter(r=>Number(r.endMinute)<=Number(r.startMinute)).length}</strong></div></article></div>
   <div className="shift-v3-tabs">
    <button className={!assignmentFilter?'active':''} onClick={()=>setAssignmentFilter('')}>All Shifts <span>{rows.length}</span></button>
    <button className={assignmentFilter==='ASSIGNED'?'active':''} onClick={()=>setAssignmentFilter('ASSIGNED')}>Assigned <span>{assignedTotal}</span></button>
    <button className={assignmentFilter==='UNASSIGNED'?'active':''} onClick={()=>setAssignmentFilter('UNASSIGNED')}>Unassigned <span>{unassignedTotal}</span></button>
   </div>
   <section className="shift-v3-toolbar">
    <label><Search size={16}/><input aria-label="Search shifts" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search shift by name…"/></label>
    <div className="shift-v3-select"><Filter size={15}/><select aria-label="Filter shift type" value={kindFilter} onChange={e=>setKindFilter(e.target.value)}><option value="">All Types</option>{['Regular','Morning','Evening','Night','Half Day'].map(value=><option key={value}>{value}</option>)}</select></div>
    <div className="shift-v3-select"><Users size={15}/><select aria-label="Filter shift assignment" value={assignmentFilter} onChange={e=>setAssignmentFilter(e.target.value)}><option value="">All Assignments</option><option value="ASSIGNED">Assigned</option><option value="UNASSIGNED">Unassigned</option></select></div>
    <button className="shift-v3-reset" onClick={resetFilters}><RotateCcw size={15}/>Reset</button>
   </section>
   {!rows.length?<Empty title="No shifts yet" description="Add the first work shift to configure attendance timing and break rules." action={canCreate?<button className="btn primary" onClick={add}><Plus size={16}/>Add Shift</button>:undefined}/>:!filtered.length?<Empty title="No matching shifts" description="Change the search or filters to see other shifts."/>:<section className="shift-v3-grid">
    {filtered.map((row,index)=>{
     const d=toDraft(row),kind=shiftKind(d),count=employeeCount(row.id),deps=departmentCount(row.id),tone=['blue','teal','orange','violet'][index%4];
     return <article key={row.id} className={'shift-v3-card '+tone} onClick={()=>openRow(row)} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openRow(row)}}}>
      <div className="shift-v3-card-top"><span className="shift-v3-card-icon">{kind==='Night'?<Moon/>:kind==='Evening'?<SunMedium/>:<Clock3/>}</span><span className="shift-v3-card-status">Configured</span><button className="shift-v3-card-menu" aria-label={'Open '+row.name} onClick={e=>{e.stopPropagation();openRow(row)}}><MoreVertical size={17}/></button></div>
      <div className="shift-v3-card-title"><h3>{row.name}</h3><strong>{minuteClock(d.startMinute)} - {minuteClock(d.endMinute)}</strong><span>({duration(spanMinutes(d.startMinute,d.endMinute))})</span></div>
      <div className="shift-v3-tags"><span>{kind}</span><span>{workWeekLabel(d)}</span><span>{d.breakMinutes?duration(d.breakMinutes)+' Break':'No Break'}</span></div>
      <div className="shift-v3-card-foot"><span><Users size={14}/><strong>{count}</strong> Employees</span><i/><span><Layers3 size={14}/><strong>{deps}</strong> Departments</span><span className="shift-v3-open-link">Open & Edit <ChevronRight size={13}/></span></div>
     </article>
    })}
   </section>}
  </main>
 </div>;
}
function CalendarIcon(){return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 5h18v16H3z"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>}
