import type {Row} from './config';
export function overviewSnapshot(data:Row,today:string){
 const people:Row[]=data.employees??[],ids=new Set(people.map(p=>p.id));
 const byEmployee=new Map<string,Row>();
 for(const row of data.attendance??[])if(String(row.date).slice(0,10)===today&&ids.has(row.employeeId))byEmployee.set(row.employeeId,row);
 const records=[...byEmployee.values()],count=(statuses:string[])=>records.filter(r=>statuses.includes(r.status)).length;
 const present=count(['PRESENT']),halfDay=count(['HALF_DAY']),insufficient=count(['INSUFFICIENT_HOURS','SHORT_HOURS']),absent=count(['ABSENT']),notChecked=people.length-records.length+count(['NOT_CLOCKED_IN','PENDING','VOID']);
 const other=Math.max(0,people.length-present-halfDay-insufficient-absent-notChecked);
 const pending:Row[]=(data.leave??[]).filter((r:Row)=>r.status==='PENDING');
 const onLeave=new Set((data.leave??[]).filter((r:Row)=>r.status==='APPROVED'&&String(r.startDate).slice(0,10)<=today&&String(r.endDate).slice(0,10)>=today).map((r:Row)=>r.employeeId)).size;
 const alerts=records.filter(r=>Number(r.lateMinutes)>0||r.exceptionCode||r.status==='MISSING_PUNCH').length;
 return {people,records,present,halfDay,insufficient,absent,notChecked,other,pending,onLeave,alerts,late:records.filter(r=>Number(r.lateMinutes)>0).length,attendanceRate:people.length?Math.round(present/people.length*100):0,overtimeMinutes:records.reduce((n,r)=>n+(Number(r.overtimeMinutes)||0),0)};
}
