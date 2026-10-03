import test from 'node:test';
import assert from 'node:assert/strict';
import {attendanceAutomationTenantStatus} from '../../apps/api/src/attendance-automation';

test('attendance automation runs for active and trial companies',()=>{
  assert.equal(attendanceAutomationTenantStatus('ACTIVE'),true);
  assert.equal(attendanceAutomationTenantStatus('TRIAL'),true);
});

test('attendance automation skips unavailable company statuses',()=>{
  assert.equal(attendanceAutomationTenantStatus('SUSPENDED'),false);
  assert.equal(attendanceAutomationTenantStatus('EXPIRED'),false);
  assert.equal(attendanceAutomationTenantStatus('ARCHIVED'),false);
});
