import test from 'node:test';
import assert from 'node:assert/strict';
import {attendanceClock12,attendanceDurationSeconds,attendanceMinuteClock12} from '../../packages/ui/attendance-format';

test('attendance durations keep seconds',()=>{
  assert.equal(attendanceDurationSeconds(580),'00:09:40');
  assert.equal(attendanceDurationSeconds(62),'00:01:02');
});

test('attendance clocks stay 12-hour and include seconds',()=>{
  assert.equal(attendanceMinuteClock12(1130),'06:50:00 PM');
  assert.equal(attendanceMinuteClock12(60),'01:00:00 AM');
  assert.equal(attendanceClock12('2026-10-03T13:20:15.000Z','Asia/Kolkata').toUpperCase(),'06:50:15 PM');
});
