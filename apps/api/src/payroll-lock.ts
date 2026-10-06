import {NotFoundException} from '@nestjs/common';
import type {Prisma} from '@prisma/client';

// Attendance and payroll share one period boundary, including when no run exists yet.
export async function lockPayrollPeriod(tx:Prisma.TransactionClient,tenantId:string,month:string){
  await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${tenantId+':payroll:'+month}))) AS advisory_lock`;
}

export async function lockPayrollRun(tx:Prisma.TransactionClient,tenantId:string,runId:string){
  const run=await tx.payrollRun.findFirst({where:{id:runId,tenantId},select:{month:true}});
  if(!run)throw new NotFoundException('Payroll run not found.');
  await lockPayrollPeriod(tx,tenantId,run.month);
  // Callers read the run again after obtaining the lock: another action may have deleted it.
}
export async function lockSalaryInputs(tx:any,tenantId:string){
  const key=tenantId+':salary-inputs';
  await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS advisory_lock`;
}
