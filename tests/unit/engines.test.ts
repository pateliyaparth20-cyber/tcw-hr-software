import test from 'node:test';
import assert from 'node:assert/strict';
import {attendancePayableUnits,calculateAttendance,workingDaySet,zonedMinute,localDate} from '../../packages/attendance-engine';
import {calculatePay,assertPayrollTransition} from '../../packages/payroll-engine';
import {hashPassword,verifyPassword} from '../../packages/auth';
import {toCsv} from '../../packages/reporting-engine';
import {ZktecoAdapter} from '../../packages/device-connectors/zkteco';
import {normalizeZkAttLog,parseZkAttLog,biomaxLocalTimestamp} from '../../packages/device-connectors/biomax';
const t=(s:string)=>new Date('2026-09-21T'+s+':00Z');
const rule={shiftStart:t('09:00'),graceMinutes:10,fullDayMinutes:480,halfDayMinutes:240,overtimeAfterMinutes:480};
test('attendance subtracts recorded breaks and ignores arrival order',()=>{
 const result=calculateAttendance([{time:t('18:00'),type:'OUT'},{time:t('09:00'),type:'IN'},{time:t('12:00'),type:'OUT'},{time:t('13:00'),type:'IN'}],rule);
 assert.equal(result.workMinutes,480);assert.equal(result.status,'PRESENT');assert.equal(result.overtimeMinutes,0);
});
test('unpaired and duplicate punches require review',()=>{assert.equal(calculateAttendance([{time:t('09:00'),type:'IN'}],rule).status,'MISSING_PUNCH');assert.equal(calculateAttendance([{time:t('09:00'),type:'IN'},{time:t('09:01'),type:'IN'},{time:t('18:00'),type:'OUT'}],rule).status,'MISSING_PUNCH')});
test('half days, grace, and overtime are calculated from input rules',()=>{const r=calculateAttendance([{time:t('09:20'),type:'IN'},{time:t('14:00'),type:'OUT'}],rule);assert.equal(r.status,'HALF_DAY');assert.equal(r.lateMinutes,10);const extra=calculateAttendance([{time:t('09:00'),type:'IN'},{time:t('19:00'),type:'OUT'}],rule);assert.equal(extra.overtimeMinutes,120)});
test('timezone conversion handles Kolkata and daylight saving',()=>{assert.equal(zonedMinute('2026-09-21',540,'Asia/Kolkata').toISOString(),'2026-09-21T03:30:00.000Z');assert.equal(zonedMinute('2026-07-01',540,'America/New_York').toISOString(),'2026-07-01T13:00:00.000Z');assert.equal(localDate(new Date('2026-09-21T21:00:00Z'),'Asia/Kolkata'),'2026-09-22')});
test('early out, working weekdays, and payable attendance units are deterministic',()=>{
 const r=calculateAttendance([{time:t('09:00'),type:'IN'},{time:t('17:30'),type:'OUT'}],{...rule,shiftEnd:t('18:00'),earlyOutGraceMinutes:10});
 assert.equal(r.earlyOutMinutes,20);
 const days=workingDaySet('1,2,3,4,5,6');assert(days.has(6));assert(!days.has(0));
 assert.equal(attendancePayableUnits('PRESENT'),100);assert.equal(attendancePayableUnits('HALF_DAY'),50);assert.equal(attendancePayableUnits('ABSENT'),0);
});

test('payroll uses integer minor units, configured caps, and adjustments',()=>{assert.deepEqual(calculatePay(100000,[{name:'Configured',percent:12,cap:10000}],5000),{gross:105000,deductions:10000,net:95000,components:[{name:'Configured',amount:10000},{name:'Adjustment',amount:5000}]});assert.throws(()=>calculatePay(100,[{name:'A',percent:80},{name:'B',percent:80}]))});
test('payroll v2 moves review directly to final and keeps locked payroll immutable',()=>{assert.throws(()=>assertPayrollTransition('LOCKED','DRAFT'));assert.throws(()=>assertPayrollTransition('DRAFT','LOCKED'));assert.doesNotThrow(()=>assertPayrollTransition('REVIEW','LOCKED'))});
test('password hashes have unique salts and reject incorrect passwords',async()=>{const a=await hashPassword('test-only-long-password'),b=await hashPassword('test-only-long-password');assert.notEqual(a,b);assert(await verifyPassword('test-only-long-password',a));assert(!await verifyPassword('incorrect',a))});
test('CSV quotes multiline cells and neutralizes spreadsheet formulas',()=>{const csv=toCsv([{name:'=HYPERLINK("bad")',notes:'line1\nline2'}]);assert(csv.includes("\"'=HYPERLINK(\"\"bad\"\")\""));assert(csv.includes('"line1\nline2"'))});
test('unconfigured device adapters never claim hardware success',async()=>{await assert.rejects(()=>new ZktecoAdapter().testConnection(),/requires a vendor SDK/)});
test('BioMax ZK PUSH parser normalizes ATTLOG punches and keeps stable event ids',()=>{
 const body='101\t2026-09-26 09:05:00\t0\t15\t0\t0\n101\t2026-09-26 18:01:00\t1\t15\t0\t0\n';
 assert.equal(parseZkAttLog(body).length,2);
 const events=normalizeZkAttLog('SN-DEMO',body,'Asia/Kolkata');
 assert.equal(events[0].userId,'101');assert.equal(events[0].type,'IN');assert.equal(events[0].verification,'FACE');
 assert.equal(events[0].timestamp,'2026-09-26T03:35:00.000Z');assert.equal(events[1].type,'OUT');
 assert.equal(normalizeZkAttLog('SN-DEMO',body,'Asia/Kolkata')[0].eventId,events[0].eventId);
});
test('BioMax wall clock conversion respects configured timezone',()=>{assert.equal(biomaxLocalTimestamp('2026-07-01 09:00:00','America/New_York').toISOString(),'2026-07-01T13:00:00.000Z')});
