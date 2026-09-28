export interface Punch {time: Date; type: 'IN'|'OUT'}
export interface AttendanceRule {
  shiftStart: Date;
  shiftEnd?: Date;
  graceMinutes: number;
  earlyOutGraceMinutes?: number;
  fullDayMinutes: number;
  halfDayMinutes: number;
  overtimeAfterMinutes: number;
}
export function calculateAttendance(punches: Punch[], rule: AttendanceRule) {
  const sorted = [...punches].sort((a,b)=>a.time.getTime()-b.time.getTime());
  let open: Date | null = null, workMinutes = 0, anomaly = false;
  let firstIn: Date | null = null, lastOut: Date | null = null;
  for(const punch of sorted) {
    if(punch.type==='IN') { if(open) anomaly = true; else open = punch.time; firstIn ??= punch.time; }
    else if(open) {workMinutes += Math.max(0, Math.floor((punch.time.getTime()-open.getTime())/60000)); lastOut = punch.time; open = null;}
    else anomaly = true;
  }
  const lateMinutes = firstIn ? Math.max(0,Math.floor((firstIn.getTime()-rule.shiftStart.getTime())/60000)-rule.graceMinutes) : 0;
  const earlyOutMinutes = lastOut && rule.shiftEnd ? Math.max(0,Math.floor((rule.shiftEnd.getTime()-lastOut.getTime())/60000)-(rule.earlyOutGraceMinutes??0)) : 0;
  const status = open || anomaly ? 'MISSING_PUNCH' : workMinutes >= rule.fullDayMinutes ? 'PRESENT' : workMinutes >= rule.halfDayMinutes ? 'HALF_DAY' : 'ABSENT';
  return {firstIn,lastOut,workMinutes,lateMinutes,earlyOutMinutes,overtimeMinutes: Math.max(0,workMinutes-rule.overtimeAfterMinutes),status};
}
/** UTC bounds for one local calendar day, including DST. */
export function localDate(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);
  const get=(kind:string)=>parts.find(p=>p.type===kind)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function zonedMinute(date: string, minute: number, timezone: string) {
  const target = new Date(`${date}T00:00:00.000Z`).getTime() + minute*60000;
  let guess=target;
  for(let i=0;i<3;i++){
    const p=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));
    const get=(k:string)=>p.find(x=>x.type===k)!.value;
    const rendered=Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`);
    guess += target-rendered;
  }
  return new Date(guess);
}
export function workingDaySet(value:string|undefined|null){
  const days=new Set((value||'1,2,3,4,5').split(',').map(v=>Number(v.trim())).filter(v=>Number.isInteger(v)&&v>=0&&v<=6));
  return days.size?days:new Set([1,2,3,4,5]);
}
export function monthBounds(month:string){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Invalid month.');
  const first=new Date(`${month}-01T00:00:00.000Z`);
  const next=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,1));
  return {first,next};
}
export function attendancePayableUnits(status:string){
  if(['PRESENT','PAID_LEAVE'].includes(status))return 100;
  if(['HALF_DAY','HALF_DAY_LEAVE'].includes(status))return 50;
  return 0;
}
