'use client';
import React from 'react';
import {useUrlTab} from './use-url-tab';
import {useApp,Empty} from './core';
import {PayrollSettingsPage} from './workforce-settings';
import {SalaryWorkspace,PayoutReconciliation} from './hr-operations';
import {ModulePage} from './modules';
import {CompanyPaymentSettings} from './payroll-payments';
import './payroll-overview.css';

export function PayrollSettingsHub({initial='payments'}:{initial?:string}){
 const {can}=useApp();const sections=[{key:'settings',label:'Payroll configuration',allowed:can('payroll','MANAGE')},{key:'rules',label:'Contribution rules',allowed:can('payroll','MANAGE')},{key:'structures',label:'Salary structures',allowed:can('payroll','MANAGE')},{key:'payments',label:'Payment account',allowed:can('payroll','APPROVE')},{key:'reconciliation',label:'Payment reconciliation',allowed:can('payroll','APPROVE')}].filter(s=>s.allowed);
 const [active,setActive]=useUrlTab('payrollSection',sections.map(s=>s.key),sections.some(s=>s.key===initial)?initial:sections[0]?.key??'');
 const current=sections.some(s=>s.key===active)?active:sections[0]?.key;
 return <section className="payroll-settings-hub"><header><span>PAYROLL WORKSPACE</span><h1>Payment Settings</h1><p>Manage payroll rules, salary structures, payment accounts and reconciliation in one place.</p></header><nav className="payroll-settings-hub-nav" aria-label="Payment settings sections">{sections.map(s=><button key={s.key} aria-pressed={current===s.key} className={current===s.key?'active':''} onClick={()=>setActive(s.key)}>{s.label}</button>)}</nav>{current==='settings'?<PayrollSettingsPage/>:current==='rules'?<ModulePage name="salary-rules"/>:current==='structures'?<SalaryWorkspace/>:current==='payments'?<CompanyPaymentSettings/>:current==='reconciliation'?<PayoutReconciliation/>:<Empty title="Payment settings access required" description="Your payroll administrator manages these settings."/>}</section>;
}
