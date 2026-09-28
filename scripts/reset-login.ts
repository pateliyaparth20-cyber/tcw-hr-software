import 'dotenv/config';
import {embeddedDatabase} from '../tests/helpers/database';
import {hashPassword} from '../packages/auth';
import {seed} from '../prisma/seed';

async function main(){
 const adminEmail=(process.env.ADMIN_EMAIL??'').toLowerCase();
 const adminPassword=process.env.ADMIN_PASSWORD??'';
 const ownerEmail=(process.env.OWNER_EMAIL??'').toLowerCase();
 const ownerPassword=process.env.OWNER_PASSWORD??'';
 const companyCode=process.env.DEMO_COMPANY_CODE??'TCW-DEMO';
 if(!adminEmail||adminPassword.length<12||!ownerEmail||ownerPassword.length<12)throw new Error('ADMIN/OWNER credentials are missing or too short in .env');
 const {db,close}=await embeddedDatabase('.local-data/preview-db');
 try{
  await seed(db,{adminEmail,adminPassword,ownerEmail,ownerPassword,companyCode,demo:true});
  const adminRole=await db.role.findUniqueOrThrow({where:{code:'SUPER_ADMIN'}});
  const ownerRole=await db.role.findUniqueOrThrow({where:{code:'COMPANY_OWNER'}});
  const company=await db.tenant.findUniqueOrThrow({where:{code:companyCode}});
  const admin=await db.user.findFirstOrThrow({where:{tenantId:null,roleId:adminRole.id}});
  const owner=await db.user.findFirstOrThrow({where:{tenantId:company.id,roleId:ownerRole.id}});
  await db.$transaction([
   db.user.update({where:{id:admin.id},data:{email:adminEmail,loginId:'TCW-ADMIN',passwordHash:await hashPassword(adminPassword),active:true,mustChangePassword:false}}),
   db.user.update({where:{id:owner.id},data:{email:ownerEmail,loginId:`${companyCode}-ADMIN`,passwordHash:await hashPassword(ownerPassword),active:true,mustChangePassword:false}}),
   db.tenant.update({where:{id:company.id},data:{status:'ACTIVE',expiresAt:null}}),
   db.session.deleteMany({where:{userId:{in:[admin.id,owner.id]}}}),
   db.loginAttempt.deleteMany({})
  ]);
  console.log('TCW HR local login reset successful.');
  console.log('');
  console.log('SUPER ADMIN');
  console.log('URL: http://localhost:3001/login');
  console.log(`Email: ${adminEmail}`);
  console.log('Login ID: TCW-ADMIN');
  console.log(`Password: ${adminPassword}`);
  console.log('');
  console.log('HR / COMPANY OWNER');
  console.log('URL: http://localhost:3000/login');
  console.log(`Company Code: ${companyCode}`);
  console.log(`Email: ${ownerEmail}`);
  console.log(`Login ID: ${companyCode}-ADMIN`);
  console.log(`Password: ${ownerPassword}`);
  console.log('');
  console.log('These credentials are for this local QA database only. Change them before any public deployment.');
 }finally{await close()}
}
main().catch(e=>{console.error(e);process.exit(1)});
