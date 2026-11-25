import {CloudStorage} from './cloud-storage';
import {planAllowsResource,planAccessMessage,planModuleFeatures} from '../../../packages/plan-access';
import {pricedPlan,isPlanDowngrade} from '../../../packages/subscription-policy';
import {billingLimited,billingRouteBlocked} from '../../../packages/billing-access';
import {workspaceWeather} from './workspace-weather';
import {DEFAULT_PRODUCT_LOGO,effectiveCompanyLogo} from '../../../packages/branding';
import {publicLoading,loadingSettings} from './loading-branding';
import {salesPipeline} from './sales-pipeline';
import {subscriptionInvoice} from './subscription-invoices';
import {SubscriptionGateway} from './subscription-gateway';
import {statutoryImport,statutoryColumns} from './statutory-import';
import {WorkforceSettings} from './workforce-settings';
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
import {toCsv,toXlsx,toPdf} from '../../../packages/reporting-engine';
import {hasPermission} from '../../../packages/permissions';
import {CompatibleProvider} from '../../../packages/ai';
import {sessionExpiryTimerDelay} from '../../../packages/session-timer';
import {effectiveAIConfig,publicAIConfig,saveAIConfig,testAIConnection} from './ai-config';
import {AuthService} from './auth';
import {pushConfig,savePushSubscription,deletePushSubscription,sendPush} from './push';
import {DataService} from './data';
import {Workflows} from './workflows';
import {FilesService} from './files';
import {BiometricService} from './biometric';
import {PayoutService} from './payouts';
import {PayoutConnections} from './payout-connections';
import {PayrollPayments} from './payroll-payments';
import {reportRows} from './report-data';
import {Releases,ReleaseCandidate,runningRelease,claimReleaseNotice,releaseRecipients} from './releases';
import {reportsAccess,requireReportsAccess} from './reports-access';
import {twoFactor} from './two-factor';
import {SalaryOperations} from './salary-operations';
import {salaryPaymentChallan,salaryChallanPdf} from './salary-challan';
import {FieldWork} from './field-work';
import {PeopleOperations} from './people-operations';
import {approvalPolicies} from './approvals';
import {employeeImport,importColumns} from './employee-import';
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
  billing:SubscriptionGateway;auth:AuthService;data:DataService;flows:Workflows;files:FilesService;biometric:BiometricService;payouts:PayoutService;io?:Server;
  releases:Releases;
  constructor(public db:Database,releaseSource?:()=>Promise<ReleaseCandidate>){this.billing=new SubscriptionGateway(db);this.auth=new AuthService(db);this.data=new DataService(db);this.flows=new Workflows(db);this.files=new FilesService(db);this.biometric=new BiometricService(db);this.payouts=new PayoutService(db);this.releases=new Releases(db,releaseSource);}
  async handle(req:Request,res:Response){
    const parts=req.path.replace(/^\/api\/?/,'').split('/').filter(Boolean),[resource,key,action]=parts;
    const method=req.method;
    if(resource==='billing'&&key==='razorpay'&&action==='webhook'&&parts[3]&&method==='POST')return this.billing.webhook(parts[3],(req as any).rawBody,String(req.headers['x-razorpay-signature']??''),String(req.headers['x-razorpay-event-id']??''));
    if(resource==='health'&&method==='GET')return {status:'ok',service:'tcw-hr-api'};
    if(resource==='version'&&method==='GET')return {version:runningRelease(),release:process.env.APP_VERSION??process.env.npm_package_version??'1.3.0',channel:process.env.APP_RELEASE_CHANNEL??'Production'};
    if(resource==='releases'&&key==='deployable'&&method==='GET')return this.releases.deployable();
    if(resource==='branding'&&method==='GET'){
      const row=await this.db.platformSetting.findUnique({where:{key:'branding'}});
      const value=row?.value&&typeof row.value==='object'&&!Array.isArray(row.value)?row.value as any:{};
      return {logo:effectiveCompanyLogo(null,value.logo),...(req.query.logoOnly==='1'?{}:{loading:await publicLoading(this.db)}),updatedAt:row?.updatedAt??null};
    }
    if(resource==='tenant-branding'&&key&&method==='GET'){
      const code=z.string().trim().toUpperCase().min(3).max(60).regex(/^[A-Z0-9-]+$/).parse(key);
      const company=await this.db.tenant.findUnique({where:{code},select:{name:true,logo:true,profile:true}});
      if(!company)return {found:false};
      const profile=company.profile&&typeof company.profile==='object'&&!Array.isArray(company.profile)?company.profile as any:{};
      const branding=await this.db.platformSetting.findUnique({where:{key:'branding'}});
      return {found:true,name:company.name,logo:effectiveCompanyLogo(company.logo,(branding?.value as any)?.logo),primaryColor:String(profile.primaryColor??'#3474ef')};
    }
    if(resource==='biometric'&&key==='push'&&method==='POST')return this.biometric.genericPush(req.headers as any,req.body);
    if(resource==='biometric'&&key==='biomax'&&action==='push'&&method==='POST')return this.biometric.biomaxPush(req.headers as any,req.body);
    if(!['GET','HEAD','OPTIONS'].includes(method)){
      const origin=String(req.headers.origin??'');
      if(!allowedAppOrigin(origin))throw new ForbiddenException('Request origin is not allowed.');
    }
    if(resource==='auth'){
      if(key==='proxy-claim'&&method==='POST')return this.auth.claimProxy(req.body,req,res);
      if(key==='login'&&method==='POST')return this.auth.login(req.body,req,res);
      if(key==='signup'&&method==='POST')return this.auth.signup(req.body,req,res);
      if(key==='forgot-password'&&method==='POST')return this.auth.forgot(req.body);
      if(key==='reset-password'&&action==='claim'&&method==='POST')return this.auth.claimReset(req.body,req,res);
      if(key==='reset-password'&&!action&&method==='POST')return this.auth.reset(req.body,req,res);
    }
    const ctx=await authenticate(this.db,req);
    if(resource==='auth'&&key==='proxy-start'&&method==='POST')return this.auth.startProxy(ctx,req.body);
    if(ctx.session.proxyParentSessionId&&resource==='auth'&&!['me','logout'].includes(key)&&!(key==='profile'&&method==='GET'))throw new ForbiddenException('Manage your platform identity from Super Admin after ending proxy access.');
    if(resource==='releases'&&key==='status'&&method==='GET')return this.releases.status(ctx);
    if(resource==='releases'&&key==='update'&&method==='POST')return this.releases.update(ctx,z.object({version:z.string().regex(/^[a-f0-9]{40}$/)}).strict().parse(req.body).version);
    if(resource==='releases')throw new NotFoundException('Software update route not found.');
    const body=req.body;
    if(resource==='weather'&&method==='GET')return workspaceWeather(this.db,ctx);
    if(ctx.tenantId){
      const company=await this.db.tenant.findUnique({where:{id:ctx.tenantId}});
      if(billingLimited(company)&&!ctx.session.proxyParentSessionId&&billingRouteBlocked(resource,key,action,method,req.query))throw new ForbiddenException('Your plan has ended. Renew to process payroll, use reports or exports, or add employees. Login, employee profiles and attendance remain available.');
    }
    if(ctx.tenantId&&ctx.planName&&!planAllowsResource(ctx.planName,resource))throw new ForbiddenException(planAccessMessage(ctx.planName,resource));
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
    if(resource==='system'&&key==='loading-branding'&&['GET','PUT'].includes(method))return loadingSettings(this.db,ctx,method,body);
    if(resource==='platform'&&key==='sales-pipeline'&&['GET','PATCH'].includes(method))return salesPipeline(this.db,ctx,method,action,body);
    if(((resource==='subscription'&&key==='invoices'&&action&&parts[3]==='download')||(resource==='platform'&&key==='invoices'&&action&&parts[3]==='download'))&&method==='GET'){
      const file=await subscriptionInvoice(this.db,ctx,action);res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${file.filename}"`);res.setHeader('Cache-Control','private, no-store');res.end(file.bytes);return;
    }
    if(resource==='system'&&key==='billing-gateway')return this.billing.settings(ctx,method,body,req.query);
    if(resource==='subscription'&&key==='contact-sales'&&method==='POST')return this.billing.contactSales(ctx,body);
    if(resource==='subscription'&&key==='quote'&&method==='POST')return this.billing.checkout(ctx,body,true);
    if(resource==='subscription'&&key==='checkout'&&action&&method==='GET')return this.billing.checkoutDetails(ctx,action);
    if(resource==='subscription'&&key==='gateway-checkout'&&method==='POST')return this.billing.checkout(ctx,body);
    if(resource==='subscription'&&key==='gateway-verify'&&method==='POST')return this.billing.verify(ctx,body);
    if(resource==='subscription'&&key==='replace-unpaid'&&method==='POST')return this.billing.replaceUnpaid(ctx,body);
    if(resource==='subscription'&&key==='gateway-status'&&method==='POST')return this.billing.reconcile(ctx,body);
    if(resource==='subscription'&&key==='autopay-cancel'&&method==='POST')return this.billing.cancel(ctx,body);
    if(resource==='subscription'&&!key&&method==='GET'){
      const tid=tenant(ctx);requirePermission(ctx,'company','VIEW');const company=await this.db.tenant.findUniqueOrThrow({where:{id:tid}});const [invoices,plans,employeesUsed,devicesUsed]=await Promise.all([
        this.db.invoice.findMany({where:{tenantId:tid},orderBy:{createdAt:'desc'},take:24}),
        this.db.plan.findMany({orderBy:{monthlyPrice:'asc'}}),
        this.db.employee.count({where:{tenantId:tid,deletedAt:null}}),
        this.db.attendanceDevice.count({where:{tenantId:tid,connectionMode:{not:'EMPLOYEE_APP'}}})
      ]);
      const payRow=await this.db.platformSetting.findUnique({where:{key:'billing-payment'}});
      const pay=payRow?.value&&typeof payRow.value==='object'&&!Array.isArray(payRow.value)?payRow.value as any:{};
      const upiId=String(pay.upiId??process.env.PAYMENT_UPI_ID??'').trim(),payeeName=String(pay.payeeName??process.env.PAYMENT_UPI_NAME??'TCW HR Software').trim();
      const gstPercent=Math.max(0,Math.min(100,Number(pay.gstPercent??process.env.PAYMENT_GST_PERCENT??18)));
      const billing=await this.billing.summary(ctx);return {...billing,company,plans:plans.map(p=>({...pricedPlan(p),moduleFeatures:planModuleFeatures(p.name)})),invoices,usage:{employeesUsed,devicesUsed},gatewayConfigured:billing.gateway.configured||!!String(process.env.PAYMENT_CHECKOUT_BASE_URL??'').trim(),upiConfigured:!!upiId,upi:{payeeName},gstPercent,pricesIncludeGst:pay.pricesIncludeGst===true};
    }
    if(resource==='subscription'&&!key&&method==='POST'){
      const tid=tenant(ctx);requirePermission(ctx,'company','EDIT');
      if(await this.db.billingCheckout.count({where:{tenantId:tid,mode:'LIVE',kind:'AUTOPAY',state:{notIn:['FAILED','ABANDONED','QUOTED']},OR:[{mandateStatus:null},{mandateStatus:{notIn:['cancelled','completed','expired']}}]}}))throw new ConflictException('Cancel the existing AutoPay mandate before starting another subscription payment.');
      const input=z.object({plan:z.enum(['STARTER','GROWTH','ENTERPRISE']),mode:z.enum(['GATEWAY','UPI']).default('UPI')}).strict().parse(body);
      const [company,plan,payRow]=await Promise.all([
        this.db.tenant.findUniqueOrThrow({where:{id:tid}}),
        this.db.plan.findUnique({where:{name:input.plan}}),
        this.db.platformSetting.findUnique({where:{key:'billing-payment'}})
      ]);
      if(!plan)throw new BadRequestException('Selected subscription plan is unavailable.');
      if(isPlanDowngrade(company.plan,plan.name))throw new BadRequestException('Plan downgrades are not available. Choose your current plan or upgrade.');
      if(company.status!=='TRIAL'&&company.expiresAt&&company.expiresAt>new Date())throw new BadRequestException('Use secure checkout for unused-time upgrade credit or renewal at expiry.');
      const offered=pricedPlan(plan);if(offered.monthlyPrice<100)throw new BadRequestException('This price needs administrator review.');
      const pay=payRow?.value&&typeof payRow.value==='object'&&!Array.isArray(payRow.value)?payRow.value as any:{};
      const base=String(process.env.PAYMENT_CHECKOUT_BASE_URL??'').trim();
      const upiId=String(pay.upiId??process.env.PAYMENT_UPI_ID??'').trim(),payeeName=String(pay.payeeName??process.env.PAYMENT_UPI_NAME??'TCW HR Software').trim();
      const gstPercent=Math.max(0,Math.min(100,Number(pay.gstPercent??process.env.PAYMENT_GST_PERCENT??18)));
      if(input.mode==='GATEWAY')throw new BadRequestException('Use the verified Razorpay checkout flow for online payments.');
      if(input.mode==='UPI'&&!upiId)throw new ServiceUnavailableException('UPI payment is not configured yet.');
      const amount=pay.pricesIncludeGst===true?Math.round(offered.monthlyPrice/(1+gstPercent/100)):offered.monthlyPrice,tax=pay.pricesIncludeGst===true?offered.monthlyPrice-amount:Math.round(amount*gstPercent/100),total=amount+tax;
      const open=await this.db.invoice.findFirst({where:{tenantId:tid,status:{in:['DRAFT','ISSUED','OVERDUE','PART_PAID']},amount,tax,total},orderBy:{createdAt:'desc'}});
      const invoice=open??await this.db.invoice.create({data:{tenantId:tid,number:`TCW-${Date.now()}-${Math.floor(1000+Math.random()*9000)}`,amount,tax,total,status:'DRAFT',dueDate:new Date(new Date().toISOString().slice(0,10))}});
      await this.db.tenant.update({where:{id:tid},data:{profile:{...(company.profile as any??{}),pendingPlan:plan.name,paymentRequestedAt:new Date().toISOString(),paymentMode:input.mode,pendingInvoiceId:invoice.id}}});
      await audit(this.db,ctx,'SUBSCRIPTION_PAYMENT_STARTED','tenants',tid,undefined,{plan:plan.name,invoiceId:invoice.id,total:invoice.total,mode:input.mode});

      const upiAmount=(invoice.total/100).toFixed(2);
      const upiUrl=`upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${encodeURIComponent(upiAmount)}&cu=INR&tn=${encodeURIComponent('TCW HR '+invoice.number)}`;
      const qrUrl=`https://quickchart.io/qr?size=280&margin=1&text=${encodeURIComponent(upiUrl)}`;
      return {ok:true,invoice,plan,mode:'UPI',upiUrl,qrUrl,upi:{payeeName},amount:upiAmount,gstPercent,breakdown:{subtotal:invoice.amount,tax:invoice.tax,total:invoice.total}};
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
      if(key==='two-factor')return twoFactor(this.db,ctx,method,action,body);
      if(key==='me'&&method==='GET')return {user:this.auth.publicUser(ctx.user),csrf:ctx.session.csrf,sessionExpiresAt:ctx.session.expiresAt.toISOString(),company:ctx.tenantId?await this.db.tenant.findUnique({where:{id:ctx.tenantId}}):null,...(ctx.session.proxyParentSessionId?{proxy:{actorName:ctx.user.name,expiresAt:ctx.session.expiresAt.toISOString(),returnUrl:new URL('/companies',process.env.ADMIN_URL??'http://localhost:3001').toString()}}:{})};
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
      const branding=await this.db.platformSetting.findUnique({where:{key:'branding'}});
      return {id:company.id,name:company.name,code:company.code,logo:effectiveCompanyLogo(company.logo,(branding?.value as any)?.logo),status:company.status,expiresAt:company.expiresAt,timezone:company.timezone,primaryColor:String(profile.primaryColor??'#3474ef')};
    }
    if(resource==='company'&&key==='billing-details'&&method==='PATCH')return this.billing.saveCustomerDetails(ctx,body);
    if(resource==='company'&&['GET','PATCH'].includes(method))return this.data.company(ctx,method==='PATCH'?body:undefined);
    if(resource==='payroll'&&key&&action==='payment-challan'&&method==='GET'){
      const format=z.enum(['json','pdf']).parse(String(req.query.format??'json'));
      if(format==='pdf')requirePermission(ctx,'payroll','EXPORT');
      const challan=await salaryPaymentChallan(this.db,ctx,key);
      res.setHeader('Cache-Control','private, no-store');
      if(format==='json')return challan;
      const bytes=salaryChallanPdf(challan);
      res.setHeader('Content-Type','application/pdf');
      res.setHeader('Content-Disposition',`attachment; filename="salary-payment-challan-${challan.month}-${challan.runId}.pdf"`);
      res.setHeader('X-Content-Type-Options','nosniff');res.end(bytes);return;
    }
    if(resource==='salary-employees'&&method==='GET'){const tid=tenant(ctx);requirePermission(ctx,'payroll','MANAGE');const scope=await employeeScope(this.db,ctx);if(scope)throw new ForbiddenException();const search=String(req.query.q??'').trim().slice(0,100);return {items:await this.db.employee.findMany({where:{tenantId:tid,deletedAt:null,...(search?{OR:[{firstName:{contains:search,mode:'insensitive'}},{lastName:{contains:search,mode:'insensitive'}},{employeeCode:{contains:search,mode:'insensitive'}}]}:{})},select:{id:true,employeeCode:true,firstName:true,lastName:true,monthlySalary:true,updatedAt:true,joiningDate:true},orderBy:{employeeCode:'asc'},take:100})};}
    if(resource==='payroll-settings')return new WorkforceSettings(this.db).config(ctx,'PAYROLL',method,body,req.query);
    if(resource==='leave-policies')return new WorkforceSettings(this.db).config(ctx,'LEAVE',method,body,req.query);
    if(resource==='holiday-reward-choices')return new WorkforceSettings(this.db).config(ctx,'HOLIDAY',method,body,req.query);
    if(resource==='leave-settings-directory'&&method==='GET')return new WorkforceSettings(this.db).leaveDirectory(ctx);
    if(resource==='payroll-settings-directory'&&method==='GET')return new WorkforceSettings(this.db).directory(ctx);
    if(resource==='salary-contracts')return new WorkforceSettings(this.db).contracts(ctx,method,body,key);
    if(resource==='pay-items')return new WorkforceSettings(this.db).payItems(ctx,method,body,key);
    if(resource==='tax-declarations')return new WorkforceSettings(this.db).tax(ctx,method,body,req.query);
    if(resource==='statutory-ids'&&key==='template'&&method==='GET'){const directory=await new WorkforceSettings(this.db).directory(ctx);const rows=directory.employees.map((e:any)=>Object.fromEntries(statutoryColumns.map(k=>[k,k==='employeeCode'?e.employeeCode:e.personal?.[k]??''])));res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition','attachment; filename="statutory-ids-template.xlsx"');res.setHeader('Cache-Control','private, no-store');res.end(toXlsx(rows.length?rows:[Object.fromEntries(statutoryColumns.map(k=>[k,'']))],'Statutory IDs'));return;}
    if(resource==='statutory-ids'&&key==='import'&&method==='POST'&&['preview','commit'].includes(action??''))return statutoryImport(this.db,ctx,body,action==='commit');
    if(resource==='statutory-ids'&&method==='POST')return new WorkforceSettings(this.db).ids(ctx,body);
    if(resource==='salary-versions'&&key)return new SalaryOperations(this.db).versions(ctx,key,method,body);
    if(resource==='payroll-loans')return new SalaryOperations(this.db).loans(ctx,method,body,key);
    if(resource==='approval-policies')return approvalPolicies(this.db,ctx,method,body);
    if(resource==='operations'&&key==='summary'&&method==='GET')return new PeopleOperations(this.db).summary(ctx);
    if(resource==='employees'&&key==='import-template'&&method==='GET'){
      requirePermission(ctx,'employees','IMPORT');const format=z.enum(['csv','xlsx']).parse(String(req.query.format??'xlsx'));
      const sample=Object.fromEntries(importColumns.map(k=>[k,({employeeCode:'EMP-001',firstName:'First',lastName:'Last',email:'employee@example.test',phone:'9000000000',joiningDate:'2026-01-01',employmentType:'FULL_TIME',status:'ACTIVE',monthlySalary:'25000.00'} as any)[k]??'']));
      res.setHeader('Content-Type',format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="employee-import-template.${format}"`);res.setHeader('Cache-Control','private, no-store');res.end(format==='xlsx'?toXlsx([sample],'Employees'):toCsv([sample]));return;
    }
    if(resource==='employees'&&key==='import'&&method==='POST')return employeeImport(this.db,ctx,body,action==='commit');
    if(resource==='employees'&&key&&action==='tasks')return new PeopleOperations(this.db).tasks(ctx,key,method,body);
    if(resource==='employees'&&key&&action==='letter'&&method==='GET'){
      const bytes=await new PeopleOperations(this.db).letter(ctx,key,String(req.query.kind??'appointment'));res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','attachment; filename="employee-letter.pdf"');res.setHeader('Cache-Control','private, no-store');res.end(bytes);return;
    }
    if(resource==='assets'&&key&&action==='history'&&method==='GET')return new PeopleOperations(this.db).assetHistory(ctx,key);
    if(resource==='courses'&&key&&action==='enrollments')return new PeopleOperations(this.db).enrollments(ctx,key,method,body);
    if(resource==='training-certificates'&&key&&method==='GET'){
      const bytes=await new PeopleOperations(this.db).certificate(ctx,key);res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','attachment; filename="training-certificate.pdf"');res.setHeader('Cache-Control','private, no-store');res.end(bytes);return;
    }
    if(resource==='employees'&&key&&action==='app-access')return this.data.employeeAppAccess(ctx,key,method,body);
    if(resource==='organization-chart'&&method==='GET')return this.data.organizationChart(ctx);
    if(resource==='employees')return this.data.employees(ctx,method,key,body,req.query);
    if(resource==='users')return this.data.users(ctx,method,body,key);
    if(resource==='roles'&&method==='GET'){requirePermission(ctx,'users','VIEW');return {items:await this.db.role.findMany({where:{scope:ctx.user.role.scope}})};}
    if(resource==='platform'){return this.data.platformResource(ctx,key,method,action,body,req.query);}
    if(resource==='attendance')return this.flows.attendance(ctx,method,body,req.query,key,action);
    if(['leave','expenses','travel'].includes(resource)&&key&&action==='review'&&method==='POST')return this.flows.review(ctx,resource,key,body);
    if(resource==='leave'&&key&&action==='cancel'&&method==='POST')return this.flows.cancelLeave(ctx,key,body);
    if(resource==='leave'&&key==='balances'&&method==='GET')return this.flows.leaveBalances(ctx,req.query);
    if(resource==='leave')return this.flows.leave(ctx,method,body);
    if(resource==='payroll-adjustments'&&method==='POST')return this.flows.adjustment(ctx,body);
    if(resource==='payroll-payment-settings'){const service=new PayoutConnections(this.db);if(method==='GET')return service.get(ctx);if(method==='PUT')return service.save(ctx,body);}
    if(resource==='payroll'&&key&&action==='payment-overview'&&method==='GET')return new PayrollPayments(this.db).overview(ctx,id.parse(key));
    if(resource==='payroll'&&key&&action==='payment-schedule'){const service=new PayrollPayments(this.db);if(method==='POST')return service.schedule(ctx,id.parse(key),body);if(method==='DELETE')return service.cancel(ctx,id.parse(key));}
    if(resource==='payroll'&&key&&action==='manual-payment'&&method==='POST')return new PayrollPayments(this.db).manual(ctx,id.parse(key),body);
    if(resource==='payout-reconciliation'&&method==='GET')return this.payouts.reconciliation(ctx);
    if(resource==='payroll'&&key&&action==='payouts'&&method==='GET')return this.payouts.list(ctx,id.parse(key));
    if(resource==='payroll'&&key&&action==='payout'&&method==='POST')return this.payouts.pay(ctx,id.parse(key),body);
    if(resource==='payroll'&&key&&action==='payment-reference'&&method==='POST')return this.payouts.recoverReference(ctx,id.parse(key),body);
    if(resource==='payroll'&&key&&action==='payout-sync'&&method==='POST')return this.payouts.sync(ctx,id.parse(key));
    if(resource==='payroll')return this.flows.payroll(ctx,method,key,action,body);
    if(resource==='field-work'){res.setHeader('Cache-Control','private, no-store');return new FieldWork(this.db).handle(ctx,method,body,req.query,key,action);}
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
      if(method==='GET'&&key==='storage')return this.files.status(ctx);
      if(method==='GET'&&!key)return this.files.list(ctx,req.query);
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
    
    if(resource==='system'&&key==='cloud-drive'&&['GET','PUT'].includes(method))return new CloudStorage(this.db).settings(ctx,method,body);
    if(resource==='system'&&key==='platform-profile'){
      platform(ctx);
      const defaults={companyName:'Tech Cyber Warrior',legalName:'',companyType:'',registrationNumber:'',foundedYear:'',contactPerson:'',contactDesignation:'',billingEmail:'',email:'',phone:'',website:'https://techcyberwarrior.in',address:'',city:'',state:'Gujarat',country:'India',postalCode:'',taxId:'',pan:'',supportEmail:'',logo:DEFAULT_PRODUCT_LOGO};
      if(method==='GET'){
        requirePermission(ctx,'system','VIEW');
        const [profileRow,brandingRow]=await Promise.all([
          this.db.platformSetting.findUnique({where:{key:'platform-profile'}}),
          this.db.platformSetting.findUnique({where:{key:'branding'}})
        ]);
        const profile=profileRow?.value&&typeof profileRow.value==='object'&&!Array.isArray(profileRow.value)?profileRow.value as any:{};
        const branding=brandingRow?.value&&typeof brandingRow.value==='object'&&!Array.isArray(brandingRow.value)?brandingRow.value as any:{};
        return {...defaults,...profile,logo:effectiveCompanyLogo(branding.logo??profile.logo,null),updatedAt:profileRow?.updatedAt??null};
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
          this.db.platformSetting.upsert({where:{key:'branding'},update:{value:{logo:logo??null}},create:{key:'branding',value:{logo:logo??null}}})
        ]);
        await audit(this.db,ctx,'PLATFORM_PROFILE_UPDATED','system');
        return {...profile,logo:effectiveCompanyLogo(null,logo),updatedAt:profileRow.updatedAt};
      }
      throw new NotFoundException();
    }
    if(resource==='system'&&key==='branding'){
      platform(ctx);
      if(method==='GET'){requirePermission(ctx,'system','VIEW');const row=await this.db.platformSetting.findUnique({where:{key:'branding'}});const value=row?.value&&typeof row.value==='object'&&!Array.isArray(row.value)?row.value as any:{};return {logo:effectiveCompanyLogo(null,value.logo),updatedAt:row?.updatedAt??null};}
      if(method==='PUT'){requirePermission(ctx,'system','EDIT');const input=z.object({logo:z.string().max(8_000_000).nullable()}).strict().parse(body);if(input.logo){if(!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(input.logo))throw new BadRequestException('Use a PNG or JPEG logo up to 5 MB.');const raw=Buffer.from(input.logo.split(',')[1],'base64');const png=raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));const jpg=raw[0]===255&&raw[1]===216&&raw[2]===255;if(raw.length>5*1024*1024||(!png&&!jpg))throw new BadRequestException('Use a valid PNG or JPEG logo up to 5 MB.');}const value={logo:input.logo??null};const row=await this.db.platformSetting.upsert({where:{key:'branding'},update:{value},create:{key:'branding',value}});await audit(this.db,ctx,'PLATFORM_BRANDING_UPDATED','system');return {logo:(row.value as any)?.logo??null,updatedAt:row.updatedAt};}
      throw new NotFoundException();
    }
    if(resource==='system'&&key==='payment-settings'){
      platform(ctx);
      if(method==='GET'){requirePermission(ctx,'system','VIEW');const row=await this.db.platformSetting.findUnique({where:{key:'billing-payment'}});const value=row?.value&&typeof row.value==='object'&&!Array.isArray(row.value)?row.value as any:{};return {pricesIncludeGst:value.pricesIncludeGst===true,upiId:String(value.upiId??process.env.PAYMENT_UPI_ID??''),payeeName:String(value.payeeName??process.env.PAYMENT_UPI_NAME??'TCW HR Software'),gstPercent:Number(value.gstPercent??process.env.PAYMENT_GST_PERCENT??18)};}
      if(method==='PUT'){requirePermission(ctx,'system','EDIT');const input=z.object({upiId:z.string().trim().max(120),payeeName:z.string().trim().min(1).max(120),gstPercent:z.number().min(0).max(100).default(18),pricesIncludeGst:z.boolean().default(false)}).strict().parse(body);if(input.upiId&&!/^[A-Za-z0-9._-]{2,}@[A-Za-z0-9.-]{2,}$/.test(input.upiId))throw new BadRequestException('Enter a valid UPI ID, for example name@bank.');const row=await this.db.platformSetting.upsert({where:{key:'billing-payment'},update:{value:input},create:{key:'billing-payment',value:input}});await audit(this.db,ctx,'PAYMENT_SETTINGS_UPDATED','system');return row.value;}
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
      await audit(this.db,ctx,'MEGHNA_COxÓ‹h‘éì¶»§q«^wšY›İÏËœİ]K™\šYšYYØ[”^KÙ\ÜÚ[Û‹˜ÜÜ™‹Ù[XİYY]ÙJNÂˆ\ÙQY™™Xİ


OOÚYŠ\›İß™\šYšYYXØ[”^_\›İËœ›İšY\”™YŠ\™]\›ØÛÛœİ[Y\\Ù][\˜[


OOÚYŠØİ[Y[š\ÚXš[]Tİ]OOOIİš\ÚX›IÊ]›ÚY™Yœ™\Ú

_KL
NÜ™]\›Š
OO˜ÛX\’[\˜[
[Y\Š_KÜ›İÏËšY™\šYšYYØ[”^WJNÂˆ\Ş[˜È[˜İ[Ûˆ^J
^ÂˆYŠ\™XY_\Ş_Ù[™[™Ë˜İ\œ™[\›İß™\šYšYYXØ[”^_^\™YY]Z[ÔØ]™Y\ÙË˜İ\œ™[
\™]\›ÂˆÙ]\œ›ÜŠ	ÉÊNÜÙ]Y\ÜØYÙJ	ÉÊNÜÙ[™[™Ë˜İ\œ™[]YNÜÙ]\ŞJYJNÂˆ^ÂˆYŠ][\Y
^ØÛÛœİİ]\ÏX]ØZ]\J	ÜİXœØÜš\[Û‹ÙØ]]Ø^K\İ]\ÉË	ÔÔÕ	ËØÚXÚÛİ]YKÙ\ÜÚ[Û‹˜ÜÜ™ŠNÚYŠÉÔRQ	Ë	ÕTÕÔRQ	×Kš[˜ÛY\Êİ]\Ëœİ]\ÊJ^ÚYŠİ]\Ëœİ]\ÏOOIÔRQ	Ê]Ú[™İË™\Ü]Ú]™[
™]È]™[
	İİË\İXœØÜš\[Û‹]\]Y	ÊJNØ]ØZ]Kœ™Y™]Ú

NÜÙ[™[™Ë˜İ\œ™[Y˜[ÙNÜÙ]\ŞJ˜[ÙJNÜ™]\›ß_BˆÙ]][\Y
YJNÜÙË˜İ\œ™[›Ü[Š
NÂˆXØ]Ú
N˜[J^ÜÙ[™[™Ë˜İ\œ™[Y˜[ÙNÜÙ]\ŞJ˜[ÙJNÜÙ]\œ›ÜŠK›Y\ÜØYÙJ_BˆBˆ\Ş[˜È[˜İ[ÛˆİÛ›ØY

^ØÛÛœİ[›ÚXÙO\›İÏËœ™XÙZ\Ëš[›ÚXÙNÚYŠZ[›ÚXÙJ\™]\›ÜÙ]İÛ›ØY[™ÊYJNİ^ØÛÛœİ™\ÜÛœÙOX]ØZ]™]Ú
	ËØ\KÜİXœØÜš\[Û‹Ú[›ÚXÙ\ËÉÊÙ[˜ÛÙUT’PÛÛ\Û™[
[›ÚXÙKšY
JÉËÙİÛ›ØY	ËØÜ™Y[X[Î‰ÜØ[YK[ÜšYÚ[‰ËØXÚN‰Û›Ë\İÜ™IßJNÚYŠ\™\ÜÛœÙK›Úß\™\ÜÛœÙKšXY\œË™Ù]
	ØÛÛ[]\IÊOËš[˜ÛY\Ê	Ø\XØ][Û‹Ü‰ÊJ]›İÈ™]È\œ›ÜŠ	Ò[›ÚXÙHÛİ[›İ™HİÛ›ØYYˆHYØZ[ˆÚÜK‰ÊNØÛÛœİ\›UT“˜Ü™X]SØš™XİT“
]ØZ]™\ÜÛœÙK˜›ØŠ
JK[šÏYØİ[Y[˜Ü™X]Q[[Y[
	ØIÊNÛ[šËš™Y]\›Û[šË™İÛ›ØYZ[›ÚXÙK›[X™\ŠÉËœ‰ÎÛ[šË˜ÛXÚÊ
NÜÙ][Y[İ]


OO•T“œ™]›ÚÙSØš™XİT“
\›
KÌ
_XØ]Ú
N˜[J^ÜÙ]\œ›ÜŠK›Y\ÜØYÙJ_Yš[˜[^ÜÙ]İÛ›ØY[™Ê˜[ÙJ__BˆYŠKš\ÓØY[™Ê\™]\›ˆØY[™ËÏÚYŠK™\œ›ÜŠ\™]\›ˆ˜Z[\™H\œ›Ü^ÜK™\œ›ÜŸKÏÚYŠ\›İÊ\™]\›ˆ[ÂˆÛÛœİ™XÙZ\\›İËœ™XÙZ\\İ\›İË›[ÙOOOIÕTÕ	Ë™]šY]Ï\›İËœ™]šY]Ô™\]Z\™YOO]YNÂˆ™]\›ˆÙXİ[ÛˆÛ\ÜÓ˜[YOHİË\^K\YÙH‚ˆXY\ˆÛ\ÜÓ˜[YOHZXY\ˆ]Ûˆ\OH˜]ÛˆˆÛÛXÚÏ^Ê
OOœ›İ]\‹œ\Ú
	ËÜİXœØÜš\[Û‰Ê_H\šXK[X™[H˜XÚÈÈ[œÈ\œ›İÓYÚ^™O^ÌM_KÏØ]ÛÜ[”İXœØÜš\[ÛˆO‹ÏÚOˆİ›Û™Ïİ™\šYšYYÉÔ™XÙZ\	Î‰ĞÚXÚÛİ]	ßOÜİ›Û™ÏÜÜ[]ˆÛ\ÜÓ˜[YOHXœ˜[™[YÈÜ˜Ï^Ü›ÙXİÙÛßH[Hˆ‹Ï•ÕÈÙ]ÚXY\‚ˆ]ˆÛ\ÜÓ˜[YOH[^[İ]\ÚYHÛ\ÜÓ˜[YOH\İ[[X\H‚ˆO“Ü™\ˆİ[[X\HÛX[ŒH[ÜÛX[ÚO‚ˆ]ˆÛ\ÜÓ˜[YOH\[‹Z][H]ˆÛ\ÜÓ˜[YOH\[‹X\[YÈÜ˜Ï^Ü›ÙXİÙÛßH[H•ÕÈˆÛÙØ\™H‹ÏÙ]]Ü[•]J›İËœ[“˜[YJ_H[Ú•ÕÈˆÛÙØ\™OÜÜ[Ü›İË˜ŞXÛOOOIÖQPT“IÏÉĞ[›X[İXœØÜš\[Û‰Î‰Ó[ÛHİXœØÜš\[Û‰ßOÜÜ[Ù]İ›Û™ÏÛ[Û™^J›İËœ][İOËœ™Xİ\œš[™ÏË˜[[İ[ÏÜ›İËœ™[™]Ø[[[İ[ÏÜ›İË˜[[İ[
_OÜİ›Û™ÏÙ]ÙXİ[ÛˆÛ\ÜÓ˜[YOHXİ\İÛY\‹Y]Z[Èˆ\šXK[X™[Hİ\İÛY\ˆ]Z[ÈXY\İ\İÛY\ˆ]Z[ÏÚÙ]Z[ÔØ]™Y	‰ˆYY][™Ğİ\İÛY\‰‰ˆ]™\šYšYY	‰]Ûˆ\OH˜]ÛˆˆÛÛXÚÏ^Ê
OOœÙ]Y][™Ğİ\İÛY\ŠYJ_O[˜Ú[Ú^™O^ÌLßKÏˆY]Ø]ÛŸOÚXY\ÙY][™Ğİ\İÛY\‰‰ˆ]™\šYšYYÏ›Ü›HÛ\ÜÓ˜[YOHXİ\İÛY\‹Y›Ü›HˆÛ”İX›Z]^ÜØ]™Pİ\İÛY\ŸO]ˆÛ\ÜÓ˜[YOHXİ\İÛY\‹YšY[ÈX™[‘[˜[YO[œ]]]ĞÛÛ\]OH›˜[YHˆ™\]Z\™YZ[“[™İ^ÌŸHX^[™İ^ÌLŒH˜[YO^Øİ\İÛY\‹›˜[Y_HÛÚ[™ÙO^ÙOOœÙ]İ\İÛY\ŠË‹‹˜İ\İÛY\‹˜[YN™K\™Ù]˜[Y_J_HXÙZÛ\H“˜[YHÛˆH^[Y[‹ÏÛX™[X™[”Û™H[X™\[œ]]]ĞÛÛ\]OH[ˆ\OH[ˆ™\]Z\™YZ[“[™İ^ÍßHX^[™İ^ÌÌH˜[YO^Øİ\İÛY\‹œÛ™_HÛÚ[™ÙO^ÙOOœÙ]İ\İÛY\ŠË‹‹˜İ\İÛY\‹Û™N™K\™Ù]˜[Y_J_HXÙZÛ\HŠÎLHNÍHÌŒL‹ÏÛX™[X™[‘[XZ[Y™\ÜÏ[œ]]]ĞÛÛ\]OH™[XZ[ˆ\OH™[XZ[ˆ™\]Z\™YX^[™İ^ÌŒH˜[YO^Øİ\İÛY\‹™[XZ[HÛÚ[™ÙO^ÙOOœÙ]İ\İÛY\ŠË‹‹˜İ\İÛY\‹[XZ[™K\™Ù]˜[Y_J_HXÙZÛ\H[İPÛÛ\[K˜ÛÛH‹ÏÛX™[X™[Û\ÜÓ˜[YOHXY™\ÜËYšY[š[[™ÈY™\ÜÏ^\™XH]]ĞÛÛ\]OHœİ™Y]XY™\ÜÈˆ™\]Z\™YZ[“[™İ^Í_HX^[™İ^ÌLH›İÜÏ^ÌŸH˜[YO^Øİ\İÛY\‹˜Y™\ÜßHÛÚ[™ÙO^ÙOOœÙ]İ\İÛY\ŠË‹‹˜İ\İÛY\‹Y™\ÜÎ™K\™Ù]˜[Y_J_HXÙZÛ\H”İ™Y]Ú]Kİ]H[™Üİ[ÛÙH‹ÏÛX™[Ù]]ˆÛ\ÜÓ˜[YOHXİ\İÛY\‹XXİ[ÛœÈÜ[”Ø]™YÙXİ\™[H›Üˆ[İ\ˆ™^^[Y[ÜÜ[]Ûˆ\OHœİX›Z]ˆ\ØX›Y^ÜØ]š[™Ğİ\İÛY\ŸOÜØ]š[™Ğİ\İÛY\ÏØY\ŒˆÚ^™O^ÌMHÛ\ÜÓ˜[YOHœšXÚ[™Ë\Ü[ˆ‹ÏØ]™HÚ^™O^ÌMKÏŸTØ]™H]Z[ÏØ]ÛÙ]Ù›Ü›OÛ\ÜÓ˜[YOHXİ\İÛY\‹]˜[Y\È]“˜[YOÙØİ\İÛY\‹›˜[Y_	ø %	ßOÙÙ]]”Û™OÙØİ\İÛY\‹œÛ™_	ø %	ßOÙÙ]]‘[XZ[ÙØİ\İÛY\‹™[XZ[	ø %	ßOÙÙ]]š[[™ÈY™\ÜÏÙØİ\İÛY\‹˜Y™\Üß	ø %	ßOÙÙ]ÙŸOÜÙXİ[Û‚ˆ]ˆÛ\ÜÓ˜[YOHZ[˜ÛYYÚXÚĞÚ\˜ÛLˆÚ^™O^ÌMßKÏ]İ›Û™Ï–[İ\ˆÛÜšÜÜXÙK™XYH›ÜˆÛÜšÏÜİ›Û™ÏXØÙ\ÜÈÈH™X]\™\È[˜ÛYY[ˆ[İ\ˆÙ[XİY[‹ÜÙ]Ù]‚ˆÛ\ÜÓ˜[YOHXœ™XZÙİÛˆ]”[ˆİXİ[ÙÛ[Û™^J›İËœ][İOËœ™Xİ\œš[™ÏËœİXİ[ÏÜ›İËœİXİ[
_OÙÙ]]‘ÔÕÙÛ[Û™^J›İËœ][İOËœ™Xİ\œš[™ÏË^ÏÜ›İË^
_OÙÙ]Ü›İËœ][İOË˜Ü™Y]Œ	‰]ˆÛ\ÜÓ˜[YOHXÜ™Y]•[\ÙY[ˆÜ™Y]Ù¸¢$Û[Û™^J›İËœ][İK˜Ü™Y]
_OÙÙ]ŸO]ˆÛ\ÜÓ˜[YOH]İ[İ™\šYšYYÉĞ[[İ[ZY	Î‰Õİ[YHÙ^IßOÙÛ[Û™^J™\šYšYYÜ™XÙZ\˜[[İ[œ›İË˜[[İ[
_OÙÙ]Ù‚ˆ]ˆÛ\ÜÓ˜[YOH\™[™]Ø[ÛØÚÌÈÚ^™O^ÌMŸKÏ]İ›Û™ÏÜ›İË˜ŞXÛOOOIÖQPT“IÏÉĞš[YYX\›IÎ‰Ğš[Y[ÛIßOÜİ›Û™Ï“X[X[™[™]Ø[ˆ›È]]ÛX]XÈXš]ËÜÙ]Ù]‚ˆ]ˆÛ\ÜÓ˜[YOHZ[Ü[“XYH›Üˆ[İ\ˆ[ÜKÜÜ[][™[˜ÙK^\›Û[™[İ\ˆX[x %ÙÙ]\ˆ[ˆÛ™HÛÜšÜÜXÙKÜÙ]‚ˆØ\ÚYOXZ[ˆÛ\ÜÓ˜[YOH[XZ[ˆ‚ˆİ\İ	‰]ˆÛ\ÜÓ˜[YOH]\İ•TÕSÑH0­È›È™X[Ú\™ÙHÜˆ]™H[ˆXİ]˜][ÛÙ]ŸBİ™\šYšYYÏ]ˆÛ\ÜÓ˜[YOH\™XÙZ\]ˆÛ\ÜÓ˜[YOH\İXØÙ\ÜËZXÛÛˆÚXÚĞÚ\˜ÛLˆÚ^™O^ÌÎKÏÙ]Ü[ˆÛ\ÜÓ˜[YOHY^YXœ›İÈİ\İÉÔĞS‘“Ö‘PÑRT	Îœ™]šY]ÏÉÔVSQS•‘PÑRU‘Q	Î‰ÔVSQS•ÓÓTUIßOÜÜ[İ\İÉÕ\İ^[Y[™\šYšYY	Îœ™]šY]ÏÉÔ^[Y[™YYÈH™]šY]ÉÎ‰ĞÛÛ™Ü˜][][ÛœÈH[İ\ˆ[ˆ\ÈXİ]™IßOÚİ\İÉÖ[İ\ˆ\İİXØÙYYYˆ]Ù\È›İÚ[™ÙH[İ\ˆ]™HİXœØÜš\[ÛˆÜˆÜ™X]HH›ÙXİ[Ûˆ[›ÚXÙK‰Îœ™]šY]ÏÉÕÙH™XÙZ]™Y[İ\ˆ^[Y[][İ\ˆÛÜšÜÜXÙHÚ[™ÙY\š[™ÈÚXÚÛİ]ˆÛÛXİİ\ÜÈ\HHÛÜœ™Xİ[‹‰Î‰ÕÙ[ÛÛYHÈÕÈ‹ˆ[İ\ˆ	ÊÜ[•]J›İËœ[“˜[YJJÉÈ[ˆ\ÈXİ]™Kˆ\™H\ÈÚ][İHØ[ˆİ\\Ú[™Ë‰ßOÜÈ]\İ	‰ˆ\™]šY]É‰ÙXİ[ÛˆÛ\ÜÓ˜[YOHXXİ]˜]Y\[ˆˆ\šXK[X™[HXİ]˜]Y[ˆ]Z[ÈÏÜ[•]J›İËœ[“˜[YJ_H[ˆ[˜ÛY\ÏÚÏ[Ê›İËœ[‘]Z[ÏË™™X]\™\ÏÏÖ×JK›X\

™X]\™Nœİš[™ÊOOHÙ^O^Ù™X]\™_OÚXÚĞÚ\˜ÛLˆÚ^™O^ÌMKÏÙ™X]\™_OÛOŠ_Oİ[]ˆÛ\ÜÓ˜[YOHXXİ]˜]Y[[Z]ÈÜ[\Ù\œÈÚ^™O^ÌM_KÏˆ\ÈÜ›İËœ[‘]Z[ÏË™[\ŞYYS[Z]ÏÉø %	ßH[\ŞYY\ÏÜÜ[Ü[[Ûš]ÜˆÚ^™O^ÌM_KÏˆÜ›İËœ[‘]Z[ÏË™]šXÙS[Z]ÏÉø %	ßH][™[˜ÙH]šXÙ\ÏÜÜ[Ù]ÜÙXİ[ÛŸO]”^[Y[™Y™\™[˜ÙOÙÜ™XÙZ\œ^[Y[YOÙÙ]]”™XÙZ]™YÙÙ\Ü^Q]J™XÙZ\˜Ü™X]Y]
_OÙÙ]È]\İ	‰ˆ\™]šY]É‰]”[ˆ\š[ÙÙÙ\Ü^Q]J™XÙZ\œ\š[Ùİ\
_H8 $ÈÙ\Ü^Q]J™XÙZ\œ\š[Ù[™
_OÙÙ]Ÿ^Ü™XÙZ\š[›ÚXÙI‰]’[›ÚXÙOÙÜ™XÙZ\š[›ÚXÙK›[X™\ŸOÙÙ]ŸOÙÜ™XÙZ\š[›ÚXÙI‰]ÛˆÛ\ÜÓ˜[YOH\š[X\HˆÛÛXÚÏ^ÙİÛ›ØYH\ØX›Y^ÙİÛ›ØY[™ßOİÛ›ØYÚ^™O^ÌMßKÏÙİÛ›ØY[™ÏÉÔ™\\š[™È[›ÚXÙx )‰Î‰ÑİÛ›ØY[›ÚXÙH‰ßOØ]ÛŸO]ÛˆÛ\ÜÓ˜[YOH\ÙXÛÛ™\HˆÛÛXÚÏ^Ê
OOœ›İ]\‹œ\Ú
	ËÜİXœØÜš\[Û‰Ê_O˜XÚÈÈ[œÈ	ˆš[[™È\œ›İÔšYÚÚ^™O^ÌMŸKÏØ]ÛÙ]‚ˆ]ˆÛ\ÜÓ˜[YOHXÚXÚÛİ][X™[ØÚÒÙ^ZÛHÚ^™O^ÌLßKÏˆÙXİ\™HÚXÚÛİ]Ù]”^[Y[]Z[ÏÚÛ\ÜÓ˜[YOHY\ØÜš\[ÛˆÉĞÚÛÜÙHH^[Y[Y]ÙÈÛÛ[YH›İYÚ˜^›Üœ^K‰ßOÜ‚ˆˆÙXİ[ÛˆÛ\ÜÓ˜[YOH\^[Y[XÚÚXÙHˆ\šXK[X™[HÚÛÜÙHH^[Y[Y]Ù]ˆÛ\ÜÓ˜[YOH[Y]ÙZXY[™È]ØÚÒÙ^ZÛHÚ^™O^ÌM_KÏİ›Û™ÏÚÛÜÙHİÈ[İHØ[È^OÜİ›Û™ÏÙ]Ü[”ÑPÕT‘HÒPÒÓÕUÜÜ[Ù]]ˆÛ\ÜÓ˜[YOH[Y]ÙYÜšY[Y]Ù[Ü[ÛœÈˆ›ÛOHœ˜Y[ÙÜ›İ\ˆ\šXK[X™[H”^[Y[Y]ÙÊŞÚY‰İ\IËX™[‰ÕTIË]Z[‰ÕTH\ÈÜˆT‰ËXÛÛ”ÛX\Û™KX\šÜÎ–ÉÙÛÛÙÛ\^IË	Øš[IË	Ü^]I×_KÚY‰ØØ\™	ËX™[‰ĞØ\™	Ë]Z[‰ĞÜ™Y]ÜˆXš]Ø\™	ËXÛÛÜ™Y]Ø\™X\šÜÎ–Éİš\ØIË	ÛX\İ\˜Ø\™	Ë	Ü\^I×_KÚY‰Û™]˜[šÚ[™ÉËX™[‰Ó™]˜[šÚ[™ÉË]Z[‰Ô^H›İYÚ[İ\ˆ˜[šÉËXÛÛ“[™X\šËX\šÜÎ–×_KÚY‰İØ[]	ËX™[‰ÕØ[]	Ë]Z[‰Õ\ÙHHİ\ÜYØ[]	ËXÛÛ•Ø[]X\šÜÎ–ÉÜ^]IË	Ø[X^›Ûœ^I×_WH\ÈÛÛœİ
K™š[\ŠY]ÙOœ›İËšÚ[™OOIĞUUÔVIßY]ÙšYOOIİØ[]	ÊK›X\
Y]ÙOØÛÛœİXÛÛ[Y]Ù’XÛÛ‹Xİ]™O\Ù[XİYY]ÙOO[Y]ÙšYÜ™]\›ˆ]ÛˆÙ^O^ÛY]ÙšYH\OH˜]Ûˆˆ›ÛOHœ˜Y[Èˆ\šXKXÚXÚÙY^ØXİ]™_HÛ\ÜÓ˜[YO^ØXİ]™OÉÜÙ[XİY	Î‰ÉßH\ØX›Y^Ø\Ş_HÛÛXÚÏ^Ê
OOÜÙ]Ù[XİYY]Ù
Y]ÙšY
NÜÙ]\œ›ÜŠ	ÉÊNÜÙ]Y\ÜØYÙJ	ÉÊ__OÜ[ˆÛ\ÜÓ˜[YOH[Y]ÙZXÛÛˆXÛÛˆÚ^™O^ÌNKÏÜÜ[Ü[ˆÛ\ÜÓ˜[YOH[Y]ÙXÛÜHİ›Û™ÏÛY]Ù›X™[OÜİ›Û™ÏÛX[ÛY]Ù™]Z[OÜÛX[ÜÜ[Ü[ˆÛ\ÜÓ˜[YOH[Y]Ù[X\šÜÈÛY]Ù›X\šÜË›X\
X\šÏO–ÉÙÛÛÙÛ\^IË	Ü^]IË	Øš[IË	Ø[X^›Ûœ^IË	İš\ØIË	ÛX\İ\˜Ø\™	×Kš[˜ÛY\ÊX\šÊOÏ[YÈÙ^O^ÛX\šßHÜ˜Ï^ÉËÜ^[Y[[ÙÛÜËÉÊÛX\šÊÉËœİ™ÉßH[^ÛX\šÏOOIÙÛÛÙÛ\^IÏÉÑÛÛÙÛH^IÎ›X\šÏOOIÜ^]IÏÉÔ^]IÎ›X\šÏOOIØš[IÏÉĞ’SIÎ›X\šÏOOIØ[X^›Ûœ^IÏÉĞ[X^›Ûˆ^IÎ›X\šÏOOIİš\ØIÏÉÕš\ØIÎ‰ÓX\İ\˜Ø\™	ßKÏˆÙ^O^ÛX\šßHÛ\ÜÓ˜[YO^ÛX\šËÓİÙ\Ø\ÙJ
_OÛX\šÏOOIÜ\^IÏÉÔT^IÎ‰ÕØ[]ÉßOØŠ_OÜÜ[Ø]ÛŸJ_OÙ]ÜÙ[XİYY]ÙOOIİ\IÏÏ]ˆÛ\ÜÓ˜[YOH[Y]ÙYİZY[˜ÙHÜ[ˆÛ\ÜÓ˜[YOHYİZY[˜ÙKZXÛÛˆ\ÛÙHÚ^™O^ÌMßKÏÜÜ[]İ›Û™ÏÜ›İËšÚ[™OOIĞUUÔVIÏÉÕTH]]Ô^HX[™]IÎ‰ÕTH\ÜˆTˆÛÙIßOÜİ›Û™ÏÜ›İËšÚ[™OOIĞUUÔVIÏÉĞÚÛÜÙHHİ\ÜYTH\[™\›İ™HH™Xİ\œš[™ÈX[™]H›Üˆ[İ\ˆ	ÊÊ›İË˜ŞXÛOOOIÖQPT“IÏÉŞYX\›IÎ‰Û[ÛIÊJÉÈ[‹ˆHX[™]HØ[ˆ™HØ[˜Ù[Y]\‹‰Î‰ÓÛˆ\ÚİÜØØ[ˆHÚXÚÛİ]TˆÛÙHÚ][İ\ˆTH\ˆÛˆ[Øš[KÚÛÜÙHHİ\ÜYTH\ÈÛÛ[YK‰ßOÜÙ]Ù]]ˆÛ\ÜÓ˜[YOH[Y]ÙYİZY[˜ÙHÜ[ˆÛ\ÜÓ˜[YOHYİZY[˜ÙKZXÛÛˆÜÙ[XİYY]ÙOOIØØ\™	ÏÏÜ™Y]Ø\™Ú^™O^ÌMßKÏœÙ[XİYY]ÙOOIÛ™]˜[šÚ[™ÉÏÏ[™X\šÈÚ^™O^ÌMßKÏØ[]Ú^™O^ÌMßKÏŸOÜÜ[]İ›Û™ÏÜ›İËšÚ[™OOIĞUUÔVIÏÊÙ[XİYY]ÙOOIØØ\™	ÏÉĞØ\™™[™]Ø[X[™]IÎœÙ[XİYY]ÙOOIÛ™]˜[šÚ[™ÉÏÉÓ™]˜[šÚ[™ÈK[X[™]IÎ‰ÕTH]]Ô^HX[™]IÊNœÙ[XİYY]ÙOOIØØ\™	ÏÉĞØ\™Èİ\ÜYH[İ\ˆ˜[šÉÎœÙ[XİYY]ÙOOIÛ™]˜[šÚ[™ÉÏÉĞÚÛÜÙH[İ\ˆ˜[šÈ[ˆ˜^›Üœ^IÎ‰ÕØ[]È[˜X›YÛˆ[İ\ˆ˜^›Üœ^HXØÛİ[	ßOÜİ›Û™ÏÜ›İËšÚ[™OOIĞUUÔVIÏÉĞ\›İ™H™Xİ\œš[™È^[Y[È›Üˆ[İ\ˆ	ÊÊ›İË˜ŞXÛOOOIÖQPT“IÏÉŞYX\›IÎ‰Û[ÛIÊJÉÈ[ˆ[ˆ˜^›Üœ^Kˆ[İHØ[ˆØ[˜Ù[HX[™]H]\‹‰Î‰Ô˜^›Üœ^HÚ[ÚİÈH^[Y[Ü[ÛœÈ[˜X›Y›Üˆ\ÈXØÛİ[‰ßOÜÙ]Ù]ŸOÛ\ÜÓ˜[YOH[Y]Ù[›İHÜ›İËšÚ[™OOIĞUUÔVIÏÉĞ]]È^Hİ\ÈÛ›HY\ˆ[İH\›İ™HH™Xİ\œš[™ÈX[™]H[ˆ[İ\ˆÙ[XİY^[Y[\‰Î‰Ô^[Y[ÛÛ\]\ÈÙXİ\™[H[ˆ˜^›Üœ^Kˆ[İ\ˆ[ˆXİ]˜]\ÈY\ˆH^[Y[\È™\šYšYY‰ßOÜÜÙXİ[Û‚ˆÜ›İËœİ]HOOIÔ‘PQIß^\™YÏ]ˆÛ\ÜÓ˜[YOH\[™[™ÈÛØÚÌÈÚ^™O^ÌKÏÏÜ›İËœİ]OOOIĞPS‘Ó‘Q	ÏÉĞÚXÚÛİ]™\XÙY	Î™^\™YÉÔ][İH^\™Y	Î‰Ğ]ØZ][™È^[Y[ÛÛ™š\›X][Û‰ßOÚÏÙ^\™YÉÔ™]šY]ÈHœ™\Ú][İH™Y›Ü™H^Z[™Ëˆ[İ\ˆİ\œ™[[ˆ\È[˜Ú[™ÙY‰Îœ›İËœİ]OOOIĞPS‘Ó‘Q	ÏÉÔ™]\›ˆÈ[œÈÈ™]šY]ÈH™]ÈÚXÚÛİ]‰Î‰ĞÚXÚÈ^[Y[İ]\È™Y›Ü™Hİ\[™È[›İ\ˆ^[Y[‰ßOÜÙ]]ˆÛ\ÜÓ˜[YOH\^K]İ[Ü[•İ[ÜÜ[İ›Û™ÏÛ[Û™^J›İË˜[[İ[
_OÜİ›Û™ÏÙ]]ÛˆÛ\ÜÓ˜[YOH\š[X\HˆÛÛXÚÏ^Ü^_H\ØX›Y^È\™XY_\Ş_XØ[”^_OØ\Ş_\™XYOÏØY\ŒˆÚ^™O^ÌMŸHÛ\ÜÓ˜[YOHœšXÚ[™Ë\Ü[ˆ‹Ï›[^ÈY]Z[ÔØ]™Y	‰ˆ]™\šYšYYÉÔØ]™Hİ\İÛY\ˆ]Z[ÈÈÛÛ[YIÎˆ\™XYOÉÔ™\\š[™ÈÙXİ\™HÚXÚÛİ]8 )‰Î˜\ŞOÉÔ^[Y[Ú[™İÈÜ[¸ )‰ÎŠ][\YÉÕH^[Y[YØZ[‰ÎŠ›İËšÚ[™OOIĞUUÔVIÏÉÔÙ]\]]È^HÚ]	Î‰ĞÛÛ[YHÚ]	ÊJÊİ\N‰ÕTIËØ\™‰ØØ\™	Ë™]˜[šÚ[™Î‰Û™]˜[šÚ[™ÉËØ[]‰İØ[]	ßH\È™XÛÜ™İš[™Ëİš[™ÏŠVÜÙ[XİYY]ÙJJÉÈ0­È	ÊÛ[Û™^J›İË˜[[İ[
_OØÚÒÙ^ZÛHÚ^™O^ÌMKÏØ]ÛÛ\ÜÓ˜[YOH[™^[›İHÉÔ˜^›Üœ^HÜ[œÈ™^ˆ[İ\ˆ[ˆİ\ÈY\ˆ^[Y[\È™\šYšYY‰ßOÜÏŸBˆÊ^\™Y›İËœİ]OOOIĞPS‘Ó‘Q	ÊI‰]ÛˆÛ\ÜÓ˜[YOH\ÙXÛÛ™\HˆÛÛXÚÏ^Ê
OOœ›İ]\‹œ\Ú
	ËÜİXœØÜš\[Û‰Ê_O”™]šY]È[œÈ\œ›İÔšYÚÚ^™O^ÌM_KÏØ]ÛŸBˆ]ÛˆÛ\ÜÓ˜[YOH\İ]\Èˆ\ØX›Y^ÈXØ[”^_HÛÛXÚÏ^Ê
OO›ÚY™Yœ™\Ú

_O™Yœ™\ÚİÈÚ^™O^ÌLßKÏˆÚXÚÈ^[Y[İ]\ÏØ]Û‚ˆÏŸBˆÛY\ÜØYÙI‰ˆ]™\šYšYY	‰Û\ÜÓ˜[YOH[Y\ÜØYÙHˆ›ÛOHœİ]\ÈÛY\ÜØYÙ_OÜŸ^Ù\œ›Ü‰‰Û\ÜÓ˜[YOHX[\ˆ›ÛOH˜[\Ù\œ›ÜŸOÜŸBˆ›Ûİ\ˆÛ\ÜÓ˜[YOH\İÙ\™YÚY[ÚXÚÈÚ^™O^ÌLßKÏˆÙXİ\™YH˜^›Üœ^HO°­ÏÚOˆÕÈˆÛÙØ\™OÙ›Ûİ\‚ˆÛXZ[Ù]‚ˆÜÙXİ[ÛÂŸB