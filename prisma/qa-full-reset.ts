import type {PrismaClient} from '@prisma/client';
import {hashPassword} from '../packages/auth';
import {localDate,zonedMinute} from '../packages/attendance-engine';
import {attendanceMonthSummary,reconcileAttendanceMonth} from '../apps/api/src/attendance-automation';
import {finalizePayrollMonth,preparePayrollMonth} from '../apps/api/src/payroll-service';

export type FullQaResetOptions={
  qaEmail:string;
  qaPassword:string;
  qaCode?:string;
  now?:Date;
  runKey?:string;
  confirmation:string;
};

const money=(rupees:number)=>Math.round(rupees*100);
const dateOnly=(value:string)=>new Date(value+'T00:00:00.000Z');
const addDays=(date:Date,days:number)=>new Date(date.getTime()+days*86400000);
function previousMonth(now:Date,timezone:string){
  const current=localDate(now,timezone).slice(0,7);
  let year=Number(current.slice(0,4)),month=Number(current.slice(5,7))-1;
  if(month===0){month=12;year--;}
  return `${year}-${String(month).padStart(2,'0')}`;
}
function workdays(month:string){
  const year=Number(month.slice(0,4)),mon=Number(month.slice(5,7));
  const count=new Date(Date.UTC(year,mon,0)).getUTCDate();
  const days:string[]=[];
  for(let day=1;day<=count;day++){
    const key=`${month}-${String(day).padStart(2,'0')}`;
    const dow=dateOnly(key).getUTCDay();
    if(dow>=1&&dow<=5)days.push(key);
  }
  return days;
}

async function archiveBusinessData(db:PrismaClient,now:Date){
  const tenants=await db.tenant.findMany({orderBy:{createdAt:'asc'}});
  let archived=0;
  for(const tenant of tenants){
    const profile=tenant.profile&&typeof tenant.profile==='object'&&!Array.isArray(tenant.profile)?tenant.profile as Record<string,any>:{};
    if(tenant.status==='ARCHIVED'&&profile.qaResetArchived===true)continue;
    const users=await db.user.findMany({where:{tenantId:tenant.id},select:{id:true}});
    const employees=await db.employee.findMany({where:{tenantId:tenant.id},select:{id:true}});
    await db.$transaction(async tx=>{
      await tx.session.deleteMany({where:{tenantId:tenant.id}});
      await tx.pushSubscription.deleteMany({where:{tenantId:tenant.id}});
      await tx.passwordReset.deleteMany({where:{tenantId:tenant.id}});
      await tx.outbox.deleteMany({where:{tenantId:tenant.id,sentAt:null}});
      await tx.deviceEmployeeMap.updateMany({where:{tenantId:tenant.id},data:{active:false}});
      await tx.attendanceDevice.updateMany({where:{tenantId:tenant.id},data:{status:'OFFLINE',apiSecretHash:null,apiSecretHint:null,lastError:'Archived by full QA reset'}});
      for(let index=0;index<users.length;index++){
        const user=users[index];
        await tx.user.update({where:{id:user.id},data:{name:`Archived User ${index+1}`,email:`archived-user-${user.id}@example.invalid`,loginId:`ARCH-${user.id.slice(0,8).toUpperCase()}`,active:false,mustChangePassword:true,avatar:null}});
      }
      await tx.employee.updateMany({where:{tenantId:tenant.id},data:{managerId:null}});
      for(let index=0;index<employees.length;index++){
        const employee=employees[index];
        await tx.employee.update({where:{id:employee.id},data:{employeeCode:`ARCH-${employee.id.slice(0,8).toUpperCase()}`,firstName:'Archived',lastName:`Employee ${index+1}`,email:`archived-employee-${employee.id}@example.invalid`,phone:'',photo:'',designation:'',status:'INACTIVE',monthlySalary:0,personal:{},deletedAt:now}});
      }
      await tx.tenant.update({where:{id:tenant.id},data:{
        name:`Archived workspace ${tenant.id.slice(0,8)}`,
        code:`ARCH-${tenant.id.slice(0,8).toUpperCase()}`,
        status:'ARCHIVED',expiresAt:now,logo:null,
        profile:{qaResetArchived:true,archivedAt:now.toISOString(),suspensionReason:'ARCHIVED_QA_RESET'}
      }});
      await tx.auditLog.create({data:{tenantId:tenant.id,action:'QA_RESET_ARCHIVED',entity:'tenants',entityId:tenant.id,after:{archivedAt:now.toISOString(),reason:'FULL_QA_RESET'}}});
    },{timeout:60000});
    archived++;
  }
  await db.lead.deleteMany({});
  await db.loginAttempt.deleteMany({});
  return archived;
}

export async function resetAndSeedFullQa(db:PrismaClient,options:FullQaResetOptions){
  if(options.confirmation!=='DELETE_AND_REBUILD_TCW_QA')throw new Error('Full QA reset confirmation is missing.');
  if(!options.qaEmail||!options.qaPassword)throw new Error('QA owner credentials are required for the full QA reset.');
  if(options.qaPassword.length<12)throw new Error('QA owner password must be at least 12 characters.');

  const now=options.now??new Date(),timezone='Asia/Kolkata',qaCode=(options.qaCode??'TCW-QA').trim().toUpperCase();
  const runKey=options.runKey??String(process.env.RAILWAY_DEPLOYMENT_ID??process.env.RAILWAY_GIT_COMMIT_SHA??now.toISOString());
  const markerKey='qa-full-reset-last-run';
  const marker=await db.platformSetting.findUnique({where:{key:markerKey}});
  const markerValue=marker?.value&&typeof marker.value==='object'&&!Array.isArray(marker.value)?marker.value as any:{};
  if(String(markerValue.runKey??'')===runKey)return {skipped:true,runKey,month:String(markerValue.month??'')};

  const archivedTenants=await archiveBusinessData(db,now);

  const ownerRole=await db.role.findUniqueOrThrow({where:{code:'COMPANY_OWNER'}});
  const employeeRole=await db.role.findUniqueOrThrow({where:{code:'EMPLOYEE'}});
  const hrRole=await db.role.findUniqueOrThrow({where:{code:'HR_ADMIN'}});
  const payrollRole=await db.role.findUniqueOrThrow({where:{code:'PAYROLL_MANAGER'}});
  const month=previousMonth(now,timezone),days=workdays(month);
  if(days.length<18)throw new Error('QA month does not contain enough working days.');

  const tenant=await db.tenant.create({data:{
    name:'TCW HR Software',code:qaCode,status:'ACTIVE',plan:'GROWTH',employeeLimit:100,
    expiresAt:addDays(now,90),currency:'INR',timezone,
    profile:{legalName:'TCW HR Software',industry:'Technology',website:'https://hr.techcyberwarrior.in',email:options.qaEmail.toLowerCase(),phone:'+91 9000000000',address:'QA workspace',city:'Ahmedabad',state:'Gujarat',country:'India',postalCode:'380001',companyType:'Private Limited',contactPerson:'QA Administrator',contactDesignation:'HR Manager',supportEmail:options.qaEmail.toLowerCase(),billingEmail:options.qaEmail.toLowerCase(),primaryColor:'#3474ef',footer:'© TCW HR Software',payoutProvider:'RAZORPAYX',payoutMode:'IMPS',payoutAccountLabel:'QA simulated salary account'}
  }});
  const owner=await db.user.create({data:{tenantId:tenant.id,name:'QA Workspace Owner',email:options.qaEmail.toLowerCase(),loginId:'TCWQA01',passwordHash:await hashPassword(options.qaPassword),roleId:ownerRole.id,active:true,mustChangePassword:false}});

  const branch=await db.branch.create({data:{tenantId:tenant.id,name:'Ahmedabad HQ',code:'AMD-HQ',description:'Primary QA office',location:'Prahlad Nagar',addressLine:'Corporate Road',city:'Ahmedabad',state:'Gujarat',pincode:'380015'}});
  const departments:Record<string,string>={};
  for(const [name,code] of [['People & Culture','HR'],['Engineering','ENG'],['Sales','SALES'],['Product','PRODUCT'],['Finance','FINANCE']] as const){
    const row=await db.department.create({data:{tenantId:tenant.id,name,code,description:'QA organization master'}});departments[code]=row.id;
  }
  for(const [name,code] of [['HR Manager','HR-MGR'],['Senior Engineer','SR-ENG'],['Sales Executive','SALES-EXE'],['QA Engineer','QA-ENG'],['Product Manager','PM'],['HR Executive','HR-EXE'],['Payroll Manager','PAY-MGR'],['UX Designer','UX']] as const)await db.designation.create({data:{tenantId:tenant.id,name,code,description:'QA designation'}});
  await db.team.createMany({data:[{tenantId:tenant.id,name:'People Operations',code:'PEOPLE',description:'QA team'},{tenantId:tenant.id,name:'Product Delivery',code:'DELIVERY',description:'QA team'}]});
  await db.location.create({data:{tenantId:tenant.id,name:'Ahmedabad Office',code:'AMD',description:'Ahmedabad HQ'}});
  await db.costCenter.createMany({data:[{tenantId:tenant.id,name:'People',code:'CC-HR',description:'HR cost center'},{tenantId:tenant.id,name:'Technology',code:'CC-TECH',description:'Technology cost center'}]});
  const shift=await db.shift.create({data:{tenantId:tenant.id,name:'General 9 to 6',startMinute:540,endMinute:1080,graceMinutes:10,earlyOutGraceMinutes:10,workingDays:'1,2,3,4,5',breakMinutes:60,fullDayMinutes:480,halfDayMinutes:240,overtimeAfterMinutes:480,timezone}});
  const leaveTypes:Record<string,string>={};
  for(const row of [{name:'Annual leave',annualDays:18,paid:true},{name:'Sick leave',annualDays:8,paid:true},{name:'Unpaid leave',annualDays:30,paid:false}]){
    const created=await db.leaveType.create({data:{tenantId:tenant.id,...row}});leaveTypes[row.name]=created.id;
  }

  const people=[
    {code:'QA001',first:'Riya',last:'Mehta',designation:'HR Manager',department:'HR',salary:85000},
    {code:'QA002',first:'Aarav',last:'Shah',designation:'Senior Engineer',department:'ENG',salary:95000},
    {code:'QA003',first:'Mira',last:'Patel',designation:'Sales Executive',department:'SALES',salary:70000},
    {code:'QA004',first:'Kabir',last:'Rao',designation:'QA Engineer',department:'ENG',salary:65000},
    {code:'QA005',first:'Ananya',last:'Joshi',designation:'Product Manager',department:'PRODUCT',salary:110000},
    {code:'QA006',first:'Diya',last:'Nair',designation:'HR Executive',department:'HR',salary:60000},
    {code:'QA007',first:'Vivaan',last:'Kapoor',designation:'Payroll Manager',department:'FINANCE',salary:80000},
    {code:'QA008',first:'Sara',last:'Khan',designation:'UX Designer',department:'PRODUCT',salary:72000}
  ];
  const employees:any[]=[];
  for(let i=0;i<people.length;i++){
    const p=people[i],email=i===0?options.qaEmail.toLowerCase():`${p.first.toLowerCase()}.${p.last.toLowerCase()}.qa@example.test`;
    employees.push(await db.employee.create({data:{tenantId:tenant.id,employeeCode:p.code,firstName:p.first,lastName:p.last,email,phone:`+9190000000${String(i+10).slice(-2)}`,departmentId:departments[p.department],branchId:branch.id,shiftId:shift.id,designation:p.designation,employmentType:'FULL_TIME',joiningDate:dateOnly('2025-04-01'),status:'ACTIVE',monthlySalary:money(p.salary),personal:{gender:i%2?'MALE':'FEMALE',city:'Ahmedabad',state:'Gujarat',nationality:'Indian',emergencyContact:'QA Emergency Contact',emergencyPhone:'+919000009999',pan:`QAAPN${String(i+1).padStart(4,'0')}A`,bankName:'QA Bank',accountHolder:`${p.first} ${p.last}`,accountNumber:`QA000000${String(i+1).padStart(4,'0')}`,ifsc:'HDFC0000001',bankBranch:'Ahmedabad'}}}));
  }
  await db.employee.updateMany({where:{tenantId:tenant.id,id:{in:employees.slice(1).map(e=>e.id)}},data:{managerId:employees[0].id}});
  await db.user.update({where:{id:owner.id},data:{employeeId:employees[0].id}});

  const qaUsers=[
    {employee:employees[1],roleId:employeeRole.id,loginId:'QA002'},
    {employee:employees[2],roleId:employeeRole.id,loginId:'QA003'},
    {employee:employees[3],roleId:employeeRole.id,loginId:'QA004'},
    {employee:employees[5],roleId:hrRole.id,loginId:'TCWQA-HR'},
    {employee:employees[6],roleId:payrollRole.id,loginId:'TCWQA-PAY'}
  ];
  const userByEmployee=new Map<string,string>();
  userByEmployee.set(employees[0].id,owner.id);
  for(const item of qaUsers){
    const user=await db.user.create({data:{tenantId:tenant.id,name:`${item.employee.firstName} ${item.employee.lastName}`,email:item.employee.email.toLowerCase(),loginId:item.loginId,passwordHash:await hashPassword(options.qaPassword),roleId:item.roleId,employeeId:item.employee.id,active:true,mustChangePassword:false}});
    userByEmployee.set(item.employee.id,user.id);
  }

  const mobileDevice=await db.attendanceDevice.create({data:{tenantId:tenant.id,name:'TCW Employee Mobile App',vendor:'TCW_MOBILE',model:'TCW Employee Face Scan',serialNumber:'TCW-EMPLOYEE-APP',branchId:branch.id,host:'',port:443,timezone,connectionMode:'EMPLOYEE_APP',status:'ONLINE',lastSeenAt:now,lastSync:now}});
  await db.deviceSyncLog.create({data:{tenantId:tenant.id,deviceId:mobileDevice.id,action:'QA_MONTH_CREATED',message:`Full QA attendance month ${month} generated.`}});
  await db.deviceEmployeeMap.createMany({data:employees.map(e=>({tenantId:tenant.id,deviceId:mobileDevice.id,employeeId:e.id,deviceUserId:e.employeeCode,active:true,lastSyncedAt:now}))});

  const holidayDay=days[4],paidLeaveDay=days[8],unpaidLeaveDay=days[11],halfLeaveDay=days[14],absenceDay=days[17],lateDay=days[6],overtimeDay=days[9];
  await db.calendarEvent.createMany({data:[
    {tenantId:tenant.id,title:'QA Company Holiday',date:dateOnly(holidayDay),kind:'HOLIDAY',description:'Synthetic holiday used for payroll verification.'},
    {tenantId:tenant.id,title:'Monthly HR review',date:dateOnly(days[18]),kind:'HR_EVENT',description:'QA monthly HR review.'},
    {tenantId:tenant.id,title:'Payroll finalization',date:dateOnly(days.at(-1)!),kind:'PAYROLL',description:'QA payroll milestone.'}
  ]});
  await db.leaveRequest.createMany({data:[
    {tenantId:tenant.id,employeeId:employees[1].id,leaveTypeId:leaveTypes['Annual leave'],startDate:dateOnly(paidLeaveDay),endDate:dateOnly(paidLeaveDay),days:1,reason:'Approved annual leave',status:'APPROVED',reviewerId:owner.id,reviewNote:'Approved in QA HR cycle'},
    {tenantId:tenant.id,employeeId:employees[2].id,leaveTypeId:leaveTypes['Unpaid leave'],startDate:dateOnly(unpaidLeaveDay),endDate:dateOnly(unpaidLeaveDay),days:1,reason:'Personal unpaid leave',status:'APPROVED',reviewerId:owner.id,reviewNote:'Approved in QA HR cycle'},
    {tenantId:tenant.id,employeeId:employees[3].id,leaveTypeId:leaveTypes['Sick leave'],startDate:dateOnly(halfLeaveDay),endDate:dateOnly(halfLeaveDay),days:0.5,reason:'Half-day medical leave',status:'APPROVED',reviewerId:owner.id,reviewNote:'Approved in QA HR cycle'}
  ]});

  const punchRows:any[]=[];
  for(let index=0;index<employees.length;index++){
    const employee=employees[index];
    for(const day of days){
      if(day===holidayDay)continue;
      if(employee.id===employees[1].id&&day===paidLeaveDay)continue;
      if(employee.id===employees[2].id&&day===unpaidLeaveDay)continue;
      if(employee.id===employees[4].id&&day===absenceDay)continue;
      let start=540,end=1080;
      if(employee.id===employees[3].id&&day===halfLeaveDay)end=810;
      if(employee.id===employees[1].id&&day===lateDay)start=565;
      if(employee.id===employees[2].id&&day===overtimeDay)end=1200;
      const first=zonedMinute(day,start,timezone),last=zonedMinute(day,end,timezone);
      punchRows.push({tenantId:tenant.id,employeeId:employee.id,deviceId:mobileDevice.id,sourceId:`qa-${month}-${employee.employeeCode}-${day}-IN`,punchTime:first,punchType:'IN',verificationType:'QA_SIMULATION',rawPayload:{qa:true,month},processedAt:now});
      punchRows.push({tenantId:tenant.id,employeeId:employee.id,deviceId:mobileDevice.id,sourceId:`qa-${month}-${employee.employeeCode}-${day}-OUT`,punchTime:last,punchType:'OUT',verificationType:'QA_SIMULATION',rawPayload:{qa:true,month},processedAt:now});
    }
  }
  await db.attendancePunch.createMany({data:punchRows});
  await reconcileAttendanceMonth(db,tenant.id,month);
  const attendance=await attendanceMonthSummary(db,tenant.id,month);
  if(attendance.totals.missingPunchDays!==0)throw new Error(`QA attendance still has ${attendance.totals.missingPunchDays} missing punch day(s).`);

  await db.salaryRule.createMany({data:[
    {tenantId:tenant.id,name:'Provident fund QA',kind:'DEDUCTION',percent:5,cap:money(1800),active:true},
    {tenantId:tenant.id,name:'Professional tax QA',kind:'DEDUCTION',percent:2,cap:money(200),active:true}
  ]});
  const prepared=await preparePayrollMonth(db,tenant.id,month,owner.id);
  const finalized=await finalizePayrollMonth(db,tenant.id,prepared.id,owner.id);
  await db.payrollPayout.createMany({data:(finalized.items??[]).filter(i=>i.net>0).map((item,index)=>({tenantId:tenant.id,runId:finalized.id,employeeId:item.employeeId,employeeName:item.employeeName,employeeCode:item.employeeCode,amount:item.net,provider:'QA_SIMULATION',mode:'IMPS',status:'PAID',providerRef:`qa-payout-${month}-${index+1}`,utr:`QAUTR${month.replace('-','')}${String(index+1).padStart(3,'0')}`,reference:`SAL-${month}-${item.employeeCode}`,details:{qa:true,simulated:true},initiatedBy:owner.id}))});
  const linkedUsers=await db.user.findMany({where:{tenantId:tenant.id,employeeId:{in:(finalized.items??[]).map(i=>i.employeeId)},active:true},select:{id:true,employeeId:true}});
  if(linkedUsers.length)await db.notification.createMany({data:linkedUsers.map(user=>({tenantId:tenant.id,userId:user.id,title:`Payslip ready for ${month}`,message:'Your QA payroll is finalized and marked paid for end-to-end verification.'}))});

  const invoice=await db.invoice.create({data:{tenantId:tenant.id,number:`QA-${month.replace('-','')}-SUB-100`,amount:8475,tax:1525,total:10000,paidAmount:10000,status:'PAID',dueDate:dateOnly(days.at(-1)!)}});
  await db.payment.create({data:{tenantId:tenant.id,invoiceId:invoice.id,amount:10000,reference:`QA-SUBSCRIPTION-${month.replace('-','')}`,date:dateOnly(days.at(-1)!)}});
  await db.auditLog.create({data:{tenantId:tenant.id,actorId:owner.id,action:'QA_FULL_MONTH_CREATED',entity:'workspace',entityId:tenant.id,after:{month,employees:employees.length,invoiceTotal:10000,payrollRunId:finalized.id}}});

  const job=await db.job.create({data:{tenantId:tenant.id,title:'Senior Backend Engineer',departmentId:departments.ENG,location:'Ahmedabad / Hybrid',openings:2,employmentType:'FULL_TIME',description:'QA recruitment opening',status:'OPEN'}});
  await db.candidate.createMany({data:[
    {tenantId:tenant.id,name:'Neel Joshi',email:'neel.joshi.qa@example.test',phone:'+919100000001',jobId:job.id,stage:'INTERVIEW',notes:'Technical round scheduled',interviewAt:addDays(now,2)},
    {tenantId:tenant.id,name:'Priya Desai',email:'priya.desai.qa@example.test',phone:'+919100000002',jobId:job.id,stage:'OFFER',notes:'QA offer workflow'}
  ]});
  await db.goal.createMany({data:[
    {tenantId:tenant.id,employeeId:employees[1].id,title:'Improve API reliability',target:100,progress:82,dueDate:addDays(now,30),status:'ACTIVE'},
    {tenantId:tenant.id,employeeId:employees[2].id,title:'Close quarterly pipeline target',target:100,progress:70,dueDate:addDays(now,30),status:'ACTIVE'}
  ]});
  await db.course.create({data:{tenantId:tenant.id,title:'Data privacy & payroll handling',description:'QA compliance training',trainer:'People Team',date:addDays(now,7),capacity:20,status:'SCHEDULED'}});
  await db.asset.createMany({data:[
    {tenantId:tenant.id,name:'Engineering Laptop',assetTag:'QA-LT-001',category:'Laptop',employeeId:employees[1].id,status:'ASSIGNED',purchaseDate:dateOnly('2026-01-15'),value:money(85000)},
    {tenantId:tenant.id,name:'QA Test Phone',assetTag:'QA-MOB-001',category:'Mobile',status:'AVAILABLE',purchaseDate:dateOnly('2026-02-10'),value:money(25000)}
  ]});
  await db.expenseClaim.createMany({data:[
    {tenantId:tenant.id,employeeId:employees[2].id,title:'Client travel reimbursement',category:'Travel',amount:money(2400),date:dateOnly(days[10]),status:'APPROVED',notes:'QA approved expense',reviewedBy:owner.id},
    {tenantId:tenant.id,employeeId:employees[1].id,title:'Team lunch',category:'Meals',amount:money(1200),date:dateOnly(days[13]),status:'PENDING',notes:'QA pending expense'}
  ]});
  await db.travelRequest.create({data:{tenantId:tenant.id,employeeId:employees[2].id,destination:'Mumbai',purpose:'Client review meeting',startDate:addDays(now,10),endDate:addDays(now,12),budget:money(18000),status:'APPROVED',reviewedBy:owner.id}});
  await db.employeeExit.create({data:{tenantId:tenant.id,employeeId:employees[7].id,lastWorkingDate:addDays(now,45),reason:'QA offboarding workflow',status:'REQUESTED',assetCleared:false,payrollCleared:false}});
  await db.activityEvent.createMany({data:employees.slice(0,5).map((employee,index)=>({tenantId:tenant.id,employeeId:employee.id,status:index%2?'WORKING':'ONLINE',source:'PORTAL',eventTime:new Date(now.getTime()-index*30000),sourceId:`qa-activity-${runKey}-${employee.employeeCode}`,app:index%2?'TCW HR':'Browser'}))});
  await db.productivityRule.createMany({data:[{tenantId:tenant.id,pattern:'github.com',category:'PRODUCTIVE'},{tenantId:tenant.id,pattern:'youtube.com',category:'NEUTRAL'}]});
  const ticket=await db.supportTicket.create({data:{tenantId:tenant.id,ticketNumber:`QA-${month.replace('-','')}-001`,subject:'Verify monthly HR QA cycle',message:'Synthetic support ticket for the full system test.',category:'GENERAL',priority:'NORMAL',status:'IN_PROGRESS',response:'QA support response recorded.'}});
  await db.supportTicketMessage.createMany({data:[
    {tenantId:tenant.id,ticketId:ticket.id,authorId:owner.id,authorScope:'TENANT',authorName:'QA Workspace Owner',message:'Please verify the full-month workflow.',internal:false},
    {tenantId:tenant.id,ticketId:ticket.id,authorScope:'PLATFORM',authorName:'TCW Support',message:'QA workflow verification is in progress.',internal:false}
  ]});
  await db.notification.create({data:{tenantId:tenant.id,title:'Full QA month ready',message:`${month} contains employees, attendance, leave, payroll, paid salary history, recruitment, expenses, travel, assets and subscription payment data.`}});
  await db.lead.createMany({data:[
    {company:'QA Northstar Pvt Ltd',contactName:'Demo Contact',email:'northstar.qa@example.test',phone:'+919200000001',stage:'DEMO',value:money(25000),notes:'Synthetic platform sales lead'},
    {company:'QA Orbit Systems',contactName:'Demo Contact',email:'orbit.qa@example.test',phone:'+919200000002',stage:'NEGOTIATION',value:money(54000),notes:'Synthetic platform sales lead'}
  ]});

  const counts={
    employees:await db.employee.count({where:{tenantId:tenant.id,deletedAt:null}}),
    users:await db.user.count({where:{tenantId:tenant.id}}),
    attendanceDays:await db.attendanceDaily.count({where:{tenantId:tenant.id}}),
    punches:await db.attendancePunch.count({where:{tenantId:tenant.id}}),
    leaveRequests:await db.leaveRequest.count({where:{tenantId:tenant.id}}),
    payrollItems:await db.payrollItem.count({where:{tenantId:tenant.id,runId:finalized.id}}),
    payrollPayouts:await db.payrollPayout.count({where:{tenantId:tenant.id,runId:finalized.id}}),
    invoices:await db.invoice.count({where:{tenantId:tenant.id}}),
    payments:await db.payment.count({where:{tenantId:tenant.id}})
  };
  await db.platformSetting.upsert({where:{key:markerKey},create:{key:markerKey,value:{runKey,month,tenantId:tenant.id,at:now.toISOString(),counts}},update:{value:{runKey,month,tenantId:tenant.id,at:now.toISOString(),counts}}});
  return {skipped:false,runKey,month,tenantId:tenant.id,companyCode:tenant.code,payrollRunId:finalized.id,archivedTenants,counts,attendanceTotals:attendance.totals};
}
