import test from 'node:test';
import assert from 'node:assert/strict';
import {attendancePayableUnits,attendanceWorkdayDate,calculateAttendance,workingDaySet,zonedMinute,localDate} from '../../packages/attendance-engine';
import {calculatePay,assertPayrollTransition} from '../../packages/payroll-engine';
import {hashPassword,verifyPassword} from '../../packages/auth';
import {toCsv,toXlsx} from '../../packages/reporting-engine';
import {ZktecoAdapter} from '../../packages/device-connectors/zkteco';
import {normalizeZkAttLog,parseZkAttLog,biomaxLocalTimestamp} from '../../packages/device-connectors/biomax';
import {shiftSchema} from '../../packages/validation';
const t=(s:string)=>new Date('2026-09-21T'+s+':00Z');
const rule={shiftStart:t('09:00'),graceMinutes:10,fullDayMinutes:480,halfDayMinutes:240,overtimeAfterMinutes:480};
test('shift validation accepts minute-level half full and overtime durations',()=>{const parsed=shiftSchema.parse({name:'Short Shift',startMinute:0,endMinute:90,graceMinutes:0,earlyOutGraceMinutes:0,workingDays:'1,2,3,4,5',breakMinutes:5,breakStartMinute:75,breakEndMinute:80,fullDayMinutes:25,halfDayMinutes:15,overtimeAfterMinutes:25,timezone:'Asia/Kolkata'});assert.equal(parsed.fullDayMinutes,25);assert.equal(parsed.halfDayMinutes,15);assert.equal(parsed.overtimeAfterMinutes,25)});
test('attendance subtracts recorded breaks and ignores arrival order',()=>{
 const result=calculateAttendance([{time:t('18:00'),type:'OUT'},{time:t('09:00'),type:'IN'},{time:t('12:00'),type:'OUT'},{time:t('13:00'),type:'IN'}],rule);
 assert.equal(result.workMinutes,480);assert.equal(result.status,'PRESENT');assert.equal(result.overtimeMinutes,0);
});
test('unpaired punches require review but duplicate taps do not poison a valid pair',()=>{assert.equal(calculateAttendance([{time:t('09:00'),type:'IN'}],rule).status,'MISSING_PUNCH');assert.equal(calculateAttendance([{time:t('09:00'),type:'IN'},{time:t('09:01'),type:'IN'},{time:t('18:00'),type:'OUT'}],rule).status,'PRESENT');assert.equal(calculateAttendance([{time:t('09:00'),type:'IN'},{time:t('18:00'),type:'OUT'},{time:t('18:01'),type:'OUT'}],rule).status,'PRESENT')});
test('multiple IN OUT sessions sum work and close cleanly',()=>{const r=calculateAttendance([{time:t('09:00'),type:'IN'},{time:t('11:00'),type:'OUT'},{time:t('11:30'),type:'IN'},{time:t('14:00'),type:'OUT'},{time:t('15:00'),type:'IN'},{time:t('18:00'),type:'OUT'}],rule);assert.equal(r.workMinutes,450);assert.equal(r.status,'HALF_DAY');assert.equal(r.firstIn?.toISOString(),t('09:00').toISOString());assert.equal(r.lastOut?.toISOString(),t('18:00').toISOString())});
test('attendance keeps cross-session seconds until the final minute rounding',()=>{const secondRule={...rule,fullDayMinutes:10,halfDayMinutes:1,overtimeAfterMinutes:10};const r=calculateAttendance([{time:new Date('2026-09-21T09:00:00Z'),type:'IN'},{time:new Date('2026-09-21T09:00:40Z'),type:'OUT'},{time:new Date('2026-09-21T09:01:00Z'),type:'IN'},{time:new Date('2026-09-21T09:01:40Z'),type:'OUT'}],secondRule);assert.equal(r.workMinutes,1);assert.equal(r.status,'HALF_DAY')});
test('half days, grace, and overtime are calculated from input rules',()=>{const r=calculateAttendance([{time:t('09:20'),type:'IN'},{time:t('14:00'),type:'OUT'}],rule);assert.equal(r.status,'HALF_DAY');assert.equal(r.lateMinutes,10);const extra=calculateAttendance([{time:t('09:00'),type:'IN'},{time:t('19:00'),type:'OUT'}],rule);assert.equal(extra.overtimeMinutes,120)});
test('chargeable late time must be made up before shift-end work becomes overtime',()=>{const shiftRule={shiftStart:t('09:00'),shiftEnd:t('17:00'),graceMinutes:10,earlyOutGraceMinutes:10,fullDayMinutes:480,halfDayMinutes:240,overtimeAfterMinutes:480};const madeUp=calculateAttendance([{time:t('09:20'),type:'IN'},{time:t('17:10'),type:'OUT'}],shiftRule);assert.equal(madeUp.lateMinutes,10);assert.equal(madeUp.overtimeMinutes,0);const extra=calculateAttendance([{time:t('09:20'),type:'IN'},{time:t('17:20'),type:'OUT'}],shiftRule);assert.equal(extra.lateMinutes,10);assert.equal(extra.overtimeMinutes,10);const withinGrace=calculateAttendance([{time:t('09:05'),type:'IN'},{time:t('17:05'),type:'OUT'}],shiftRule);assert.equal(withinGrace.lateMinutes,0);assert.equal(withinGrace.overtimeMinutes,5)});
test('full day requires full working threshold and short work is not promoted',()=>{assert.equal(calculateAttendance([{time:t('09:00'),type:'IN'},{time:t('12:00'),type:'OUT'}],rule).status,'ABSENT');assert.equal(calculateAttendance([{time:t('09:00'),type:'IN'},{time:t('13:00'),type:'OUT'}],rule).status,'HALF_DAY');assert.equal(calculateAttendance([{time:t('09:00'),type:'IN'},{time:t('16:59'),type:'OUT'}],rule).status,'HALF_DAY');assert.equal(calculateAttendance([{time:t('09:00'),type:'IN'},{time:t('17:00'),type:'OUT'}],rule).status,'PRESENT')});
test('work after configured shift end is overtime even below duration threshold when there is no late debt',()=>{const shiftRule={shiftStart:t('09:00'),shiftEnd:t('17:00'),graceMinutes:0,earlyOutGraceMinutes:0,fullDayMinutes:480,halfDayMinutes:240,overtimeAfterMinutes:600};const r=calculateAttendance([{time:t('09:00'),type:'IN'},{time:t('18:00'),type:'OUT'}],shiftRule);assert.equal(r.workMinutes,540);assert.equal(r.overtimeMinutes,60)});
test('night shift stays open across midnight until an actual OUT punch',()=>{const nightRule={shiftStart:new Date('2026-09-21T22:00:00Z'),shiftEnd:new Date('2026-09-22T06:00:00Z'),graceMinutes:10,earlyOutGraceMinutes:10,fullDayMinutes:480,halfDayMinutes:240,overtimeAfterMinutes:480};const open=calculateAttendance([{time:new Date('2026-09-21T22:00:00Z'),type:'IN'}],nightRule);assert.equal(open.status,'MISSING_PUNCH');assert.equal(open.lastOut,null);const closed=calculateAttendance([{time:new Date('2026-09-21T22:00:00Z'),type:'IN'},{time:new Date('2026-09-22T06:30:00Z'),type:'OUT'}],nightRule);assert.equal(closed.workMinutes,510);assert.equal(closed.status,'PRESENT');assert.equal(closed.overtimeMinutes,30)});
test('night shift overtime stays on the original shift-cycle day',()=>{assert.equal(attendanceWorkdayDate(new Date('2026-09-22T01:30:00Z'),1320,360,'UTC'),'2026-09-21');assert.equal(attendanceWorkdayDate(new Date('2026-09-22T07:00:00Z'),1320,360,'UTC'),'2026-09-21');assert.equal(attendanceWorkdayDate(new Date('2026-09-22T20:00:00Z'),1320,360,'UTC'),'2026-09-22')});
test('one-second short attendance does not drop to a lower day status',()=>{
 const fullRule={shiftStart:t('09:00'),shiftEnd:t('17:00'),graceMinutes:0,earlyOutGraceMinutes:0,fullDayMinutes:480,halfDayMinutes:240,overtimeAfterMinutes:480};
 const full=calculateAttendance([{time:new Date('2026-09-21T09:00:00.000Z'),type:'IN'},{time:new Date('2026-09-21T16:59:59.000Z'),type:'OUT'}],fullRule);
 assert.equal(full.workMinutes,479);assert.equal(full.status,'PRESENT');
 const half=calculateAttendance([{time:new Date('2026-09-21T09:00:00.000Z'),type:'IN'},{time:new Date('2026-09-21T12:59:59.000Z'),type:'OUT'}],fullRule);
 assert.equal(half.workMinutes,239);assert.equal(half.status,'HALF_DAY');
 const twoSecondsShort=calculateAttendance([{time:new Date('2026-09-21T09:00:00.000Z'),type:'IN'},{time:new Date('2026-09-21T16:59:58.000Z'),type:'OUT'}],fullRule);
 assert.equal(twoSecondsShort.status,'HALF_DAY');
});
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

test('XLSX export is a real Office Open XML zip workbook',()=>{
 const file=toXlsx([{employee:'A01',name:'Test Employee'}]);
 assert.equal(file.subarray(0,2).toString(),'PK');
 assert.ok(file.includes(Buffer.from('[Content_Types].xml')));
 assert.ok(file.includes(Buffer.from('xl/worksheets/sheet1.xml')));
});
test('BioMax wall clock conversion respects configured timezone',()=>{assert.equal(biomaxLocalTimestamp('2026-07-01 09:00:00','America/New_York').toISOString(),'2026-07-01T13:00:00.000Z')});
