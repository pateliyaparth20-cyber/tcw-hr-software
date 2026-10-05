import test from 'node:test';
import assert from 'node:assert/strict';
import {toCsv,toXlsx,toPdf} from '../../packages/reporting-engine';

const rows=[
  {employeeCode:'EMP001',employeeName:'Ravi Joshi',days:2,status:'APPROVED',note:'=SUM(A1:A2)'},
  {employeeCode:'EMP002',employeeName:'Pooja Khan',days:1,status:'PENDING',note:'Personal work'}
];

test('CSV export is real CSV with BOM and spreadsheet-injection protection',()=>{
  const csv=toCsv(rows);
  assert.equal(csv.charCodeAt(0),0xfeff);
  assert.match(csv,/employeeCode/);
  assert.match(csv,/Ravi Joshi/);
  assert.match(csv,/"'=SUM\(A1:A2\)"/);
});

test('Excel export is a native XLSX zip package, not renamed CSV',()=>{
  const xlsx=toXlsx(rows,'TCW HR Report');
  assert.equal(xlsx.subarray(0,4).toString('hex'),'504b0304');
  assert.ok(xlsx.includes(Buffer.from('[Content_Types].xml')));
  assert.ok(xlsx.includes(Buffer.from('xl/worksheets/sheet1.xml')));
  assert.ok(xlsx.includes(Buffer.from('Ravi Joshi')));
  assert.notEqual(xlsx.subarray(0,3).toString('utf8'),'EMP');
});

test('PDF export is a native PDF document with readable report content',()=>{
  const pdf=toPdf(rows,'TCW HR - Leave Report');
  const text=pdf.toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.match(text,/TCW HR - Leave Report/);
  assert.match(text,/Ravi Joshi/);
  assert.ok(text.endsWith('%%EOF'));
});

test('Excel sheet names are sanitized before XML escaping and length limits',()=>{
  const xlsx=toXlsx(rows,'123456789012345678901234567890&bad/name').toString('utf8');
  assert(xlsx.includes('name="123456789012345678901234567890&amp;"'));
  assert(toXlsx(rows,"'Team/[HR]:*?' ").toString('utf8').includes('name="Team  HR'));
});
