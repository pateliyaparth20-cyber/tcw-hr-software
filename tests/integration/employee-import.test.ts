import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {embeddedDatabase} from '../helpers/database';
import {employeeImport} from '../../apps/api/src/employee-import';
import {roleDefinitions} from '../../packages/permissions';
import {toXlsx,toCsv} from '../../packages/reporting-engine';
import type {Context} from '../../apps/api/src/context';

test('mixed-case Excel employees preview normalized data, update canonical codes and reject duplicate identities',async()=>{
  const fixture=await embeddedDatabase(),db=fixture.db;
  try{
    const company=await db.tenant.create({data:{name:'Synthetic Excel Import',code:'IMPORT-'+randomUUID()}});
    const tid=company.id,ctx:Context={tenantId:tid,user:{id:randomUUID(),role:roleDefinitions.find(r=>r.code==='COMPANY_OWNER')!},session:{},ip:'127.0.0.1'};
    const department=await db.department.create({data:{tenantId:tid,name:'Engineering',code:'ENG'}}),branch=await db.branch.create({data:{tenantId:tid,name:'Office',code:'OFFICE'}});
    const shift=await db.shift.create({data:{tenantId:tid,name:'Morning Shift',startMinute:540,endMinute:1080}});
    const row={'EMPLOYEE CODE':'emp-001','First Name':'Mixed','LAST_NAME':'Case','EMAIL':'Mixed@Example.Test','PHONE':'09000000000','Joining Date':45292,'Department Code':'eng','BRANCH CODE':'office','SHIFT NAME':'morning shift','Employment Type':'full time','STATUS':'aCtIvE','Monthly Salary':'25,000.50'};
    const body={fileName:'Employees.XLSX',content:toXlsx([row]).toString('base64'),mode:'CREATE'};
    let preview=await employeeImport(db,ctx,body,false) as any;
    assert.equal(preview.valid,true,JSON.stringify(preview));assert.equal(preview.items[0].joiningDate,'2024-01-01');assert.equal(preview.items[0].monthlySalary,2500050);assert.equal(preview.items[0].employmentType,'FULL_TIME');assert.equal(preview.items[0].status,'ACTIVE');assert.equal(preview.items[0].email,'mixed@example.test');
    await employeeImport(db,ctx,{...body,expectedDigest:preview.digest},true);
    let employee=await db.employee.findFirstOrThrow({where:{tenantId:tid,employeeCode:'emp-001'}});
    assert.equal(employee.departmentId,department.id);assert.equal(employee.branchId,branch.id);assert.equal(employee.shiftId,shift.id);assert.equal(employee.phone,'09000000000');assert.equal(employee.joiningDate.toISOString().slice(0,10),'2024-01-01');
    await db.employee.update({where:{id:employee.id},data:{personal:{accountNumber:'0000012345',ifsc:'TEST0000001'}}});
    const update={...body,mode:'UPDATE',content:toXlsx([{...row,'EMPLOYEE CODE':'EMP-001','Joining Date':'1/2/2024','STATUS':'probation','Employment Type':'Part-Time'}]).toString('base64')};
    preview=await employeeImport(db,ctx,update,false) as any;assert.equal(preview.valid,true);assert.equal(preview.items[0].employeeCode,'emp-001');
    await employeeImport(db,ctx,{...update,expectedDigest:preview.digest},true);
    employee=await db.employee.findUniqueOrThrow({where:{id:employee.id}});assert.equal(employee.employeeCode,'emp-001');assert.equal(employee.status,'PROBATION');assert.equal(employee.employmentType,'PART_TIME');assert.equal(employee.joiningDate.toISOString().slice(0,10),'2024-02-01');assert.equal((employee.personal as any).accountNumber,'0000012345');
    const duplicates={...body,content:toXlsx([{...row,'EMPLOYEE CODE':'new-002','EMAIL':'new@example.test'},{...row,'EMPLOYEE CODE':'NEW-002','EMAIL':'other@example.test'}]).toString('base64')};
    const invalid=await employeeImport(db,ctx,duplicates,false) as any;assert.equal(invalid.valid,false);assert.match(invalid.items[1].errors.join(' '),/Duplicate employee code/);
    await assert.rejects(()=>employeeImport(db,ctx,{...duplicates,expectedDigest:invalid.digest},true));assert.equal(await db.employee.count({where:{tenantId:tid}}),1);
    const badDate={...body,content:toXlsx([{...row,'EMPLOYEE CODE':'new-date','EMAIL':'date@example.test','Joining Date':60}]).toString('base64')};
    const datePreview=await employeeImport(db,ctx,badDate,false) as any;assert.equal(datePreview.valid,false);assert.match(datePreview.items[0].errors.join(' '),/joiningDate/);
    const csv={fileName:'update.csv',mode:'UPDATE',content:Buffer.from(toCsv([{'employee code':'EMP-001','first name':'Mixed','last name':'Case',email:'mixed@example.test',phone:'09000000000','joining date':'01/02/2024'}])).toString('base64')};
    const hr={...ctx,user:{...ctx.user,role:{...roleDefinitions.find(r=>r.code==='HR_EXECUTIVE')!,permissions:[...roleDefinitions.find(r=>r.code==='HR_EXECUTIVE')!.permissions,'employees:IMPORT']}}};
    const hrPreview=await employeeImport(db,hr,csv,false) as any;assert.equal(hrPreview.valid,true);assert.equal('monthlySalary' in hrPreview.items[0],false,'Preview must not expose existing salary to a role without payroll view');
    await assert.rejects(()=>employeeImport(db,{...ctx,tenantId:randomUUID()},body,false));
  }finally{await fixture.close()}
});
