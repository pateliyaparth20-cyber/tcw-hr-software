import test from 'node:test';
import assert from 'node:assert/strict';
import {attendanceLiveBreakUsage,attendanceLiveBreakState,attendanceBusinessMinutesFromSeconds,attendanceClock12,attendanceDurationSeconds,attendanceMinuteClock12} from '../../packages/ui/attendance-format';

test('attendance durations keep seconds',()=>{
  assert.equal(attendanceDurationSeconds(580),'00:09:40');
  assert.equal(attendanceDurationSeconds(62),'00:01:02');
});

test('attendance clocks stay 12-hour and include seconds',()=>{
  assert.equal(attendanceMinuteClock12(1130),'06:50:00 PM');
  assert.equal(attendanceMinuteClock12(60),'01:00:00 AM');
  assert.equal(attendanceClock12('2026-10-03T13:20:15.000Z','Asia/Kolkata').toUpperCase(),'06:50:15 PM');
});

test('attendance business calculations ignore sub-minute seconds',()=>{
  assert.equal(attendanceBusinessMinutesFromSeconds(10*60+29),10);
  assert.equal(attendanceBusinessMinutesFromSeconds(10*60+31),11);
  assert.equal(attendanceBusinessMinutesFromSeconds(59),1);
});

test('scheduled manual break starts at actual OUT and freezes the same total on IN',()=>{
 const now=Date.parse('2026-10-07T12:15:00Z'),row={breakMode:'PUNCH_SCHEDULED',currentBreakSince:'2026-10-07T12:10:00Z',breakWindowStartTime:'2026-10-07T12:00:00Z',breakEntitlementEnd:'2026-10-07T12:30:00Z',breakSeconds:300,allowedBreakSeconds:1500,completedOverBreakSeconds:45};
 assert.deepEqual(attendanceLiveBreakUsage(row,now),{breakSeconds:600,overBreakSeconds:45});assert.equal(attendanceLiveBreakState(row,now),'BREAK');
 assert.deepEqual(attendanceLiveBreakUsage(row,Date.parse('2026-10-07T12:30:01Z')),{breakSeconds:1500,overBreakSeconds:46});assert.equal(attendanceLiveBreakState(row,Date.parse('2026-10-07T12:30:01Z')),'OVER_BREAK');
 const saved={...row,currentBreakSince:null,breakEntitlementEnd:null,breakSeconds:600};assert.deepEqual(attendanceLiveBreakUsage(saved,now+60000),{breakSeconds:600,overBreakSeconds:45});
});
test('automatic scheduled OUT keeps elapsed policy break and excess starts at fixed end',()=>{
 const row={breakMode:'AUTO_SCHEDULED',currentBreakSince:'2026-10-07T12:10:00Z',breakEntitlementEnd:'2026-10-07T12:30:00Z',breakSeconds:600,allowedBreakSeconds:1800};
 assert.deepEqual(attendanceLiveBreakUsage(row,Date.parse('2026-10-07T12:15:00Z')),{breakSeconds:900,overBreakSeconds:0});
 assert.equal(attendanceLiveBreakState(row,Date.parse('2026-10-07T12:30:00Z')),'BREAK');assert.equal(attendanceLiveBreakState(row,Date.parse('2026-10-07T12:30:01Z')),'OVER_BREAK');
 assert.deepEqual(attendanceLiveBreakUsage(row,Date.parse('2026-10-07T12:30:01Z')),{breakSeconds:1800,overBreakSeconds:1});
});
