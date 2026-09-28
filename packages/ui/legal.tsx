'use client';
import React,{useEffect,useState} from 'react';
import Link from 'next/link';
import {Cookie,ShieldCheck} from 'lucide-react';

const CONSENT_KEY='tcw_cookie_consent_v1';
type Consent='essential'|'optional';

export function CookieConsent(){
 const[value,setValue]=useState<Consent|null>(null),[ready,setReady]=useState(false);
 useEffect(()=>{try{const stored=window.localStorage.getItem(CONSENT_KEY);if(stored==='essential'||stored==='optional')setValue(stored)}catch{}setReady(true)},[]);
 function choose(next:Consent){try{window.localStorage.setItem(CONSENT_KEY,next)}catch{}setValue(next);window.dispatchEvent(new CustomEvent('tcw-cookie-consent',{detail:{level:next}}));}
 if(!ready||value)return null;
 return <aside className="cookie-banner" role="dialog" aria-label="Cookie preferences" aria-live="polite"><div className="cookie-icon"><Cookie size={20}/></div><div className="cookie-copy"><strong>Cookie preferences</strong><p>TCW HR Software uses essential cookies for secure sign-in, session protection and core application features. Optional analytics remain off unless you allow them.</p><div className="cookie-links"><Link href="/privacy">Privacy</Link><Link href="/cookies">Cookies</Link></div></div><div className="cookie-actions"><button className="btn secondary small" type="button" onClick={()=>choose('essential')}>Essential only</button><button className="btn primary small" type="button" onClick={()=>choose('optional')}>Allow optional</button></div></aside>;
}

export function LegalPage({kind}:{kind:'privacy'|'cookies'|'terms'}){
 const content=kind==='privacy'?{
  title:'Privacy notice',subtitle:'How TCW HR Software handles account and workforce information.',sections:[
   ['Data used by the service','The service processes company account information, user identities, employee records, attendance, leave, payroll, documents and operational data that authorized users choose to enter or connect.'],
   ['Purpose','Data is used to provide HR workflows, authentication, security, reporting, notifications, payroll processing and features enabled by the company administrator.'],
   ['Access and security','Access is controlled by company code, authenticated sessions and role permissions. TCW HR Software uses HTTPS in production, protects application sessions, and records important administrator actions in the audit log.'],
   ['External services','Email, SMS, AI, object storage, biometric devices and payout providers are only used when the deployment administrator configures those integrations. Their own terms and privacy practices also apply.'],
   ['Retention and requests','Your organization controls the workforce records entered into TCW HR Software and its retention practices. Employees should contact their employer or HR administrator for access, correction or deletion requests.']
  ]}:kind==='cookies'?{
  title:'Cookie notice',subtitle:'Cookies and browser storage used by TCW HR Software.',sections:[
   ['Essential session cookies','Secure HTTP-only session cookies are used to keep signed-in users authenticated and to protect application requests. These are necessary for the service to work.'],
   ['Local browser storage','The application may store interface preferences, local-development session recovery data and your cookie choice in browser storage. Production authentication is still verified by the server.'],
   ['Optional analytics','Optional analytics are not required for core HR features. They should only be enabled after consent and only when the deployment operator has configured an analytics provider.'],
   ['Changing your choice','You can clear site data in your browser to reset the saved cookie preference. Essential authentication cookies are recreated when you sign in.']
  ]}:{
  title:'Terms of use',subtitle:'Basic operating terms for TCW HR Software.',sections:[
   ['Authorized use','Use the service only for an organization you are authorized to manage. Keep credentials private and assign the minimum role permissions needed.'],
   ['HR and payroll review','Attendance, leave, salary, deductions and payout data must be reviewed by authorized company staff before final approval. The software supports administration but does not replace legal, tax, payroll or employment advice.'],
   ['Third-party integrations','SMS, AI, payout, storage and attendance-device functions depend on separately configured providers and may be subject to provider limits, fees, KYC and availability.'],
   ['Availability and backups','TCW HR Software is operated with production monitoring and managed infrastructure. Each customer organization remains responsible for reviewing its HR, payroll and business records and for keeping authorized user access up to date.']
  ]};
 return <main className="legal-page"><div className="legal-shell"><Link href="/login" className="legal-brand"><img src="/tcw-logo.png" alt="TCW HR Software"/><span><strong>TCW HR Software</strong><small>TECH CYBER WARRIOR</small></span></Link><div className="legal-title"><ShieldCheck size={24}/><div><h1>{content.title}</h1><p>{content.subtitle}</p></div></div>{content.sections.map(([title,text])=><section key={title}><h2>{title}</h2><p>{text}</p></section>)}<footer><span>© TCW HR Software</span><a href="https://techcyberwarrior.in" target="_blank" rel="noreferrer">techcyberwarrior.in</a></footer></div></main>;
}
