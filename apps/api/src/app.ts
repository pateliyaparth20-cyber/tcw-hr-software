import 'reflect-metadata';
import {All,Controller,Inject,Module,Req,Res,NotFoundException,BadRequestException,ForbiddenException,HttpException,ServiceUnavailableException,ConflictException} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {json,text as expressText} from 'express';
import type {Request,Response} from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import multer from 'multer';
import {Server} from 'socket.io';
import {z,ZodError} from 'zod';
import type {Database} from '../../../packages/database';
import {id,password} from '../../../packages/validation';
import {toCsv} from '../../../packages/reporting-engine';
import {hasPermission} from '../../../packages/permissions';
import {CompatibleProvider} from '../../../packages/ai';
import {effectiveAIConfig,publicAIConfig,saveAIConfig,testAIConnection} from './ai-config';
import {AuthService} from './auth';
import {pushConfig,savePushSubscription,deletePushSubscription,sendPush} from './push';
import {DataService} from './data';
import {Workflows} from './workflows';
import {FilesService} from './files';
import {BiometricService} from './biometric';
import {PayoutService} from './payouts';
import {authenticate,audit,employeeScope,platform,requirePermission,tenant,Context} from './context';
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1,fields:5}}).single('file');
function localLanOrigin(origin:string){
  if(process.env.NODE_ENV==='production')return false;
  try{
    const url=new URL(origin);
    if(url.protocol!=='http:'||!['3000','3001'].includes(url.port))return false;
    // Local QA may be opened from a private IPv4 address, IPv6 address, Windows host
    // name or mDNS name. In explicit LOCAL_TEST_MODE, trust the two TCW frontend ports
    // instead of forcing one LAN address pattern. Production never enters this branch.
    if(process.env.LOCAL_TEST_MODE==='true')return true;
    const host=url.hostname;
    if(host==='localhost'||host==='127.0.0.1'||host==='[::1]')return true;
    if(/^10\./.test(host)||/^192\.168\./.test(host))return true;
    const match=host.match(/^172\.(\d+)\./);
    return !!match&&Number(match[1])>=16&&Number(match[1])<=31;
  }catch{return false;}
}
function allowedAppOrigin(origin:string|undefined){
  if(!origin)return false;
  const configured=(process.env.APP_ORIGINS??'http://localhost:3000,http://localhost:3001').split(',').map(v=>v.trim()).filter(Boolean);
  return configured.includes(origin)||localLanOrigin(origin);
}
export class Api {
  auth:AuthService;data:DataService;flows:Workflows;files:FilesService;biometric:BiometricService;payouts:PayoutService;io?:Server;
  constructor(public db:Database){this.auth=new AuthService(db);this.data=new DataService(db);this.flows=new Workflows(db);this.files=new FilesService(db);this.biometric=new BiometricService(db);this.payouts=new PayoutService(db);}
  async handle(req:Request,res:Response){
    const parts=req.path.replace(/^\/api\/?/,'').split('/').filter(Boolean),[resource,key,action]=parts;
    const method=req.method;
    if(resource==='health'&&method==='GET')return {status:'ok',service:'tcw-hr-api'};
    if(resource==='version'&&method==='GET')return {version:process.env.RAILWAY_DEPLOYMENT_ID??process.env.RAILWAY_GIT_COMMIT_SHA??process.env.GIT_COMMIT_SHA??process.env.npm_package_version??'local',release:process.env.APP_VERSION??process.env.npm_package_version??'1.3.0',channel:process.env.APP_RELEASE_CHANNEL??'Production'};
    if(resource==='branding'&&method==='GET'){
      const row=await this.db.platformSetting.findUnique({where:{key:'branding'}});
      const value=row?.value&&typeof row.value==='object'&&!Array.isArray(row.value)?row.value as any:{};
      return {logo:value.logo??'/tcw-logo.png',updatedAt:row?.updatedAt??null};
    }
    if(resource==='biometric'&&key==='push'&&method==='POST')return this.biometric.genericPush(req.headers as any,req.body);
    if(resource==='biometric'&&key==='biomax'&&action==='push'&&method==='POST')return this.biometric.biomaxPush(req.headers as any,req.body);
    if(!['GET','HEAD','OPTIONS'].includes(method)){
      const origin=String(req.headers.origin??'');
      if(!allowedAppOrigin(origin))throw new ForbiddenException('Request origin is not allowed.');
    }
    if(resource==='auth'){
      if(key==='login'&&method==='POST')return this.auth.login(req.body,req,res);
      if(key==='signup'&&method==='POST')return this.auth.signup(req.body,req,res);
      if(key==='forgot-password'&&method==='POST')return this.auth.forgot(req.body);
      if(key==='reset-password'&&action==='claim'&&method==='POST')return this.auth.claimReset(req.body,req,res);
      if(key==='reset-password'&&!action&&method==='POST')return this.auth.reset(req.body,req,res);
    }
    const ctx=await authenticate(this.db,req);
    const body=req.body;
    if(ctx.tenantId){
      const company=await this.db.tenant.findUnique({where:{id:ctx.tenantId}});
      const billingLocked=company&&(company.status==='EXPIRED'||(company.status==='SUSPENDED'&&(company.profile as any)?.suspensionReason==='BILLING')||(company.expiresAt&&company.expiresAt<new Date()));
      if(billingLocked&&!['auth','subscription','push'].includes(resource))throw new ForbiddenException('Your trial or subscription has ended. Complete payment to unlock HR modules.');
    }
    if(resource==='push'&&key==='config'&&method==='GET')return pushConfig();
    if(resource==='push'&&key==='subscription'&&method==='POST'){
      const input=z.object({endpoint:z.string().url().max(4000),keys:z.object({p256dh:z.string().min(10).max(1000),auth:z.string().min(5).max(1000)}).strict()}).strict().parse(body);
      await savePushSubscription(this.db,{tenantId:ctx.tenantId??null,userId:ctx.user.id,endpoint:input.endpoint,p256dh:input.keys.p256dh,auth:input.keys.auth,userAgent:String(req.headers['user-agent']??'').slice(0,500)});
      return {ok:true};
    }
    if(resource==='push'&&key==='subscription'&&method==='DELETE'){
      const input=z.object({endpoint:z.string().url().max(4000)}).strict().parse(body);
      return deletePushSubscription(this.db,ctx.user.id,input.endpoint);
    }
    if(resource==='subscription'&&method==='GET'){
      const tid=tenant(ctx);requirePermission(ctx,'company','VIEW');const company=await this.db.tenant.findUniqueOrThrow({where:{id:tid}});const [invoices,plans]=await Promise.all([
        this.db.invoice.findMany({where:{tenantId:tid},orderBy:{createdAt:'desc'},take:24}),
        this.db.plan.findMany({orderBy:{monthlyPrice:'asc'}})
      ]);
      const payRow=await this.db.platformSetting.findUnique({where:{key:'billing-payment'}});
      const pay=payRow?.value&&typeof payRow.value==='object'&&!Array.isArray(payRow.value)?payRow.value as any:{};
      const upiId=String(pay.upiId??process.env.PAYMENT_UPI_ID??'').trim(),payeeName=String(pay.payeeName??process.env.PAYMENT_UPI_NAME??'TCW HR Software').trim();
      const gstPercent=Math.max(0,Math.min(100,Number(pay.gstPercent??process.env.PAYMENT_GST_PERCENT??18)||18));
      return {company,plans,gatewayConfigured:!!String(process.env.PAYMENT_CHECKOUT_BASE_URL??'').trim(),upiConfigured:!!upiId,upi:{payeeName},gstPercent};
    }
    if(resource==='subscription'&&!key&&method==='POST'){
      const tid=tenant(ctx);requirePermission(ctx,'company','EDIT');
      const input=z.object({plan:z.enum(['STARTER','GROWTH','ENTERPRISE']),mode:z.enum(['GATEWAY','UPI']).default('UPI')}).strict().parse(body);
      const [company,plan,payRow]=await Promise.all([
        this.db.tenant.findUniqueOrThrow({where:{id:tid}}),
        this.db.plan.findUnique({where:{name:input.plan}}),
        this.db.platformSetting.findUnique({where:{key:'billing-payment'}})
      ]);
      if(!plan)throw new BadRequestException('Selected subscription plan is unavailable.');
      const pay=payRow?.value&&typeof payRow.value==='object'&&!Array.isArray(payRow.value)?payRow.value as any:{};
      const base=String(process.env.PAYMENT_CHECKOUT_BASE_URL??'').trim();
      const upiId=String(pay.upiId??process.env.PAYMENT_UPI_ID??'').trim(),payeeName=String(pay.payeeName??process.env.PAYMENT_UPI_NAME??'TCW HR Software').trim();
      const gstPercent=Math.max(0,Math.min(100,Number(pay.gstPercent??process.env.PAYMENT_GST_PERCENT??18)||18));
      if(input.mode==='GATEWAY'&&!base)throw new ServiceUnavailableException('Card/online gateway is not configured yet.');
      if(input.mode==='UPI'&&!upiId)throw new ServiceUnavailableException('UPI payment is not configured yet.');
      const tax=Math.round(plan.monthlyPrice*gstPercent/100),total=plan.monthlyPrice+tax;
      const open=await this.db.invoice.findFirst({where:{tenantId:tid,status:{in:['ISSUED','OVERDUE','PART_PAID']},amount:plan.monthlyPrice,tax,total},orderBy:{createdAt:'desc'}});
      const invoice=open??await this.db.invoice.create({data:{tenantId:tid,number:`TCW-${Date.now()}-${Math.floor(1000+Math.random()*9000)}`,amount:plan.monthlyPrice,tax,total,dueDate:new Date(new Date().toISOString().slice(0,10))}});
      await this.db.tenant.update({where:{id:tid},data:{plan:plan.name,employeeLimit:plan.employeeLimit,profile:{...(company.profile as any??{}),pendingPlan:plan.name,paymentRequestedAt:new Date().toISOString(),paymentMode:input.mode,pendingInvoiceId:invoice.id}}});
      await audit(this.db,ctx,'SUBSCRIPTION_PAYMENT_STARTED','tenants',tid,undefined,{plan:plan.name,invoiceId:invoice.id,total:invoice.total,mode:input.mode});
      if(input.mode==='GATEWAY'){
        const checkoutUrl=`${base}${base.includes('?')?'&':'?'}invoice=${encodeURIComponent(invoice.id)}&tenant=${encodeURIComponent(tid)}&plan=${encodeURIComponent(plan.name)}&amount=${invoice.total}`;
        return {ok:true,invoice,plan,mode:'GATEWAY',checkoutUrl};
      }
      const amount=(invoice.total/100).toFixed(2);
      const upiUrl=`upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${encodeURIComponent(amount)}&cu=INR&tn=${encodeURIComponent('TCW HR '+invoice.number)}`;
      const qrUrl=`https://quickchart.io/qr?size=280&margin=1&text=${encodeURIComponent(upiUrl)}`;
      return {ok:true,invoice,plan,mode:'UPI',upiUrl,qrUrl,upi:{payeeName},amount,gstPercent,breakdown:{subtotal:invoice.amount,tax:invoice.tax,total:invoice.total}};
    }
    if(resource==='subscription'&&key==='manual-payment'&&method==='POST'){
      const tid=tenant(ctx);requirePermission(ctx,'company','EDIT');
      const input=z.object({invoiceId:id,utr:z.string().trim().min(6).max(100)}).strict().parse(body);
      const invoice=await this.db.invoice.findFirst({where:{id:input.invoiceId,tenantId:tid}});if(!invoice)throw new NotFoundException('Invoice not found.');
      const company=await this.db.tenant.findUniqueOrThrow({where:{id:tid}});
      const profile={...(company.profile as any??{}),pendingPaymentProof:{invoiceId:invoice.id,utr:input.utr,submittedAt:new Date().toISOString(),amount:invoice.total,status:'AWAITING_VERIFICATION'}};
      await this.db.tenant.update({where:{id:tid},data:{profile}});
      await audit(this.db,ctx,'MANUAL_PAYMENT_PROOF_SUBMITTED','invoices',invoice.id,undefined,{utr:input.utr,amount:invoice.total});
      return {ok:true,status:'AWAITING_VERIFICATION',message:'Payment reference submitted. Access will unlock after payment verification.'};
    }
    if(resource==='auth'){
      if(key==='me'&&method==='GET')return {user:this.auth.publicUser(ctx.user),csrf:ctx.session.csrf,sessionExpiresAt:ctx.session.expiresAt.toISOString(),company:ctx.tenantId?await this.db.tenant.findUnique({where:{id:ctx.tenantId}}):null};
      if(key==='profile'&&method==='GET'){
        let profileUser:any=ctx.user;
        if(ctx.tenantId&&ctx.user.role?.code==='COMPANY_OWNER'){
          const company=await this.db.tenant.findUnique({where:{id:ctx.tenantId},select:{profile:true}});
          if((company?.profile as any)?.signupSource==='SELF_SERVICE'){
            const hrRole=await this.db.role.findUnique({where:{code:'HR_ADMIN'}});
            if(hrRole)profileUser=await this.db.user.update({where:{id:ctx.user.id},data:{roleId:hrRole.id},include:{role:true}});
          }
        }
        const employee=ctx.user.employeeId?await this.db.employee.findFirst({where:{id:ctx.user.employeeId,tenantId:ctx.tenantId??undefined,deletedAt:null},select:{id:true,employeeCode:true,firstName:true,lastName:true,email:true,phone:true,photo:true,departmentId:true,branchId:true,shiftId:true,designation:true,employmentType:true,status:true,joiningDate:true,personal:true}}):null;
        if(employee&&ctx.tenantId){
          const [department,branch,shift]=await Promise.all([
            employee.departmentId?this.db.department.findFirst({where:{id:employee.departmentId,tenantId:ctx.tenantId},select:{name:true}}):null,
            employee.branchId?this.db.branch.findFirst({where:{id:employee.branchId,tenantId:ctx.tenantId},select:{name:true,location:true,city:true}}):null,
            employee.shiftId?this.db.shift.findFirst({where:{id:employee.shiftId,tenantId:ctx.tenantId},select:{name:true}}):null
          ]);
          return {user:this.auth.publicUser(profileUser),employee:{...employee,departmentName:department?.name??'',branchName:branch?.name??'',branchLocation:branch?.location??'',branchCity:branch?.city??'',shiftName:shift?.name??''}};
        }
        return {user:this.auth.publicUser(profileUser),employee};
      }
      if(key==='profile'&&method==='PATCH'){
        const input=z.object({name:z.string().trim().min(1).max(120),email:z.string().trim().email().max(200),avatar:z.string().max(8_000_000).nullable().optional()}).strict().parse(body);
        if(input.avatar){
          if(!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(input.avatar))throw new BadRequestException('Use a PNG or JPEG profile photo up to 5 MB.');
          const raw=Buffer.from(input.avatar.split(',')[1],'base64');
          const png=raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
          const jpg=raw[0]===255&&raw[1]===216&&raw[2]===255;
          if(raw.length>5*1024*1024||(!png&&!jpg))throw new BadRequestException('Use a valid PNG or JPEG profile photo up to 5 MB.');
        }
        const before=await this.db.user.findUniqueOrThrow({where:{id:ctx.user.id}});
        const duplicate=await this.db.user.findFirst({where:{email:input.email,id:{not:ctx.user.id},tenantId:ctx.tenantId??null}});
        if(duplicate)throw new ConflictException('Another account already uses this email.');
        const after=await this.db.user.update({where:{id:ctx.user.id},data:input});
        await audit(this.db,ctx,'ACCOUNT_PROFILE_UPDATED','users',after.id,before,after);
        return {user:this.auth.publicUser({...after,role:ctx.user.role} as any)};
      }
      if(key==='logout'&&method==='POST')return this.auth.logout(ctx,res);
      if(key==='change-password'&&method==='POST')return this.auth.change(ctx,body,res);
      if(key==='sessions'&&method==='GET')return {items:await this.db.session.findMany({where:{userId:ctx.user.id},select:{id:true,createdAt:true,expiresAt:true,userAgent:true,ip:true}}),currentId:ctx.session.id};
      if(key==='sessions'&&action&&method==='DELETE'){await this.db.session.deleteMany({where:{id:id.parse(action),userId:ctx.user.id}});return {ok:true};}
      throw new NotFoundException();
    }
    if(resource==='dashboard'&&method==='GET')return this.data.dashboard(ctx);
    if(resource==='support'&&key&&action==='messages')return this.data.supportMessages(ctx,key,method,body);
    if(resource==='company'&&key==='branding'&&method==='GET'){
      const tid=tenant(ctx);
      const company=await this.db.tenant.findUnique({where:{id:tid},select:{id:true,name:true,code:true,logo:true,status:true,expiresAt:true,timezone:true,profile:true}});
      if(!company)throw new NotFoundException('Company not found.');
      const profile=company.profile&&typeof company.profile==='object'&&!Array.isArray(company.profile)?company.profile as any:{};
      return {id:company.id,name:company.name,code:company.code,logo:company.logo,status:company.status,expiresAt:company.expiresAt,timezone:company.timezone,primaryColor:String(profile.primaryColor??'#3474ef')};
    }
    if(resource==='company'&&['GET','PATCH'].includes(method))return this.data.company(ctx,method==='PATCH'?body:undefined);
    if(resource==='employees'&&key&&action==='app-access')return this.data.employeeAppAccess(ctx,key,method,body);
    if(resource==='employees')return this.data.employees(ctx,method,key,body,req.query);
    if(resource==='users')return this.data.users(ctx,method,body,key);
    if(resource==='roles'&&method==='GET'){requirePermission(ctx,'users','VIEW');return {items:await this.db.role.findMany({where:{scope:ctx.user.role.scope}})};}
    if(resource==='platform'){return this.data.platformResource(ctx,key,method,action,body);}
    if(resource==='attendance')return this.flows.attendance(ctx,method,body,req.query,key,action);
    if(['leave','expenses','travel'].includes(resource)&&key&&action==='review'&&method==='POST')return this.flows.review(ctx,resource,key,body);
    if(resource==='leave')return this.flows.leave(ctx,method,body);
    if(resource==='payroll-adjustments'&&method==='POST')return this.flows.adjustment(ctx,body);
    if(resource==='payroll'&&key&&action==='payouts'&&method==='GET')return this.payouts.list(ctx,id.parse(key));
    if(resource==='payroll'&&key&&action==='payout'&&method==='POST')return this.payouts.pay(ctx,id.parse(key),body);
    if(resource==='payroll'&&key&&action==='payout-sync'&&method==='POST')return this.payouts.sync(ctx,id.parse(key));
    if(resource==='payroll')return this.flows.payroll(ctx,method,key,action,body);
    if(resource==='workforce')return this.flows.workforce(ctx,method,body);
    if(resource==='exit'&&key&&action==='review'&&method==='POST')return this.flows.exit(ctx,key,body);
    if(resource==='devices'&&key&&action==='test'&&method==='POST')return this.biometric.test(ctx,id.parse(key));
    if(resource==='devices'&&key&&action==='rotate-secret'&&method==='POST')return this.biometric.rotateSecret(ctx,id.parse(key));
    if(resource==='devices'&&key&&action==='mappings'&&method==='GET')return this.biometric.mappings(ctx,id.parse(key));
    if(resource==='devices'&&key&&action==='mappings'&&method==='POST')return this.biometric.mappings(ctx,id.parse(key),body);
    if(resource==='devices'&&key&&action==='logs'&&method==='GET')return this.biometric.logs(ctx,id.parse(key));
    if(resource==='devices'&&key&&action==='punches'&&method==='GET')return this.biometric.punches(ctx,id.parse(key));
    if(resource==='devices'&&key&&action==='setup'&&method==='GET')return this.biometric.setup(ctx,id.parse(key));
    if(resource==='documents'){
      if(method==='GET'&&!key)return this.files.list(ctx);
      if(method==='GET'&&key){const result=await this.files.download(ctx,key);res.setHeader('Content-Type',result.row.mimeType);res.setHeader('Content-Disposition',`attachment; filename="${result.row.fileName}"`);res.send(result.bytes);return undefined;}
      if(method==='POST'){await new Promise<void>((resolve,reject)=>upload(req,res,e=>e?reject(e):resolve()));return this.files.upload(ctx,req.file,req.body);}
    }
    if(resource==='audit'&&method==='GET'){
      requirePermission(ctx,'audit','VIEW');return {items:await this.db.auditLog.findMany({where:{tenantId:ctx.tenantId},orderBy:{createdAt:'desc'},take:200})};
    }
    if(resource==='notifications'){
      const tid=tenant(ctx),where={tenantId:tid,OR:[{userId:ctx.user.id},{userId:null}]};
      if(method==='GET'){
        const clearBefore=new Date(Date.now()-12*60*60*1000);
        await this.db.notification.deleteMany({where:{tenantId:tid,readAt:{lte:clearBefore}}});
        const items=await this.db.notification.findMany({where,orderBy:{createdAt:'desc'},take:200});
        return {items};
      }
      if(method==='PATCH'&&key==='all'){await this.db.notification.updateMany({where:{...where,readAt:null},data:{readAt:new Date()}});return {ok:true};}
      if(method==='PATCH'&&key){await this.db.notification.updateMany({where:{...where,id:id.parse(key)},data:{readAt:new Date()}});return {ok:true};}
    }
    
    if(resource==='system'&&key==='platform-profile'){
      platform(ctx);
      const defaults={companyName:'Tech Cyber Warrior',legalName:'',companyType:'',registrationNumber:'',foundedYear:'',contactPerson:'',contactDesignation:'',billingEmail:'',email:'',phone:'',website:'https://techcyberwarrior.in',address:'',city:'',state:'Gujarat',country:'India',postalCode:'',taxId:'',pan:'',supportEmail:'',logo:'/tcw-logo.png'};
      if(method==='GET'){
        requirePermission(ctx,'system','VIEW');
        const [profileRow,brandingRow]=await Promise.all([
          this.db.platformSetting.findUnique({where:{key:'platform-profile'}}),
          this.db.platformSetting.findUnique({where:{key:'branding'}})
        ]);
        const profile=profileRow?.value&&typeof profileRow.value==='object'&&!Array.isArray(profileRow.value)?profileRow.value as any:{};
        const branding=brandingRow?.value&&typeof brandingRow.value==='object'&&!Array.isArray(brandingRow.value)?brandingRow.value as any:{};
        return {...defaults,...profile,logo:branding.logo??profile.logo??defaults.logo,updatedAt:profileRow?.updatedAt??null};
      }
      if(method==='PUT'){
        requirePermission(ctx,'system','EDIT');
        const input=z.object({
          companyName:z.string().trim().min(1).max(160),
          legalName:z.string().trim().max(200).default(''),
          companyType:z.string().trim().max(100).default(''),
          registrationNumber:z.string().trim().max(80).default(''),
          foundedYear:z.string().trim().regex(/^$|^\d{4}$/).default(''),
          contactPerson:z.string().trim().max(120).default(''),
          contactDesignation:z.string().trim().max(120).default(''),
          billingEmail:z.string().trim().email().or(z.literal('')).default(''),
          email:z.string().trim().email().or(z.literal('')).default(''),
          phone:z.string().trim().max(40).default(''),
          website:z.string().trim().url().or(z.literal('')).default(''),
          address:z.string().trim().max(500).default(''),
          city:z.string().trim().max(120).default(''),
          state:z.string().trim().max(120).default(''),
          country:z.string().trim().max(120).default(''),
          postalCode:z.string().trim().max(20).default(''),
          taxId:z.string().trim().max(60).default(''),
          pan:z.string().trim().max(30).default(''),
          supportEmail:z.string().trim().email().or(z.literal('')).default(''),
          logo:z.string().max(8_000_000).nullable()
        }).strict().parse(body);
        if(input.logo){
          if(!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(input.logo))throw new BadRequestException('Use a PNG or JPEG logo up to 5 MB.');
          const raw=Buffer.from(input.logo.split(',')[1],'base64');
          const png=raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
          const jpg=raw[0]===255&&raw[1]===216&&raw[2]===255;
          if(raw.length>5*1024*1024||(!png&&!jpg))throw new BadRequestException('Use a valid PNG or JPEG logo up to 5 MB.');
        }
        const {logo,...profile}=input;
        const [profileRow]=await Promise.all([
          this.db.platformSetting.upsert({where:{key:'platform-profile'},update:{value:profile},create:{key:'platform-profile',value:profile}}),
          this.db.platformSetting.upsert({where:{key:'branding'},update:{value:{logo:logo??'/tcw-logo.png'}},create:{key:'branding',value:{logo:logo??'/tcw-logo.png'}}})
        ]);
        await audit(this.db,ctx,'PLATFORM_PROFILE_UPDATED','system');
        return {...profile,logo:logo??'/tcw-logo.png',updatedAt:profileRow.updatedAt};
      }
      throw new NotFoundException();
    }
    if(resource==='system'&&key==='branding'){
      platform(ctx);
      if(method==='GET'){requirePermission(ctx,'system','VIEW');const row=await this.db.platformSetting.findUnique({where:{key:'branding'}});const value=row?.value&&typeof row.value==='object'&&!Array.isArray(row.value)?row.value as any:{};return {logo:value.logo??'/tcw-logo.png',updatedAt:row?.updatedAt??null};}
      if(method==='PUT'){requirePermission(ctx,'system','EDIT');const input=z.object({logo:z.string().max(8_000_000).nullable()}).strict().parse(body);if(input.logo){if(!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(input.logo))throw new BadRequestException('Use a PNG or JPEG logo up to 5 MB.');const raw=Buffer.from(input.logo.split(',')[1],'base64');const png=raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));const jpg=raw[0]===255&&raw[1]===216&&raw[2]===255;if(raw.length>5*1024*1024||(!png&&!jpg))throw new BadRequestException('Use a valid PNG or JPEG logo up to 5 MB.');}const value={logo:input.logo??'/tcw-logo.png'};const row=await this.db.platformSetting.upsert({where:{key:'branding'},update:{value},create:{key:'branding',value}});await audit(this.db,ctx,'PLATFORM_BRANDING_UPDATED','system');return {logo:(row.value as any)?.logo??'/tcw-logo.png',updatedAt:row.updatedAt};}
      throw new NotFoundException();
    }
    if(resource==='system'&&key==='payment-settings'){
      platform(ctx);
      if(method==='GET'){requirePermission(ctx,'system','VIEW');const row=await this.db.platformSetting.findUnique({where:{key:'billing-payment'}});const value=row?.value&&typeof row.value==='object'&&!Array.isArray(row.value)?row.value as any:{};return {upiId:String(value.upiId??process.env.PAYMENT_UPI_ID??''),payeeName:String(value.payeeName??process.env.PAYMENT_UPI_NAME??'TCW HR Software'),gstPercent:Number(value.gstPercent??process.env.PAYMENT_GST_PERCENT??18)||18};}
      if(method==='PUT'){requirePermission(ctx,'system','EDIT');const input=z.object({upiId:z.string().trim().max(120),payeeName:z.string().trim().min(1).max(120),gstPercent:z.number().min(0).max(100).default(18)}).strict().parse(body);if(input.upiId&&!/^[A-Za-z0-9._-]{2,}@[A-Za-z0-9.-]{2,}$/.test(input.upiId))throw new BadRequestException('Enter a valid UPI ID, for example name@bank.');const row=await this.db.platformSetting.upsert({where:{key:'billing-payment'},update:{value:input},create:{key:'billing-payment',value:input}});await audit(this.db,ctx,'PAYMENT_SETTINGS_UPDATED','system');return row.value;}
      throw new NotFoundException();
    }
    if(resource==='system'&&key==='company-update'){
      platform(ctx);requirePermission(ctx,'system','EDIT');
      if(method!=='POST')throw new NotFoundException();
      const input=z.object({tenantId:id,title:z.string().trim().min(1).max(160),message:z.string().trim().min(1).max(2000)}).strict().parse(body);
      const company=await this.db.tenant.findUnique({where:{id:input.tenantId}});if(!company)throw new BadRequestException('Company was not found.');
      const notice=await this.db.notification.create({data:{tenantId:company.id,title:input.title,message:input.message}});
      sendPush(this.db,{tenantId:company.id,title:notice.title,body:notice.message,url:'/notifications',tag:'tcw-'+notice.id}).catch(()=>{});
      await audit(this.db,ctx,'COMPANY_UPDATE_SENT','notifications',notice.id,undefined,{tenantId:company.id,title:input.title});
      return {ok:true,company:{id:company.id,name:company.name,code:company.code},notice};
    }
    if(resource==='system'&&key==='ai-config'){
      platform(ctx);
      if(method==='GET'){requirePermission(ctx,'system','VIEW');return publicAIConfig(this.db);}
      if(method==='PUT'){requirePermission(ctx,'system','EDIT');const input=z.object({provider:z.string().max(60).default('OPENAI_COMPATIBLE'),baseUrl:z.string().max(500),model:z.string().max(200),apiKey:z.string().max(500).optional(),enabled:z.boolean()}).strict().parse(body);try{const result=await saveAIConfig(this.db,input);await audit(this.db,ctx,'AI_CONFIG_UPDATED','system');return result;}catch(e:any){throw new BadRequestException(e.message);}}
      if(action==='test'&&method==='POST'){requirePermission(ctx,'system','EDIT');try{return await testAIConnection(this.db);}catch(e:any){throw new ServiceUnavailableException(e.message);}}
    }
    if(resource==='system'&&method==='GET'){platform(ctx);requirePermission(ctx,'system','VIEW');await this.db.$queryRaw`SELECT 1`;const ai=await publicAIConfig(this.db);const sms=String(process.env.SMS_PROVIDER??'').trim();const payouts=process.env.PAYROLL_PAYOUTS_ENABLED==='true'&&process.env.PAYOUT_PROVIDER==='RAZORPAYX';return {database:'CONNECTED',email:(process.env.RESEND_API_KEY||process.env.SMTP_HOST)?'CONFIGURED':'NOT_CONFIGURED',sms:sms?'CONFIGURED':'NOT_CONFIGURED',storage:process.env.S3_ENDPOINT?'CONFIGURED':'NOT_CONFIGURED',ai:ai.configured?'CONFIGURED':'NOT_CONFIGURED',salaryPayouts:payouts?'CONFIGURED':'SAFE_MODE',pendingMessages:await this.db.outbox.count({where:{sentAt:null}})};}
    if(resource==='agent'&&key==='history'&&method==='GET'&&!action){
      const tid=tenant(ctx);
      const items=await this.db.meghnaConversation.findMany({where:{tenantId:tid,userId:ctx.user.id},orderBy:{updatedAt:'desc'},take:30,select:{id:true,title:true,createdAt:true,updatedAt:true,messages:true}});
      return {items:items.map((r:any)=>({id:r.id,title:r.title,createdAt:r.createdAt,updatedAt:r.updatedAt,messageCount:Array.isArray(r.messages)?r.messages.length:0}))};
    }
    if(resource==='agent'&&key==='history'&&method==='GET'&&action){
      const tid=tenant(ctx);
      const row=await this.db.meghnaConversation.findFirst({where:{id:id.parse(action),tenantId:tid,userId:ctx.user.id}});
      if(!row)throw new NotFoundException('Conversation not found.');
      return row;
    }
    if(resource==='agent'&&key==='history'&&method==='POST'){
      const tid=tenant(ctx);
      const input=z.object({messages:z.array(z.object({role:z.enum(['user','assistant']),text:z.string().trim().min(1).max(4000)}).strict()).min(1).max(100)}).strict().parse(body);
      const first=input.messages.find(m=>m.role==='user')?.text??'Conversation';
      const title=first.replace(/\s+/g,' ').trim().slice(0,72)||'Conversation';
      const row=await this.db.meghnaConversation.create({data:{tenantId:tid,userId:ctx.user.id,title,messages:input.messages}});
      await audit(this.db,ctx,'MEGHNA_CONVERSATION_SAVED','meghna-history',row.id,undefined,{title,messageCount:input.messages.length});
      return row;
    }
    if(resource==='agent'&&key==='history'&&method==='PUT'&&action){
      const tid=tenant(ctx);
      const input=z.object({messages:z.array(z.object({role:z.enum(['user','assistant']),text:z.string().trim().min(1).max(4000)}).strict()).min(1).max(100)}).strict().parse(body);
      const existing=await this.db.meghnaConversation.findFirst({where:{id:id.parse(action),tenantId:tid,userId:ctx.user.id}});
      if(!existing)throw new NotFoundException('Conversation not found.');
      const first=input.messages.find(m=>m.role==='user')?.text??existing.title;
      const title=first.replace(/\s+/g,' ').trim().slice(0,72)||existing.title;
      return this.db.meghnaConversation.update({where:{id:existing.id},data:{title,messages:input.messages}});
    }
    if(resource==='agent'&&key==='history'&&method==='DELETE'&&action){
      const tid=tenant(ctx);
      const existing=await this.db.meghnaConversation.findFirst({where:{id:id.parse(action),tenantId:tid,userId:ctx.user.id}});
      if(!existing)throw new NotFoundException('Conversation not found.');
      await this.db.meghnaConversation.delete({where:{id:existing.id}});
      await audit(this.db,ctx,'MEGHNA_CONVERSATION_DELETED','meghna-history',existing.id,{title:existing.title},undefined);
      return {ok:true};
    }
    if(resource==='agent'&&key==='status'&&method==='GET'){
      const tid=tenant(ctx),now=new Date(),company=await this.db.tenant.findUnique({where:{id:tid}});
      await this.db.$queryRaw`SELECT 1`;
      const employeeSelf=ctx.user.role.code==='EMPLOYEE',canDevices=!employeeSelf&&hasPermission(ctx.user.role.permissions,'devices','VIEW');
      const recentCutoff=new Date(now.getTime()-24*3600000);
      const smsConfigured=!!String(process.env.SMS_PROVIDER??'').trim();
      const [failedEmail,failedSms,deviceIssues]=await Promise.all([
        employeeSelf?Promise.resolve(0):this.db.outbox.count({where:{tenantId:tid,kind:'EMAIL',sentAt:null,attempts:{gte:3,lt:5},createdAt:{gte:recentCutoff}}}),
        employeeSelf?Promise.resolve(0):smsConfigured?this.db.outbox.count({where:{tenantId:tid,kind:'SMS',sentAt:null,attempts:{gte:3,lt:5},createdAt:{gte:recentCutoff}}}):Promise.resolve(0),
        canDevices?this.db.attendanceDevice.findMany({where:{tenantId:tid,OR:[{status:{in:['OFFLINE','ERROR','DEGRADED']}},{lastError:{not:null}}]},select:{id:true,name:true,status:true,lastError:true},take:10}):Promise.resolve([])
      ]);
      const issues:any[]=[];
      if(failedEmail>0)issues.push({code:'EMAIL_DELIVERY',severity:'warning',title:'Email delivery needs attention',message:failedEmail+' recent email job(s) have failed repeatedly. Check the recipient address and email delivery logs.'});
      if(failedSms>0)issues.push({code:'SMS_DELIVERY',severity:'warning',title:'SMS delivery needs attention',message:failedSms+' recent SMS job(s) have failed repeatedly. Check the SMS provider configuration and delivery logs.'});
      if(deviceIssues.length)issues.push({code:'ATTENDANCE_DEVICE',severity:'warning',title:'Attendance device issue',message:deviceIssues.length+' device(s) are offline, degraded, or reporting an error.'});
      if(company?.status==='EXPIRED'||company?.status==='SUSPENDED')issues.push({code:'COMPANY_ACCESS',severity:'warning',title:'Company access needs attention',message:'Company status is '+company.status+'. Review subscription or platform access.'});
      const daysRemaining=company?.expiresAt?Math.max(0,Math.ceil((company.expiresAt.getTime()-now.getTime())/86400000)):null;
      if(company?.status==='TRIAL'&&daysRemaining!==null&&daysRemaining<=1)issues.push({code:'TRIAL_ENDING',severity:'info',title:'Trial ending soon',message:'Trial access ends in '+daysRemaining+' day(s).'});
      return {healthy:issues.filter(v=>v.severity==='warning').length===0,checkedAt:now,issues,checks:{api:'ONLINE',database:'CONNECTED',email:(process.env.RESEND_API_KEY||process.env.SMTP_HOST)?'CONFIGURED':'NOT_CONFIGURED',sms:process.env.SMS_PROVIDER?'CONFIGURED':'NOT_CONFIGURED',devices:canDevices?(deviceIssues.length?'ATTENTION':'OK'):'ROLE_RESTRICTED'},company:{status:company?.status,daysRemaining},version:process.env.RAILWAY_DEPLOYMENT_ID??process.env.RAILWAY_GIT_COMMIT_SHA??process.env.npm_package_version??'local'};
    }
    if(resource==='agent'&&method==='POST'){
      const tid=tenant(ctx);const {question,history=[]}=z.object({question:z.string().trim().min(2).max(700),history:z.array(z.object({role:z.enum(['user','assistant']),text:z.string().trim().max(1600)}).strict()).max(12).optional()}).strict().parse(body);const q=question.toLowerCase(),now=new Date();
      const company=await this.db.tenant.findUnique({where:{id:tid}});
      const scopedEmployees=await employeeScope(this.db,ctx),employeeSelf=ctx.user.role.code==='EMPLOYEE';
      const canDevices=!employeeSelf&&hasPermission(ctx.user.role.permissions,'devices','VIEW'),canAttendance=hasPermission(ctx.user.role.permissions,'attendance','VIEW'),canPayroll=hasPermission(ctx.user.role.permissions,'payroll','VIEW'),canLeave=hasPermission(ctx.user.role.permissions,'leave','VIEW');
      const smsConfigured=!!String(process.env.SMS_PROVIDER??'').trim(),recentDeliveryCutoff=new Date(now.getTime()-24*3600000);
      const [failedEmail,failedSms,deviceIssues,pendingLeave,payrollReview]=await Promise.all([
        employeeSelf?Promise.resolve(0):this.db.outbox.count({where:{tenantId:tid,kind:'EMAIL',sentAt:null,attempts:{gte:3,lt:5},createdAt:{gte:recentDeliveryCutoff}}}),
        employeeSelf?Promise.resolve(0):smsConfigured?this.db.outbox.count({where:{tenantId:tid,kind:'SMS',sentAt:null,attempts:{gte:3,lt:5},createdAt:{gte:recentDeliveryCutoff}}}):Promise.resolve(0),
        canDevices?this.db.attendanceDevice.count({where:{tenantId:tid,OR:[{status:{in:['OFFLINE','ERROR','DEGRADED']}},{lastError:{not:null}}]}}):Promise.resolve(0),
        canLeave?this.db.leaveRequest.count({where:{tenantId:tid,status:'PENDING',...(scopedEmployees?{employeeId:{in:scopedEmployees}}:{})}}):Promise.resolve(0),
        canPayroll?(employeeSelf&&ctx.user.employeeId?this.db.payrollItem.count({where:{tenantId:tid,employeeId:ctx.user.employeeId,run:{status:'LOCKED'}}}):this.db.payrollRun.count({where:{tenantId:tid,status:{in:['DRAFT','REVIEW']}}})):Promise.resolve(0)
      ]);
      const emailConfigured=!!(process.env.RESEND_API_KEY||process.env.SMTP_HOST);
      const failedMessages=failedEmail+failedSms;
      const summary='Monitor: API online, database connected, '+failedEmail+' failed email job(s), '+failedSms+' failed SMS job(s), '+deviceIssues+' attendance device issue(s).';
      let answer='';
      if(/^(hi|hello|hey|hiya|namaste|namaskar|kem cho|કેમ છો|નમસ્તે|હાય|हाय|नमस्ते)[!?. ]*$/.test(q))answer=/[\u0A80-\u0AFF]/.test(question)?'હાય! હું મેઘના છું 😊 કહો, આજે શું વાત કરવી છે?':/[\u0900-\u097F]/.test(question)?'हाय! मैं मेघना हूँ 😊 बताइए, आज क्या बात करनी है?':'Hi! I’m Meghna 😊 What would you like to talk about?';
      else if(/^(thanks|thank you|thx|આભાર|धन्यवाद)[!?. ]*$/.test(q))answer=/[\u0A80-\u0AFF]/.test(question)?'આભાર! જ્યારે ઇચ્છો ત્યારે વાત કરો 😊':/[\u0900-\u097F]/.test(question)?'आपका स्वागत है 😊 जब चाहें बात कीजिए।':'You’re welcome 😊 I’m here whenever you want to chat.';
      else if(q.includes('email')||q.includes('mail'))answer=emailConfigured?(failedEmail?'Email is configured, but '+failedEmail+' recent email delivery job(s) need attention. Verify the recipient address and delivery logs.':'Email delivery is configured and no repeated recent email failure is visible. Check Inbox/Spam for a fresh test message.'):'Email delivery is not configured yet.';
      else if(q.includes('sms')||q.includes('message'))answer=smsConfigured?('SMS provider is configured. '+(failedSms?failedSms+' recent SMS job(s) need attention.':'No repeated recent SMS delivery failure is visible.')):'SMS provider is not configured. Email works independently and SMS warnings are suppressed.';
      else if(q.includes('device')||q.includes('biometric')||q.includes('attendance'))answer=canAttendance?(employeeSelf?'Open My attendance to view your own check-in, check-out, work hours and attendance status. Device setup is managed by HR.':((deviceIssues?deviceIssues+' attendance device issue(s) need review. ':'')+'Open Attendance/Devices to check connectivity, mapping, punches and last-seen status.')):'Your role does not have access to attendance diagnostics.';
      else if(q.includes('payroll')||q.includes('salary'))answer=canPayroll?(employeeSelf?'You have '+payrollReview+' locked payslip(s) available. Open Payslips to view your own finalized salary records.':'There are '+payrollReview+' payroll run(s) in Draft/Review. Check employee monthly salary, locked attendance, leave, deductions and bank details before approval.'):'Your role does not have payroll access.';
      else if(q.includes('leave'))answer=canLeave?(employeeSelf?'You have '+pendingLeave+' pending leave request(s). Open Time off to view or submit your own request.':'There are '+pendingLeave+' pending leave request(s). Review dates and attendance impact before approval.'):'Your role does not have leave access.';
      else if(q.includes('login')||q.includes('password')||q.includes('forgot'))answer='For login issues, confirm Company Code + User ID/email. Remember me keeps a valid session on this device. Forgot Password sends a one-time link that expires in 10 minutes.';
      else if(q.includes('update')||q.includes('version'))answer=employeeSelf?'Software releases are managed by your company administrator. Your employee workspace will use the approved production release.':'TCW HR can notify you when a newer production build is available. Updates are manual: open Software Update and choose Install update when you are ready. The software will not auto-install or auto-reload.';
      else if(q.includes('problem')||q.includes('error')||q.includes('status')||q.includes('monitor')||q.includes('check'))answer=employeeSelf?'Your employee workspace is connected. If a page or request fails, tell me what you were trying to do and I’ll guide you without exposing administrator-only diagnostics.':((failedMessages||deviceIssues)?summary+' Open the Agent attention items for the exact area that needs review.':summary+' No repeated backend issue is currently detected.');
      else answer='I’m Meghna. Ask me anything naturally. I can chat with you or help with TCW HR Software, and I’ll use the available workspace facts when your question is about HR data.';
      try{const cfg=await effectiveAIConfig(this.db);if(cfg.enabled){const enhanced=await new CompatibleProvider({baseUrl:cfg.baseUrl,apiKey:cfg.apiKey,model:cfg.model}).summarize(question,{conversationHistory:history,company:{name:company?.name,status:company?.status,plan:company?.plan},failedMessages,failedEmail,failedSms,deviceIssues,pendingLeave,payrollReview,emailConfigured,smsConfigured});if(enhanced)answer=enhanced;}}catch{}
      let agentAction:any=undefined;
      if(/\b(open|go to|show)\b/.test(q)){
        const routes:[RegExp,string][]=[[/employee|people/,'/employees'],[/attendance/,'/attendance'],[/leave|time off/,'/leave'],[/payroll|salary/,'/payroll'],[/company profile|company setting/,'/company-profile'],[/notification/,'/notifications'],[/device|biometric/,'/devices'],[/report/,'/reports'],[/plan|payment|subscription|billing/,'/subscription']];
        const hit=routes.find(([rx])=>rx.test(q));if(hit)agentAction={type:'navigate',href:hit[1]};
      }
      if(/\b(refresh|reload)\b/.test(q))agentAction={type:'refresh'};
      if(/password|credential|login id|api key|secret/.test(q)&&/(show|tell|give|change|reset|reveal)/.test(q)){answer='I can help you navigate account and security settings, but I will not reveal, request, change, or expose passwords, login IDs, API keys, or other credentials.';agentAction=undefined;}
      await audit(this.db,ctx,'AGENT_HELP','agent');
      return {answer,model:'Meghna',action:agentAction};
    }
    if(resource==='reports'&&method==='GET')return this.report(ctx,key,req,res);
    if(resource==='ai'&&key==='status'&&method==='GET'){tenant(ctx);requirePermission(ctx,'ai','VIEW');return publicAIConfig(this.db);}
    if(resource==='ai'&&method==='POST'){
      tenant(ctx);requirePermission(ctx,'ai','VIEW');const {question,history=[]}=z.object({question:z.string().min(3).max(1000),history:z.array(z.object({role:z.enum(['user','assistant']),text:z.string().trim().max(1600)}).strict()).max(10).optional()}).strict().parse(body);
      const dashboard=await this.data.dashboard(ctx);
      const facts={conversationHistory:history,employeeCount:dashboard.employees?.length,attendance:dashboard.attendance?.map((r:any)=>({date:r.date,status:r.status,workMinutes:r.workMinutes,lateMinutes:r.lateMinutes,overtimeMinutes:r.overtimeMinutes})),leave:dashboard.leave?.map((r:any)=>({startDate:r.startDate,endDate:r.endDate,status:r.status,days:r.days})),openJobs:dashboard.jobs};
      try{const cfg=await effectiveAIConfig(this.db);if(!cfg.enabled){const attendance=facts.attendance??[],leave=facts.leave??[];const present=attendance.filter((r:any)=>r.status==='PRESENT').length,late=attendance.filter((r:any)=>(r.lateMinutes??0)>0).length,absent=attendance.filter((r:any)=>r.status==='ABSENT').length,pendingLeave=leave.filter((r:any)=>r.status==='PENDING').length;const q=question.toLowerCase();let answer='';if(q.includes('payroll')||q.includes('salary'))answer=`Payroll readiness: ${facts.employeeCount??0} employee record(s) are in scope. Review salary amounts, locked attendance, pending leave and bank details before approval. Current attendance snapshot: ${present} present, ${absent} absent, ${late} late record(s); ${pendingLeave} leave request(s) pending.`;else if(q.includes('leave'))answer=`Leave overview: ${pendingLeave} request(s) are pending review. Review overlapping dates and attendance before approving leave that affects payroll.`;else if(q.includes('attendance')||q.includes('late')||q.includes('absent'))answer=`Attendance overview: ${present} present record(s), ${absent} absent record(s), and ${late} late record(s) in the available dashboard window. Review exceptions before payroll is locked.`;else answer=`Workforce overview: ${facts.employeeCount??0} employee(s) are in scope, with ${pendingLeave} pending leave request(s). Attendance snapshot shows ${present} present, ${absent} absent and ${late} late record(s). Ask about attendance, leave, payroll or salary for a focused summary.`;await audit(this.db,ctx,'AI_LOCAL_SUMMARY','ai');return {answer,model:'TCW HR Insights'};}const answer=await new CompatibleProvider({baseUrl:cfg.baseUrl,apiKey:cfg.apiKey,model:cfg.model}).summarize(question,facts);await audit(this.db,ctx,'AI_SUMMARY','ai');return {answer,model:cfg.model};}catch(e:any){throw new ServiceUnavailableException(e.message);}
    }
    return this.data.resource(ctx,resource,method,key,body,req.query);
  }
  async report(ctx:Context,type:string,req:Request,res:Response){
    requirePermission(ctx,'reports','EXPORT');
    let rows:any[]=[];
    if(type==='employees'){requirePermission(ctx,'employees','EXPORT');rows=(await this.data.employees(ctx,'GET',undefined,undefined,{...req.query,pageSize:500})).items;}
    else if(type==='attendance'){requirePermission(ctx,'attendance','EXPORT');rows=((await this.flows.attendance(ctx,'GET',undefined,req.query)) as any).items;}
    else if(type==='attendance-summary'){requirePermission(ctx,'attendance','EXPORT');const tid=tenant(ctx);const month=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).parse(String(req.query.month??''));rows=(await (await import('./attendance-automation')).attendanceMonthSummary(this.db,tid,month)).items;}
    else if(type==='leave'){requirePermission(ctx,'leave','EXPORT');rows=((await this.flows.leave(ctx,'GET',undefined)) as any).items;}
    else if(type==='payroll'){requirePermission(ctx,'payroll','EXPORT');rows=((await this.flows.payroll(ctx,'GET')) as any).items;}
    else if(type==='bank-payout'){
      requirePermission(ctx,'payroll','EXPORT');const tid=tenant(ctx);const runId=id.parse(String(req.query.runId??''));const run=await this.db.payrollRun.findFirst({where:{id:runId,tenantId:tid,status:{in:['APPROVED','LOCKED']}},include:{items:true}});if(!run)throw new BadRequestException('Approve payroll before generating a bank payout file.');
      const employees=await this.db.employee.findMany({where:{tenantId:tid,id:{in:run.items.map(i=>i.employeeId)}}});const byId=new Map(employees.map(e=>[e.id,e]));
      rows=run.items.map(item=>{const employee=byId.get(item.employeeId),personal=(employee?.personal&&typeof employee.personal==='object'&&!Array.isArray(employee.personal)?employee.personal:{}) as any;return {employeeCode:item.employeeCode,employeeName:item.employeeName,accountHolder:personal.accountHolder??item.employeeName,bankName:personal.bankName??'',accountNumber:personal.accountNumber??'',ifsc:personal.ifsc??'',netAmount:(item.net/100).toFixed(2),reference:`SAL-${run.month}-${item.employeeCode}`};});
      if(rows.some(r=>!r.accountNumber||!r.ifsc))throw new BadRequestException('Complete bank account number and IFSC for every employee before exporting payout data.');
    }
    else if(['expenses','assets','goals','candidates'].includes(type)){const resource=type==='goals'?'performance':type==='candidates'?'recruitment':type;requirePermission(ctx,resource,'EXPORT');rows=(await this.data.resource(ctx,type,'GET',undefined,undefined,{pageSize:500})).items;}
    else throw new NotFoundException('Report not found.');
    const csv=toCsv(rows.map(({personal,passwordHash,items,...r})=>r));
    res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="tcw-hr-${type}.csv"`);res.send(csv);return undefined;
  }
}
@Controller('api')
class RootController {
  constructor(@Inject('API') private api:Api){}
  @All('*path') async route(@Req()req:Request,@Res()res:Response){
    try{const result=await this.api.handle(req,res);if(result!==undefined&&!res.headersSent)res.json(result);if(!['GET','HEAD'].includes(req.method)&&res.statusCode<400){try{const ctx=await authenticate(this.api.db,{...req,method:'GET'} as Request);this.api.io?.to(ctx.tenantId??'PLATFORM').emit('changed',{resource:req.path.split('/')[2]});}catch{}}}
    catch(e:any){
      if(res.headersSent)return;
      let status=500,message='Something went wrong. Please try again.';
      if(e instanceof ZodError){status=400;message=e.issues.map(i=>`${i.path.join('.')||'Input'}: ${i.message}`).join('; ');}
      else if(e instanceof HttpException){status=e.getStatus();message=e.message;}
      else if(e.code==='P2002'){status=409;message='A record with these details already exists.';}
      else if(e.code==='P2003'){status=409;message='This record is referenced by another record.';}
      else if(e.code==='P2025'){status=404;message='Record not found.';}
      else if(e.code==='P2034'){status=409;message='This record changed during your request. Refresh and retry.';}
      else if(e.code==='LIMIT_FILE_SIZE'){status=400;message='Maximum file size is 10 MB.';}
      else if(e.message?.startsWith('Payroll cannot')||e.message==='Deductions exceed pay'){status=400;message=e.message;}
      if(status===500)console.error('Request failed',process.env.NODE_ENV==='test'?e.message:(e.code??e.name));
      res.status(status).json({message});
    }
  }
}
@Controller('iclock')
class BiomaxPushController {
  constructor(@Inject('API') private api:Api){}
  @All('*path') async route(@Req()req:Request,@Res()res:Response){
    const action=req.path.split('/').filter(Boolean).at(-1)??'';
    const serial=String(req.query.SN??req.query.sn??'').trim();
    const send=(status:number,text:string)=>{res.status(status).type('text/plain').send(text);};
    try{
      let result:{text:string;tenantId?:string;deviceId?:string}|undefined;
      if(action==='cdata'&&req.method==='GET')result=await this.api.biometric.nativeOptions(serial,req.ip);
      else if(action==='cdata'&&req.method==='POST')result=await this.api.biometric.nativeCdata(serial,String(req.query.table??''),typeof req.body==='string'?req.body:Buffer.isBuffer(req.body)?req.body.toString('utf8'):String(req.body??''),req.ip);
      else if(action==='getrequest'&&['GET','POST'].includes(req.method))result=await this.api.biometric.nativePoll(serial,req.ip);
      else if(action==='devicecmd'&&req.method==='POST')result=await this.api.biometric.nativeCommandAck(serial,typeof req.body==='string'?req.body:String(req.body??''),req.ip);
      else if(action==='registry'&&['GET','POST'].includes(req.method))result=req.method==='GET'?await this.api.biometric.nativeOptions(serial,req.ip):await this.api.biometric.nativeRegistry(serial,typeof req.body==='string'?req.body:String(req.body??''),req.ip);
      else if(action==='ping'&&['GET','POST'].includes(req.method))result=await this.api.biometric.nativePing(serial,req.ip);
      else{send(404,'ERROR');return;}
      if(result.tenantId)this.api.io?.to(result.tenantId).emit('changed',{resource:'attendance'});
      send(200,result.text);
    }catch(e:any){
      const status=e instanceof HttpException?e.getStatus():500;
      if(status===500)console.error('BioMax PUSH failed',e?.message??e);
      send(status,status>=500?'ERROR':String(e?.message??'ERROR').slice(0,300));
    }
  }
}
export async function createApp(db:Database){
  const api=new Api(db);
  @Module({controllers:[RootController,BiomaxPushController],providers:[{provide:'API',useValue:api}]})class AppModule{}
  const app=await NestFactory.create(AppModule,{logger:process.env.NODE_ENV==='test'?false:['error','warn','log'],bodyParser:false});
  app.use(helmet());app.use(cookieParser());app.use('/iclock',expressText({type:'*/*',limit:'2mb'}));app.use(json({limit:'8mb'}));
  // Edge Nginx adds an independent shared limit. This cap protects a local instance.
  const windows=new Map<string,{start:number;count:number}>();
  app.use((req:Request,res:Response,next:()=>void)=>{
    const now=Date.now(),key=req.ip??'unknown',row=windows.get(key);
    if(!row||now-row.start>60000){windows.set(key,{start:now,count:1});if(windows.size>10000)for(const[k,v]of windows)if(now-v.start>60000)windows.delete(k);}
    else if(++row.count>300){res.status(429).json({message:'Too many requests. Try again in a minute.'});return;}
    res.setHeader('Cache-Control','no-store');next();
  });
  await app.init();
  if(process.env.NODE_ENV==='production'&&process.env.RELEASE_UPDATES_ENABLED==='true'&&String(process.env.RAILWAY_SERVICE_NAME??'')==='tcw-hr-software'){
    const deployment=String(process.env.RAILWAY_DEPLOYMENT_ID??process.env.RAILWAY_GIT_COMMIT_SHA??'').trim();
    if(deployment){
      setTimeout(async()=>{
        try{
          const key='last-web-push-software-release';
          const previous=await db.platformSetting.findUnique({where:{key}});
          const last=previous?.value&&typeof previous.value==='object'&&!Array.isArray(previous.value)?String((previous.value as any).deployment??''):'';
          if(last===deployment)return;
          await db.platformSetting.upsert({where:{key},create:{key,value:{deployment,at:new Date().toISOString()}},update:{value:{deployment,at:new Date().toISOString()}}});
          await sendPush(db,{title:'TCW HR Software update available',body:'A new version is ready. Open Software update when you want to install it.',url:'/software-update',tag:'tcw-software-update'});
        }catch{}
      },8000);
    }
  }
  const io=new Server(app.getHttpServer(),{path:'/socket.io',cors:{origin:(origin,callback)=>{if(!origin||allowedAppOrigin(origin))callback(null,true);else callback(new Error('Origin not allowed'));},credentials:true}});api.io=io;
  io.use(async(socket,next)=>{try{
    const header=socket.handshake.headers.cookie??'';const cookies=Object.fromEntries(header.split(';').map(s=>s.trim().split('=')));
    const headers={...socket.handshake.headers,...(process.env.NODE_ENV!=='production'&&socket.handshake.auth?.localSessionToken?{'x-tcw-local-session':String(socket.handshake.auth.localSessionToken)}:{})};
    const ctx=await authenticate(db,{cookies,headers,method:'GET',ip:socket.handshake.address} as Request);
    socket.data.ctx=ctx;next();
  }catch{next(new Error('Authentication required.'));}});
  io.on('connection',socket=>{const ctx:Context=socket.data.ctx;socket.join(ctx.tenantId??'PLATFORM');const timer=setTimeout(()=>socket.disconnect(true),Math.max(0,+ctx.session.expiresAt-Date.now()));timer.unref();socket.on('disconnect',()=>clearTimeout(timer));});
  return {app,api,io};
}
