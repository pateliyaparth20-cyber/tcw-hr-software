import 'dotenv/config';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createApp} from '../../apps/api/src/app';
import {seed} from '../../prisma/seed';
import {embeddedDatabase} from '../helpers/database';

async function run(){
 process.env.NODE_ENV='test';
 const fixture=await embeddedDatabase();
 await seed(fixture.db,{adminEmail:process.env.ADMIN_EMAIL!,adminPassword:process.env.ADMIN_PASSWORD!,ownerEmail:process.env.OWNER_EMAIL!,ownerPassword:process.env.OWNER_PASSWORD!,companyCode:process.env.DEMO_COMPANY_CODE});
 const{app,io}=await createApp(fixture.db);await app.listen(4000,'127.0.0.1');
 const children=['web','super-admin'].map((name,i)=>spawn(process.execPath,['../../node_modules/next/dist/bin/next','start','-p',String(3000+i),'-H','127.0.0.1'],{cwd:'apps/'+name,stdio:'ignore',env:{...process.env,NODE_ENV:'production',API_INTERNAL_URL:'http://127.0.0.1:4000'}}));
 try{
  for(const [index,name] of ['web','admin'].entries()){
   const origin=`http://localhost:${3000+index}`;
   let ready=false;for(let i=0;i<100;i++){try{const r=await fetch(origin+'/login');if(r.ok){const html=await r.text();assert(html.includes('TCW HR Software'));ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100));}assert(ready,name+' starts');
   const protectedPage=await fetch(origin+'/employees');assert.equal(protectedPage.status,200);const protectedHtml=await protectedPage.text();assert(protectedHtml.includes('Opening your workspace'),'protected route should render the client-side session gate');
   const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:index?process.env.ADMIN_EMAIL:process.env.OWNER_EMAIL,password:index?process.env.ADMIN_PASSWORD:process.env.OWNER_PASSWORD,...(!index?{companyCode:process.env.DEMO_COMPANY_CODE}: {})})});
   assert.equal(login.status,200,await login.text());const cookie=login.headers.get('set-cookie')!.split(';')[0];
   const me=await fetch(origin+'/api/auth/me',{headers:{Cookie:cookie,Origin:origin}});const meText=await me.text();assert.equal(me.status,200,meText);const session=JSON.parse(meText);assert.equal(session.user.scope,index?'PLATFORM':'TENANT');
   const dashboard=await fetch(origin+'/dashboard',{headers:{Cookie:cookie}});assert.equal(dashboard.status,200);const html=await dashboard.text();assert(html.includes('Opening your workspace'));console.log(name+': login proxy, cookie forwarding and protected app shell passed');
  }
 }finally{children.forEach(c=>c.kill('SIGTERM'));io.close();await app.close();await fixture.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1});
