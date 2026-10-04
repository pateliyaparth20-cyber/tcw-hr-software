import test from 'node:test';
import assert from 'node:assert/strict';
import {shiftSchema} from '../../packages/validation';

const base={name:'General',startMinute:540,endMinute:1080,graceMinutes:10,earlyOutGraceMinutes:10,workWeekMode:'MON_FRI' as const,workingDays:'1,2,3,4,5',alternateSaturdayMode:'SECOND_FOURTH_OFF' as const,monthlyFlexibleOffDays:0,breakMinutes:60,breakStartMinute:780,breakEndMinute:840,fullDayMinutes:480,halfDayMinutes:240,overtimeAfterMinutes:480,timezone:'Asia/Kolkata'};

test('automatic scheduled break is the default exclusive mode',()=>{
  const parsed=shiftSchema.parse(base);
  assert.equal(parsed.punchDrivenBreaks,false);
  assert.equal(parsed.flexibleBreakAnytime,false);
});

test('scheduled punch break uses punch timing without flexible-anytime',()=>{
  const parsed=shiftSchema.parse({...base,punchDrivenBreaks:true,flexibleBreakAnytime:false});
  assert.equal(parsed.punchDrivenBreaks,true);
  assert.equal(parsed.flexibleBreakAnytime,false);
});

test('flexible punch break is the third exclusive mode',()=>{
  const parsed=shiftSchema.parse({...base,punchDrivenBreaks:true,flexibleBreakAnytime:true});
  assert.equal(parsed.punchDrivenBreaks,true);
  assert.equal(parsed.flexibleBreakAnytime,true);
});

test('contradictory break flags are rejected instead of enabling modes together',()=>{
  assert.throws(()=>shiftSchema.parse({...base,punchDrivenBreaks:false,flexibleBreakAnytime:true}));
});
