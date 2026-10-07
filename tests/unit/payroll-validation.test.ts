import test from 'node:test';
import assert from 'node:assert/strict';
import {calculatePay} from '../../packages/payroll-engine';

test('payroll rejects non-finite percentages and invalid deduction caps',()=>{
  for(const percent of [NaN,Infinity,-Infinity,-1,101])assert.throws(()=>calculatePay(10000,[{name:'Tax',percent}]));
  for(const cap of [NaN,Infinity,-1,0.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>calculatePay(10000,[{name:'Tax',percent:10,cap}]));
  assert.equal(calculatePay(10000,[{name:'Tax',percent:10,cap:0}]).net,10000);
});

test('payroll rejects integer overflow and preserves signed adjustments',()=>{
  assert.throws(()=>calculatePay(Number.MAX_SAFE_INTEGER,[],1));
  assert.equal(calculatePay(10000,[],-100).net,9900);
  assert.equal(calculatePay(10000,[{name:'Tax',percent:12.5}]).net,8750);
});

test('salary rules use basic wage caps, fixed deductions and employer contributions without reducing net',()=>{
 const r=calculatePay(3000000,[{name:'Employee contribution',percent:12,basis:'BASIC',wageCap:1500000},{name:'Employer contribution',percent:12,basis:'BASIC',wageCap:1500000,kind:'EMPLOYER'},{name:'Configured fixed tax',percent:0,calculation:'FIXED',fixedAmount:20000}],0,1800000);
 assert.equal(r.deductions,200000);assert.equal(r.net,2800000);assert.equal(r.components.find(c=>c.name==='Employer contribution')?.amount,180000);
 assert.throws(()=>calculatePay(10000,[{name:'Invalid',percent:10,wageCap:-1}]));assert.throws(()=>calculatePay(10000,[{name:'Invalid',percent:10,fixedAmount:0.5}]));assert.throws(()=>calculatePay(10000,[],0,10001));
});
