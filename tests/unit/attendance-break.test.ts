import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateBreakUsageSeconds,calculateAttendance,isScheduledBreakOut} from '../../packages/attendance-engine';

test('only an OUT that starts inside the configured window is a scheduled break',()=>{
  const start=new Date('2026-10-03T07:30:00.000Z');
  const end=new Date('2026-10-03T08:00:00.000Z');
  assert.equal(isScheduledBreakOut(new Date('2026-10-03T07:29:59.000Z'),start,end),false);
  assert.equal(isScheduledBreakOut(new Date('2026-10-03T07:30:00.000Z'),start,end),true);
  assert.equal(isScheduledBreakOut(new Date('2026-10-03T07:59:59.000Z'),start,end),true);
  assert.equal(isScheduledBreakOut(new Date('2026-10-03T08:00:00.000Z'),start,end),false);
});

test('returning from a break does not leave an interim early-out value',()=>{
  const result=calculateAttendance([
    {time:new Date('2026-10-03T03:30:00.000Z'),type:'IN'},
    {time:new Date('2026-10-03T07:30:00.000Z'),type:'OUT'},
    {time:new Date('2026-10-03T08:00:00.000Z'),type:'IN'}
  ],{
    shiftStart:new Date('2026-10-03T03:30:00.000Z'),
    shiftEnd:new Date('2026-10-03T12:30:00.000Z'),
    graceMinutes:0,
    earlyOutGraceMinutes:0,
    fullDayMinutes:480,
    halfDayMinutes:240,
    overtimeAfterMinutes:480
  });
  assert.equal(result.status,'MISSING_PUNCH');
  assert.equal(result.earlyOutMinutes,0);
});

test('configured break is excluded from automatic total work and full-day status',()=>{
  const result=calculateAttendance([
    {time:new Date('2026-10-03T03:30:00.000Z'),type:'IN'},
    {time:new Date('2026-10-03T12:30:00.000Z'),type:'OUT'}
  ],{
    shiftStart:new Date('2026-10-03T03:30:00.000Z'),
    shiftEnd:new Date('2026-10-03T12:30:00.000Z'),
    breakStart:new Date('2026-10-03T07:30:00.000Z'),
    breakEnd:new Date('2026-10-03T08:30:00.000Z'),
    graceMinutes:0,
    earlyOutGraceMinutes:0,
    fullDayMinutes:480,
    halfDayMinutes:240,
    overtimeAfterMinutes:480
  });
  assert.equal(result.workMinutes,480);
  assert.equal(result.status,'PRESENT');
});

test('half-day threshold also uses work time after scheduled break is excluded',()=>{
  const result=calculateAttendance([
    {time:new Date('2026-10-03T03:30:00.000Z'),type:'IN'},
    {time:new Date('2026-10-03T08:30:00.000Z'),type:'OUT'}
  ],{
    shiftStart:new Date('2026-10-03T03:30:00.000Z'),
    shiftEnd:new Date('2026-10-03T12:30:00.000Z'),
    breakStart:new Date('2026-10-03T06:30:00.000Z'),
    breakEnd:new Date('2026-10-03T07:30:00.000Z'),
    graceMinutes:0,
    earlyOutGraceMinutes:0,
    fullDayMinutes:480,
    halfDayMinutes:240,
    overtimeAfterMinutes:480
  });
  assert.equal(result.workMinutes,240);
  assert.equal(result.status,'HALF_DAY');
});


test('break allowance is consumed before over-break begins',()=>{
  const first=allocateBreakUsageSeconds(9*60+29,0,10*60);
  assert.deepEqual(first,{breakSeconds:569,overBreakSeconds:0});
  const exact=allocateBreakUsageSeconds(10*60,0,10*60);
  assert.deepEqual(exact,{breakSeconds:600,overBreakSeconds:0});
  const over=allocateBreakUsageSeconds(10*60+13,0,10*60);
  assert.deepEqual(over,{breakSeconds:600,overBreakSeconds:13});
});

test('multiple scheduled breaks share one cumulative allowance',()=>{
  const first=allocateBreakUsageSeconds(4*60,0,10*60);
  const second=allocateBreakUsageSeconds(7*60,first.breakSeconds,10*60);
  assert.deepEqual(first,{breakSeconds:240,overBreakSeconds:0});
  assert.deepEqual(second,{breakSeconds:360,overBreakSeconds:60});
});
