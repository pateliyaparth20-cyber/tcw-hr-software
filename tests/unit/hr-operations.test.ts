import test from 'node:test';
import assert from 'node:assert/strict';
import {base32,decode32,totp,totpCounter} from '../../packages/auth/totp';
import {parseCsv,spreadsheetRows} from '../../packages/validation/spreadsheet';
import {toXlsx} from '../../packages/reporting-engine';
test('TOTP matches all RFC 6238 SHA1 test vectors',()=>{
  const secret=base32(Buffer.from('12345678901234567890'));
  for(const [seconds,code] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']] as const)assert.equal(totp(secret,seconds*1000,8),code);
  assert.deepEqual(decode32(secret),Buffer.from('12345678901234567890'));
});
test('authenticator accepts only bounded clock drift and numeric six digit codes',()=>{
  const secret=base32(Buffer.alloc(20,5)),time=1700000000000;
  assert.equal(totpCounter(secret,totp(secret,time),time),Math.floor(time/30000));
  assert.equal(totpCounter(secret,totp(secret,time+30000),time),Math.floor(time/30000)+1);
  assert.equal(totpCounter(secret,totp(secret,time+90000),time),null);
  assert.equal(totpCounter(secret,'0000000',time),null);
});
test('CSV supports quoted commas, multiline cells and escaped quotes',()=>{
  assert.deepEqual(parseCsv('\uFEFFname,note\r\n"A, B","line 1\nline ""2"""'),[['name','note'],['A, B','line 1\nline "2"']]);
  assert.throws(()=>parseCsv('name\n"unfinished'),/not closed/);
  assert.throws(()=>parseCsv('name\n"cell"bad'),/unexpected/);
});
test('employee Excel template round-trips without interpreting formulas or losing leading zero text',()=>{
  const bytes=toXlsx([{employeeCode:'00001',joiningDate:'2026-01-01',phone:'09000000000',name:'A & <B>',salary:'25000.50'}]);
  assert.deepEqual(spreadsheetRows('employees.xlsx',bytes),[['employeeCode','joiningDate','phone','name','salary'],['00001','2026-01-01','09000000000','A & <B>','25000.50']]);
});
test('import reader refuses unsupported formats, truncated archives and oversized imports',()=>{
  assert.throws(()=>spreadsheetRows('employees.xls',Buffer.from('fake')),/CSV or XLSX/);
  assert.throws(()=>spreadsheetRows('employees.xlsx',Buffer.from('fake')),/Invalid Excel/);
  assert.throws(()=>spreadsheetRows('employees.csv',Buffer.alloc(2_000_001)),/2 MB/);
  assert.throws(()=>spreadsheetRows('employees.csv',Buffer.from('name\n'+'row\n'.repeat(201))),/200 rows/);
});
