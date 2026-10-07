'use client';
import {createPortal} from 'react-dom';
import './salary-challan.css';
import {FileDown,Printer,RefreshCw} from 'lucide-react';
import {useApp,useData,Modal,Table,Loading,Failure,Badge,currencyValue} from './core';
import type {Row} from './config';

export function SalaryPaymentChallan({runId,onClose}:{runId:string;onClose:()=>void}){
  const {can}=useApp(),q=useData(`payroll/${runId}/payment-challan`,true,false);
  const challan=q.data,currency=challan?.company?.currency??'INR',totals=challan?.totals;
  if(typeof document==='undefined')return null;
  return createPortal(<Modal title="Salary Payment Challan" onClose={onClose} wide>
    {q.isLoading?<Loading/>:q.error?<Failure error={q.error} retry={()=>q.refetch()}/>:challan&&<>
      <div className="modal-body printable salary-challan">
        <header className="salary-challan-heading"><div><span className="print-brand">TCW HR Software</span><h2>{challan.company.name}</h2><p>{challan.company.address}</p></div><div><Badge value="FINALIZED"/><h3>Salary Payment Challan</h3><strong>{new Date(challan.month+'-01T00:00:00').toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</strong></div></header>
        <div className="salary-challan-meta"><div><span>Challan number</span><strong>{challan.number}</strong></div><div><span>Generated</span><strong>{new Date(challan.generatedAt).toLocaleString('en-IN')}</strong></div><div><span>Company code</span><strong>{challan.company.code}</strong></div>{challan.company.accountLabel&&<div><span>Current payout account label</span><strong>{challan.company.accountLabel}</strong></div>}</div>
        <div className="salary-challan-totals">{[['Employees',totals.employees],['Gross salary',totals.gross],['Deductions',totals.deductions],['Net payable',totals.net]].map(([label,value])=><div key={String(label)}><span>{label}</span><strong>{label==='Employees'?value:currencyValue(Number(value),currency)}</strong></div>)}</div>
        <div className="salary-challan-payments">{[['Paid',totals.paid,totals.paidEmployees],['Pending / unverified',totals.pending,totals.pendingEmployees],['Failed / reversed',totals.failed,totals.failedEmployees]].map(([label,value,count])=><div key={String(label)}><span>{label} · {count} employee(s)</span><strong>{currencyValue(Number(value),currency)}</strong></div>)}</div>
        <Table columns={['employeeName','employeeCode','gross','deductions','net','paymentStatus','mode','reference','utr']} rows={challan.items.map((r:Row)=>({...r,id:r.employeeCode}))} cell={(r,k)=>['gross','deductions','net'].includes(k)?currencyValue(r[k],currency):k==='paymentStatus'?<Badge value={r[k]}/>:k==='utr'||k==='mode'?r[k]||'—':undefined}/>
        <p className="form-help">{challan.note}</p>{totals.zeroEmployees>0&&<p>{totals.zeroEmployees} employee(s) have no payment due.</p>}
        <div className="salary-challan-signatures"><span>Prepared by</span><span>Checked by</span><span>Authorized by</span></div>
      </div>
      <div className="modal-body no-print card-actions"><button className="btn secondary" disabled={q.isFetching} onClick={()=>q.refetch()}><RefreshCw size={16}/>Refresh status</button>{can('payroll','EXPORT')&&<><a className="btn primary" href={`/api/payroll/${runId}/payment-challan?format=pdf`}><FileDown size={16}/>Download challan PDF</a><button className="btn secondary" onClick={()=>window.print()}><Printer size={16}/>Print / Save PDF</button></>}</div>
    </>}
  </Modal>,document.body);
}
