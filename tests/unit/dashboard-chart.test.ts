import test from 'node:test';
import assert from 'node:assert/strict';
import {attendanceTrendData} from '../../packages/ui/dashboard-chart';

test('attendance chart follows company calendar across UTC midnight',()=>{
  const data=attendanceTrendData([{date:'2026-10-06T00:00:00.000Z',status:'PRESENT'}],'Asia/Kolkata',new Date('2026-10-05T20:00:00Z'));
  assert.equal(data.days[6],'2026-10-06');assert.equal(data.days[0],'2026-09-30');assert.equal(data.values[6],1);
  assert.equal(attendanceTrendData([],'America/Los_Angeles',new Date('2026-10-05T01:00:00Z')).days[6],'2026-10-04');
});

test('empty, small and larger attendance charts have distinct integer ticks',()=>{
  for(const count of [0,1,2,5,25]){
    const data=attendanceTrendData(Array.from({length:count},()=>({date:'2026-10-05',status:'PRESENT'})),'UTC',new Date('2026-10-05T12:00:00Z'));
    const ticks=[0,.25,.5,.75,1].map(v=>data.max*v);
    assert.equal(new Set(ticks).size,5);assert(ticks.every(Number.isInteger));assert(data.max>=count);
  }
});
