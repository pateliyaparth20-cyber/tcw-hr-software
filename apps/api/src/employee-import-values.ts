import {spreadsheetColumnKey} from '../../../packages/validation/spreadsheet';

export const employeeImportColumns=['employeeCode','firstName','lastName','email','phone','joiningDate','departmentCode','branchCode','shiftName','designation','employmentType','status','monthlySalary'];
export function employeeImportHeaders(values:string[]){
  const headings=values.map(v=>v.trim());while(headings.length&&!headings.at(-1))headings.pop();
  const header=headings.map(v=>employeeImportColumns.find(k=>spreadsheetColumnKey(k)===spreadsheetColumnKey(v))??v);
  if(new Set(header).size!==header.length)throw new Error('Duplicate column headings. Keep one column for each employee field.');
  const unknown=header.filter(k=>!employeeImportColumns.includes(k));
  if(unknown.length)throw new Error(`Unknown column heading: ${unknown.join(', ')}. Use the Excel or CSV template headings; capital and small letters are both accepted.`);
  for(const key of employeeImportColumns.slice(0,6))if(!header.includes(key))throw new Error(`Missing required column: ${key}.`);
  return header;
}
export function employeeImportEnum(value:string,options:string[]){
  return options.find(option=>spreadsheetColumnKey(option)===spreadsheetColumnKey(value))??value.toUpperCase();
}
export function employeeImportDate(value:string){
  const dmy=/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  if(dmy)return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
  const ymd=/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(value);
  return ymd?`${ymd[1]}-${ymd[2].padStart(2,'0')}-${ymd[3].padStart(2,'0')}`:value;
}
export function employeeImportAmount(value:string){
  if(/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(value)||/^\d{1,3}(?:,\d{2})*,\d{3}(?:\.\d{1,2})?$/.test(value))return value.replaceAll(',','');
  return value;
}
