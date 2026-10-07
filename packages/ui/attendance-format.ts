export function attendanceDurationSeconds(value:any){
  const total=Math.max(0,Math.floor(Number(value??0))),hours=Math.floor(total/3600),minutes=Math.floor(total%3600/60),seconds=total%60;
  return String(hours).padStart(2,'0')+':'+String(minutes).padStart(2,'0')+':'+String(seconds).padStart(2,'0');
}

export function attendanceClock12(value:any,timezone:string){
  if(!value)return '—';
  const date=new Date(value);if(Number.isNaN(date.getTime()))return '—';
  return new Intl.DateTimeFormat('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true,timeZone:timezone}).format(date);
}

export function attendanceMinuteClock12(value:any){
  if(value===null||value===undefined||value==='')return '—';
  const raw=Number(value);if(!Number.isFinite(raw))return '—';
  const minute=((Math.floor(raw)%1440)+1440)%1440,h24=Math.floor(minute/60),minutes=minute%60,hour=((h24+11)%12)+1,period=h24>=12?'PM':'AM';
  return String(hour).padStart(2,'0')+':'+String(minutes).padStart(2,'0')+':00 '+period;
}

export function attendanceBusinessMinutesFromSeconds(value:any){
  return Math.max(0,Math.round(Number(value??0)/60));
}

// Live break status uses elapsed seconds; payroll minute rounding is separate.
export function attendanceLiveBreakState(row:Record<string,any>,now:number){
  if(!row.currentBreakSince||row.workingNow)return null;
  if(row.breakMode==='PUNCH_SCHEDULED'&&row.breakEntitlementEnd){const excess=Math.max(0,Math.floor((now-new Date(row.breakEntitlementEnd).getTime())/1000));return excess>0?'OVER_BREAK':'BREAK';}
  const base=Math.max(0,Number(row.breakSeconds??Number(row.breakMinutes??0)*60)),allowed=Math.max(0,Number(row.allowedBreakSeconds??Number(row.allowedBreakMinutes??0)*60)),elapsed=Math.max(0,Math.floor((now-new Date(row.currentBreakSince).getTime())/1000));
  return base+elapsed>allowed?'OVER_BREAK':'BREAK';
}
