import test from 'node:test';
import assert from 'node:assert/strict';
import {payslipLines} from '../../packages/payslip';
const sum=(rows:{amount:number}[])=>rows.reduce((s,r)=>s+r.amount,0);
test('payslip separates earnings and employee deductions from employer contributions and snapshots',()=>{
 const result=payslipLines({gross:5000000,deductions:200000,components:[{type:'EARNING',name:'Basic',amount:3000000},{type:'EARNING',name:'HRA',amount:2000000},{type:'DEDUCTION',name:'PF',amount:180000},{type:'DEDUCTION',name:'PT',amount:20000},{type:'EMPLOYER',name:'Employer PF',amount:180000},{type:'TAX_SNAPSHOT',amount:5000000}]});
 assert.equal(sum(result.earnings),5000000);assert.equal(sum(result.deductions),200000);assert.equal(result.deductions.length,2);
});
test('manual net overrides and recoveries reconcile to stored totals without rewriting payroll',()=>{
 const item={gross:4500000,deductions:230000,components:[{type:'EARNING',name:'Basic',amount:5000000},{type:'DEDUCTION',name:'PF',amount:180000},{type:'DEDUCTION',name:'Loan recovery',amount:50000},{type:'MANUAL_NET_OVERRIDE',net:4270000}]};const copy=JSON.stringify(item),r=payslipLines(item);assert.equal(sum(r.earnings),4500000);assert.equal(sum(r.deductions),230000);assert.equal(r.earnings[1].amount,-500000);assert.equal(JSON.stringify(item),copy);
});
test('legacy and zero salary records retain honest saved totals',()=>{
 assert.deepEqual(payslipLines({gross:0,deductions:0,components:null}),{earnings:[],deductions:[]});const r=payslipLines({gross:100000,deductions:1000,components:[{name:'old entry',amount:NaN}]});assert.equal(sum(r.earnings),100000);assert.equal(sum(r.deductions),1000);
});
