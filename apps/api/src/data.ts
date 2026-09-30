import {BadRequestException,ForbiddenException,NotFoundException,ConflictException} from '@nestjs/common';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import type { Database } from '../../../packages/database';
import {hashPassword} from '../../../packages/auth';
import {randomBytes,createHash} from 'node:crypto';
import {allocateShortLoginId,temporaryPassword8} from './identifiers';
import {configs,employeeSchema,id,tenantSchema,leadSchema,planSchema,date,password} from '../../../packages/validation';
import {hasPermission,restrictedRoles} from '../../../packages/permissions';
import {audit,assertEmployee,employeeScope,platform,requirePermission,tenant,Context} from './context';
import {syncCompanyAccess} from './billing';
import {sendPush} from './push';
export class DataService {
  constructor(public db:Database){}
  private object(value:any):Record<string,any>{return value&&typeof value==='object'&&!Array.isArray(value)?{...value}:{};}
  private async trialRows(){
    await syncCompanyAccess(this.db);
    const companies=await this.db.tenant.findMany({orderBy:{createdAt:'desc'},take:1000});
    const trialCompanies=companies.filter(company=>{const profile=this.object(company.profile);return company.status==='TRIAL'||!!profile.trialDays||['SELF_SERVICE','ADMIN_CREATED'].includes(String(profile.signupSource??''));});
    const tenantIds=trialCompanies.map(c=>c.id);
    if(!tenantIds.length)return {items:[],summary:{total:0,active:0,expiringSoon:0,callDue:0,contacted:0,converted:0}};
    const [users,employees,logins,leads]=await Promise.all([
      this.db.user.findMany({where:{tenantId:{in:tenantIds}},select:{tenantId:true,name:true,email:true,loginId:true,active:true,role:{select:{code:true}}}}),
      this.db.employee.findMany({where:{tenantId:{in:tenantIds},deletedAt:null},select:{tenantId:true}}),
      this.db.auditLog.findMany({where:{tenantId:{in:tenantIds},action:'LOGIN_SUCCEEDED'},orderBy:{createdAt:'desc'},take:5000,select:{tenantId:true,createdAt:true}}),
      this.db.lead.findMany({orderBy:{createdAt:'desc'},take:2000})
    ]);
    const counts=new Map<string,number>();for(const employee of employees)counts.set(employee.tenantId,(counts.get(employee.tenantId)??0)+1);
    const lastLogin=new Map<string,Date>();for(const row of logins)if(row.tenantId&&!lastLogin.has(row.tenantId))lastLogin.set(row.tenantId,row.createdAt);
    const now=Date.now(),day=86400000;
    const items=trialCompanies.map(company=>{
      const profile=this.object(company.profile),owner=users.find(u=>u.tenantId===company.id&&u.role.code==='COMPANY_OWNER')??users.find(u=>u.tenantId===company.id);
      const lead=leads.find(l=>l.notes?.includes(company.code))??leads.find(l=>l.company===company.name&&(!owner?.email||l.email===owner.email));
      const trialEndRaw=profile.trialOriginalEndsAt??company.expiresAt,trialEndAt=trialEndRaw?new Date(trialEndRaw):null,trialEndMs=trialEndAt?.getTime()??0;
      const nextFollowupRaw=Object.prototype.hasOwnProperty.call(profile,'trialNextFollowupAt')?profile.trialNextFollowupAt:(lead?.nextFollowup??trialEndAt),nextFollowupAt=nextFollowupRaw?new Date(nextFollowupRaw):null;
      const converted=company.status==='ACTIVE'&&trialEndMs>0&&trialEndMs<=now;
      let followupStatus=String(profile.trialFollowupStatus??(company.status==='TRIAL'?'PENDING':company.status==='ACTIVE'?'CONVERTED':'CALL_DUE'));
      if(company.status==='ACTIVE')followupStatus='CONVERTED';else if(trialEndMs&&trialEndMs<=now&&['PENDING',''].includes(followupStatus))followupStatus='CALL_DUE';
      const unresolved=['PENDING','CALL_DUE','NO_ANSWER','FOLLOW_UP'].includes(followupStatus),scheduled=['CONTACTED','INTERESTED'].includes(followupStatus)&&!!nextFollowupAt;const needsCall=company.status!=='ACTIVE'&&!!trialEndMs&&trialEndMs<=now&&followupStatus!=='NOT_INTERESTED'&&(unresolved?(!nextFollowupAt||nextFollowupAt.getTime()<=now):scheduled?nextFollowupAt!.getTime()<=now:false);
      const daysRemaining=trialEndMs?Math.ceil((trialEndMs-now)/day):null,daysSinceExpired=trialEndMs&&trialEndMs<now?Math.floor((now-trialEndMs)/day):0;
      return {id:company.id,companyId:company.id,company:company.name,companyCode:company.code,tenantStatus:company.status,plan:company.plan,employeeLimit:company.employeeLimit,employeesUsed:counts.get(company.id)??0,createdAt:company.createdAt,trialStartedAt:profile.trialStartedAt??company.createdAt,trialEndsAt:trialEndAt,daysRemaining,daysSinceExpired,source:profile.signupSource??'LEGACY',contactName:owner?.name??lead?.contactName??'',email:owner?.email??lead?.email??'',loginId:owner?.loginId??'',phone:profile.ownerPhone??lead?.phone??'',contactConsent:!!profile.contactConsentAt,contactConsentAt:profile.contactConsentAt??null,lastLoginAt:lastLogin.get(company.id)??null,leadId:lead?.id??null,leadStage:lead?.stage??null,leadValue:lead?.value??0,followupStatus,nextFollowupAt,followupNotes:profile.trialFollowupNotes??'',lastContactedAt:profile.trialLastContactedAt??null,needsCall,converted};
    });
    return {items,summary:{total:items.length,active:items.filter(r=>r.tenantStatus==='TRIAL').length,expiringSoon:items.filter(r=>r.tenantStatus==='TRIAL'&&r.daysRemaining!==null&&r.daysRemaining>=0&&r.daysRemaining<=2).length,callDue:items.filter(r=>r.needsCall).length,contacted:items.filter(r=>['CONTACTED','INTERESTED'].includes(r.followupStatus)).length,converted:items.filter(r=>r.followupStatus==='CONVERTED').length}};
  }
  async dashboard(ctx:Context){
    requirePermission(ctx,'dashboard','VIEW');
    if(ctx.user.role.scope==='PLATFORM'){
      const [companies,leads,invoices,activity,support,employees]=await Promise.all([
        hasPermission(ctx.user.role.permissions,'tenants','VIEW')?this.db.tenant.findMany({orderBy:{createdAt:'desc'}}):[],
        hasPermission(ctx.user.role.permissions,'sales','VIEW')?this.db.lead.findMany():[],
        hasPermission(ctx.user.role.permissions,'billing','VIEW')?this.db.invoice.findMany():[],
        hasPermission(ctx.user.role.permissions,'audit','VIEW')?this.db.auditLog.findMany({where:{tenantId:null},orderBy:{createdAt:'desc'},take:8}):[],
        hasPermission(ctx.user.role.permissions,'support','VIEW')?this.db.supportTicket.findMany({orderBy:{updatedAt:'desc'},take:20}):[],
        hasPermission(ctx.user.role.permissions,'tenants','VIEW')?this.db.employee.count({where:{deletedAt:null}}):0]);
      const trials=hasPermission(ctx.user.role.permissions,'tenants','VIEW')?await this.trialRows():{items:[],summary:{total:0,active:0,expiringSoon:0,callDue:0,contacted:0,converted:0}};
      return {companies,leads,invoices,activity,support,employeeCount:employees,trials:trials.items.slice(0,8),trialSummary:trials.summary};
    }
    const tid=tenant(ctx),scope=await employeeScope(this.db,ctx),employeeSelf=ctx.user.role.code==='EMPLOYEE';
    const employeeWhere={tenantId:tid,deletedAt:null,...(scope?{id:{in:scope}}:{})};
    const owned={tenantId:tid,...(scope?{employeeId:{in:scope}}:{})};
    const [company,employees,attendance,leave,jobs,departments,events,activity,payroll,devices,support,unreadNotifications]=await Promise.all([
      this.db.tenant.findUnique({where:{id:tid}}),
      this.db.employee.findMany({where:employeeWhere,select:{id:true,firstName:true,lastName:true,photo:true,departmentId:true,designation:true,status:true,joiningDate:true,monthlySalary:hasPermission(ctx.user.role.permissions,'payroll','VIEW')}}),
      hasPermission(ctx.user.role.permissions,'attendance','VIEW')?this.db.attendanceDaily.findMany({where:{...owned,date:{gte:new Date(Date.now()-7*86400000)}},orderBy:{date:'asc'}}):[],
      hasPermission(ctx.user.role.permissions,'leave','VIEW')?this.db.leaveRequest.findMany({where:owned,orderBy:{createdAt:'desc'},take:200}):[],
      hasPermission(ctx.user.role.permissions,'recruitment','VIEW')?this.db.job.count({where:{tenantId:tid,status:'OPEN'}}):0,
      this.db.department.findMany({where:{tenantId:tid}}),
      this.db.calendarEvent.findMany({where:{tenantId:tid,OR:[{date:{gte:new Date(new Date().toISOString().slice(0,10))}},{endDate:{gte:new Date(new Date().toISOString().slice(0,10))}}]},orderBy:{date:'asc'},take:5}),
      hasPermission(ctx.user.role.permissions,'audit','VIEW')?this.db.auditLog.findMany({where:{tenantId:tid},orderBy:{createdAt:'desc'},take:6}):[],
      hasPermission(ctx.user.role.permissions,'payroll','VIEW')?(employeeSelf&&ctx.user.employeeId?this.db.payrollItem.findFirst({where:{tenantId:tid,employeeId:ctx.user.employeeId,run:{status:'LOCKED'}},include:{run:{select:{month:true,status:true}}},orderBy:{createdAt:'desc'}}):this.db.payrollRun.findFirst({where:{tenantId:tid},orderBy:{month:'desc'}})):null,
      hasPermission(ctx.user.role.permissions,'devices','VIEW')?this.db.attendanceDevice.findMany({where:{tenantId:tid},select:{id:true,name:true,status:true,lastSeenAt:true}}):[],
      !employeeSelf&&hasPermission(ctx.user.role.permissions,'support','VIEW')?this.db.supportTicket.findMany({where:{tenantId:tid,status:{not:'RESOLVED'}},orderBy:{updatedAt:'desc'},take:8}):[],
      this.db.notification.count({where:{tenantId:tid,readAt:null,OR:[{userId:ctx.user.id},{userId:null}]}})]);
    return {company,employees,attendance,leave,jobs,departments,events,activity,payroll,devices,support,unreadNotifications};
  }
  async company(ctx:Context,body?:unknown){
    const tid=tenant(ctx);requirePermission(ctx,'company',body?'EDIT':'VIEW');
    if(!body)return this.db.tenant.findUnique({where:{id:tid}});
    const schema=z.object({name:z.string().trim().min(1).max(200),currency:z.string().regex(/^[A-Z]{3}$/),timezone:z.string().refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true}catch{return false}}),profile:z.object({legalName:z.string().max(200).optional(),industry:z.string().max(100).optional(),companyType:z.string().max(100).optional(),registrationNumber:z.string().max(80).optional(),foundedYear:z.string().max(4).optional(),contactPerson:z.string().max(120).optional(),contactDesignation:z.string().max(120).optional(),billingEmail:z.string().max(200).optional(),website:z.string().max(200).optional(),email:z.string().max(200).optional(),phone:z.string().max(40).optional(),address:z.string().max(1000).optional(),city:z.string().max(100).optional(),state:z.string().max(100).optional(),country:z.string().max(100).optional(),postalCode:z.string().max(20).optional(),taxId:z.string().max(50).optional(),pan:z.string().max(20).optional(),dateFormat:z.string().max(40).optional(),financialYear:z.string().max(40).optional(),supportEmail:z.string().max(200).optional(),footer:z.string().max(200).optional(),primaryColor:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),salaryDay:z.number().int().min(1).max(31).optional(),autoPayroll:z.boolean().optional(),payoutProvider:z.enum(['NONE','BANK_FILE','RAZORPAYX','CASHFREE','CUSTOM']).optional(),payoutMode:z.enum(['IMPS','NEFT','RTGS']).optional(),payoutAccountLabel:z.string().max(120).optional()}).strict(),logo:z.string().max(8_000_000).nullable().optional()}).strict();
    const input=schema.parse(body);
    if(input.logo){
      if(!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(input.logo))throw new BadRequestException('Use a PNG or JPEG logo up to 5 MB.');
      const raw=Buffer.from(input.logo.split(',')[1],'base64');
      const png=raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const jpg=raw[0]===255&&raw[1]===216&&raw[2]===255;
      if(raw.length>5*1024*1024||(!png&&!jpg))throw new BadRequestException('Use a valid PNG or JPEG logo up to 5 MB.');
    }
    return this.db.$transaction(async tx=>{const before=await tx.tenant.findUnique({where:{id:tid}});const after=await tx.tenant.update({where:{id:tid},data:input});await audit(tx,ctx,'COMPANY_UPDATED','company',tid,before,after);return after;});
  }
  private async references(tx:any,ctx:Context,values:any,refs:Record<string,string>){
    for(const [field,model] of Object.entries(refs))if(values[field]){
      if(model==='employee'){await assertEmployee(tx,ctx,values[field]);continue;}
      if(!await tx[model].findFirst({where:{tenantId:tenant(ctx),id:values[field]}}))throw new BadRequestException(`Invalid ${field}.`);
    }
  }
  async employees(ctx:Context,method:string,recordId?:string,body?:unknown,query:any={}){
    const tid=tenant(ctx), action=method==='GET'?'VIEW':method==='POST'?'CREATE':method==='DELETE'?'DELETE':'EDIT';requirePermission(ctx,'employees',action);
    const scope=await employeeScope(this.db,ctx);
    const where:any={tenantId:tid,deletedAt:null,...(scope?{id:{in:scope}}:{})};
    const canSalary=hasPermission(ctx.user.role.permissions,'payroll','VIEW');
    const clean=(row:any)=>{if(canSalary)return row;const{monthlySalary,...rest}=row;const personal=this.object(rest.personal);for(const key of ['bankName','accountHolder','accountNumber','ifsc','bankBranch'])delete personal[key];return {...rest,personal};};
    if(method==='GET'){
      if(recordId){const row=await this.db.employee.findFirst({where:{...where,id:id.parse(recordId),...(scope?{AND:{id:{in:scope}}}:{})}});if(!row)throw new NotFoundException();let designation=row.designation;if(/^[0-9a-f-]{36}$/i.test(designation)){const master=await this.db.designation.findFirst({where:{id:designation,tenantId:tid},select:{name:true}});if(master)designation=master.name;}return clean({...row,designation});}
      if(query.q){const q=String(query.q).trim().slice(0,100),parts=q.split(/\s+/).filter(Boolean);where.OR=[{firstName:{contains:q,mode:'insensitive'}},{lastName:{contains:q,mode:'insensitive'}},{email:{contains:q,mode:'insensitive'}},{employeeCode:{contains:q,mode:'insensitive'}},...(parts.length>1?[{AND:[{firstName:{contains:parts[0],mode:'insensitive'}},{lastName:{contains:parts.slice(1).join(' '),mode:'insensitive'}}]}]:[])];}
      if(query.status)where.status=String(query.status);
      if(query.departmentId)where.departmentId=id.parse(query.departmentId);
      const take=Math.min(500,Math.max(1,Number(query.pageSize)||25)),page=Math.max(1,Number(query.page)||1);
      const [items,total,departments,branches,designations]=await Promise.all([this.db.employee.findMany({where,orderBy:{createdAt:'desc'},take,skip:(page-1)*take}),this.db.employee.count({where}),this.db.department.findMany({where:{tenantId:tid},select:{id:true,name:true}}),this.db.branch.findMany({where:{tenantId:tid},select:{id:true,name:true}}),this.db.designation.findMany({where:{tenantId:tid},select:{id:true,name:true}})]);
      const departmentNames=new Map(departments.map(r=>[r.id,r.name])),branchNames=new Map(branches.map(r=>[r.id,r.name])),designationNames=new Map(designations.map(r=>[r.id,r.name]));
      return {items:items.map(row=>clean({...row,departmentName:row.departmentId?departmentNames.get(row.departmentId)??'':null,branchName:row.branchId?branchNames.get(row.branchId)??'':null,designation:designationNames.get(row.designation)??row.designation})),total,page,pageSize:take};
    }
    if(restrictedRoles.has(ctx.user.role.code))throw new ForbiddenException('Employee records are managed by HR.');
    return this.db.$transaction(async tx=>{
      const before=recordId?await tx.employee.findFirst({where:{...where,id:id.parse(recordId)}}):null;
      if(recordId&&!before)throw new NotFoundException('Employee not found.');
      if(method==='DELETE'){
        const employeeId=before!.id;
        const rawPunchesRetained=await tx.attendancePunch.count({where:{tenantId:tid,employeeId}});
        const linkedUsers=await tx.user.findMany({where:{tenantId:tid,employeeId},select:{id:true}});
        const userIds=linkedUsers.map(u=>u.id);
        await tx.employeeFaceProfile.deleteMany({where:{tenantId:tid,employeeId}});
        await tx.deviceEmployeeMap.deleteMany({where:{tenantId:tid,employeeId}});
        await tx.attendanceDaily.deleteMany({where:{tenantId:tid,employeeId}});
        await tx.leaveRequest.deleteMany({where:{tenantId:tid,employeeId}});
        await tx.goal.deleteMany({where:{tenantId:tid,employeeId}});
        await tx.expenseClaim.deleteMany({where:{tenantId:tid,employeeId}});
        await tx.travelRequest.deleteMany({where:{tenantId:tid,employeeId}});
        await tx.employeeExit.deleteMany({where:{tenantId:tid,employeeId}});
        await tx.document.deleteMany({where:{tenantId:tid,employeeId}});
        await tx.activityEvent.deleteMany({where:{tenantId:tid,employeeId}});
        await tx.asset.updateMany({where:{tenantId:tid,employeeId},data:{employeeId:null,status:'AVAILABLE'}});
        await tx.employee.updateMany({where:{tenantId:tid,managerId:employeeId},data:{managerId:null}});

        if(userIds.length){
          await tx.pushSubscription.deleteMany({where:{userId:{in:userIds}}});
          await tx.passwordReset.deleteMany({where:{userId:{in:userIds}}});
          await tx.notification.deleteMany({where:{tenantId:tid,userId:{in:userIds}}});
          await tx.meghnaConversation.deleteMany({where:{tenantId:tid,userId:{in:userIds}}});
          await tx.session.deleteMany({where:{userId:{in:userIds}}});
          await tx.user.deleteMany({where:{id:{in:userIds},tenantId:tid}});
        }

        await tx.employee.update({where:{id:employeeId},data:{deletedAt:new Date(),status:'INACTIVE',managerId:null}});

        await audit(tx,ctx,'EMPLOYEE_DELETED','employees',employeeId,before,{operationalDataCleared:true,rawPunchesRetained,historicalPayrollRetained:true,linkedUsers:userIds.length});
        return {ok:true,deleted:true,rawPunchesRetained};
      }
      const input=employeeSchema.parse(body);
      if(input.photo){
        if(!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(input.photo))throw new BadRequestException('Use a PNG or JPEG employee photo up to 5 MB.');
        const raw=Buffer.from(input.photo.split(',')[1],'base64');
        const png=raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
        const jpg=raw[0]===255&&raw[1]===216&&raw[2]===255;
        if(raw.length>5*1024*1024||(!png&&!jpg))throw new BadRequestException('Use a valid PNG or JPEG employee photo up to 5 MB.');
      }
      if(before && !(body as any)?.personal)input.personal=before.personal as any;
      if(before && !canSalary && !Object.prototype.hasOwnProperty.call(body??{},"monthlySalary"))input.monthlySalary=before.monthlySalary;
      if(!canSalary&&((before&&input.monthlySalary!==before.monthlySalary)||(!before&&input.monthlySalary>0)))throw new ForbiddenException('Payroll permission is required to set salary.');
      if(!canSalary){const submitted=this.object((body as any)?.personal);if(['bankName','accountHolder','accountNumber','ifsc','bankBranch'].some(k=>Object.prototype.hasOwnProperty.call(submitted,k)))throw new ForbiddenException('Payroll permission is required to edit employee bank details.');}
      await this.references(tx,ctx,input,{departmentId:'department',branchId:'branch',shiftId:'shift',managerId:'employee'});
      if(input.managerId){
        let current:string|null|undefined=input.managerId;const seen=new Set<string>(recordId?[recordId]:[]);
        while(current){if(seen.has(current))throw new BadRequestException('Reporting relationships cannot form a cycle.');seen.add(current);current=(await tx.employee.findFirst({where:{id:current,tenantId:tid},select:{managerId:true}}))?.managerId;}
      }
      if(!before){
        await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tid}::uuid FOR UPDATE`;
        const company=await tx.tenant.findUniqueOrThrow({where:{id:tid}});
        if(await tx.employee.count({where:{tenantId:tid,deletedAt:null}})>=company.employeeLimit)throw new ConflictException('Your plan employee limit has been reached.');
      }
      const after=before?await tx.employee.update({where:{id:before.id},data:input}):await tx.employee.create({data:{tenantId:tid,...input}});
      await audit(tx,ctx,before?'EMPLOYEE_UPDATED':'EMPLOYEE_CREATED','employees',after.id,before,after);
      if(!before){const notice=await tx.notification.create({data:{tenantId:tid,title:'New employee added',message:`${after.firstName} ${after.lastName} (${after.employeeCode}) was added to the workforce. Complete user access, documents and attendance mapping as needed.`}});sendPush(this.db,{tenantId:tid,title:notice.title,body:notice.message,url:'/employees',tag:'tcw-'+notice.id}).catch(()=>{});}
      return clean(after);
    });
  }
  async resource(ctx:Context,type:string,method:string,recordId?:string,body?:unknown,query:any={}){
    const cfg=configs[type];if(!cfg)throw new NotFoundException();const tid=tenant(ctx);
    requirePermission(ctx,cfg.resource,method==='GET'?'VIEW':method==='POST'?'CREATE':method==='DELETE'?'DELETE':'EDIT');
    if(['DELETE','PATCH'].includes(method)&&['expenses','travel','exit'].includes(type))throw new BadRequestException('Use the review workflow for submitted requests.');
    if(restrictedRoles.has(ctx.user.role.code)&&method!=='GET'&&!['expenses','travel'].includes(type))throw new ForbiddenException('This action requires an administrator.');
    const scope=cfg.employeeScoped?await employeeScope(this.db,ctx):null;
    const where:any={tenantId:tid,...(scope?{employeeId:{in:scope}}:{})};
    if(type==='support'&&restrictedRoles.has(ctx.user.role.code))throw new ForbiddenException('Contact your HR administrator for company support tickets.');
    if(recordId)where.id=id.parse(recordId);
    const model=(this.db as any)[cfg.model];
    if(method==='GET'){
      const take=Math.min(500,Math.max(1,Number(query.pageSize)||100)),page=Math.max(1,Number(query.page)||1);
      const [items,total]=await Promise.all([model.findMany({where,orderBy:{createdAt:'desc'},take,skip:(page-1)*take}),model.count({where})]);
      if(type==='devices')return {items:items.map((row:any)=>{const{apiSecretHash,...safe}=row;return safe;}),total,page,pageSize:take};
      return {items,total,page,pageSize:take};
    }
    return this.db.$transaction(async tx=>{
      const table=(tx as any)[cfg.model];const before=recordId?await table.findFirst({where}):null;
      if(recordId&&!before)throw new NotFoundException('Record not found.');
      if(method==='DELETE'){await table.delete({where:{id:recordId}});await audit(tx,ctx,'DELETED',type,recordId,before);return {ok:true};}
      const input=cfg.schema.parse(body) as any;
      await this.references(tx,ctx,input,{...(cfg.employeeScoped?{employeeId:'employee'}:{}),...cfg.references});
      if(ctx.user.role.code==='EMPLOYEE'&&input.employeeId!==ctx.user.employeeId)throw new ForbiddenException();
      if(type==='goals'&&input.progress>input.target)throw new BadRequestException('Progress cannot exceed the target.');
      if(type==='devices'&&!before){
        if(input.connectionMode==='EMPLOYEE_APP'||input.vendor==='TCW_MOBILE'){
          const existingMobile=await tx.attendanceDevice.findFirst({where:{tenantId:tid,connectionMode:'EMPLOYEE_APP'}});
          if(existingMobile)throw new ConflictException('TCW Employee Mobile App attendance is already enabled for this company.');
          const after=await table.create({data:{tenantId:tid,...input,vendor:'TCW_MOBILE',connectionMode:'EMPLOYEE_APP',model:input.model||'TCW Employee Face Scan',host:'',port:443,status:'READY'}});
          await tx.deviceSyncLog.create({data:{tenantId:tid,deviceId:after.id,action:'MOBILE_APP_ENABLED',message:'TCW Employee Mobile App Face Scan attendance enabled.'}});
          const{apiSecretHash:_hash,...safe}=after;await audit(tx,ctx,'CREATED',type,after.id,before,safe);return safe;
        }
        const pushSecret=randomBytes(24).toString('base64url');
        const apiSecretHash=createHash('sha256').update(pushSecret).digest('hex');
        const after=await table.create({data:{tenantId:tid,...input,apiSecretHash,apiSecretHint:pushSecret.slice(-6),status:'AWAITING_CONNECTION'}});
        await tx.deviceSyncLog.create({data:{tenantId:tid,deviceId:after.id,action:'DEVICE_CREATED',message:'Device registered. Cloud push receiver is awaiting its first event.'}});
        const{apiSecretHash:_hash,...safe}=after;await audit(tx,ctx,'CREATED',type,after.id,before,safe);return {...safe,pushSecret,pushPath:'/api/biometric/push',legacyPushPath:'/api/biometric/biomax/push'};
      }
      if(type==='support'&&!before){
        const priorityMinutes:Record<string,number>={URGENT:120,HIGH:480,NORMAL:1440,LOW:2880};
        const ticketNumber=`TCW-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${randomBytes(3).toString('hex').toUpperCase()}`;
        const slaDueAt=new Date(Date.now()+(priorityMinutes[input.priority]??1440)*60000);
        const after=await table.create({data:{tenantId:tid,...input,ticketNumber,slaDueAt}});
        await tx.supportTicketMessage.create({data:{tenantId:tid,ticketId:after.id,authorId:ctx.user.id,authorScope:'TENANT',authorName:ctx.user.name,message:input.message}});
        const notice=await tx.notification.create({data:{tenantId:tid,title:`Support ticket ${ticketNumber} created`,message:`${input.subject} · ${input.priority} priority. TCW Support will update this ticket here.`}});sendPush(this.db,{tenantId:tid,title:notice.title,body:notice.message,url:'/support',tag:'tcw-'+notice.id}).catch(()=>{});
        await audit(tx,ctx,'SUPPORT_TICKET_CREATED','support',after.id,before,after);return after;
      }
      const after=before?await table.update({where:{id:recordId},data:input}):await table.create({data:{tenantId:tid,...input}});
      await audit(tx,ctx,before?'UPDATED':'CREATED',type,after.id,before,after);if(type==='devices'){const{apiSecretHash,...safe}=after;return safe;}return after;
    });
  }
  async supportMessages(ctx:Context,ticketId:string,method:string,body?:unknown){
    const ticketKey=id.parse(ticketId),isPlatform=ctx.user.role.scope==='PLATFORM';
    if(isPlatform){platform(ctx);requirePermission(ctx,'support',method==='GET'?'VIEW':'EDIT');}
    else{requirePermission(ctx,'support',method==='GET'?'VIEW':'CREATE');if(restrictedRoles.has(ctx.user.role.code))throw new ForbiddenException('Contact your HR administrator for company support tickets.');}
    const ticket=await this.db.supportTicket.findFirst({where:{id:ticketKey,...(!isPlatform?{tenantId:tenant(ctx)}:{})}});if(!ticket)throw new NotFoundException('Support ticket not found.');
    if(method==='GET')return {items:await this.db.supportTicketMessage.findMany({where:{ticketId:ticket.id,tenantId:ticket.tenantId,...(!isPlatform?{internal:false}:{})},orderBy:{createdAt:'asc'},take:500})};
    if(method!=='POST')throw new BadRequestException('Unsupported ticket message operation.');
    const input=z.object({message:z.string().trim().min(1).max(5000),internal:z.boolean().optional().default(false)}).strict().parse(body);const internal=isPlatform?input.internal:false;
    return this.db.$transaction(async tx=>{
      const row=await tx.supportTicketMessage.create({data:{tenantId:ticket.tenantId,ticketId:ticket.id,authorId:ctx.user.id,authorScope:isPlatform?'PLATFORM':'TENANT',authorName:ctx.user.name,message:input.message,internal}});
      const after=await tx.supportTicket.update({where:{id:ticket.id},data:{status:!isPlatform&&ticket.status==='RESOLVED'?'OPEN':ticket.status,closedAt:!isPlatform&&ticket.status==='RESOLVED'?null:ticket.closedAt}});
      if(isPlatform&&!internal){const notice=await tx.notification.create({data:{tenantId:ticket.tenantId,title:`Support ticket ${ticket.ticketNumber} replied`,message:input.message.slice(0,300)}});sendPush(this.db,{tenantId:ticket.tenantId,title:notice.title,body:notice.message,url:'/support',tag:'tcw-'+notice.id}).catch(()=>{});}
      await audit(tx,ctx,isPlatform?'TICKET_SUPPORT_REPLY':'TICKET_CUSTOMER_REPLY','support',ticket.id,ticket,after);return row;
    });
  }
  async employeeAppAccess(ctx:Context,employeeId:string,method:string,body?:unknown){
    const tid=tenant(ctx);requirePermission(ctx,'employees',method==='GET'?'VIEW':'EDIT');if(method!=='GET')requirePermission(ctx,'users','MANAGE');
    const employee=await this.db.employee.findFirst({where:{id:id.parse(employeeId),tenantId:tid,deletedAt:null},select:{id:true,employeeCode:true,firstName:true,lastName:true,email:true,phone:true,status:true}});
    if(!employee)throw new NotFoundException('Employee not found.');
    const [existing,faceProfile]=await Promise.all([
      this.db.user.findFirst({where:{tenantId:tid,employeeId:employee.id},include:{role:true}}),
      this.db.employeeFaceProfile.findUnique({where:{tenantId_employeeId:{tenantId:tid,employeeId:employee.id}},select:{enrolledAt:true,templateVersion:true,sampleCount:true}})
    ]);
    const safe=(user:any)=>user?{id:user.id,name:user.name,email:user.email,loginId:user.loginId,active:user.active,mustChangePassword:user.mustChangePassword,role:user.role?.code??'',createdAt:user.createdAt,updatedAt:user.updatedAt}:null;
    const faceEnrollment=faceProfile?{enrolled:true,enrolledAt:faceProfile.enrolledAt,templateVersion:faceProfile.templateVersion,sampleCount:faceProfile.sampleCount}:{enrolled:false};
    if(method==='GET'){const company=await this.db.tenant.findUnique({where:{id:tid},select:{code:true}});return {employee,user:safe(existing),faceEnrollment,companyCode:company?.code??'',employeePortal:'https://employee.techcyberwarrior.in/login'};}
    if(method!=='POST')throw new BadRequestException('Unsupported Employee App access operation.');
    const input=z.object({operation:z.enum(['CREATE','RESET_PASSWORD','SET_ACTIVE','RESET_FACE']),password:password.optional(),active:z.boolean().optional()}).strict().parse(body);
    if(input.operation==='CREATE'&&existing)throw new ConflictException('Employee App access already exists for this employee.');
    if(input.operation!=='CREATE'&&!existing)throw new NotFoundException('Create Employee App access first.');
    const credentialOperation=input.operation==='CREATE'||input.operation==='RESET_PASSWORD';
    const generatedPassword=credentialOperation&&!input.password?temporaryPassword8():null;
    const newPassword=input.password??generatedPassword??undefined;
    const company=await this.db.tenant.findUnique({where:{id:tid},select:{name:true,code:true}});
    const loginUrl='https://employee.techcyberwarrior.in/login';
    return this.db.$transaction(async tx=>{
      let user:any=existing;
      if(input.operation==='RESET_FACE'){
        const beforeFace=await tx.employeeFaceProfile.findUnique({where:{tenantId_employeeId:{tenantId:tid,employeeId:employee.id}},select:{id:true,enrolledAt:true,templateVersion:true,sampleCount:true}});
        await tx.employeeFaceProfile.deleteMany({where:{tenantId:tid,employeeId:employee.id}});
        if(existing)await tx.session.deleteMany({where:{userId:existing.id}});
        await audit(tx,ctx,'EMPLOYEE_FACE_RESET','employees',employee.id,beforeFace??undefined,{employeeCode:employee.employeeCode});
        return {employee,user:safe(existing),faceEnrollment:{enrolled:false},companyCode:company?.code??'',employeePortal:loginUrl};
      }
      if(input.operation==='CREATE'){
        const role=await tx.role.findUnique({where:{code:'EMPLOYEE'}});if(!role||role.scope!=='TENANT')throw new BadRequestException('Employee role is not configured.');
        const duplicateEmail=await tx.user.findFirst({where:{tenantId:tid,email:employee.email.toLowerCase()}});if(duplicateEmail)throw new ConflictException('This employee email is already used by another login account.');
        const loginId=await allocateShortLoginId(tx as unknown as Database,tid);
        user=await tx.user.create({data:{tenantId:tid,name:`${employee.firstName} ${employee.lastName}`.trim(),email:employee.email.toLowerCase(),loginId,roleId:role.id,employeeId:employee.id,active:true,passwordHash:await hashPassword(newPassword!),mustChangePassword:true},include:{role:true}});
        await audit(tx,ctx,'EMPLOYEE_APP_ACCESS_CREATED','users',user.id,undefined,{employeeId:employee.id,employeeCode:employee.employeeCode,email:user.email});
      }else if(input.operation==='RESET_PASSWORD'){
        user=await tx.user.update({where:{id:existing!.id},data:{passwordHash:await hashPassword(newPassword!),mustChangePassword:true,active:true},include:{role:true}});
        await tx.session.deleteMany({where:{userId:user.id}});
        await audit(tx,ctx,'EMPLOYEE_APP_PASSWORD_RESET','users',user.id,existing,{employeeId:employee.id,employeeCode:employee.employeeCode});
      }else{
        if(input.active===undefined)throw new BadRequestException('Choose whether Employee App access should be active.');
        user=await tx.user.update({where:{id:existing!.id},data:{active:input.active},include:{role:true}});
        if(!input.active)await tx.session.deleteMany({where:{userId:user.id}});
        await audit(tx,ctx,input.active?'EMPLOYEE_APP_ACCESS_ENABLED':'EMPLOYEE_APP_ACCESS_DISABLED','users',user.id,existing,{employeeId:employee.id});
      }
      if(newPassword){
        await tx.outbox.create({data:{tenantId:tid,kind:'EMAIL',payload:{to:employee.email,subject:'Your TCW Employee login',tempPassword:newPassword,text:`Your TCW Employee account is ready. Company Code: ${company?.code??''}. Employee ID: ${employee.employeeCode}. Temporary Password: ${newPassword}. Login: ${loginUrl}. You will be asked to change this temporary password after first sign in.`}}});
        if(employee.phone)await tx.outbox.create({data:{tenantId:tid,kind:'SMS',payload:{to:employee.phone,template:'EMPLOYEE_LOGIN',company:company?.name??'Your company',companyCode:company?.code??'',employeeCode:employee.employeeCode,tempPassword:newPassword,loginUrl,text:`TCW Employee login: Company ${company?.code??''}, Employee ID ${employee.employeeCode}, Temp Password ${newPassword}. Login ${loginUrl}.`}}});
      }
      const currentFace=await tx.employeeFaceProfile.findUnique({where:{tenantId_employeeId:{tenantId:tid,employeeId:employee.id}},select:{enrolledAt:true,templateVersion:true,sampleCount:true}});
      return {employee,user:safe(user),faceEnrollment:currentFace?{enrolled:true,enrolledAt:currentFace.enrolledAt,templateVersion:currentFace.templateVersion,sampleCount:currentFace.sampleCount}:{enrolled:false},companyCode:company?.code??'',employeePortal:loginUrl,...(generatedPassword?{temporaryPassword:generatedPassword}:{})};
    });
  }

  async users(ctx:Context,method:string,body?:unknown,recordId?:string){
    const tid=tenant(ctx);requirePermission(ctx,'users',method==='GET'?'VIEW':'MANAGE');
    if(method==='GET')return {items:await this.db.user.findMany({where:{tenantId:tid,role:{code:{notIn:['EMPLOYEE','MANAGER','TEAM_LEADER']}}},select:{id:true,name:true,email:true,loginId:true,active:true,employeeId:true,role:{select:{code:true,name:true}},createdAt:true}})};
    const input=z.object({name:z.string().min(1).max(200),email:z.email().transform(v=>v.toLowerCase()),loginId:z.string().trim().min(3).max(80).regex(/^[A-Za-z0-9._-]+$/).optional(),password:password.optional(),role:z.string(),employeeId:id.nullable().optional(),active:z.boolean().default(true)}).strict().parse(body);
    const role=await this.db.role.findUnique({where:{code:input.role}});
    if(!role||role.scope!=='TENANT')throw new BadRequestException('Invalid company role.');
    if(['EMPLOYEE','MANAGER','TEAM_LEADER'].includes(input.role))throw new BadRequestException('Employee access is managed from People → Employee App Access.');
    if(input.employeeId)throw new BadRequestException('Linked employee accounts are managed from People → Employee App Access.');
    if(recordId===ctx.user.id&&(!input.active||input.role!=='COMPANY_OWNER'))throw new BadRequestException('You cannot remove your own owner access.');
    return this.db.$transaction(async tx=>{
      const before=recordId?await tx.user.findFirst({where:{id:id.parse(recordId),tenantId:tid}}):null;
      if(recordId&&!before)throw new NotFoundException();
      const generatedPassword=!before&&!input.password?temporaryPassword8():null;
      const initialPassword=input.password??generatedPassword??undefined;
      const resolvedLoginId=before?(input.loginId?.toUpperCase()??before.loginId):(input.loginId?.toUpperCase()??await allocateShortLoginId(tx as unknown as Database,tid));
      const data={tenantId:tid,name:input.name,email:input.email,loginId:resolvedLoginId,roleId:role.id,employeeId:input.employeeId,active:input.active,...(initialPassword?{passwordHash:await hashPassword(initialPassword),mustChangePassword:!before}:{})};
      const after=before?await tx.user.update({where:{id:before.id},data}):await tx.user.create({data:{...data,passwordHash:data.passwordHash!}});
      if(before)await tx.session.deleteMany({where:{userId:before.id}});
      if(!before&&initialPassword){
        const company=await tx.tenant.findUnique({where:{id:tid}});
        const employee=input.employeeId?await tx.employee.findFirst({where:{id:input.employeeId,tenantId:tid},select:{phone:true}}):null;
        const loginUrl=new URL('/login',process.env.WEB_URL??'http://localhost:3000').toString();
        await tx.outbox.create({data:{tenantId:tid,kind:'EMAIL',payload:{to:input.email,subject:'Your TCW HR Software login',tempPassword:initialPassword,text:`Your TCW HR Software account is ready. Company Code: ${company?.code??''}. User ID: ${resolvedLoginId}. Temporary Password: ${initialPassword}. Login: ${loginUrl}. You will be asked to change the temporary password after first sign in.`}}});
        if(employee?.phone)await tx.outbox.create({data:{tenantId:tid,kind:'SMS',payload:{to:employee.phone,template:'USER_LOGIN',company:company?.name??'Your company',companyCode:company?.code??'',loginId:resolvedLoginId,tempPassword:initialPassword,loginUrl,text:`TCW HR login: Company ${company?.code??''}, User ${resolvedLoginId}, Temp Password ${initialPassword}. Login ${loginUrl}. Change password after first sign in.`}}});
      }
      await audit(tx,ctx,'USER_UPDATED','users',after.id,before,after);const{passwordHash,...safe}=after;return {...safe,...(!before&&generatedPassword?{temporaryPassword:generatedPassword}:{})};
    });
  }
  async platformResource(ctx:Context,type:string,method:string,recordId?:string,body?:unknown){
    platform(ctx);const resource=type==='companies'||type==='trials'?'tenants':type==='leads'?'sales':type==='invoices'||type==='payments'?'billing':type;
    requirePermission(ctx,resource,method==='GET'?'VIEW':method==='POST'?'CREATE':method==='DELETE'?'DELETE':'EDIT');
    if(type==='trials'){
      if(method==='GET')return this.trialRows();
      if(method==='PATCH'&&recordId){
        const input=z.object({followupStatus:z.enum(['PENDING','CALL_DUE','CONTACTED','NO_ANSWER','FOLLOW_UP','INTERESTED','NOT_INTERESTED']),nextFollowupAt:z.iso.datetime().nullable().optional(),notes:z.string().trim().max(4000).default(''),contactPhone:z.string().trim().max(30).default('')}).strict().parse(body);
        return this.db.$transaction(async tx=>{
          const before=await tx.tenant.findUnique({where:{id:id.parse(recordId)}});if(!before)throw new NotFoundException('Trial company not found.');
          const profile=this.object(before.profile),now=new Date(),nextProfile={...profile,ownerPhone:input.contactPhone||profile.ownerPhone||'',trialFollowupStatus:input.followupStatus,trialFollowupNotes:input.notes,trialNextFollowupAt:input.nextFollowupAt??null,...(['CONTACTED','NO_ANSWER','FOLLOW_UP','INTERESTED','NOT_INTERESTED'].includes(input.followupStatus)?{trialLastContactedAt:now.toISOString()}: {})};
          const after=await tx.tenant.update({where:{id:before.id},data:{profile:nextProfile}});
          const owner=await tx.user.findFirst({where:{tenantId:before.id},include:{role:true},orderBy:{createdAt:'asc'}});
          const lead=await tx.lead.findFirst({where:{OR:[{notes:{contains:before.code}},{company:before.name,...(owner?.email?{email:owner.email}:{})}]},orderBy:{createdAt:'desc'}});
          if(lead){const stage=input.followupStatus==='NOT_INTERESTED'?'LOST':input.followupStatus==='INTERESTED'?'NEGOTIATION':input.followupStatus==='CONTACTED'||input.followupStatus==='NO_ANSWER'||input.followupStatus==='FOLLOW_UP'?'CONTACTED':lead.stage;const stamp=`[${now.toISOString().slice(0,10)} ${input.followupStatus}]`;const note=input.notes?`${lead.notes}${lead.notes?'\n':''}${stamp} ${input.notes}`:lead.notes;await tx.lead.update({where:{id:lead.id},data:{phone:input.contactPhone||lead.phone,stage,nextFollowup:input.nextFollowupAt?new Date(input.nextFollowupAt):null,notes:note.slice(0,4000)}});}
          await audit(tx,ctx,'TRIAL_FOLLOWUP_UPDATED','trials',before.id,before,after);return after;
        });
      }
      throw new NotFoundException();
    }
    const modelMap:Record<string,string>={companies:'tenant',plans:'plan',leads:'lead',invoices:'invoice',payments:'payment',support:'supportTicket'};
    const model=modelMap[type];if(!model)throw new NotFoundException();
    if(method==='GET'){
      if(type==='companies'||type==='invoices')await syncCompanyAccess(this.db);
      const items=await(this.db as any)[model].findMany({orderBy:{createdAt:'desc'},take:500});
      if(type==='support'){
        const tenantIds:string[]=[...new Set<string>(items.map((r:any)=>String(r.tenantId)).filter(Boolean))];
        const companies=tenantIds.length?await this.db.tenant.findMany({where:{id:{in:tenantIds}},select:{id:true,name:true,code:true}}):[];
        const byId=new Map(companies.map(c=>[c.id,c]));
        return {items:items.map((r:any)=>({...r,company:byId.get(r.tenantId)??null}))};
      }
      if(type==='payments'){
        const tenants=await this.db.tenant.findMany({select:{id:true,name:true,profile:true}});
        const pending=tenants.flatMap((t:any)=>{const proof=(t.profile as any)?.pendingPaymentProof;if(!proof||proof.status!=='AWAITING_VERIFICATION')return [];return [{id:'pending-'+t.id,tenantId:t.id,tenantName:t.name,invoiceId:proof.invoiceId,amount:Number(proof.amount??0),reference:String(proof.utr??''),date:proof.submittedAt,status:'AWAITING_VERIFICATION',pendingProof:true}]});
        return {items:[...pending,...items]};
      }
      if(type!=='companies')return {items};
      const invoices=await this.db.invoice.findMany({select:{tenantId:true,total:true,paidAmount:true,status:true,dueDate:true}});
      return {items:items.map((company:any)=>{const billing=invoices.filter(i=>i.tenantId===company.id);return {...company,outstandingBalance:billing.reduce((sum,i)=>sum+Math.max(0,i.total-i.paidAmount),0),overdueInvoices:billing.filter(i=>i.status==='OVERDUE').length,suspensionReason:(company.profile as any)?.suspensionReason??null};})};
    }
    if(type==='companies'&&method==='POST'){
      const input=tenantSchema.parse(body);
      const slug=input.name.toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,12)||'COMPANY';
      let code='';
      for(let i=0;i<20;i++){const candidate=`TCW-${slug}-${String(Math.floor(Math.random()*10000)).padStart(4,'0')}`;if(!await this.db.tenant.findUnique({where:{code:candidate}})){code=candidate;break;}}
      if(!code)throw new ConflictException('Unable to generate a unique company code. Try again.');
      const tempPassword=temporaryPassword8();
      const passwordHash=await hashPassword(tempPassword);
      const trialDays=Math.max(1,Math.min(30,Number(process.env.TRIAL_DAYS??3)||3));
      const trialEndsAt=new Date(Date.now()+trialDays*86400000);
      return this.db.$transaction(async tx=>{
        const company=await tx.tenant.create({data:{name:input.name,code,plan:input.plan,employeeLimit:input.employeeLimit,status:'TRIAL',expiresAt:trialEndsAt,profile:{trialDays,trialStartedAt:new Date().toISOString(),trialOriginalEndsAt:trialEndsAt.toISOString(),trialFollowupStatus:'PENDING',trialNextFollowupAt:trialEndsAt.toISOString(),signupSource:'ADMIN_CREATED',ownerPhone:input.ownerPhone}}});
        const loginId=await allocateShortLoginId(tx as unknown as Database,company.id);
        const role=await tx.role.findUniqueOrThrow({where:{code:'COMPANY_OWNER'}});
        await tx.user.create({data:{tenantId:company.id,name:input.ownerName,email:input.ownerEmail,loginId,passwordHash,roleId:role.id,mustChangePassword:true}});
        await tx.lead.create({data:{company:input.name,contactName:input.ownerName,email:input.ownerEmail,phone:input.ownerPhone,stage:'DEMO',value:0,nextFollowup:trialEndsAt,notes:`Admin-created ${trialDays}-day trial · ${code}`}});
        await tx.leaveType.createMany({data:[{tenantId:company.id,name:'Annual leave',annualDays:12},{tenantId:company.id,name:'Sick leave',annualDays:6},{tenantId:company.id,name:'Casual leave',annualDays:6}]});
        await tx.notification.create({data:{tenantId:company.id,title:'Welcome to TCW HR Software',message:`Your ${trialDays}-day trial is active until ${trialEndsAt.toISOString().slice(0,10)}.`}});
        const loginUrl=new URL('/login',process.env.WEB_URL??'http://localhost:3000').toString();
        await tx.outbox.create({data:{tenantId:company.id,kind:'EMAIL',payload:{to:input.ownerEmail,subject:'Your TCW HR Software trial login',tempPassword:tempPassword,text:`Company Code: ${code}. User ID: ${loginId}. Temporary Password: ${tempPassword}. Login: ${loginUrl}. Change the temporary password after first sign in.`}}});
        if(input.ownerPhone)await tx.outbox.create({data:{tenantId:company.id,kind:'SMS',payload:{to:input.ownerPhone,template:'TRIAL_LOGIN',company:input.name,companyCode:code,loginId,tempPassword,loginUrl,text:`TCW HR trial: Company ${code}, User ${loginId}, Temp Password ${tempPassword}. Login ${loginUrl}. Change password after first sign in.`}}});
        await audit(tx,ctx,'COMPANY_CREATED','tenants',company.id,undefined,company);
        return {company,credentials:{companyCode:code,loginId,email:input.ownerEmail,tempPassword,trialEndsAt}};
      });
    }
    if(type==='companies'&&recordId&&method==='DELETE'){
      return this.db.$transaction(async tx=>{const before=await tx.tenant.findUnique({where:{id:id.parse(recordId)}});if(!before)throw new NotFoundException();const profile=before.profile&&typeof before.profile==='object'&&!Array.isArray(before.profile)?{...(before.profile as any)}:{};const after=await tx.tenant.update({where:{id:recordId},data:{status:'ARCHIVED',profile:{...profile,suspensionReason:'ARCHIVED',archivedAt:new Date().toISOString()}}});await tx.session.deleteMany({where:{tenantId:recordId}});await audit(tx,ctx,'COMPANY_ARCHIVED','tenants',recordId,before,after);return {ok:true,company:after};});
    }
    if(type==='companies'&&recordId){
      const input=z.object({status:z.enum(['TRIAL','ACTIVE','SUSPENDED','EXPIRED']),plan:z.enum(['STARTER','GROWTH','ENTERPRISE']),employeeLimit:z.number().int().min(1).max(100000),expiresAt:date.nullable()}).strict().parse(body);
      return this.db.$transaction(async tx=>{const before=await tx.tenant.findUnique({where:{id:id.parse(recordId)}});if(!before)throw new NotFoundException();const profile=before.profile&&typeof before.profile==='object'&&!Array.isArray(before.profile)?{...(before.profile as any)}:{};delete profile.billingSuspendedAt;delete profile.billingPreviousStatus;profile.suspensionReason=input.status==='SUSPENDED'?'MANUAL':undefined;const cleanProfile=Object.fromEntries(Object.entries(profile).filter(([,v])=>v!==undefined)) as Prisma.InputJsonObject;const after=await tx.tenant.update({where:{id:recordId},data:{...input,profile:cleanProfile}});if(!['ACTIVE','TRIAL'].includes(after.status))await tx.session.deleteMany({where:{tenantId:recordId}});await audit(tx,ctx,'SUBSCRIPTION_CHANGED','tenants',recordId,before,after);return after;});
    }
    if(type==='leads'||type==='plans'){
      const input=(type==='leads'?leadSchema:planSchema).parse(body);
      return this.db.$transaction(async tx=>{const table=(tx as any)[model];const before=recordId?await table.findUnique({where:{id:id.parse(recordId)}}):null;if(recordId&&!before)throw new NotFoundException();const after=recordId?await table.update({where:{id:recordId},data:input}):await table.create({data:input});await audit(tx,ctx,'UPDATED',type,after.id,before,after);return after;});
    }
    if(type==='invoices'&&method==='POST'){
      const input=z.object({tenantId:id,number:z.string().min(1).max(100),amount:z.number().int().min(1).max(1e9),tax:z.number().int().min(0).max(1e9),dueDate:date}).strict().parse(body);
      if(!await this.db.tenant.findUnique({where:{id:input.tenantId}}))throw new BadRequestException('Company not found.');
      return this.db.$transaction(async tx=>{const after=await tx.invoice.create({data:{...input,total:input.amount+input.tax}});await audit(tx,ctx,'INVOICE_CREATED','invoices',after.id,undefined,after);return after;});
    }
    if(type==='invoices'&&recordId&&method==='DELETE'){
      return this.db.$transaction(async tx=>{
        const invoice=await tx.invoice.findUnique({where:{id:id.parse(recordId)}});
        if(!invoice)throw new NotFoundException('Invoice not found.');
        const paymentCount=await tx.payment.count({where:{invoiceId:invoice.id}});
        if(invoice.paidAmount>0||paymentCount>0)throw new BadRequestException('Invoices with recorded payments cannot be deleted.');
        await tx.invoice.delete({where:{id:invoice.id}});
        await audit(tx,ctx,'INVOICE_DELETED','invoices',invoice.id,invoice,undefined);
        return {ok:true};
      });
    }
    if(type==='payments'&&method==='POST'){
      const input=z.object({invoiceId:id,amount:z.number().int().min(1).max(1e9),reference:z.string().min(1).max(100),date}).strict().parse(body);
      const after=await this.db.$transaction(async tx=>{
        await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${input.invoiceId}::uuid FOR UPDATE`;
        const invoice=await tx.invoice.findUnique({where:{id:input.invoiceId}});if(!invoice)throw new NotFoundException();
        if(input.amount>invoice.total-invoice.paidAmount)throw new BadRequestException('Payment exceeds the outstanding balance.');
        const payment=await tx.payment.create({data:{...input,tenantId:invoice.tenantId}});
        const paidAmount=invoice.paidAmount+input.amount;
        const overdue=paidAmount<invoice.total&&invoice.dueDate<new Date(new Date().toISOString().slice(0,10)+'T00:00:00.000Z');
        await tx.invoice.update({where:{id:invoice.id},data:{paidAmount,status:paidAmount===invoice.total?'PAID':overdue?'OVERDUE':'PART_PAID'}});
        if(paidAmount===invoice.total){
          const company=await tx.tenant.findUnique({where:{id:invoice.tenantId}});
          if(company){const nextExpiry=new Date();nextExpiry.setUTCDate(nextExpiry.getUTCDate()+30);const profile=this.object(company.profile);delete profile.pendingPaymentProof;delete profile.suspensionReason;await tx.tenant.update({where:{id:company.id},data:{status:'ACTIVE',expiresAt:nextExpiry,profile}});}
        }
        await audit(tx,ctx,'PAYMENT_RECORDED','payments',payment.id,undefined,payment);return payment;
      });
      await syncCompanyAccess(this.db,after.tenantId);return after;
    }
    if(type==='support'&&recordId){const input=z.object({status:z.enum(['OPEN','IN_PROGRESS','RESOLVED']),response:z.string().max(5000),assignedTo:z.string().max(120).optional().nullable()}).strict().parse(body);return this.db.$transaction(async tx=>{const before=await tx.supportTicket.findUniqueOrThrow({where:{id:id.parse(recordId)}});const after=await tx.supportTicket.update({where:{id:recordId},data:{...input,closedAt:input.status==='RESOLVED'?new Date():null}});if(input.response.trim())await tx.supportTicketMessage.create({data:{tenantId:after.tenantId,ticketId:after.id,authorId:ctx.user.id,authorScope:'PLATFORM',authorName:input.assignedTo?.trim()||ctx.user.name,message:input.response.trim()}});await tx.notification.create({data:{tenantId:after.tenantId,title:`Support ticket ${after.ticketNumber} updated`,message:`Status: ${after.status}. ${after.response?after.response.slice(0,300):'TCW Support updated your request.'}`}});await audit(tx,ctx,'TICKET_UPDATED','support',recordId,before,after);return after;});}
    throw new BadRequestException('Unsupported operation.');
  }
}
