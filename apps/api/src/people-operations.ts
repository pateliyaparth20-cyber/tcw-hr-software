import {BadRequestException,ConflictException,ForbiddenException,NotFoundException} from '@nestjs/common';
import {z} from 'zod';
import type {Database} from '../../../packages/database';
import {id,date} from '../../../packages/validation';
import {restrictedRoles,hasPermission} from '../../../packages/permissions';
import {toPdf} from '../../../packages/reporting-engine';
import {audit,assertEmployee,employeeScope,Context,requirePermission,tenant} from './context';

export async function recordAssetEvent(tx:any,ctx:Context,before:any,after:any){
  const tid=tenant(ctx),row=after??before;if(!row)return;
  const add=async(kind:string,employeeId:string|null,note:string)=>{const person=employeeId?await tx.employee.findFirst({where:{tenantId:tid,id:employeeId}}):null;await tx.assetEvent.create({data:{tenantId:tid,assetId:row.id,assetTag:row.assetTag,employeeId,employeeName:person?`${person.firstName} ${person.lastName}`:'',kind,note,actorId:ctx.user.id}});};
  if(before?.employeeId&&before.employeeId!==after?.employeeId)await add('RETURNED',before.employeeId,'Assignment ended');
  if(after?.employeeId&&before?.employeeId!==after.employeeId)await add('ASSIGNED',after.employeeId,'Assigned to employee');
  if(!before)await add('CREATED',null,'Asset registered');
  if(!after)await add('DELETED',null,'Asset removed; history retained');
  else if(before&&before.status!==after.status)await add(after.status,null,`Status changed from ${before.status} to ${after.status}`);
}
const defaults:Record<string,string[]>={JOINING:['Verify identity and employment documents','Create employee app access','Assign shift and reporting manager','Complete bank and salary details','Issue equipment and company policies'],EXIT:['Confirm last working date','Collect assigned equipment','Revoke app access','Review payroll and final settlement','Prepare experience and relieving documents']};
export class PeopleOperations {
  constructor(private db:Database){}
  async assetHistory(ctx:Context,assetId:string){
    const tid=tenant(ctx);id.parse(assetId);requirePermission(ctx,'assets','VIEW');
    if(restrictedRoles.has(ctx.user.role.code))throw new ForbiddenException('Asset history is managed by HR.');
    const exists=await this.db.asset.findFirst({where:{tenantId:tid,id:assetId}});if(!exists)throw new NotFoundException('Asset not found.');
    return {items:await this.db.assetEvent.findMany({where:{tenantId:tid,assetId},orderBy:[{createdAt:'desc'},{id:'desc'}]})};
  }
  async enrollments(ctx:Context,courseId:string,method:string,body?:unknown){
    const tid=tenant(ctx);id.parse(courseId);requirePermission(ctx,'training',method==='GET'?'VIEW':'MANAGE');
    const scope=await employeeScope(this.db,ctx);
    if(method!=='GET'&&scope)throw new ForbiddenException('Training enrollments are managed by HR.');
    const course=await this.db.course.findFirst({where:{tenantId:tid,id:courseId}});if(!course)throw new NotFoundException('Course not found.');
    if(method==='GET'){
      const items=await this.db.courseEnrollment.findMany({where:{tenantId:tid,courseId,...(scope?{employeeId:{in:scope}}:{})},orderBy:{createdAt:'asc'}});
      const people=await this.db.employee.findMany({where:{tenantId:tid,id:{in:items.map(i=>i.employeeId)}},select:{id:true,firstName:true,lastName:true,employeeCode:true}}),byId=new Map(people.map(p=>[p.id,p]));
      return {course,items:items.map(i=>({...i,employeeName:byId.has(i.employeeId)?`${byId.get(i.employeeId)!.firstName} ${byId.get(i.employeeId)!.lastName}`:'Archived employee',employeeCode:byId.get(i.employeeId)?.employeeCode??''}))};
    }
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM courses WHERE id = ${courseId}::uuid AND tenant_id = ${tid}::uuid FOR UPDATE`;
      const current=await tx.course.findFirstOrThrow({where:{tenantId:tid,id:courseId}});if(current.status==='CANCELLED')throw new ConflictException('Cancelled courses cannot be changed.');
      if(method==='POST'){
        const input=z.object({employeeId:id}).strict().parse(body);await assertEmployee(tx,ctx,input.employeeId);
        if(current.status==='COMPLETED')throw new ConflictException('This course is completed.');
        if(await tx.courseEnrollment.count({where:{tenantId:tid,courseId,status:{not:'CANCELLED'}}})>=current.capacity)throw new ConflictException('The course is full.');
        const previous=await tx.courseEnrollment.findUnique({where:{tenantId_courseId_employeeId:{tenantId:tid,courseId,employeeId:input.employeeId}}});
        if(previous&&previous.status!=='CANCELLED')throw new ConflictException('Employee is already enrolled.');
        const after=previous?await tx.courseEnrollment.update({where:{id:previous.id},data:{status:'ENROLLED',score:null,completedAt:null}}):await tx.courseEnrollment.create({data:{tenantId:tid,courseId,...input}});
        await audit(tx,ctx,'TRAINING_ENROLLED','training',after.id,previous,after);return after;
      }
      if(method==='PATCH'){
        const input=z.object({enrollmentId:id,status:z.enum(['ENROLLED','COMPLETED','CANCELLED']),score:z.number().int().min(0).max(100).nullable().default(null),expectedUpdatedAt:z.iso.datetime()}).strict().parse(body);
        const before=await tx.courseEnrollment.findFirst({where:{tenantId:tid,courseId,id:input.enrollmentId}});if(!before)throw new NotFoundException('Enrollment not found.');
        if(before.updatedAt.toISOString()!==input.expectedUpdatedAt)throw new ConflictException('Enrollment changed. Refresh first.');
        if(before.status==='CANCELLED'&&input.status!=='CANCELLED'&&await tx.courseEnrollment.count({where:{tenantId:tid,courseId,status:{not:'CANCELLED'}}})>=current.capacity)throw new ConflictException('The course is full.');
        const after=await tx.courseEnrollment.update({where:{id:before.id},data:{status:input.status,score:input.status==='COMPLETED'?input.score:null,completedAt:input.status==='COMPLETED'?(before.completedAt??new Date()):null}});await audit(tx,ctx,'TRAINING_ENROLLMENT_UPDATED','training',after.id,before,after);return after;
      }
      throw new BadRequestException('Unsupported enrollment operation.');
    });
  }
  async certificate(ctx:Context,enrollmentId:string){
    const tid=tenant(ctx);requirePermission(ctx,'training','VIEW');const scope=await employeeScope(this.db,ctx);
    const record=await this.db.courseEnrollment.findFirst({where:{id:id.parse(enrollmentId),tenantId:tid,status:'COMPLETED',...(scope?{employeeId:{in:scope}}:{})}});if(!record)throw new NotFoundException('Completed enrollment not found.');
    const [employee,course,company]=await Promise.all([this.db.employee.findFirst({where:{id:record.employeeId,tenantId:tid}}),this.db.course.findFirst({where:{id:record.courseId,tenantId:tid}}),this.db.tenant.findUnique({where:{id:tid}})]);if(!employee||!course)throw new NotFoundException();
    return toPdf([{employee:`${employee.firstName} ${employee.lastName}`,employeeCode:employee.employeeCode,course:course.title,trainer:course.trainer,completed:record.completedAt?.toISOString().slice(0,10),score:record.score,certificate:record.id}],`${company?.name??'Company'} - Training completion`);
  }
  async tasks(ctx:Context,employeeId:string,method:string,body?:unknown){
    const tid=tenant(ctx);id.parse(employeeId);requirePermission(ctx,'employees',method==='GET'?'VIEW':'EDIT');await assertEmployee(this.db,ctx,employeeId);
    if(restrictedRoles.has(ctx.user.role.code))throw new ForbiddenException('Joining and exit checklists are managed by HR.');
    if(method==='GET')return {items:await this.db.employeeTask.findMany({where:{tenantId:tid,employeeId},orderBy:[{kind:'asc'},{createdAt:'asc'}]})};
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${employeeId}::uuid AND tenant_id = ${tid}::uuid FOR UPDATE`;
      if(method==='POST'){
        const input=z.object({kind:z.enum(['JOINING','EXIT']),title:z.string().trim().min(1).max(200).optional(),dueDate:date.nullable().optional()}).strict().parse(body);
        if(input.title){const after=await tx.employeeTask.create({data:{tenantId:tid,employeeId,kind:input.kind,title:input.title,dueDate:input.dueDate}});await audit(tx,ctx,'CHECKLIST_TASK_ADDED','employees',after.id,undefined,after);return after;}
        await tx.employeeTask.createMany({data:defaults[input.kind].map(title=>({tenantId:tid,employeeId,kind:input.kind,title})),skipDuplicates:true});await audit(tx,ctx,'CHECKLIST_STARTED','employees',employeeId,undefined,{kind:input.kind});return {ok:true};
      }
      if(method==='PATCH'){
        const input=z.object({taskId:id,completed:z.boolean(),expectedUpdatedAt:z.iso.datetime()}).strict().parse(body);
        const before=await tx.employeeTask.findFirst({where:{id:input.taskId,tenantId:tid,employeeId}});if(!before)throw new NotFoundException('Task not found.');if(before.updatedAt.toISOString()!==input.expectedUpdatedAt)throw new ConflictException('Task changed. Refresh first.');
        const after=await tx.employeeTask.update({where:{id:before.id},data:{completed:input.completed,completedAt:input.completed?new Date():null,completedBy:input.completed?ctx.user.id:null}});await audit(tx,ctx,'CHECKLIST_TASK_UPDATED','employees',after.id,before,after);return after;
      }
      throw new BadRequestException('Unsupported checklist operation.');
    });
  }
  async letter(ctx:Context,employeeId:string,kind:string){
    const tid=tenant(ctx);requirePermission(ctx,'documents','CREATE');requirePermission(ctx,'employees','VIEW');if(restrictedRoles.has(ctx.user.role.code))throw new ForbiddenException('Letters are generated by HR.');
    const person=await assertEmployee(this.db,ctx,id.parse(employeeId)),company=await this.db.tenant.findUniqueOrThrow({where:{id:tid}});
    if(!['appointment','experience','relieving'].includes(kind))throw new BadRequestException('Choose a supported letter.');
    const exit=kind!=='appointment'?await this.db.employeeExit.findFirst({where:{tenantId:tid,employeeId,status:'COMPLETED'}}):null;
    if(kind!=='appointment'&&!exit)throw new ConflictException('Complete offboarding before generating an experience or relieving letter.');
    const name=`${person.firstName} ${person.lastName}`,rows=[{field:'Employee',value:name},{field:'Employee code',value:person.employeeCode},{field:'Designation',value:person.designation},{field:'Joined',value:person.joiningDate.toISOString().slice(0,10)},...(exit?[{field:'Last working date',value:exit.lastWorkingDate.toISOString().slice(0,10)}]:[]),{field:'Issued on',value:new Date().toISOString().slice(0,10)},{field:'Statement',value:kind==='appointment'?`${name} is appointed as ${person.designation||'an employee'} at ${company.name} from the joining date above. Employment terms are recorded in the signed employment agreement.`:kind==='experience'?`${name} worked at ${company.name} in the designation above during the stated period.`:`${name} completed the recorded offboarding process at ${company.name} with the stated last working date.`},{field:'Authorized signature',value:'____________________'},{field:'Company',value:company.name}];
    await audit(this.db,ctx,'EMPLOYEE_LETTER_GENERATED','documents',employeeId,undefined,{kind});return toPdf(rows,`${company.name} - ${kind} letter`);
  }
  async summary(ctx:Context){
    const tid=tenant(ctx);requirePermission(ctx,'employees','VIEW');if(restrictedRoles.has(ctx.user.role.code))throw new ForbiddenException();
    const permits=(r:string)=>hasPermission(ctx.user.role.permissions,r,'VIEW'),now=new Date(),soon=new Date(+now+30*86400000);
    const [tasks,documents,devices,transfers]=await Promise.all([
      this.db.employeeTask.count({where:{tenantId:tid,completed:false}}),
      permits('documents')?this.db.document.findMany({where:{tenantId:tid,expiresAt:{lte:soon}},orderBy:{expiresAt:'asc'},select:{id:true,title:true,expiresAt:true}}):[],
      permits('devices')?this.db.attendanceDevice.findMany({where:{tenantId:tid,connectionMode:{not:'EMPLOYEE_APP'},OR:[{lastSeenAt:null},{lastSeenAt:{lt:new Date(+now-15*60000)}}]},select:{id:true,name:true,lastSeenAt:true}}):[],
      permits('payroll')?this.db.payrollPayout.count({where:{tenantId:tid,status:{in:['UNKNOWN','INITIATING']}}}):0
    ]);return {openTasks:tasks,expiringDocuments:documents,offlineDevices:devices,unverifiedTransfers:transfers};
  }
}
