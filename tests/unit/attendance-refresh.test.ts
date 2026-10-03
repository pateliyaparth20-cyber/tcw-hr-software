import test from 'node:test';
import assert from 'node:assert/strict';
import {attendanceAutomationTenantStatus} from '../../apps/api/src/attendance-automation';

test('no-punch automation covers active and trial tenants',()=>{
  assert.equal(attendanceAutomationTenantStatus('ACTIVE'),true);
  assert.equal(attendanceAutomationTenantStatus('TRIAL'),true);
  assert.equal(attendanceAutomationTenantStatus('SUSPENDED'),false);
});
