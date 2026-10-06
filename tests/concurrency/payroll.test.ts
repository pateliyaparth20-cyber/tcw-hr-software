import test from 'node:test';
import {PrismaClient} from '@prisma/client';
import {payrollRegressions} from '../helpers/payroll-regressions';

test('payroll concurrency against isolated PostgreSQL',async t=>{
  const value=process.env.PAYROLL_TEST_DATABASE_URL;
  if(!value)throw new Error('PAYROLL_TEST_DATABASE_URL must point to an isolated local test database.');
  const url=new URL(value);
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.pathname!=='/tcw_payroll_test')throw new Error('Concurrency tests only allow a loopback tcw_payroll_test database.');
  const db=new PrismaClient({datasources:{db:{url:value}}});
  try{await payrollRegressions(db,t,true);}finally{await db.$disconnect();}
});
