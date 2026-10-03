import test from 'node:test';
import assert from 'node:assert/strict';
import {shiftSchema} from '../../packages/validation';

const base={name:'General',startMinute:540,endMinute:1080,graceMinutes:10,earlyOutGraceMinutes:10,workWeekMode:'MON_FRI' as const,workingDays:'1,2,3,4,5',alternateSaturdayMode:'SECOND_FOURTH_OFF' as const,monthlyFlexibleOffDays:0,breakMinutes:60,breakStartMinute:780,breakEndMinute:840,fullDayMinutes:480,halfDayMinutes:240,overtimeAfterMinutes:480,timezone:'Asia/Kolkata'};

test('shift punch-driven break mode defaults OFF',()=>{
  const parsed=shiftSchema.parse(base);
  assert.equal(parsed.punchDrivenBreaks,false);
});

test('shift punch-driven break mode can be enabled per shift',()=>{
  const parsed=shiftSchema.parse({...base,punchDrivenBreaks:true});
  assert.equal(parsed.punchDrivenBreaks,true);
});

test('flexible break-anytime mode defaults OFF and can be enabled per shift',()=>{
  const defaulted=shiftSchema.parse({...base,punchDrivenBreaks:true});
  assert.equal(defaulted.flexibleBreakAnytime,false);
  const enabled=shiftSchema.parse({...base,punchDrivenBreaks:true,flexibleBreakAnytime:true});
  assert.equal(enabled.flexibleBreakAnytime,true);
});
