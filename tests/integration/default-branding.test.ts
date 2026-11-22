import test from 'node:test';
import assert from 'node:assert/strict';
import {embeddedDatabase} from '../helpers/database';
import {seed} from '../../prisma/seed';
import {createApp} from '../../apps/api/src/app';
test('Super Admin default branding is inherited without changing company logo records',async()=>{
 process.env.NODE_ENV='test';process.env.APP_ORIGINS='http://localhost:3000';const f=await embeddedDatabase(),db=f.db;
 await seed(db,{adminEmail:'brand-admin@example.test',adminPassword:'SyntheticAdmin!2026',ownerEmail:'brand-owner@example.test',ownerPassword:'SyntheticOwner!2026',companyCode:'BRAND'});await db.user.updateMany({data:{mustChangePassword:false}});
 const {app,io}=await createApp(db);await app.listen(0,'127.0.0.1');const root=`http://127.0.0.1:${app.getHttpServer().address().port}/api/`;
 const call=async(path:string,scope='TENANT',method='GET',body?:any,auth?:{cookie:string;csrf:string})=>{const r=await fetch(root+path,{method,headers:{Origin:'http://localhost:3000','X-PeopleOS-Portal':scope,...(body?{'Content-Type':'application/json'}:{}),...(auth?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]??''}};
 try{
 const a=await call('auth/login','PLATFORM','POST',{email:'brand-admin@example.test',password:'SyntheticAdmin!2026'}),o=await call('auth/login','TENANT','POST',{email:'brand-owner@example.test',password:'SyntheticOwner!2026',companyCode:'BRAND'});assert.equal(a.status,200);assert.equal(o.status,200);const admin={cookie:a.cookie,csrf:a.data.csrf},owner={cookie:o.cookie,csrf:o.data.csrf};
 const logo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jip0AAAAASUVORK5CYII=';
 assert.equal((await call('system/branding','TENANT','PUT',{logo},owner)).status,403);assert.equal((await call('system/branding','PLATFORM','PUT',{logo},admin)).status,200);
 const publicBrand=await call('branding?logoOnly=1');assert.equal(publicBrand.data.logo,logo);assert.equal(publicBrand.data.loading,undefined);
 assert.equal((await call('tenant-branding/BRAND')).data.logo,logo);assert.equal((await call('company/branding','TENANT','GET',undefined,owner)).data.logo,logo);
 const profile=await call('company','TENANT','GET',undefined,owner);assert.equal(profile.status,200);assert.equal(profile.data.defaultLogo,logo);assert.equal(profile.data.logo,null);
 const tenant=await db.tenant.findUniqueOrThrow({where:{code:'BRAND'}});await db.tenant.update({where:{id:tenant.id},data:{logo:'data:image/png;base64,custom-company'}});assert.equal((await call('company/branding','TENANT','GET',undefined,owner)).data.logo,'data:image/png;base64,custom-company');assert.equal((await db.tenant.findUniqueOrThrow({where:{id:tenant.id}})).logo,'data:image/png;base64,custom-company');
 assert.equal((await call('weather','PLATFORM','GET',undefined,admin)).data.status,'LOCATION_REQUIRED');assert.equal((await call('weather')).status,401);
 await db.tenant.update({where:{id:tenant.id},data:{profile:{city:'',country:'India'}}});assert.equal((await call('weather','TENANT','GET',undefined,owner)).data.status,'LOCATION_REQUIRED');
 assert.equal((await call('system/branding','PLATFORM','PUT',{logo:null},admin)).status,200);assert.equal((await call('branding?logoOnly=1')).data.logo,'/logo-placeholder.svg');
 }finally{io.close();await app.close();await f.close()}
});
