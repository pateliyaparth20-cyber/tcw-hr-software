'use client';
import React,{useEffect,useMemo,useState} from 'react';
import {Activity,ChevronRight,Cloud,Filter,KeyRound,MapPin,Monitor,MoreVertical,Plus,RefreshCw,Search,Server,Settings2,Signal,Smartphone,Trash2,Users,Wifi,WifiOff} from 'lucide-react';
import {Confirm,Empty,Failure,Loading,Modal,displayDate,useApp,useData} from './core';
import {Row,readable} from './config';
import {AttendanceMachineCatalogModal,DeviceLogModal,DeviceMappingModal,DeviceNativeSetupModal,DevicePunchModal} from './modules';

type DeviceDraft={name:string;vendor:string;model:string;serialNumber:string;connectionMode:string;host:string;port:number;branchId:string;timezone:string};
const vendors=['TCW_MOBILE','BIOMAX','ZKTECO','ESSL','MATRIX','REALTIME','MANTRA','HIKVISION','CPPLUS','DAHUA','SUPREMA','ANVIZ','SPECTRA','VIRDI','GENERIC'];
const modes=['EMPLOYEE_APP','NATIVE_PUSH','CLOUD_PUSH','LAN_PULL','WIFI_LAN','MIDDLEWARE'];
const timezones=['Asia/Kolkata','UTC','Asia/Dubai','Asia/Singapore','Europe/London','America/New_York'];
const emptyDraft=():DeviceDraft=>({name:'',vendor:'BIOMAX',model:'SpeedFace 5SE Lite',serialNumber:'',connectionMode:'NATIVE_PUSH',host:'',port:4370,branchId:'',timezone:'Asia/Kolkata'});
const toDraft=(row:Row):DeviceDraft=>({name:String(row.name??''),vendor:String(row.vendor??'GENERIC'),model:String(row.model??''),serialNumber:String(row.serialNumber??''),connectionMode:String(row.connectionMode??'NATIVE_PUSH'),host:String(row.host??''),port:Number(row.port??5005),branchId:String(row.branchId??''),timezone:String(row.timezone??'Asia/Kolkata')});
const payload=(draft:DeviceDraft)=>{const mobile=draft.vendor==='TCW_MOBILE'||draft.connectionMode==='EMPLOYEE_APP';return {name:draft.name.trim(),vendor:mobile?'TCW_MOBILE':draft.vendor,model:mobile?'TCW Employee Face Scan':draft.model.trim(),serialNumber:mobile?'TCW-EMPLOYEE-APP':draft.serialNumber.trim(),connectionMode:mobile?'EMPLOYEE_APP':draft.connectionMode,host:mobile?'':draft.host.trim(),port:mobile?443:Number(draft.port||5005),branchId:draft.branchId||null,timezone:draft.timezone}};
const isOnline=(row:Row)=>['ONLINE','ACTIVE','READY'].includes(String(row.status??'').toUpperCase());
const isInactive=(row:Row)=>['INACTIVE','DISABLED'].includes(String(row.status??'').toUpperCase());
const deviceKind=(row:Row|DeviceDraft)=>String(row.connectionMode)==='EMPLOYEE_APP'||String(row.vendor)==='TCW_MOBILE'?'Mobile App':'Biometric Device';
const modeLabel=(value:any)=>readable(String(value??'').toLowerCase());
const vendorLabel=(value:any)=>String(value)==='TCW_MOBILE'?'TCW Mobile':readable(String(value??'').toLowerCase());

function DeviceIcon({row,large=false}:{row:Row|DeviceDraft;large?:boolean}){const mobile=String(row.connectionMode)==='EMPLOYEE_APP'||String(row.vendor)==='TCW_MOBILE';return <span className={'device-v3-icon '+(large?'large ':'')+(mobile?'mobile':'')}>{mobile?<Smartphone/>:<Monitor/>}</span>}
function StatusChip({row}:{row:Row}){if(isOnline(row))return <span className="device-v3-status online"><i/>Online</span>;if(isInactive(row))return <span className="device-v3-status inactive"><i/>Inactive</span>;return <span className="device-v3-status offline"><i/>{String(row.status??'OFFLINE')==='AWAITING_CONNECTION'?'Awaiting':'Offline'}</span>}
function DeviceField({label,children,required=false,className=''}:{label:string;children:React.ReactNode;required?:boolean;className?:string}){return <label className={'device-v3-field '+className}><span>{label}{required&&<b>*</b>}</span>{children}</label>}

export function DeviceManagement(){
 const {can,mutate,notify}=useApp();
 const query=useData('devices?pageSize=500',true,10000);
 const branches=useData('branches?pageSize=500',can('organization'));
 const rows:Row[]=query.data?.items??[],branchRows:Row[]=branches.data?.items??[];
 const canCreate=can('devices','CREATE'),canEdit=can('devices','EDIT'),canDelete=can('devices','DELETE'),canManage=can('devices','MANAGE');
 const [selectedId,setSelectedId]=useState(''),[creating,setCreating]=useState(false),[draft,setDraft]=useState<DeviceDraft>(emptyDraft()),[search,setSearch]=useState(''),[filter,setFilter]=useState<'ALL'|'ONLINE'|'OFFLINE'|'INACTIVE'>('ALL'),[saving,setSaving]=useState(false);
 const [remove,setRemove]=useState<Row|null>(null),[catalog,setCatalog]=useState(false),[catalogSearch,setCatalogSearch]=useState('');
 const [nativeSetup,setNativeSetup]=useState<Row|null>(null),[punches,setPunches]=useState<Row|null>(null),[mapping,setMapping]=useState<Row|null>(null),[logs,setLogs]=useState<Row|null>(null),[gateway,setGateway]=useState<Row|null>(null);
 useEffect(()=>{if(creating)return;if(selectedId&&rows.some(row=>String(row.id)===selectedId))return;if(rows.length){setSelectedId(String(rows[0].id));setDraft(toDraft(rows[0]))}},[rows,selectedId,creating]);
 const selected=creating?null:rows.find(row=>String(row.id)===selectedId)??null;
 useEffect(()=>{if(selected&&!creating)setDraft(toDraft(selected))},[selectedId,selected?.updatedAt,creating]);
 const branchName=(id:any)=>branchRows.find(row=>String(row.id)===String(id))?.name??'Unassigned';
 const online=rows.filter(isOnline).length,inactive=rows.filter(isInactive).length,offline=rows.length-online-inactive;
 const filtered=useMemo(()=>rows.filter(row=>{const needle=search.trim().toLowerCase();if(needle&&!String([row.name,row.vendor,row.model,row.serialNumber,row.host,branchName(row.branchId)].join(' ')).toLowerCase().includes(needle))return false;if(filter==='ONLINE')return isOnline(row);if(filter==='INACTIVE')return isInactive(row);if(filter==='OFFLINE')return !isOnline(row)&&!isInactive(row);return true}),[rows,search,filter,branchRows]);
 const update=(patch:Partial<DeviceDraft>)=>setDraft(current=>({...current,...patch}));
 const mobile=draft.vendor==='TCW_MOBILE'||draft.connectionMode==='EMPLOYEE_APP';
 function open(row:Row){setCreating(false);setSelectedId(String(row.id));setDraft(toDraft(row))}
 function add(){setCreating(true);setSelectedId('');setDraft(emptyDraft())}
 async function save(){if(!draft.name.trim()||(!draft.serialNumber.trim()&&!mobile))return;setSaving(true);try{const result=await mutate('devices'+(selected?'/'+selected.id:''),selected?'PATCH':'POST',payload(draft));if(!selected&&result?.id){setCreating(false);setSelectedId(String(result.id));setDraft(toDraft(result));if(result.connectionMode==='NATIVE_PUSH')setNativeSetup({...result,fallbackKey:result.pushSecret});else if(result?.pushSecret)setGateway(result)}}finally{setSaving(false)}}
 async function test(row:Row){try{const result=await mutate('devices/'+row.id+'/test','POST',{});notify(result?.message??'Connection test completed.')}catch(e:any){notify(e?.message??'Connection test failed.',true)}}
 async function rotate(row:Row){try{const result=await mutate('devices/'+row.id+'/rotate-secret','POST',{});setGateway({...result.device,...result})}catch{}}
 const choosePreset=(preset:Row)=>{setCatalog(false);setCreating(true);setSelectedId('');setDraft({...emptyDraft(),name:String(preset.name??''),vendor:String(preset.vendor??'GENERIC'),model:String(preset.model??''),serialNumber:String(preset.serialNumber??''),connectionMode:String(preset.connectionMode??'NATIVE_PUSH'),host:String(preset.host??''),port:Number(preset.port??5005),timezone:String(preset.timezone??'Asia/Kolkata'),branchId:''})};

 if(query.isLoading)return <Loading/>;
 if(query.error)return <Failure error={query.error} retry={()=>query.refetch()}/>;

 return <div className="device-v3">
  <header className="device-v3-head"><div><span className="device-v3-eyebrow">ATTENDANCE CONNECTIVITY</span><h1>Device Management</h1><p>Manage biometric devices, TCW Employee Face Scan and attendance terminals.</p></div><div className="device-v3-head-actions">{canCreate&&<button className="btn secondary" onClick={()=>setCatalog(true)}><Monitor size={17}/>Attendance Sources</button>}{canCreate&&<button className="btn primary" onClick={add}><Plus size={17}/>Add Device</button>}</div></header>
  <div className="device-v3-layout">
   <aside className="device-v3-list-panel">
    <div className="device-v3-list-head"><div><h2>All Devices</h2><span>{rows.length}</span></div><button className="icon-button" title="Refresh devices" onClick={()=>query.refetch()}><RefreshCw size={17}/></button></div>
    <div className="device-v3-tabs"><button className={filter==='ALL'?'active':''} onClick={()=>setFilter('ALL')}>All <span>{rows.length}</span></button><button className={filter==='ONLINE'?'active':''} onClick={()=>setFilter('ONLINE')}><i className="online"/>Online <span>{online}</span></button><button className={filter==='OFFLINE'?'active':''} onClick={()=>setFilter('OFFLINE')}><i className="offline"/>Offline <span>{offline}</span></button><button className={filter==='INACTIVE'?'active':''} onClick={()=>setFilter('INACTIVE')}><i className="inactive"/>Inactive <span>{inactive}</span></button></div>
    <label className="device-v3-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search device by name, serial, IP…"/><Filter size={16}/></label>
    <div className="device-v3-list">{!filtered.length?<Empty title="No matching devices" description={rows.length?'Change the search or device status filter.':'Add your first attendance source.'}/>:filtered.map(row=><button key={row.id} type="button" className={'device-v3-list-item '+(selected?.id===row.id?'active':'')} onClick={()=>open(row)}><DeviceIcon row={row}/><span className="device-v3-list-copy"><span><strong>{row.name}</strong><StatusChip row={row}/></span><small>{vendorLabel(row.vendor)} {row.model?'· '+row.model:''}</small><em><MapPin size={13}/>{branchName(row.branchId)}{row.host?' · '+row.host:''}</em></span><MoreVertical size={18}/></button>)}</div>
   </aside>
   <main className="device-v3-editor">
    <div className="device-v3-editor-head"><div><h2>{creating?'Add Device':'Edit Device'}</h2><p>{creating?'Register a new attendance source.':'Update device information and connection settings.'}</p></div>{selected?<StatusChip row={selected}/>:<span className="device-v3-status inactive"><i/>New</span>}</div>
    <div className="device-v3-editor-body">
     <section className="device-v3-identity"><DeviceIcon row={draft} large/><div><strong>{draft.name||'New Attendance Device'}</strong><span>{deviceKind(draft)}</span><small>{vendorLabel(draft.vendor)} {draft.model?'· '+draft.model:''}</small></div>{selected&&<div className="device-v3-live-meta"><span><Signal size={15}/>Last seen <strong>{selected.lastSeenAt?displayDate(selected.lastSeenAt):'Never'}</strong></span><span><RefreshCw size={15}/>Last sync <strong>{selected.lastSync?displayDate(selected.lastSync):'Never'}</strong></span></div>}</section>
     <section className="device-v3-section">
      <div className="device-v3-section-title"><div><h3>Device Information</h3><p>Core identity and attendance source details.</p></div><Monitor size={19}/></div>
      <div className="device-v3-grid two">
       <DeviceField label="Device Name" required><input value={draft.name} onChange={e=>update({name:e.target.value})} placeholder="Main Office Device"/></DeviceField>
       <DeviceField label="Source / Brand" required><select value={draft.vendor} onChange={e=>{const vendor=e.target.value;update({vendor,connectionMode:vendor==='TCW_MOBILE'?'EMPLOYEE_APP':draft.connectionMode,port:vendor==='TCW_MOBILE'?443:draft.port})}}>{vendors.map(v=><option key={v} value={v}>{vendorLabel(v)}</option>)}</select></DeviceField>
       <DeviceField label="Model / App"><input value={mobile?'TCW Employee Face Scan':draft.model} disabled={mobile} onChange={e=>update({model:e.target.value})} placeholder="SpeedFace 5SE Lite"/></DeviceField>
       <DeviceField label="Serial / Source ID" required><input value={mobile?'TCW-EMPLOYEE-APP':draft.serialNumber} disabled={mobile} onChange={e=>update({serialNumber:e.target.value})} placeholder="Device serial number"/></DeviceField>
       <DeviceField label="Branch / Location"><select value={draft.branchId} onChange={e=>update({branchId:e.target.value})}><option value="">Unassigned</option>{branchRows.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></DeviceField>
       <DeviceField label="Timezone" required><select value={draft.timezone} onChange={e=>update({timezone:e.target.value})}>{!timezones.includes(draft.timezone)&&<option value={draft.timezone}>{draft.timezone}</option>}{timezones.map(v=><option key={v} value={v}>{v}</option>)}</select></DeviceField>
      </div>
     </section>
     <section className="device-v3-section">
      <div className="device-v3-section-title"><div><h3>Connection Settings</h3><p>Configure how TCW HR receives attendance punches.</p></div><Server size={19}/></div>
      <div className="device-v3-grid three"><DeviceField label="Communication Mode" required className="span-3"><select value={mobile?'EMPLOYEE_APP':draft.connectionMode} disabled={mobile} onChange={e=>update({connectionMode:e.target.value})}>{modes.map(v=><option key={v} value={v}>{modeLabel(v)}</option>)}</select></DeviceField>{!mobile&&<><DeviceField label="LAN IP / Host" className="span-2"><input value={draft.host} onChange={e=>update({host:e.target.value})} placeholder="192.168.1.201"/></DeviceField><DeviceField label="Port" required><input type="number" min={1} max={65535} value={draft.port} onChange={e=>update({port:Math.max(1,Math.min(65535,Number(e.target.value)||5005))})}/></DeviceField></>}</div>
      {selected&&canManage&&<div className="device-v3-connection-actions"><button className="btn secondary" onClick={()=>test(selected)}>{mobile?<Smartphone size={17}/>:<Wifi size={17}/>} {mobile?'Check App Status':'Test Connection'}</button>{!mobile&&<button className="btn secondary" onClick={()=>setNativeSetup(selected)}><Settings2 size={17}/>Device Setup</button>}</div>}
     </section>
     <section className="device-v3-section">
      <div className="device-v3-section-title"><div><h3>Attendance & Sync</h3><p>Live operational information from this attendance source.</p></div><Activity size={19}/></div>
      <div className="device-v3-info-grid"><article><span className="blue"><Activity/></span><div><small>Punch Capture</small><strong>IN & OUT attendance</strong><em>Processed by TCW attendance engine</em></div></article><article><span className={selected&&isOnline(selected)?'green':'slate'}>{selected&&isOnline(selected)?<Wifi/>:<WifiOff/>}</span><div><small>Connection State</small><strong>{selected?readable(String(selected.status??'unknown').toLowerCase()):'Not connected yet'}</strong><em>{selected?.lastSeenAt?'Last seen '+displayDate(selected.lastSeenAt):'No live heartbeat yet'}</em></div></article><article><span className="violet"><Cloud/></span><div><small>Integration</small><strong>{modeLabel(draft.connectionMode)}</strong><em>{mobile?'Signed-in Employee Face Scan':'Device to server attendance sync'}</em></div></article></div>
      {selected&&canManage&&<div className="device-v3-tools"><button onClick={()=>setPunches(selected)}><Activity size={17}/><span><strong>{mobile?'Face Scan Punches':'Live Punches'}</strong><small>View recent attendance events</small></span><ChevronRight size={17}/></button>{!mobile&&<button onClick={()=>setMapping(selected)}><Users size={17}/><span><strong>Map Employees</strong><small>Link device users to employees</small></span><ChevronRight size={17}/></button>}<button onClick={()=>setLogs(selected)}><Server size={17}/><span><strong>{mobile?'Activity Log':'Sync Log'}</strong><small>Review device integration events</small></span><ChevronRight size={17}/></button>{!mobile&&<button onClick={()=>rotate(selected)}><KeyRound size={17}/><span><strong>Gateway Key</strong><small>Rotate middleware secret safely</small></span><ChevronRight size={17}/></button>}</div>}
     </section>
    </div>
    <footer className="device-v3-footer"><div>{selected&&canDelete&&<button className="btn danger" onClick={()=>setRemove(selected)}><Trash2 size={17}/>Delete Device</button>}</div><div>{creating&&<button className="btn secondary" onClick={()=>{setCreating(false);if(rows[0])open(rows[0])}}>Cancel</button>}{(creating?canCreate:canEdit)&&<button className="btn primary" disabled={saving||!draft.name.trim()||(!mobile&&!draft.serialNumber.trim())} onClick={save}>{saving?'Saving…':creating?'Create Device':'Update Device'}</button>}</div></footer>
   </main>
  </div>
  {catalog&&<AttendanceMachineCatalogModal search={catalogSearch} setSearch={setCatalogSearch} onClose={()=>setCatalog(false)} onSelect={choosePreset}/>}
  {nativeSetup&&<DeviceNativeSetupModal device={nativeSetup} onClose={()=>setNativeSetup(null)}/>}
  {punches&&<DevicePunchModal device={punches} onClose={()=>setPunches(null)}/>}
  {mapping&&<DeviceMappingModal device={mapping} onClose={()=>setMapping(null)}/>}
  {logs&&<DeviceLogModal device={logs} onClose={()=>setLogs(null)}/>}
  {gateway&&<Modal title="Gateway key" onClose={()=>setGateway(null)} wide><div className="modal-body credential-sheet"><p>This secret is used only for middleware / REST gateway integrations. Save it securely when it is shown.</p><div className="profile-grid"><div><span>Device</span><strong>{gateway.name??gateway.device?.name??selected?.name}</strong></div><div><span>Serial</span><strong>{gateway.serialNumber??gateway.device?.serialNumber??selected?.serialNumber}</strong></div><div className="span-two"><span>Gateway key</span><strong className="mono-secret">{gateway.pushSecret??'Generated key is not available in this response.'}</strong></div></div>{gateway.pushSecret&&<button className="btn primary" onClick={()=>navigator.clipboard?.writeText(String(gateway.pushSecret))}>Copy gateway key</button>}</div></Modal>}
  {remove&&<Confirm title="Delete device?" description="This permanently removes the attendance device/source. Existing attendance records remain, but future punches from this source will stop until it is registered again." onClose={()=>setRemove(null)} onConfirm={async()=>{await mutate('devices/'+remove.id,'DELETE');setRemove(null);setCreating(false);setSelectedId('')}}/>}
 </div>
}
