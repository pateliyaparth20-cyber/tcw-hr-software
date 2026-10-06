export function attendanceTrendData(attendance:{date:string;status:string}[],timezone:string,now=new Date()){
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const end=Date.parse(today+'T00:00:00.000Z');
  const days=Array.from({length:7},(_,i)=>new Date(end-(6-i)*86400000).toISOString().slice(0,10));
  const counts=new Map<string,number>();
  for(const row of attendance)if(row.status==='PRESENT')counts.set(row.date.slice(0,10),(counts.get(row.date.slice(0,10))??0)+1);
  const values=days.map(day=>counts.get(day)??0);
  // Five distinct integer ticks, even for empty and small workforces.
  const max=Math.max(4,Math.ceil(Math.max(0,...values)/4)*4);
  return {days,values,max};
}
