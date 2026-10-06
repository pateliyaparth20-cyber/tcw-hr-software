import test from 'node:test';
import assert from 'node:assert/strict';
import {liveRefreshInterval,shouldRefreshForServerChange} from '../../packages/ui/live-refresh';

test('live refresh intervals prioritize operational data without background hammering',()=>{
  assert.equal(liveRefreshInterval('dashboard'),10_000);
  assert.equal(liveRefreshInterval('attendance?from=2026-10-01'),10_000);
  assert.equal(liveRefreshInterval('workforce'),10_000);
  assert.equal(liveRefreshInterval('leave?page=1'),10_000);
  assert.equal(liveRefreshInterval('employees?page=1'),30_000);
  assert.equal(liveRefreshInterval('payroll'),30_000);
  assert.equal(liveRefreshInterval('documents?page=1'),60_000);
  assert.equal(liveRefreshInterval('ai/status'),false);
  assert.equal(liveRefreshInterval('branding'),false);
  assert.equal(liveRefreshInterval('attendance/export?format=xlsx'),false);
});

test('attendance server changes refresh live attendance surfaces',()=>{
  for(const path of ['attendance','workforce','dashboard','devices'])assert.equal(shouldRefreshForServerChange(path,'attendance'),true,path);
  for(const path of ['payroll','leave','employees'])assert.equal(shouldRefreshForServerChange(path,'attendance'),false,path);
});

test('leave server changes refresh dependent attendance and payroll surfaces',()=>{
  for(const path of ['leave','attendance','workforce','dashboard','payroll'])assert.equal(shouldRefreshForServerChange(path,'leave'),true,path);
  for(const path of ['devices','employees'])assert.equal(shouldRefreshForServerChange(path,'leave'),false,path);
});

test('unknown server changes still refresh their own resource and dashboard',()=>{
  assert.equal(shouldRefreshForServerChange('documents?page=1','documents'),true);
  assert.equal(shouldRefreshForServerChange('dashboard','documents'),true);
  assert.equal(shouldRefreshForServerChange('attendance','documents'),false);
});

test('unscoped server changes refresh active queries safely',()=>{
  assert.equal(shouldRefreshForServerChange('dashboard'),true);
  assert.equal(shouldRefreshForServerChange('employees?page=1'),true);
  assert.equal(shouldRefreshForServerChange(''),false);
});
