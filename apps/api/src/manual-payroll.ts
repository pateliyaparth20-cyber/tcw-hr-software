import {BadRequestException,ConflictException,NotFoundException} from '@nestjs/common';
import {z} from 'zod';
import type {Database} from '../../../packages/database';
import {MANUAL_SALARY,manualSalary,manualSalaryValues} from '../../../packages/payroll-engine/manual';
import {audit,requirePermission,tenant,type Context} from './context';
import {lockPayrollRun} from './payroll-lock';

const common={employeeId:z.string().uuid(),expectedUpdatedAt:z.string().datetime(),expectedNet:z.number().int().nonnegative()};
const inputSchema=z.union([
  z.object({...common,reset:z.literal(true)}).strict(),
  z.object({...common,net:z.number().int().min(0).max(1000000000),reason:z.string().trim().min(5).max(1000)}).strict()
]);

export async function updateManualSalary(db:Database,ctx:Context,runId:string,body:unknown){
  requirePermission(ctx,'payroll','MANAGE');
  const input=inputSchema.parse(body),tid=tenant(ctx);
  return db.$transaction(async tx=>{
    await lockPayrollRun(tx,tid,runId);
    const run=await tx.payrollRun.findFirst({where:{tenantId:tid,id:runId}});
    if(!run)throw new NotFoundException('Payroll run not found.');
    if(run.status!=='REVIEW')throw new ConflictException('Prepare payroll for review before editing salary. Finalized payroll must be reopened and prepared again.');
    if(await tx.payrollPayout.count({where:{tenantId:tid,runId}}))throw new ConflictException('Salary cannot change after payout has started.');
    const before=await tx.payrollItem.findFirst({where:{tenantId:tid,runId,employeeId:input.employeeId}});
    if(!before)throw new NotFoundException('Employee is not included in this payroll month.');
    if(before.updatedAt.toISOString()!==input.expectedUpdatedAt||before.net!==input.expectedNet)throw new ConflictException('This salary changed while you were editing. Refresh payroll and review the latest amount.');
    const existing=manualSalary(before.components),baseComponents=(Array.isArray(before.components)?before.components:[]).filter((c:any)=>c?.type!==MANUAL_SALARY);
    let values:{gross:number;deductions:number;net:number},components:any[];
    if('reset' in input){
      if(!existing)throw new BadRequestException('This employee already uses the calculated salary.');
      values={gross:existing.calculatedGross,deductions:before.deductions,net:existing.calculatedNet};components=baseComponents;
    }else{
      try{values=manualSalaryValues(input.net,before.deductions);}catch(e:any){throw new BadRequestException(e.message);}
      components=[...baseComponents,{type:MANUAL_SALARY,name:'Manual final salary',net:input.net,reason:input.reason,actorId:ctx.user.id,updatedAt:new Date().toISOString(),calculatedGross:existing?.calculatedGross??before.gross,calculatedNet:existing?.calculatedNet??before.net}];
    }
    const after=await tx.payrollItem.update({where:{id:before.id},data:{...values,components}});
    const totals=await tx.payrollItem.aggregate({where:{tenantId:tid,runId},_sum:{gross:true,deductions:true,net:true}});
    await tx.payrollRun.update({where:{id:runId},data:{totalGross:totals._sum.gross??0,totalDeductions:totals._sum.deductions??0,totalNet:totals._sum.net??0}});
    await audit(tx,ctx,'reset' in input?'PAYROLL_MANUAL_SALARY_REMOVED':'PAYROLL_MANUAL_SALARY_SET','payroll-item',before.id,before,after);
    return after;
  },{timeout:30000});
}
