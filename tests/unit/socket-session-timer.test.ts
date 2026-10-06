import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_NODE_TIMER_MS,sessionExpiryTimerDelay} from '../../packages/session-timer';

test('socket session timer caps long sessions within Node timer limits',()=>{
  const now=Date.UTC(2026,9,6);
  const twentyEightDays=now+28*24*60*60*1000;
  assert.equal(sessionExpiryTimerDelay(twentyEightDays,now),MAX_NODE_TIMER_MS);
});

test('socket session timer preserves normal delays and handles expiry',()=>{
  const now=Date.UTC(2026,9,6);
  assert.equal(sessionExpiryTimerDelay(now+60_000,now),60_000);
  assert.equal(sessionExpiryTimerDelay(new Date(now+5_000),now),5_000);
  assert.equal(sessionExpiryTimerDelay(new Date(now+10_000).toISOString(),now),10_000);
  assert.equal(sessionExpiryTimerDelay(now-1,now),0);
  assert.equal(sessionExpiryTimerDelay('not-a-date',now),0);
});
