import {BadRequestException,ConflictException,ForbiddenException,NotFoundException} from '@nestjs/common';
import {z} from 'zod';
import type {Database} from '../../../packages/database';
import {id} from '../../../packages/validation';
import {restrictedRoles} from '../../../packages/permissions';
import {localDate} from '../../../packages/attendance-engine';
import {audit,assertEmployee,Context,requirePermission,tenant} from './context';
import {lockPayrollPeriod,lockSalaryInputs} from './payroll-lock';

const money=z.number().int().min(0).max(1e9);
const month=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const reason=z.string().trim().min(5).max(1000);
export const shiftMonth=(value:string,offset:number)=>new Date(Date.UTC(Number(value.slice(0,4)),Number(value.slice(5,7))-1+offset,1)).toISOString().slice(0,7);
function manage(ctx:Context){requirePermission(ctx,'payroll','MANAGE');if(restrictedRoles.has(ctx.user.role.code))throw new ForbiddenException('Payroll is managed by HR and payroll administrators.');}
async function editableMonth(tx:any,tid:string,value:string){
  await lockPayrollPeriod(tx,tid,value);
  const run=await tx.payrollRun.findUnique({where:{tenantId_month:{tenantId:tid,month:value}}});
  if(run&&run.status!=='DRAFT')throw new ConflictException(`Payroll for ${value} is already prepared. Reopen it before changing its salary inputs.`);
}

export async function recordProfileSalaryChange(tx:any,ctx:Context,before:any,after:any){
  if(!before||before.monthlySalary===after.monthlySalary)return;
  manage(ctx);const tid=tenant(ctx),company=await tx.tenant.findUniqueOrThrow({where:{id:tid}}),month=localDate(new Date(),company.timezone).slice(0,7),joiningMonth=before.joiningDate.toISOString().slice(0,7);
  await editableMonth(tx,tid,month);
  if(!await tx.salaryVersion.count({where:{tenantId:tid,employeeId:before.id}})&&joiningMonth<month)await tx.salaryVersion.create({data:{tenantId:tid,employeeId:before.id,effectiveMonth:joiningMonth,basic:before.monthlySalary,reason:'Opening salary before profile revision',actorId:ctx.user.id}});
  const version=await tx.salaryVersion.create({data:{tenantId:tid,employeeId:before.id,effectiveMonth:month,basic:after.monthlySalary,reason:'Monthly salary changed in employee profile',actorId:ctx.user.id}});
  await audit(tx,ctx,'SALARY_REVISION_CREATED','payroll',version.id,undefined,version);
}

export class SalaryOperations {
  constructor(private db:Database){}
  async versions(ctx:Context,employeeId:string,method:string,body?:unknown){
    const tid=tenant(ctx);id.parse(employeeId);requirePermission(ctx,'payroll','VIEW');await assertEmployee(this.db,ctx,employeeId);
    if(method==='GET')return {employee:await this.db.employee.findFirst({where:{tenantId:tid,id:employeeId},select:{id:true,employeeCode:true,firstName:true,lastName:true,monthlySalary:true,updatedAt:true}}),items:await this.db.salaryVersion.findMany({where:{tenantId:tid,employeeId},orderBy:[{effectiveMonth:'desc'},{createdAt:'desc'},{id:'desc'}]})};
    if(method!=='POST')throw new BadRequestException('Use a new effective month to record a salary revision.');
    manage(ctx);
    const input=z.object({effectiveMonth:month,basic:money,hra:money,allowances:money,overtimeHourly:money,reason,expectedUpdatedAt:z.iso.datetime()}).strict().parse(body);
    const total=input.basic+input.hra+input.allowances;if(total>1e9)throw new BadRequestException('Monthly salary exceeds the supported amount.');
    return this.db.$transaction(async tx=>{
      await lockSalaryInputs(tx,tid);
      const employee=await tx.employee.findFirst({where:{tenantId:tid,id:employeeId,deletedAt:null}});if(!employee)throw new NotFoundException('Employee not found.');
      if(employee.updatedAt.toISOString()!==input.expectedUpdatedAt)throw new ConflictException('Employee changed. Refresh before saving the salary.');
      const joiningMonth=employee.joiningDate.toISOString().slice(0,7);if(input.effectiveMonth<joiningMonth)throw new BadRequestException('Salary cannot start before joining.');
      const prepared=await tx.payrollRun.findMany({where:{tenantId:tid,month:{gte:input.effectiveMonth},status:{not:'DRAFT'}},orderBy:{month:'asc'},select:{month:true}});
      // Acquire every affected period and re-read after acquiring the lock.
      const periods=[...new Set([input.effectiveMonth,...prepared.map(r=>r.month)])].sort();
      for(const value of periods)await editableMonth(tx,tid,value);
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${employeeId}::uuid AND tenant_id = ${tid}::uuid FOR UPDATE`;
      const count=await tx.salaryVersion.count({where:{tenantId:tid,employeeId}});
      if(!count&&joiningMonth<input.effectiveMonth)await tx.salaryVersion.create({data:{tenantId:tid,employeeId,effectiveMonth:joiningMonth,basic:employee.monthlySalary,reason:'Opening salary before first structure revision',actorId:ctx.user.id}});
      const {expectedUpdatedAt,...values}=input;
      const version=await tx.salaryVersion.create({data:{tenantId:tid,employeeId,...values,actorId:ctx.user.id}});
      const company=await tx.tenant.findUniqueOrThrow({where:{id:tid}}),currentMonth=localDate(new Date(),company.timezone).slice(0,7);
      const current=await tx.salaryVersion.findFirst({where:{tenantId:tid,employeeId,effectiveMonth:{lte:currentMonth}},orderBy:[{effectiveMonth:'desc'},{createdAt:'desc'},{id:'desc'}]});
      if(current)await tx.employee.update({where:{id:employeeId},data:{monthlySalary:current.basic+current.hra+current.allowances}});
      await audit(tx,ctx,'SALARY_REVISION_CREATED','payroll',version.id,undefined,version);return version;
    },{timeout:30000});
  }
  async loans(ctx:Context,method:string,body?:unknown,loanId?:string){
    const tid=tenant(ctx);manage(ctx);
    if(method==='GET'){
      const items=await this.db.payrollLoan.findMany({where:{tenantId:tid},orderBy:{createdAt:'desc'}});
      const installments=await this.db.loanInstallment.findMany({where:{tenantId:tid,loanId:{in:items.map(i=>i.id)}}});
      const locked=new Set((await this.db.payrollRun.findMany({where:{tenantId:tid,status:'LOCKED'},select:{id:true}})).map(r=>r.id));
      const people=await this.db.employee.findMany({where:{tenantId:tid,id:{in:items.map(i=>i.employeeId)}},select:{id:true,firstName:true,lastName:true}}),names=new Map(people.map(p=>[p.id,p.firstName+' '+p.lastName]));
      return {items:items.map(i=>{const schedule=installments.filter(s=>s.loanId===i.id),recovered=schedule.filter(s=>s.appliedRunId&&locked.has(s.appliedRunId)).reduce((n,s)=>n+s.amount,0);return {...i,employeeName:names.get(i.employeeId)??'Archived employee',recovered,outstanding:i.principal-recovered,scheduled:schedule.filter(s=>!s.cancelled&&!s.appliedRunId).reduce((n,s)=>n+s.amount,0),installments:schedule}})};
    }
    if(method==='POST'){
      const input=z.object({employeeId:id,principal:money.min(1),installment:money.min(1),startMonth:month,reason}).strict().parse(body);await assertEmployee(this.db,ctx,input.employeeId);
      const count=Math.ceil(input.principal/input.installment);if(count>60)throw new BadRequestException('Choose an installment that repays within 60 months.');
      return this.db.$transaction(async tx=>{
        await lockSalaryInputs(tx,tid);
        for(let i=0;i<count;i++)await editableMonth(tx,tid,shiftMonth(input.startMonth,i));
        const loan=await tx.payrollLoan.create({data:{tenantId:tid,...input,actorId:ctx.user.id}});
        await tx.loanInstallment.createMany({data:Array.from({length:count},(_,i)=>({tenantId:tid,loanId:loan.id,month:shiftMonth(input.startMonth,i),amount:Math.min(input.installment,input.principal-i*input.installment)}))});
        await audit(tx,ctx,'LOAN_RECOVERY_SCHEDULED','payroll',loan.id,undefined,loan);return loan;
      },{timeout:30000});
    }
    if(method==='DELETE'&&loanId){
      id.parse(loanId);return this.db.$transaction(async tx=>{
        await lockSalaryInputs(tx,tid);
        await tx.$queryRaw`SELECT id FROM payroll_loans WHERE id = ${loanId}::uuid AND tenant_id = ${tid}::uuid FOR UPDATE`;
        const loan=await tx.payrollLoan.findFirst({where:{id:loanId,tenantId:tid}});if(!loan)throw new NotFoundException('Loan not found.');
        const pending=await tx.loanInstallment.findMany({where:{tenantId:tid,loanId,appliedRunId:null,cancelled:false},orderBy:{month:'asc'}});
        for(const item of pending)await editableMonth(tx,tid,item.month);
        await tx.loanInstallment.updateMany({where:{tenantId:tid,loanId,appliedRunId:null},data:{cancelled:true}});
        const after=await tx.payrollLoan.update({where:{id:loanId},data:{status:'CANCELLED'}});await audit(tx,ctx,'LOAN_FUTURE_RECOVERY_CANCELLED','payroll',loanId,loan,after);return after;
      });
    }
    throw new BadRequestException('Unsupported loan operation.');
  }
}
