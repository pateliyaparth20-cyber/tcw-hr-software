import test from 'node:test';
import {embeddedDatabase} from '../helpers/database';
import {payrollRegressions} from '../helpers/payroll-regressions';

test('payroll transitions and synthetic payout regressions',async t=>{
  const fixture=await embeddedDatabase();
  try{await payrollRegressions(fixture.db,t);}finally{await fixture.close();}
});
