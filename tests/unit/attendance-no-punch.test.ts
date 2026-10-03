import test from 'node:test';
import assert from 'node:assert/strict';
import {noPunchAttendanceStatus} from '../../packages/attendance-engine';

test('no-punch attendance stays pending until late grace expires',()=>{
  const start=new Date('2026-10-03T03:30:00.000Z');
  assert.equal(noPunchAttendanceStatus(new Date('2026-10-03T03:39:59.000Z'),start,10,240),'PENDING');
});

test('no-punch attendance becomes half day after late grace',()=>{
  const start=new Date('2026-10-03T03:30:00.000Z');
  assert.equal(noPunchAttendanceStatus(new Date('2026-10-03T03:40:00.000Z'),start,10,240),'HALF_DAY');
  assert.equal(noPunchAttendanceStatus(new Date('2026-10-03T07:29:59.000Z'),start,10,240),'HALF_DAY');
});

test('no-punch attendance becomes absent after half-day cutoff',()=>{
  const start=new Date('2026-10-03T03:30:00.000Z');
  assert.equal(noPunchAttendanceStatus(new Date('2026-10-03T07:30:00.000Z'),start,10,240),'ABSENT');
});
