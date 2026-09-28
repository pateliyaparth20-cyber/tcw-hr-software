export function toCsv(rows:Record<string,unknown>[], columns?:string[]) {
  const keys=columns??Object.keys(rows[0]??{});
  const cell=(v:unknown)=>{
    let str=v instanceof Date?v.toISOString():v===null||v===undefined?'':typeof v==='object'?JSON.stringify(v):String(v);
    if(/^[=+\-@\t\r]/.test(str)) str="'"+str;
    return '"'+str.replaceAll('"','""')+'"';
  };
  return '\uFEFF'+[keys.map(cell).join(','),...rows.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\r\n');
}
