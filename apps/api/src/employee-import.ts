import {recordProfileSalaryChange} from './salary-operations';
import {BadRequestException,ConflictException,ForbiddenException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Database} from '../../../packages/database';
import {employeeSchema} from '../../../packages/validation';
import {spreadsheetRows} from '../../../packages/validation/spreadsheet';
import {hasPermission,restrictedRoles} from '../../../packages/permissions';
import {audit,Context,requirePermission,tenant} from './context';
import {lockSalaryInputs} from './payroll-lock';
import {employeeImportColumns,employeeImportHeaders,employeeImportEnum,employeeImportDate,employeeImportAmount} from './employee-import-values';

export const importColumns=employeeImportColumns;
const schema=z.object({fileName:z.string().max(200),content:z.string().min(1).max(2_800_000),mode:z.enum(['CREATE','UPDATE']),expectedDigest:z.string().length(64).optional()}).strict();
export async function employeeImport(db:Database,ctx:Context,body:unknown,commit:boolean){
  const tid=tenant(ctx);requirePermission(ctx,'employees','IMPORT');requirePermission(ctx,'employees',schema.parse(body).mode==='CREATE'?'CREATE':'EDIT');
  if(restrictedRoles.has(ctx.user.role.code))throw new ForbiddenException('Imports are managed by HR.');
  const input=schema.parse(body);let rows:string[][];
  try{rows=spreadsheetRows(input.fileName,Buffer.from(input.content,'base64'),{dateColumns:['joiningDate']});}catch(e:any){throw new BadRequestException(e.message);}
  if(rows.length<2||rows.length>201)throw new BadRequestException('Import between 1 and 200 employee rows.');
  let header:string[];try{header=employeeImportHeaders(rows.shift()!);}catch(e:any){throw new BadRequestException(e.message);}
  return db.$transaction(async tx=>{
    if(commit){await lockSalaryInputs(tx,tid);await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tid}::uuid FOR UPDATE`;}
    const [employees,departments,branches,shifts,company]=await Promise.all([tx.employee.findMany({where:{tenantId:tid}}),tx.department.findMany({where:{tenantId:tid}}),tx.branch.findMany({where:{tenantId:tid}}),tx.shift.findMany({where:{tenantId:tid}}),tx.tenant.findUniqueOrThrow({where:{id:tid}})]);
    const versions=new Set((await tx.salaryVersion.findMany({where:{tenantId:tid},select:{employeeId:true}})).map(v=>v.employeeId));
    const codes=new Set<string>(),emails=new Set<string>();const preview:any[]=[],plan:any[]=[];
    rows.forEach((values,index)=>{
      const raw=Object.fromEntries(header.map((key,i)=>[key,(values[i]??'').trim()]));const errors:string[]=[];
      const codeKey=raw.employeeCode.toLowerCase(),matches=employees.filter(e=>e.employeeCode.toLowerCase()===codeKey),before=matches.length===1?matches[0]:undefined,email=raw.email.toLowerCase();
      if(matches.length>1)errors.push('Employee code matches multiple existing employees. Resolve the duplicate codes before importing.');
      if(values.slice(header.length).some(value=>value.trim()))errors.push('Row contains more cells than the header.');
      if(codes.has(codeKey))errors.push('Duplicate employee code in file.');codes.add(codeKey);
      if(emails.has(email))errors.push('Duplicate email in file.');emails.add(email);
      if(input.mode==='CREATE'&&before)errors.push('Employee code already exists.');if(input.mode==='UPDATE'&&(!before||before.deletedAt))errors.push('Active employee code not found.');
      if(employees.some(e=>e.email.toLowerCase()===email&&e.id!==before?.id))errors.push('Email already belongs to another employee.');
      const reference=(key:string,records:any[],field:string)=>{if(!raw[key])return before?(before as any)[{departmentCode:'departmentId',branchCode:'branchId',shiftName:'shiftId'}[key]!]:null;const matches=records.filter(r=>String(r[field]).toLowerCase()===raw[key].toLowerCase());if(matches.length!==1)errors.push(`Unknown or ambiguous ${key}: ${raw[key]}`);return matches[0]?.id??null;};
      let salary=before?.monthlySalary??0;
      if(raw.monthlySalary){raw.monthlySalary=employeeImportAmount(raw.monthlySalary);if(!/^\d+(?:\.\d{1,2})?$/.test(raw.monthlySalary))errors.push('monthlySalary must be a company-currency amount with up to two decimals.');else salary=Math.round(Number(raw.monthlySalary)*100);if(!hasPermission(ctx.user.role.permissions,'payroll','MANAGE')&&salary!==(before?.monthlySalary??0))errors.push('Payroll manage permission is required to change salary.');if(before&&versions.has(before.id)&&salary!==before.monthlySalary)errors.push('Use Salary structure to revise this employee salary.');}
      const candidate={employeeCode:before?.employeeCode??raw.employeeCode,firstName:raw.firstName,lastName:raw.lastName,email,phone:raw.phone,joiningDate:employeeImportDate(raw.joiningDate),departmentId:reference('departmentCode',departments,'code'),branchId:reference('branchCode',branches,'code'),shiftId:reference('shiftName',shifts,'name'),designation:raw.designation||before?.designation||'',employmentType:employeeImportEnum(raw.employmentType||before?.employmentType||'FULL_TIME',['FULL_TIME','PART_TIME','CONTRACT','INTERN']),status:employeeImportEnum(raw.status||before?.status||'ACTIVE',['ACTIVE','PROBATION','NOTICE','INACTIVE']),monthlySalary:salary,managerId:before?.managerId??null,personal:before?.personal??{},photo:before?.photo??''};
      const parsed=employeeSchema.safeParse(candidate);if(!parsed.success)errors.push(...parsed.error.issues.map(i=>i.path[0]==='joiningDate'?'joiningDate: Use a real Excel date, YYYY-MM-DD or DD/MM/YYYY.':`${i.path.join('.')}: ${i.message}`));
      preview.push({row:index+2,employeeCode:candidate.employeeCode,name:raw.firstName+' '+raw.lastName,email,phone:raw.phone,joiningDate:candidate.joiningDate,departmentCode:departments.find(d=>d.id===candidate.departmentId)?.code??raw.departmentCode??'',branchCode:branches.find(b=>b.id===candidate.branchId)?.code??raw.branchCode??'',shiftName:shifts.find(shift=>shift.id===candidate.shiftId)?.name??raw.shiftName??'',designation:candidate.designation,employmentType:candidate.employmentType,status:candidate.status,...(hasPermission(ctx.user.role.permissions,'payroll','VIEW')?{monthlySalary:salary}:{}),action:input.mode,errors});
      if(parsed.success)plan.push({before:before?{id:before.id,updatedAt:before.updatedAt.toISOString(),monthlySalary:before.monthlySalary,joiningDate:before.joiningDate}:null,values:parsed.data});
    });
    if(input.mode==='CREATE'&&employees.filter(e=>!e.deletedAt).length+rows.length>company.employeeLimit)preview[0].errors.push('The file would exceed the company employee limit.');
    const digest=createHash('sha256').update(JSON.stringify({tid,mode:input.mode,plan})).digest('hex'),valid=preview.every(r=>!r.errors.length);
    if(!commit)return {items:preview,valid,digest,total:rows.length};
    if(!valid)throw new BadRequestException('Fix the preview errors before importing.');if(input.expectedDigest!==digest)throw new ConflictException('The file or employee records changed. Preview again before importing.');
    for(const item of plan){await recordProfileSalaryChange(tx,ctx,item.before,item.values);const after=item.before?await tx.employee.update({where:{id:item.before.id},data:item.values}):await tx.employee.create({data:{tenantId:tid,...item.values}});await audit(tx,ctx,'EMPLOYEE_IMPORTED','employees',after.id,undefined,{mode:input.mode,employeeCode:after.employeeCode});}
    await audit(tx,ctx,'EMPLOYEE_IMPORT_COMPLETED','employees',undefined,undefined,{count:plan.length,mode:input.mode,digest});return {ok:true,count:plan.length};
  },{timeout:60000});
}
