'use client';
import React,{useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {ArrowUpRight,Sparkles,ShieldCheck,LayoutDashboard} from 'lucide-react';
import {Modal} from './core';
import './quick-actions.css';
const details:Record<string,{description:string;tone:string}>={employees:{description:'Your people, together',tone:'violet'},calendar:{description:'See what is coming up',tone:'blue'},attendance:{description:'Daily check-ins & hours',tone:'teal'},leave:{description:'Requests & time away',tone:'rose'},payroll:{description:'Salary & payment details',tone:'amber'},companies:{description:'Manage your workspaces',tone:'violet'},trials:{description:'Follow up with companies',tone:'blue'},invoices:{description:'Billing at a glance',tone:'amber'},support:{description:'A little help, right here',tone:'teal'},profile:{description:'Your personal workspace',tone:'blue'}};
const actionKeys=new Set(Object.keys(details));
export function QuickActions({items,icons,onClose}:{items:ReadonlyArray<ReadonlyArray<string>>;icons:Record<string,React.ElementType>;onClose:()=>void}){
 const[closing,setClosing]=useState(false);const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current)},[]);
 const close=()=>{if(timer.current)return;setClosing(true);const reduced=typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;timer.current=setTimeout(onClose,reduced?0:180)};
 const actions=items.filter(([key])=>actionKeys.has(key));
 return <Modal title="Quick actions" className={'quick-action-dialog '+(closing?'qa-closing':'')} onClose={close}>
  <div className="qa-intro"><span><Sparkles size={18}/></span><div><strong>A little less searching.</strong><p>Your everyday tools, one tap away.</p></div><span className="qa-count">{actions.length} tools</span></div>
  <nav className="qa-grid" aria-label="Quick actions">{actions.map(([key,label],index)=>{const Icon=icons[key]??LayoutDashboard,detail=details[key];return <Link key={key} href={'/'+key} onClick={onClose} className={'qa-tile qa-'+detail.tone} style={{'--qa-delay':Math.min(index,8)*28+'ms'} as React.CSSProperties}><span className="qa-tile-top"><span className="qa-icon"><Icon size={23} strokeWidth={1.8}/></span><ArrowUpRight size={16} className="qa-arrow" aria-hidden="true"/></span><strong>{label}</strong><small>{detail.description}</small></Link>})}</nav>
  <footer className="qa-footer"><ShieldCheck size={14}/><span>Tools follow your workspace access.</span><span className="qa-escape">Esc to close</span></footer>
 </Modal>;
}
