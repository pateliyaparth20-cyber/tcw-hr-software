import test from 'node:test';
import assert from 'node:assert/strict';
import {noPunchAttendanceStatus} from '../../packages/attendance-engine';

const start=new Date('2026-10-03T03:30:00.000Z');
const end=new Date('2026-10-03T12:30:00.000Z');

test('no-punch attendance stays pending until late grace expires',()=>{
  assert.equal(noPunchAttendanceStatus(new Date('2026-10-03T03:39:59.000Z'),start,end,10),'PENDING');
});

test('no-punch attendance is not clocked in after grace until assigned shift end',()=>{
  assert.equal(noPunchAttendanceStatus(new Date('2026-10-03T03:40:00.000Z'),start,end,10),'NOT_CLOCKED_IN');
  assert.equal(noPunchAttendanceStatus(new Date('2026-10-03T12:29:59.000Z'),start,end,10),'NOT_CLOCKED_IN');
});

test('no-punch attendance becomes absent at assigned shift end',()=>{
  assert.equal(noPunchAttendanceStatus(new Date('2026-10-03T12:30:00.000Z'),start,end,10),'ABSENT');
});
