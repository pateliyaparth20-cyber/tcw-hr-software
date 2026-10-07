import {PGlite} from '@electric-sql/pglite';
import {PrismaPGlite} from 'pglite-prisma-adapter';
import {PrismaClient} from '@prisma/client';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
export async function embeddedDatabase(directory?:string){
 const pg=new PGlite(directory);
 await pg.waitReady;
 const exists=await pg.query("SELECT to_regclass('public.tenants') AS name");
 if(!(exists.rows[0] as any)?.name){
  for(const entry of (await readdir(path.resolve('prisma/migrations'),{withFileTypes:true})).filter(e=>e.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name)))await pg.exec(await readFile(path.resolve('prisma/migrations',entry.name,'migration.sql'),'utf8'));
 }else{
  // Embedded demo databases predate Prisma's migration table. Apply additive launch upgrades by schema detection so copied .local-data keeps working.
  const loginId=await pg.query("SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='login_id'");
  if(!loginId.rows.length)await pg.exec(await readFile(path.resolve('prisma/migrations/202609260002_launch_onboarding/migration.sql'),'utf8'));
  const deviceMaps=await pg.query("SELECT to_regclass('public.device_employee_maps') AS name");
  if(!(deviceMaps.rows[0] as any)?.name)await pg.exec(await readFile(path.resolve('prisma/migrations/202609260003_biomax_foundation/migration.sql'),'utf8'));
  const attendanceLocks=await pg.query("SELECT to_regclass('public.attendance_period_locks') AS name");
  if(!(attendanceLocks.rows[0] as any)?.name)await pg.exec(await readFile(path.resolve('prisma/migrations/202609260004_attendance_payroll_automation/migration.sql'),'utf8'));
  const aiConfig=await pg.query("SELECT to_regclass('public.platform_ai_config') AS name");
  if(!(aiConfig.rows[0] as any)?.name)await pg.exec(await readFile(path.resolve('prisma/migrations/202609270005_ai_configuration/migration.sql'),'utf8'));
  const ticketNumber=await pg.query("SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='ticket_number'");
  if(!ticketNumber.rows.length)await pg.exec(await readFile(path.resolve('prisma/migrations/202609270006_v11_production_launch/migration.sql'),'utf8'));
  const supportMessages=await pg.query("SELECT to_regclass('public.support_ticket_messages') AS name");
  if(!(supportMessages.rows[0] as any)?.name)await pg.exec(await readFile(path.resolve('prisma/migrations/202609270007_v11_support_threads/migration.sql'),'utf8'));
 }
 const operations=await pg.query("SELECT to_regclass('public.salary_versions') AS name");
 if(!(operations.rows[0] as any)?.name)await pg.exec(await readFile(path.resolve('prisma/migrations/202610060008_hr_operations/migration.sql'),'utf8'));
 const security=await pg.query("SELECT to_regclass('public.user_security') AS name");
 if(!(security.rows[0] as any)?.name)await pg.exec(await readFile(path.resolve('prisma/migrations/202610060009_two_factor/migration.sql'),'utf8'));
 const payments=await pg.query("SELECT to_regclass('public.company_payout_connections') AS name");
 if(!(payments.rows[0] as any)?.name)await pg.exec(await readFile(path.resolve('prisma/migrations/202610070010_company_payroll_payments/migration.sql'),'utf8'));
 const field=await pg.query("SELECT to_regclass('public.field_work_sessions') AS name");
 if(!(field.rows[0] as any)?.name)await pg.exec(await readFile(path.resolve('prisma/migrations/202610070011_field_work/migration.sql'),'utf8'));
 const faceStatus=await pg.query("SELECT 1 FROM information_schema.columns WHERE table_name='employee_face_profiles' AND column_name='status'");
 if(!faceStatus.rows.length)await pg.exec(await readFile(path.resolve('prisma/migrations/202610070012_server_face_verification/migration.sql'),'utf8'));
 const db=new PrismaClient({adapter:new PrismaPGlite(pg)});
 return {db,pg,close:async()=>{await db.$disconnect();await pg.close()}};
}
