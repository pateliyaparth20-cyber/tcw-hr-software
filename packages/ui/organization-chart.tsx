'use client';
import React,{useMemo,useState} from 'react';
import './organization-chart.css';
import Link from 'next/link';
import {Search,Network,ChevronDown,ChevronRight,Users} from 'lucide-react';
import {useApp,useData,Loading,Failure,Empty,Avatar,Badge,PageTitle} from './core';
import {reportingTree,type ReportingPerson} from './reporting-tree';

export function OrganizationChart(){
 const {session}=useApp();const data=useData('organization-chart');
 const [search,setSearch]=useState(''),[collapsed,setCollapsed]=useState<Set<string>>(new Set());
 const people:ReportingPerson[]=data.data?.items??[];
 const tree=useMemo(()=>reportingTree(people,search),[people,search]);
 function toggle(id:string){setCollapsed(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next})}
 function personNode(person:ReportingPerson,depth=0):React.ReactNode{
  const reports=tree.children.get(person.id)??[],open=!!search||!collapsed.has(person.id);
  return <li key={person.id}><div className={'reporting-person '+(search&&tree.matches.has(person.id)?'search-match':'')}>
   <Avatar name={person.firstName+' '+person.lastName}/><div className="reporting-person-copy"><Link href={'/employees?search='+encodeURIComponent(person.employeeCode)}>{person.firstName} {person.lastName}</Link><span>{person.designation||'Designation not set'}</span><small>{person.employeeCode}{person.departmentName?' · '+person.departmentName:''}</small></div>
   <Badge value={person.status??'ACTIVE'}/>{reports.length>0&&<button type="button" className="reporting-toggle" aria-label={(open?'Collapse':'Expand')+' reports for '+person.firstName+' '+person.lastName} aria-expanded={open} onClick={()=>toggle(person.id)}>{open?<ChevronDown size={16}/>:<ChevronRight size={16}/>}<span>{reports.length} direct</span></button>}
  </div>{tree.invalid.has(person.id)&&<p className="reporting-note">This reporting relationship forms a cycle. Correct Reports to in People.</p>}
  {person.managerId&&!people.some(p=>p.id===person.managerId)&&<p className="reporting-note">Assigned manager is outside this available directory.</p>}
  {reports.length>0&&open&&(depth<40?<ul>{reports.map(p=>personNode(p,depth+1))}</ul>:<p className="reporting-note">Open the employee directory to review deeper reporting levels.</p>)}</li>;
 }
 return <><PageTitle title="Reporting chart" subtitle="View who reports to whom across your organization."/>
 <section className="panel organization-chart-panel"><div className="toolbar"><label className="search-field"><Search size={18}/><input aria-label="Search reporting chart" placeholder="Search name, ID, department or designation…" value={search} onChange={e=>setSearch(e.target.value)}/></label><span className="reporting-count"><Users size={16}/>{people.length} employees</span><button type="button" className="btn secondary small" disabled={!!search} onClick={()=>setCollapsed(new Set())}>Expand all</button><button type="button" className="btn secondary small" disabled={!!search} onClick={()=>setCollapsed(new Set(people.map(p=>p.id)))}>Collapse all</button></div>
 {data.isLoading?<Loading/>:data.error?<Failure error={data.error} retry={()=>data.refetch()}/>:!tree.roots.length?<Empty title={search?'No matching employees':'No reporting structure yet'} description={search?'Try a different name, employee ID or department.':'Add employees and assign Reports to in People to build your organization chart.'}/>:<div className="reporting-chart"><div className="reporting-company"><Network size={23}/><div><strong>{session.company?.name??'Company'}</strong><span>HR / Company leadership</span></div></div><ul className="organization-chart-tree">{tree.roots.map(p=>personNode(p))}</ul></div>}
 <p className="reporting-footer">Search includes managers for context. Update reporting relationships from the employee profile in People.</p></section></>;
}
