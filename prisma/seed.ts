import 'dotenv/config';
import type {PrismaClient} from '@prisma/client';
import {db} from '../packages/database';
import {hashPassword} from '../packages/auth';
import {roleDefinitions} from '../packages/permissions';
import {zonedMinute,localDate} from '../packages/attendance-engine';
export async function seed(database:PrismaClient,options:{adminEmail:string;adminPassword:string;ownerEmail?:string;ownerPassword?:string;demo?:boolean;companyCode?:string}){
  if(options.adminPassword.length<12||options.adminPassword.includes('GENERATE_'))throw new Error('Set a random ADMIN_PASSWORD of at least 12 characters.');
  for(const role of roleDefinitions)await database.role.upsert({where:{code:role.code},create:role,update:role});
  const adminRole=await database.role.findUniqueOrThrow({where:{code:'SUPER_ADMIN'}});
  if(!await database.user.findFirst({where:{tenantId:null,email:options.adminEmail.toLowerCase()}}))await database.user.create({data:{name:'Platform Administrator',email:options.adminEmail.toLowerCase(),loginId:'TCW-ADMIN',passwordHash:await hashPassword(options.adminPassword),roleId:adminRole.id,mustChangePassword:true}});
  for(const plan of [{name:'STARTER',monthlyPrice:249900,employeeLimit:25,deviceLimit:1,features:['Core HR','Attendance','Leave']},{name:'GROWTH',monthlyPrice:749900,employeeLimit:100,deviceLimit:5,features:['Core HR','Attendance','Leave','Payroll','Recruitment']},{name:'ENTERPRISE',monthlyPrice:1999900,employeeLimit:1000,deviceLimit:25,features:['All modules','Priority support']}])await database.plan.upsert({where:{name:plan.name},create:plan,update:{}});
  if(!options.ownerEmail||!options.ownerPassword)return;
  if(options.ownerPassword.length<12||options.ownerPassword.includes('GENERATE_'))throw new Error('Set a random OWNER_PASSWORD of at least 12 characters.');
  const tenant=await database.tenant.upsert({where:{code:options.companyCode??'TCW-DEMO'},create:{name:'TCW Demo Workspace',code:options.companyCode??'TCW-DEMO',status:'ACTIVE',plan:'GROWTH',employeeLimit:100,currency:'INR',timezone:'Asia/Kolkata',profile:{legalName:'Fictional demonstration company',industry:'Technology',city:'Ahmedabad',country:'India',primaryColor:'#3474ef',footer:'© TCW HR Software'}},update:{}});
  const ownerRole=await database.role.findUniqueOrThrow({where:{code:'COMPANY_OWNER'}});
  if(!await database.user.findFirst({where:{tenantId:tenant.id,email:options.ownerEmail.toLowerCase()}}))await database.user.create({data:{tenantId:tenant.id,name:'Workspace Owner',email:options.ownerEmail.toLowerCase(),loginId:`${tenant.code}-ADMIN`,passwordHash:await hashPassword(options.ownerPassword),roleId:ownerRole.id,mustChangePassword:true}});
  if(!await database.shift.count({where:{tenantId:tenant.id}}))await database.shift.create({data:{tenantId:tenant.id,name:'General shift',startMinute:540,endMinute:1080,graceMinutes:10,breakMinutes:60,fullDayMinutes:480,halfDayMinutes:240,overtimeAfterMinutes:480}});
  for(const t of [{name:'Annual leave',annualDays:18,paid:true},{name:'Sick leave',annualDays:8,paid:true},{name:'Unpaid leave',annualDays:30,paid:false}])await database.leaveType.upsert({where:{tenantId_name:{tenantId:tenant.id,name:t.name}},create:{tenantId:tenant.id,...t},update:{}});
  if(!options.demo||await database.employee.count({where:{tenantId:tenant.id}}))return;
  const departments=[];
  for(const [name,code] of [['Engineering','ENG'],['Product & Design','PD'],['Sales & Marketing','SM'],['People & Culture','HR']])departments.push(await database.department.create({data:{tenantId:tenant.id,name,code,description:'Fictional sample department'}}));
  const branch=await database.branch.create({data:{tenantId:tenant.id,name:'Ahmedabad HQ',code:'AMD',description:'Fictional demo office'}});
  const people=[['Aarav','Shah','Senior Engineer'],['Mira','Patel','Product Designer'],['Ishaan','Desai','Account Executive'],['Riya','Mehta','People Partner'],['Kabir','Rao','Software Engineer'],['Ananya','Joshi','Product Manager'],['Arjun','Singh','Growth Marketer'],['Diya','Nair','HR Executive'],['Vivaan','Kapoor','QA Engineer'],['Sara','Khan','UX Researcher'],['Aditya','Verma','Sales Manager'],['Nisha','Iyer','Recruiter']];
  const employees=[];
  for(let i=0;i<people.length;i++){
    const [firstName,lastName,designation]=people[i];
    employees.push(await database.employee.create({data:{tenantId:tenant.id,employeeCode:`TCW-${String(i+1).padStart(3,'0')}`,firstName,lastName,designation,email:`${firstName.toLowerCase()}@example.test`,departmentId:departments[i%4].id,branchId:branch.id,joiningDate:new Date(i<10?'2025-04-01':new Date().toISOString().slice(0,7)+'-01'),monthlySalary:(50000+i*3500)*100,status:i>=10?'PROBATION':'ACTIVE'}}));
  }
  const owner=await database.user.findFirstOrThrow({where:{tenantId:tenant.id,email:options.ownerEmail.toLowerCase()}});await database.user.update({where:{id:owner.id},data:{employeeId:employees[3].id}});
  for(let offset=0;offset<7;offset++){
    const day=localDate(new Date(Date.now()-offset*86400000),'Asia/Kolkata');
    for(let i=0;i<employees.length-2;i++){
      const firstIn=zonedMinute(day,540+(i===1?22:0),'Asia/Kolkata'),lastOut=zonedMinute(day,1080,'Asia/Kolkata');
      if(lastOut>new Date())continue;
      await database.attendanceDaily.create({data:{tenantId:tenant.id,employeeId:employees[i].id,date:new Date(day),firstIn,lastOut,workMinutes:480,lateMinutes:i===1?12:0,status:'PRESENT'}});
      for(const [type,time] of [['IN',firstIn],['OUT',lastOut]] as const)await database.attendancePunch.create({data:{tenantId:tenant.id,employeeId:employees[i].id,sourceId:`demo-${day}-${i}-${type}`,punchTime:time,punchType:type,verificationType:'DEMO',rawPayload:{sample:true},processedAt:new Date()}});
    }
  }
  const tomorrow=new Date();tomorrow.setUTCDate(tomorrow.getUTCDate()+3);
  const leaveType=await database.leaveType.findUniqueOrThrow({where:{tenantId_name:{tenantId:tenant.id,name:'Annual leave'}}});
  await database.leaveRequest.create({data:{tenantId:tenant.id,employeeId:employees[0].id,leaveTypeId:leaveType.id,startDate:tomorrow,endDate:tomorrow,days:1,reason:'Fictional demo request',status:'PENDING'}});
  await database.calendarEvent.create({data:{tenantId:tenant.id,title:'Team learning session',date:tomorrow,kind:'TRAINING',description:'Fictional demonstration event'}});
  const job=await database.job.create({data:{tenantId:tenant.id,title:'Senior Frontend Engineer',location:'Ahmedabad / Hybrid',description:'Sample position for demonstration.',openings:2,departmentId:departments[0].id}});
  for(const [name,stage] of [['Dev Patel','APPLIED'],['Priya Shah','INTERVIEW'],['Neel Joshi','SCREENING']])await database.candidate.create({data:{tenantId:tenant.id,name,email:name.toLowerCase().replace(' ','.')+'@example.test',jobId:job.id,stage,notes:'Fictional sample candidate'}});
  await database.asset.create({data:{tenantId:tenant.id,name:'Development laptop',assetTag:'DEMO-LT-001',category:'Laptop',status:'ASSIGNED',employeeId:employees[0].id,value:8500000}});
  await database.goal.create({data:{tenantId:tenant.id,employeeId:employees[0].id,title:'Complete onboarding improvements',target:100,progress:65,dueDate:tomorrow}});
  await database.course.create({data:{tenantId:tenant.id,title:'Data privacy essentials',trainer:'People team',date:tomorrow,capacity:20}});
  await database.expenseClaim.create({data:{tenantId:tenant.id,employeeId:employees[0].id,title:'Client workshop travel',category:'Travel',amount:240000,date:new Date(),notes:'Fictional demonstration claim'}});
  for(const [company,stage,value] of [['Northstar Studio','DEMO',2500000],['Orbit Labs','LEAD',1800000],['Bluebird Systems','NEGOTIATION',5400000]] as const)await database.lead.create({data:{company,stage,value,contactName:'Demo Contact',email:company.toLowerCase().replace(' ','')+'@example.test',notes:'Fictional sample lead'}});
  await database.auditLog.create({data:{tenantId:tenant.id,action:'DEMO_DATA_CREATED',entity:'workspace',after:{sample:true}}});
}
if(require.main===module){
  (async()=>{
    await seed(db,{adminEmail:process.env.ADMIN_EMAIL??'',adminPassword:process.env.ADMIN_PASSWORD??'',ownerEmail:process.env.OWNER_EMAIL,ownerPassword:process.env.OWNER_PASSWORD,companyCode:process.env.DEMO_COMPANY_CODE,demo:process.env.SEED_DEMO==='true'});
    if(process.env.QA_BOOTSTRAP==='true'){
      const qaEmail=process.env.QA_OWNER_EMAIL?.trim(),qaPassword=process.env.QA_OWNER_PASSWORD?.trim(),qaCode=(process.env.QA_COMPANY_CODE??'TCW-QA').trim().toUpperCase();
      if(!qaEmail||!qaPassword)throw new Error('QA_BOOTSTRAP requires QA_OWNER_EMAIL and QA_OWNER_PASSWORD.');
      await seed(db,{adminEmail:process.env.ADMIN_EMAIL??'',adminPassword:process.env.ADMIN_PASSWORD??'',ownerEmail:qaEmail,ownerPassword:qaPassword,companyCode:qaCode,demo:true});
      const tenant=await db.tenant.findUniqueOrThrow({where:{code:qaCode}});
      const user=await db.user.findFirstOrThrow({where:{tenantId:tenant.id,email:qaEmail.toLowerCase()}});
      const preferredQaLoginId='TCWQA01';
      const loginIdConflict=await db.user.findFirst({where:{tenantId:tenant.id,loginId:preferredQaLoginId,NOT:{id:user.id}},select:{id:true}});
      const updatedQaUser=await db.user.update({where:{id:user.id},data:{...(loginIdConflict?{}:{loginId:preferredQaLoginId}),mustChangePassword:false},select:{loginId:true}});
      await db.tenant.update({where:{id:tenant.id},data:{name:'TCW QA Workspace',profile:{...((tenant.profile as any)??{}),legalName:'TCW QA Workspace',industry:'Technology',website:'https://hr.techcyberwarrior.in',email:qaEmail,phone:'+91 9000000000',address:'QA workspace',city:'Ahmedabad',state:'Gujarat',country:'India',postalCode:'380001',companyType:'Private Limited',contactPerson:'QA Administrator',contactDesignation:'HR Manager',supportEmail:qaEmail,billingEmail:qaEmail,primaryColor:'#3474ef',footer:'© TCW HR Software · QA workspace'}}});
      console.log('QA workspace ready:',qaCode,`loginId=${updatedQaUser.loginId}`);
    }
    console.log('Bootstrap complete. Existing passwords were preserved.');
  })().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
}
