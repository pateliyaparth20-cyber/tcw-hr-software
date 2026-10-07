import test from 'node:test';
import assert from 'node:assert/strict';
import {challanPaymentStatus} from '../../apps/api/src/salary-challan';
import {toPdf} from '../../packages/reporting-engine';

test('challan never marks reversed, cancelled, unknown or mismatched transfers as paid',()=>{
  for(const status of ['reversed','cancelled','rejected','failed'])assert.equal(challanPaymentStatus(100,{status,amount:100}),'FAILED');
  for(const status of ['queued','pending','processing'])assert.equal(challanPaymentStatus(100,{status,amount:100}),'PENDING');
  assert.equal(challanPaymentStatus(100,{status:'processed',amount:99}),'UNVERIFIED');
  assert.equal(challanPaymentStatus(0),'NO_PAYMENT_DUE');
});

test('challan PDF wraps long employee and payment references across pages without dropping text',()=>{
  const reference='REFERENCE'+Array.from({length:90},(_,i)=>String(i).padStart(3,'0')).join('');
  const pdf=toPdf(Array.from({length:80},(_,i)=>({employee:`Employee ${i}`,reference})), 'Challan',{metadata:['Company and month'],summary:['Total 80 employees'],wrapCells:true}).toString();
  assert.ok(Number(pdf.match(/\/Count (\d+)/)?.[1])>1);
  const strings=Array.from(pdf.matchAll(/\((.*?)\) Tj/g),m=>m[1].trim()).join('');
  assert.ok(strings.includes(reference),'Long reference retained in full');
  assert.match(pdf,/Employee 79/);assert.match(pdf,/Total 80 employees/);
});
