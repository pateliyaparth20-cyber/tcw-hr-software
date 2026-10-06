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
