import test from 'node:test';
import assert from 'node:assert/strict';
import {overviewSnapshot} from '../../packages/ui/overview-data';
const people=Array.from({length:6},(_,i)=>({id:String(i+1)}));
test('overview uses scoped employee records and keeps half day distinct from insufficient time',()=>{
 const statuses=['PRESENT','HALF_DAY','INSUFFICIENT_HOURS','ABSENT','NOT_CLOCKED_IN','MISSING_PUNCH'];
 const attendance=statuses.map((status,i)=>({employeeId:String(i+1),date:'2026-10-06',status,...(i===0?{lateMinutes:5,exceptionCode:'LATE'}:{})}));
 const s=overviewSnapshot({employees:people,attendance:[...attendance,attendance[0],{employeeId:'outside',date:'2026-10-06',status:'PRESENT'},{employeeId:'1',date:'2026-10-05',status:'PRESENT'}]},'2026-10-06');
 assert.equal(s.present,1);assert.equal(s.halfDay,1);assert.equal(s.insufficient,1);assert.equal(s.absent,1);assert.equal(s.notChecked,1);assert.equal(s.other,1);assert.equal(s.attendanceRate,17);assert.equal(s.alerts,2);assert.equal(s.late,1);
});
test('today leave count is people rather than overlapping requests and pending requests remain actionable',()=>{
 const s=overviewSnapshot({employees:people,leave:[{id:'1',employeeId:'1',status:'APPROVED',startDate:'2026-10-05',endDate:'2026-10-07'},{id:'2',employeeId:'1',status:'APPROVED',startDate:'2026-10-06',endDate:'2026-10-06'},{id:'3',employeeId:'2',status:'APPROVED',startDate:'2026-10-07',endDate:'2026-10-08'},{id:'4',employeeId:'3',status:'PENDING'}]},'2026-10-06');
 assert.equal(s.onLeave,1);assert.equal(s.pending.length,1);
});
test('empty and no-punch workspaces retain honest zero and not-checked counts',()=>{
 const empty=overviewSnapshot({},'2026-10-06');assert.equal(empty.attendanceRate,0);assert.equal(empty.notChecked,0);assert.equal(empty.alerts,0);
 const s=overviewSnapshot({employees:people},'2026-10-06');assert.equal(s.present,0);assert.equal(s.notChecked,6);assert.equal(s.absent,0);
});
