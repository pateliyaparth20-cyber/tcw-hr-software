import test from 'node:test';
import assert from 'node:assert/strict';
import {isScheduledWorkDay} from '../../packages/attendance-engine';

const d=(v:string)=>new Date(v+'T00:00:00.000Z');

test('supports common weekly work patterns',()=>{
  assert.equal(isScheduledWorkDay(d('2026-10-03'),{workWeekMode:'MON_FRI'}),false);
  assert.equal(isScheduledWorkDay(d('2026-10-03'),{workWeekMode:'MON_SAT'}),true);
  assert.equal(isScheduledWorkDay(d('2026-10-04'),{workWeekMode:'ALL_DAYS'}),true);
  assert.equal(isScheduledWorkDay(d('2026-10-04'),{workWeekMode:'CUSTOM_WEEKLY',workingDays:'0,1,2,3,4,5'}),true);
});

test('supports alternate Saturday rules',()=>{
  assert.equal(isScheduledWorkDay(d('2026-10-10'),{workWeekMode:'ALTERNATE_SATURDAY',alternateSaturdayMode:'SECOND_FOURTH_OFF'}),false);
  assert.equal(isScheduledWorkDay(d('2026-10-17'),{workWeekMode:'ALTERNATE_SATURDAY',alternateSaturdayMode:'SECOND_FOURTH_OFF'}),true);
  assert.equal(isScheduledWorkDay(d('2026-10-24'),{workWeekMode:'ALTERNATE_SATURDAY',alternateSaturdayMode:'SECOND_FOURTH_OFF'}),false);
});
