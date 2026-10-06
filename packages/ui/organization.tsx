'use client';
import React,{useEffect,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {Building2,Layers,Briefcase,Users,Network,Wallet,MapPin,Plus,Search,LayoutGrid,List,PenLine,Trash2,ArrowUpDown,ChevronLeft,ChevronRight} from 'lucide-react';
import {modules,type Row,type Field} from './config';
import {useApp,useData,Modal,RecordForm,Confirm,Loading,Failure,Empty,Table} from './core';
import {OrganizationChart} from './organization-chart';
import './organization.css';

const sections=[
 {key:'departments',label:'Departments',icon:Layers,description:'Build a clear structure for your people and their responsibilities.'},
 {key:'branches',label:'Branches',icon:Building2,description:'Keep every office location and address organized in one place.'},
 {key:'designations',label:'Designations',icon:Briefcase,description:'Create consistent job titles for employee profiles.'},
 {key:'teams',label:'Teams',icon:Users,description:'Maintain the teams that make your organization work.'},
 {key:'locations',label:'Locations',icon:MapPin,description:'Manage additional work locations for your organization.'},
 {key:'cost-centers',label:'Cost centers',icon:Wallet,description:'Organize cost allocation with clear names and unique codes.'},
 {key:'reporting-chart',label:'Reporting chart',icon:Network,description:'Explore your company structure and reporting relationships.'},
];

export function Organization(){
 const {session}=useApp();const params=useSearchParams(),router=useRouter();
 const tab=sections.some(s=>s.key===params.get('tab'))?params.get('tab')!:'departments';
 const active=sections.find(s=>s.key===tab)!;
 function select(key:string){const query=new URLSearchParams(params.toString());query.set('tab',key);router.replace('/organization?'+query.toString(),{scroll:false})}
 return <div className="org-workspace">
  <header className="org-hero"><div className="org-hero-copy"><span className="org-eyebrow"><Building2 size={15}/>COMPANY WORKSPACE</span><h1>Organization</h1><p>A well-organized company starts with a clear foundation.</p><span className="org-company"><span className="org-company-dot"/>{session.company?.name??'Your company'}</span></div><div className="org-hero-art" aria-hidden="true"><Building2 size={42}/><div><Layers size={22}/><Users size={22}/><Network size={22}/></div></div></header>
  <nav className="org-navigation" aria-label="Organization sections">{sections.map(s=><button type="button" key={s.key} className={s.key===tab?'active':''} aria-current={s.key===tab?'page':undefined} onClick={()=>select(s.key)}><s.icon size={18}/><span>{s.label}</span></button>)}</nav>
  {tab==='reporting-chart'?<OrganizationChart/>:<OrganizationRecords key={tab} name={tab} description={active.description} icon={active.icon}/>}
 </div>;
}

function OrganizationRecords({name,description,icon:Icon}:{name:string;description:string;icon:typeof Building2}){
 const {can,mutate}=useApp(),cfg=modules[name];
 const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1),[view,setView]=useState<'cards'|'list'>('cards'),[sort,setSort]=useState<'recent'|'name'>('recent');
 const [editing,setEditing]=useState<Row|null>(null),[deleting,setDeleting]=useState<Row|null>(null);
 useEffect(()=>{const timer=setTimeout(()=>{setQuery(search.trim());setPage(1)},250);return()=>clearTimeout(timer)},[search]);
 const data=useData(`${name}?page=${page}&pageSize=24&q=${encodeURIComponent(query)}&sort=${sort}`);
 const rows:Row[]=data.data?.items??[],total=Number(data.data?.total??0),pages=Math.max(1,Math.ceil(total/24));
 // A live deletion may remove the last row on the current page.
 useEffect(()=>{if(data.data&&page>pages)setPage(pages)},[data.data,page,pages]);
 const fields:Field[]=cfg.fields.map(f=>({...f,hint:f.key==='code'?'Use a unique code within this company.':f.hint}));
 if(!fields.some(f=>f.key==='description'))fields.push({key:'description',label:'Description',type:'textarea',hint:'Optional context for your HR team.'});
 const actions=(row:Row)=><>{can('organization','EDIT')&&<button type="button" className="org-action" aria-label={'Edit '+row.name} onClick={()=>setEditing(row)}><PenLine size={16}/></button>}{can('organization','DELETE')&&<button type="button" className="org-action org-delete" aria-label={'Delete '+row.name} onClick={()=>setDeleting(row)}><Trash2 size={16}/></button>}</>;
 return <section className="org-records" aria-label={cfg.title}>
  <div className="org-section-head"><div><span className="org-section-label">ORGANIZATION DIRECTORY</span><h2><Icon size={24}/>{cfg.title}</h2><p>{description}</p></div>{can('organization','CREATE')&&<button type="button" className="btn primary" onClick={()=>setEditing({})}><Plus size={17}/>Add {cfg.singular}</button>}</div>
  <div className="org-tools"><label className="org-search"><Search size={18}/><input aria-label={'Search '+cfg.title.toLowerCase()} placeholder={'Search '+cfg.title.toLowerCase()+'…'} value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button type="button" aria-label="Clear organization search" onClick={()=>setSearch('')}>×</button>}</label><label className="org-sort"><ArrowUpDown size={16}/><select aria-label="Sort organization records" value={sort} onChange={e=>{setSort(e.target.value as 'recent'|'name');setPage(1)}}><option value="recent">Newest first</option><option value="name">Name A–Z</option></select></label><div className="org-view" aria-label="Directory view"><button type="button" aria-label="Card view" aria-pressed={view==='cards'} onClick={()=>setView('cards')}><LayoutGrid size={18}/></button><button type="button" aria-label="List view" aria-pressed={view==='list'} onClick={()=>setView('list')}><List size={18}/></button></div></div>
  <div className="org-results"><span>{data.isLoading?'Loading records…':data.error?'Records unavailable':`${total} ${query?'matching ':''}${total===1?cfg.singular:cfg.title.toLowerCase()}`}</span>{query&&<small>Results for “{query}”</small>}</div>
  {data.isLoading?<Loading/>:data.error?<Failure error={data.error} retry={()=>data.refetch()}/>:!rows.length?<Empty title={query?'No matching records':'Your '+cfg.title.toLowerCase()+' start here'} description={query?'Try a different name or code.':'Use Add '+cfg.singular+' to create the first record for your company.'}/>:view==='list'?<div className="org-list"><Table rows={rows} columns={cfg.columns} actions={can('organization','EDIT')||can('organization','DELETE')?actions:undefined}/></div>:<div className="org-card-grid">{rows.map(row=><article className="org-card" key={row.id}><div className="org-card-top"><span className="org-record-icon"><Icon size={22}/></span><span className="org-code">{row.code}</span></div><h3>{row.name}</h3>{name==='branches'&&<p className="org-address"><MapPin size={14}/><span>{[row.location,row.addressLine,row.city,row.state,row.pincode].filter(Boolean).join(', ')||'Address not added'}</span></p>}<p className="org-card-description">{row.description||'No description added.'}</p><footer><span>{row.createdAt?'Added '+new Date(row.createdAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):''}</span><div>{actions(row)}</div></footer></article>)}</div>}
  {!data.isLoading&&!data.error&&total>0&&<div className="org-pagination"><span>{(page-1)*24+1}–{Math.min(page*24,total)} of {total}</span><div><button type="button" className="btn secondary small" disabled={page<=1||data.isFetching} aria-label="Previous organization page" onClick={()=>setPage(p=>p-1)}><ChevronLeft size={16}/></button><span>Page {page} of {pages}</span><button type="button" className="btn secondary small" disabled={page>=pages||data.isFetching} aria-label="Next organization page" onClick={()=>setPage(p=>p+1)}><ChevronRight size={16}/></button></div></div>}
  <p className="org-directory-note"><Network size={16}/>Assign employee departments, branches and designations from People. Records in use are protected from deletion.</p>
  {editing&&<Modal title={(editing.id?'Edit ':'Add ')+cfg.singular} onClose={()=>setEditing(null)} wide={name==='branches'}><div className="org-form-intro"><Icon size={21}/><div><strong>{editing.id?'Keep your directory up to date':'Create a new '+cfg.singular}</strong><p>Names and codes help your HR team find the right record.</p></div></div><RecordForm fields={fields} initial={editing} submit={editing.id?'Save changes':'Create '+cfg.singular} formClassName="org-record-form" onCancel={()=>setEditing(null)} onSave={async values=>{await mutate(name+(editing.id?'/'+editing.id:''),editing.id?'PATCH':'POST',values);setEditing(null)}}/></Modal>}
  {deleting&&<Confirm title={'Delete '+cfg.singular+'?'} description={`Delete “${deleting.name}”? This is permanent. Records referenced elsewhere cannot be deleted.`} onClose={()=>setDeleting(null)} onConfirm={async()=>{await mutate(name+'/'+deleting.id,'DELETE')}}/>}
 </section>;
}
