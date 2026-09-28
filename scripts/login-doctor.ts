import 'dotenv/config';
import {embeddedDatabase} from '../tests/helpers/database';
import {verifyPassword} from '../packages/auth';

async function main(){
  if(process.env.NODE_ENV==='production')throw new Error('login:doctor is intended for local QA only.');
  const {db,close}=await embeddedDatabase('.local-data/preview-db');
  try{
    const adminInput=(process.env.ADMIN_EMAIL??'').toLowerCase();
    const ownerInput=(process.env.OWNER_EMAIL??'').toLowerCase();
    const companyCode=process.env.DEMO_COMPANY_CODE??'TCW-DEMO';
    const company=await db.tenant.findUnique({where:{code:companyCode}});
    const admins=await db.user.findMany({where:{tenantId:null,OR:[{email:adminInput},{loginId:'TCW-ADMIN'}]},include:{role:true}});
    const owners=company?await db.user.findMany({where:{tenantId:company.id,OR:[{email:ownerInput},{loginId:`${companyCode}-ADMIN`}]},include:{role:true}}):[];
    const adminMatches=[] as string[];for(const u of admins)if(await verifyPassword(process.env.ADMIN_PASSWORD??'',u.passwordHash))adminMatches.push(u.id);
    const ownerMatches=[] as string[];for(const u of owners)if(await verifyPassword(process.env.OWNER_PASSWORD??'',u.passwordHash))ownerMatches.push(u.id);
    console.log('\nTCW LOCAL LOGIN DOCTOR');
    console.log('======================');
    console.log(`COOKIE_SECURE       : ${process.env.COOKIE_SECURE??'(unset)'} ${process.env.COOKIE_SECURE==='true'?'[WARN for local HTTP]':'[OK]'}`);
    console.log(`Admin candidates    : ${admins.length}`);
    const adminReady=admins.some(u=>adminMatches.includes(u.id)&&u.active&&!u.mustChangePassword&&u.role.scope==='PLATFORM');
    console.log(`Admin password match: ${adminMatches.length} ${adminMatches.length?'[PASS]':'[FAIL]'}`);
    console.log(`Admin dashboard ready: ${adminReady?'YES [PASS]':'NO [FAIL]'}`);
    console.log(`Company ${companyCode}    : ${company?company.status+' [FOUND]':'[MISSING]'}`);
    console.log(`Owner candidates    : ${owners.length}`);
    const ownerReady=owners.some(u=>ownerMatches.includes(u.id)&&u.active&&!u.mustChangePassword&&u.role.scope==='TENANT');
    console.log(`Owner password match: ${ownerMatches.length} ${ownerMatches.length?'[PASS]':'[FAIL]'}`);
    console.log(`Owner dashboard ready: ${ownerReady?'YES [PASS]':'NO [FAIL]'}`);
    console.log(`Active sessions     : ${await db.session.count()}`);
    console.log(`Login attempt rows  : ${await db.loginAttempt.count()}`);
    console.log('======================\n');
    if(!adminMatches.length||!adminReady||!company||!ownerMatches.length||!ownerReady||process.env.COOKIE_SECURE==='true'){
      console.log('Run: npm run login:fix-local');
      process.exitCode=2;
    }else console.log('Credential database checks PASS. Start with: npm run demo\n');
  }finally{await close();}
}
main().catch(e=>{console.error(e?.message??e);process.exit(1)});
