import {BadRequestException,NotFoundException} from '@nestjs/common';
import {z} from 'zod';
import type {Database} from '../../../packages/database';
import {id,date} from '../../../packages/validation';
import {Context,employeeScope,requirePermission,tenant} from './context';
const configurations:Record<string,{model:string;resource:string;fields:string[];date?:string;employee?:boolean}>={
  employees:{model:'employee',resource:'employees',fields:['id','employeeCode','firstName','lastName','email','phone','designation','employmentType','status','joiningDate','departmentId','branchId']},
  attendance:{model:'attendanceDaily',resource:'attendance',fields:['id','employeeId','date','status','firstIn','lastOut','workMinutes','lateMinutes','overtimeMinutes','payableUnits','dayType','exceptionCode'],date:'date',employee:true},
  leave:{model:'leaveRequest',resource:'leave',fields:['id','employeeId','startDate','endDate','days','status','reason','reviewNote'],employee:true},
  expenses:{model:'expenseClaim',resource:'expenses',fields:['id','employeeId','title','category','amount','date','status','notes'],date:'date',employee:true},
  assets:{model:'asset',resource:'assets',fields:['id','name','assetTag','category','employeeId','status','purchaseDate','value'],employee:true},
  goals:{model:'goal',resource:'performance',fields:['id','employeeId','title','target','progress','dueDate','status'],date:'dueDate',employee:true},
  candidates:{model:'candidate',resource:'recruitment',fields:['id','name','email','jobId','stage','interviewAt','createdAt'],date:'createdAt'},
};
export async function reportRows(db:Database,ctx:Context,type:string,query:any){
  const tid=tenant(ctx);requirePermission(ctx,'reports','EXPORT');
  const from=query.from?date.parse(String(query.from)):null,to=query.to?date.parse(String(query.to)):null;if(from&&to&&from>to)throw new BadRequestException('From date must precede To date.');
  const departmentId=query.departmentId?id.parse(String(query.departmentId)):null,branchId=query.branchId?id.parse(String(query.branchId)):null,status=query.status?z.string().max(60).parse(String(query.status)):null;
  const scope=await employeeScope(db,ctx),employeeWhere:any={tenantId:tid,...(scope?{id:{in:scope}}:{}),...(departmentId?{departmentId}:{}),...(branchId?{branchId}:{})};
  const people=await db.employee.findMany({where:employeeWhere,select:{id:true,employeeCode:true,firstName:true,lastName:true,departmentId:true,branchId:true}}),ids=people.map(p=>p.id),byId=new Map(people.map(p=>[p.id,p]));
  const enriched=(rows:any[])=>rows.map(row=>{const p=byId.get(row.employeeId??row.id);return p?{...row,employeeCode:row.employeeCode??p.employeeCode,employeeName:row.employeeName??`${p.firstName} ${p.lastName}`,departmentId:p.departmentId,branchId:p.branchId}:row});
  if(['payroll','payroll-items'].includes(type)){
    requirePermission(ctx,'payroll','EXPORT');const where:any={tenantId:tid,...(status?{status}:{}),...(from||to?{month:{...(from?{gte:from.toISOString().slice(0,7)}:{}),...(to?{lte:to.toISOString().slice(0,7)}:{})}}:{})};
    const runs=await db.payrollRun.findMany({where,include:{items:true},orderBy:{month:'desc'}});
    const matches=(items:any[])=>scope||departmentId||branchId?items.filter(i=>ids.includes(i.employeeId)):items;
    if(type==='payroll-items')return enriched(runs.flatMap(run=>matches(run.items).map(i=>({id:i.id,employeeId:i.employeeId,employeeCode:i.employeeCode,employeeName:i.employeeName,month:run.month,status:run.status,gross:i.gross,deductions:i.deductions,net:i.net,scheduledDays:i.scheduledDays,payableUnits:i.payableUnits,overtimeMinutes:i.overtimeMinutes}))));
    return runs.map(run=>{const items=matches(run.items);return {id:run.id,month:run.month,status:run.status,employees:items.length,totalGross:items.reduce((n,i)=>n+i.gross,0),totalDeductions:items.reduce((n,i)=>n+i.deductions,0),totalNet:items.reduce((n,i)=>n+i.net,0),lockedAt:run.lockedAt};}).filter(r=>!(departmentId||branchId||scope)||r.employees>0);
  }
  const cfg=configurations[type];if(!cfg)throw new NotFoundException('Report not found.');requirePermission(ctx,cfg.resource,'EXPORT');
  const where:any={tenantId:tid,...(status?{[type==='candidates'?'stage':'status']:status}:{})};
  if(type==='employees'){where.deletedAt=null;where.id={in:ids};const q=String(query.q??'').trim().slice(0,100);if(q)where.OR=['firstName','lastName','email','employeeCode'].map(key=>({[key]:{contains:q,mode:'insensitive'}}));}
  else if(cfg.employee&&(scope||departmentId||branchId))where.employeeId={in:ids};
  if(type!=='employees'&&query.q){const q=String(query.q).trim().slice(0,100),fields=cfg.fields.filter(k=>['name','title','assetTag','category','email'].includes(k));if(q&&fields.length)where.OR=fields.map(key=>({[key]:{contains:q,mode:'insensitive'}}));}
  if(type==='candidates'&&departmentId)where.jobId={in:(await db.job.findMany({where:{tenantId:tid,departmentId},select:{id:true}})).map(j=>j.id)};
  if(type==='candidates'&&branchId)throw new BadRequestException('Recruitment does not have branch assignments. Clear the branch filter.');
  if(type==='leave'&&(from||to))Object.assign(where,{...(from?{endDate:{gte:from}}:{}),...(to?{startDate:{lte:to}}:{})});
  else if(cfg.date&&(from||to))where[cfg.date]={...(from?{gte:from}:{}),...(to?{lt:new Date(+to+86400000)}:{})};
  const select=Object.fromEntries(cfg.fields.map(field=>[field,true]));const rows=await (db as any)[cfg.model].findMany({where,select,orderBy:[{createdAt:'desc'},{id:'desc'}]});return enriched(rows);
}
