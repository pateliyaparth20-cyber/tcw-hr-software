import test from 'node:test';
import assert from 'node:assert/strict';
import {employeeImportHeaders,employeeImportEnum,employeeImportDate,employeeImportAmount} from '../../apps/api/src/employee-import-values';
import {excelDate,spreadsheetRows} from '../../packages/validation/spreadsheet';
import {toXlsx} from '../../packages/reporting-engine';

test('employee headings and enum values accept case, spaces, underscores and hyphens',()=>{
  assert.deepEqual(employeeImportHeaders(['EMPLOYEE CODE','first_name','Last-Name','EMAIL','Phone','Joining Date','','']),['employeeCode','firstName','lastName','email','phone','joiningDate']);
  assert.throws(()=>employeeImportHeaders(['employeeCode','EMPLOYEE CODE']),/Duplicate/);
  assert.throws(()=>employeeImportHeaders(['Wrong']),/Unknown/);
  assert.equal(employeeImportEnum('full time',['FULL_TIME','PART_TIME']),'FULL_TIME');
  assert.equal(employeeImportEnum('part-time',['FULL_TIME','PART_TIME']),'PART_TIME');
  assert.equal(employeeImportEnum('aCtIvE',['ACTIVE','INACTIVE']),'ACTIVE');
  assert.equal(employeeImportDate('1/2/2024'),'2024-02-01');
  assert.equal(employeeImportDate('2024/2/1'),'2024-02-01');
  assert.equal(employeeImportAmount('1,00,000.50'),'100000.50');
  assert.equal(employeeImportAmount('1,000,000.50'),'1000000.50');
  assert.equal(employeeImportAmount('12,34.50'),'12,34.50','Malformed grouping must remain invalid');
});
test('Excel employee date cells use the workbook date system and preserve invalid values for preview errors',()=>{
  assert.equal(excelDate('45292'),'2024-01-01');assert.equal(excelDate('45292.5'),'2024-01-01');
  assert.equal(excelDate('1'),'1900-01-01');assert.equal(excelDate('59'),'1900-02-28');assert.equal(excelDate('61'),'1900-03-01');
  assert.throws(()=>excelDate('60'),/Invalid/);assert.equal(excelDate('0',true),'1904-01-01');assert.equal(excelDate('43830',true),'2024-01-01');
  const bytes=toXlsx([{'Joining Date':45292,employeeCode:'00001',phone:'09000000000'}]);
  assert.deepEqual(spreadsheetRows('Employees.XLSX',bytes,{dateColumns:['joiningDate']}),[['Joining Date','employeeCode','phone'],['2024-01-01','00001','09000000000']]);
  assert.equal(spreadsheetRows('bad.xlsx',toXlsx([{joiningDate:60}]),{dateColumns:['joiningDate']})[1][0],'60');
  assert.equal(spreadsheetRows('text-date.xlsx',toXlsx([{joiningDate:'2026'}]),{dateColumns:['joiningDate']})[1][0],'2026','Plain text years must not become Excel dates');
  assert.equal(spreadsheetRows('dates.csv',Buffer.from('joiningDate\n45292'),{dateColumns:['joiningDate']})[1][0],'45292','CSV numbers are not silently treated as Excel dates');
});
