import 'dotenv/config';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {embeddedDatabase} from '../tests/helpers/database';
import {hashPassword} from '../packages/auth';
import {roleDefinitions} from '../packages/permissions';
import {seed} from '../prisma/seed';

const preferredAdminEmail='admin@tcwhr.local';
const adminPassword='TCWAdmin@2026!';
const preferredOwnerEmail='owner@tcwhr.local';
const ownerPassword='TCWOwner@2026!';
const companyCode='TCW-DEMO';

function setEnv(name:string,value:string){
  const path='.env';
  if(!existsSync(path))throw new Error('.env is missing. Run npm run setup first.');
  let text=readFileSync(path,'utf8');
  const line=`${name}=${value}`;
  const re=new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}=.*$`,'m');
  text=re.test(text)?text.replace(re,line):`${text.replace(/\s*$/,'')}\n${line}\n`;
  writeFileSync(path,text,{encoding:'utf8',mode:0o600});
}

async function main(){
  if(process.env.NODE_ENV==='production')throw new Error('login:fix-local refuses to run with NODE_ENV=production.');
  if(!existsSync('.env'))throw new Error('.env is missing. Run npm run setup first.');
  // PGlite needs the parent directory to exist on a fresh local-test checkout.
  mkdirSync('.local-data',{recursive:true});

  const {db,close}=await embeddedDatabase('.local-data/preview-db');
  let admin:any,owner:any;
  try{
    const fresh=(await db.user.count())===0;
    if(fresh){
      await seed(db,{adminEmail:preferredAdminEmail,adminPassword,ownerEmail:preferredOwnerEmail,ownerPassword,companyCode,demo:true});
    }else{
      for(const role of roleDefinitions)await db.role.upsert({where:{code:role.code},create:role,update:role});
      const adminRole=await db.role.findUniqueOrThrow({where:{code:'SUPER_ADMIN'}});
      const ownerRole=await db.role.findUniqueOrThrow({where:{code:'COMPANY_OWNER'}});
      const company=await db.tenant.upsert({where:{code:companyCode},create:{name:'TCW Local Workspace',code:companyCode,status:'ACTIVE',plan:'GROWTH',employeeLimit:100,currency:'INR',timezone:'Asia/Kolkata',profile:{localQa:true}},update:{status:'ACTIVE',expiresAt:null}});

      // Prefer the established login ID so older local databases are repaired in-place.
      // Avoid rewriting email when that could collide with another historical QA row.
      admin=await db.user.findFirst({where:{tenantId:null,loginId:'TCW-ADMIN'},orderBy:{updatedAt:'desc'}})
        ??await db.user.findFirst({where:{tenantId:null,roleId:adminRole.id},orderBy:{updatedAt:'desc'}});
      if(admin)admin=await db.user.update({where:{id:admin.id},data:{loginId:'TCW-ADMIN',passwordHash:await hashPassword(adminPassword),roleId:adminRole.id,active:true,mustChangePassword:false}});
      else admin=await db.user.create({data:{name:'Platform Administrator',email:preferredAdminEmail,loginId:'TCW-ADMIN',passwordHash:await hashPassword(adminPassword),roleId:adminRole.id,active:true,mustChangePassword:false}});

      owner=await db.user.findFirst({where:{tenantId:company.id,loginId:`${companyCode}-ADMIN`},orderBy:{updatedAt:'desc'}})
        ??await db.user.findFirst({where:{tenantId:company.id,roleId:ownerRole.id},orderBy:{updatedAt:'desc'}});
      if(owner)owner=await db.user.update({where:{id:owner.id},data:{loginId:`${companyCode}-ADMIN`,passwordHash:await hashPassword(ownerPassword),roleId:ownerRole.id,active:true,mustChangePassword:false}});
      else owner=await db.user.create({data:{tenantId:company.id,name:'Workspace Owner',email:preferredOwnerEmail,loginId:`${companyCode}-ADMIN`,passwordHash:await hashPassword(ownerPassword),roleId:ownerRole.id,active:true,mustChangePassword:false}});
    }

    if(!admin)admin=await db.user.findFirstOrThrow({where:{tenantId:null,loginId:'TCW-ADMIN'},orderBy:{updatedAt:'desc'}});
    const company=await db.tenant.findUniqueOrThrow({where:{code:companyCode}});
    if(!owner)owner=await db.user.findFirstOrThrow({where:{tenantId:company.id,loginId:`${companyCode}-ADMIN`},orderBy:{updatedAt:'desc'}});

    // IMPORTANT: seed() intentionally marks brand-new accounts for a mandatory first-password
    // change. That is correct for production provisioning, but it made a fresh local:test login
    // bounce into the password-change screen and invalidate the just-created session. Local QA
    // accounts must always be immediately usable with the documented fixed test credentials.
    admin=await db.user.update({where:{id:admin.id},data:{loginId:'TCW-ADMIN',passwordHash:await hashPassword(adminPassword),roleId:(await db.role.findUniqueOrThrow({where:{code:'SUPER_ADMIN'}})).id,active:true,mustChangePassword:false}});
    owner=await db.user.update({where:{id:owner.id},data:{loginId:`${companyCode}-ADMIN`,passwordHash:await hashPassword(ownerPassword),roleId:(await db.role.findUniqueOrThrow({where:{code:'COMPANY_OWNER'}})).id,active:true,mustChangePassword:false}});

    await db.session.deleteMany({});
    await db.loginAttempt.deleteMany({});
    await db.tenant.update({where:{id:company.id},data:{status:'ACTIVE',expiresAt:null}});

    // Keep .env aligned with the exact rows that were repaired.
    setEnv('ADMIN_EMAIL',admin.email);
    setEnv('ADMIN_PASSWORD',adminPassword);
    setEnv('OWNER_EMAIL',owner.email);
    setEnv('OWNER_PASSWORD',ownerPassword);
    setEnv('DEMO_COMPANY_CODE',companyCode);
    setEnv('COOKIE_SECURE','false');
    setEnv('LOCAL_TEST_MODE','true');

    console.log('\nLOCAL LOGIN REPAIR COMPLETE');
    console.log('===========================');
    console.log('Super Admin URL : http://localhost:3001/login');
    console.log('Super Admin ID  : TCW-ADMIN');
    console.log(`Super Admin Mail: ${admin.email}`);
    console.log(`Super Admin Pass: ${adminPassword}`);
    console.log('');
    console.log('HR URL           : http://localhost:3000/login');
    console.log(`Company Code     : ${companyCode}`);
    console.log(`HR Login ID      : ${companyCode}-ADMIN`);
    console.log(`HR Email         : ${owner.email}`);
    console.log(`HR Password      : ${ownerPassword}`);
    console.log('===========================');
    console.log('These credentials are LOCAL TEST credentials only. Do not use them for production.\n');
  }finally{await close();}
}

main().catch(e=>{console.error('\nLocal login repair failed:',e?.message??e);console.error('Stop npm run demo before running this command, then try again.\n');process.exit(1)});
