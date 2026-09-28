import 'dotenv/config';
import {mkdir} from 'node:fs/promises';
import {networkInterfaces} from 'node:os';
import {embeddedDatabase} from '../tests/helpers/database';
import {seed} from '../prisma/seed';
import {createApp} from '../apps/api/src/app';
import {syncCompanyAccess} from '../apps/api/src/billing';
import {monitorAttendanceDevices,prepareScheduledPayroll} from '../apps/api/src/automation';
async function main(){
 if(process.env.NODE_ENV==='production')throw new Error('Embedded demo mode is for local development only.');
 await mkdir('.local-data',{recursive:true});
 const {db,close}=await embeddedDatabase('.local-data/preview-db');
 await seed(db,{adminEmail:process.env.ADMIN_EMAIL??'',adminPassword:process.env.ADMIN_PASSWORD??'',ownerEmail:process.env.OWNER_EMAIL,ownerPassword:process.env.OWNER_PASSWORD,companyCode:process.env.DEMO_COMPANY_CODE,demo:true});
 const{app}=await createApp(db);await syncCompanyAccess(db);await Promise.all([prepareScheduledPayroll(db).catch(()=>{}),monitorAttendanceDevices(db).catch(()=>{})]);const accessTimer=setInterval(()=>{syncCompanyAccess(db).catch(()=>{});prepareScheduledPayroll(db).catch(()=>{});monitorAttendanceDevices(db).catch(()=>{})},60000);accessTimer.unref();await app.listen(4000,process.env.API_BIND_HOST??'0.0.0.0');
 const lanIps:string[]=[];for(const group of Object.values(networkInterfaces()))for(const row of group??[])if(row.family==='IPv4'&&!row.internal)lanIps.push(row.address);
 console.log('Local TCW HR Software demo API ready. All sample company data is fictional. Credentials are in your generated .env.');
 console.log('PC HR: http://localhost:3000  |  Super Admin: http://localhost:3001');
 for(const ip of [...new Set(lanIps)]){console.log(`Phone HR: http://${ip}:3000  |  Phone Super Admin: http://${ip}:3001`);}
 console.log('Phone and PC must be on the same Wi-Fi/LAN.');
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{clearInterval(accessTimer);await app.close();await close();process.exit(0)});
}
main().catch(e=>{console.error(e);process.exit(1)});
