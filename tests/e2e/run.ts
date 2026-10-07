import {spawn,type ChildProcess} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {createApp} from '../../apps/api/src/app';
import {hashPassword} from '../../packages/auth';
import {seed} from '../../prisma/seed';
import {embeddedDatabase} from '../helpers/database';

// No external database or live portal is used by this runner.
async function run(){
 Object.assign(process.env,{NODE_ENV:'test',REPORTS_MAINTENANCE:'false',APP_ORIGINS:'http://localhost:3000,http://localhost:3001',COOKIE_SECURE:'false',
  ADMIN_EMAIL:'platform@example.test',OWNER_EMAIL:'owner@example.test',ADMIN_PASSWORD:randomBytes(24).toString('hex'),
  OWNER_PASSWORD:randomBytes(24).toString('hex'),CONFIG_ENCRYPTION_KEY:randomBytes(32).toString('hex'),DEMO_COMPANY_CODE:'E2E-ONLY',PEOPLEOS_E2E_ISOLATED:'true'});
 const fixture=await embeddedDatabase();
 const children:ChildProcess[]=[];
 let api:Awaited<ReturnType<typeof createApp>>|undefined;
 try{
  await seed(fixture.db,{adminEmail:process.env.ADMIN_EMAIL!,adminPassword:process.env.ADMIN_PASSWORD!,ownerEmail:process.env.OWNER_EMAIL!,ownerPassword:process.env.OWNER_PASSWORD!,companyCode:process.env.DEMO_COMPANY_CODE,demo:false});
  await fixture.db.user.updateMany({data:{mustChangePassword:false}});
  const tenant=await fixture.db.tenant.findUniqueOrThrow({where:{code:'E2E-ONLY'}});
  await fixture.db.branch.create({data:{tenantId:tenant.id,name:'E2E Office',code:'E2E'}});
  const department=await fixture.db.department.create({data:{tenantId:tenant.id,name:'E2E Engineering',code:'E2E'}});
  const leader=await fixture.db.employee.create({data:{tenantId:tenant.id,employeeCode:'CHART-LEAD',firstName:'Team',lastName:'Lead',email:'lead@example.test',joiningDate:new Date('2025-01-01'),departmentId:department.id}});
  await fixture.db.employee.create({data:{tenantId:tenant.id,employeeCode:'CHART-MEMBER',firstName:'QA',lastName:'Member',email:'member@example.test',joiningDate:new Date('2025-01-01'),managerId:leader.id,departmentId:department.id}});
  for(const [name,code] of [['QA Engineer','QA'],['Senior QA','SQA']])await fixture.db.designation.create({data:{tenantId:tenant.id,name,code}});
  await fixture.db.course.create({data:{tenantId:tenant.id,title:'E2E Operations Training',description:'Synthetic training fixture',trainer:'QA Trainer',date:new Date('2026-01-01'),capacity:3}});
  await fixture.db.asset.create({data:{tenantId:tenant.id,name:'E2E Operations Laptop',assetTag:'OPS-LAPTOP',category:'Laptop'}});
  process.env.E2E_EMPLOYEE_PASSWORD=randomBytes(24).toString('hex');
  const employeeRole=await fixture.db.role.findFirstOrThrow({where:{code:'EMPLOYEE'}});
  await fixture.db.user.create({data:{tenantId:tenant.id,employeeId:leader.id,roleId:employeeRole.id,name:'Phone Employee',email:'phone-employee@example.test',passwordHash:await hashPassword(process.env.E2E_EMPLOYEE_PASSWORD),active:true,mustChangePassword:false}});
  api=await createApp(fixture.db);await api.app.listen(4000,'127.0.0.1');
  for(const [index,name] of ['web','super-admin'].entries()){
   const child=spawn(process.execPath,['../../node_modules/next/dist/bin/next','start','-p',String(3000+index),'-H','127.0.0.1'],{cwd:'apps/'+name,stdio:'inherit',env:{...process.env,NODE_ENV:'production',API_INTERNAL_URL:'http://127.0.0.1:4000'}});
   children.push(child);
   const deadline=Date.now()+60000;
   let ready=false;
   while(Date.now()<deadline){
    if(child.exitCode!==null||child.signalCode!==null)throw new Error(name+' exited before startup');
    try{if((await fetch(`http://localhost:${3000+index}/login`,{signal:AbortSignal.timeout(2000)})).ok){ready=true;break}}catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
   }
   if(!ready)throw new Error(name+' did not become ready');
  }
  const browser=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test'],{stdio:'inherit',env:process.env});
  children.push(browser);
  const [code]=await once(browser,'exit');
  if(code!==0)throw new Error('Browser verification failed');
 }finally{
  for(const child of children){
   if(child.exitCode!==null||child.signalCode!==null)continue;
   const stopped=once(child,'exit');child.kill('SIGTERM');
   const timer=setTimeout(()=>child.kill('SIGKILL'),5000);timer.unref();
   await stopped;clearTimeout(timer);
  }
  if(api){api.io.close();await api.app.close()}
  await fixture.close();
 }
}
run().catch(error=>{console.error(error);process.exitCode=1});
