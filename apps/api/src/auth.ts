import { BadRequestException, ForbiddenException, UnauthorizedException, HttpException, ConflictException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {allocateShortLoginId,temporaryPassword8} from './identifiers';
import type { Database } from '../../../packages/database';
import { digest, hashPassword, token, verifyPassword } from '../../../packages/auth';
import { loginSchema, password } from '../../../packages/validation';
import {sessionCookieName} from './context';
import type { Context } from './context';
import {syncCompanyAccess} from './billing';
const dummyHash=hashPassword('unusable-dummy-password');
export class AuthService {
  constructor(private db:Database){}
  publicUser(user:any){const localTest=process.env.NODE_ENV!=='production'&&process.env.LOCAL_TEST_MODE==='true';return {id:user.id,name:user.name,email:user.email,loginId:user.loginId,tenantId:user.tenantId,employeeId:user.employeeId,mustChangePassword:localTest?false:user.mustChangePassword,role:user.role.code,roleName:user.role.name,scope:user.role.scope,permissions:user.role.permissions};}
  private async setSession(user:any,req:Request,res:Response,remember:boolean){
    const raw=token(),csrf=token();
    const expiresAt=new Date(Date.now()+(remember?30:1)*86400000);
    await this.db.session.create({data:{tenantId:user.tenantId,userId:user.id,tokenHash:digest(raw),csrf,expiresAt,userAgent:String(req.headers['user-agent']??'').slice(0,300),ip:req.ip??''}});
    const cookieName=sessionCookieName(user.role.scope);
    // Local/LAN development is HTTP, so never emit Secure cookies outside production.
    // Production startup already requires COOKIE_SECURE=true and HTTPS.
    const secureCookie=process.env.NODE_ENV==='production';
    const cookieOptions={httpOnly:true,secure:secureCookie,sameSite:'lax' as const,path:'/'};
    res.cookie(cookieName,raw,{...cookieOptions,...(remember?{expires:expiresAt}:{})});
    const legacyNames=user.role.scope==='PLATFORM'?['peopleos_session','tcw_admin_session']:['peopleos_session','tcw_hr_session'];
    for(const legacy of legacyNames)res.clearCookie(legacy,{path:'/'});
    return {user:this.publicUser(user),csrf,...(process.env.NODE_ENV==='production'?{}:{localSessionToken:raw})};
  }
  async login(body:unknown,req:Request,res:Response){
    const input=loginSchema.parse(body);
    const key=digest(`${req.ip}:${input.companyCode??'PLATFORM'}:${input.email}`);
    const attempt=await this.db.loginAttempt.findUnique({where:{key}});
    if(attempt?.lockedUntil&&attempt.lockedUntil>new Date())throw new HttpException('Too many attempts. Try again in 15 minutes.',429);
    let company=input.companyCode?await this.db.tenant.findUnique({where:{code:input.companyCode.toUpperCase()}}):null;
    // Platform identities can have tenantId=NULL, and PostgreSQL composite UNIQUE constraints allow
    // more than one NULL-scoped row. Older local seeds could therefore leave duplicate platform
    // admins behind. Never authenticate an arbitrary findFirst() result: verify every matching
    // candidate and select the account whose password actually matches.
    const candidates=input.companyCode&&!company?[]:await this.db.user.findMany({where:{tenantId:company?.id??null,OR:[{email:input.email.toLowerCase()},{loginId:input.email.toUpperCase()}]},include:{role:true},orderBy:{updatedAt:'desc'}});
    let user:any=null;
    for(const candidate of candidates){if(candidate.active&&await verifyPassword(input.password,candidate.passwordHash)){user=candidate;break;}}
    if(!candidates.length)await verifyPassword(input.password,await dummyHash);
    if(!user){
      const row=await this.db.loginAttempt.upsert({where:{key},create:{key,failures:1},update:{failures:{increment:1}}});
      if(row.failures>=5)await this.db.loginAttempt.update({where:{key},data:{lockedUntil:new Date(Date.now()+15*60000),failures:0}});
      await this.db.auditLog.create({data:{tenantId:company?.id,action:'LOGIN_FAILED',entity:'auth',ip:req.ip}});
      throw new UnauthorizedException('Email, password, or company code is incorrect.');
    }
    if(company){await syncCompanyAccess(this.db,company.id);company=await this.db.tenant.findUnique({where:{id:company.id}});}
    if(company&&company.status==='ARCHIVED')throw new ForbiddenException('This company account has been archived. Contact your software administrator.');
    if(company&&company.status==='SUSPENDED'&&(company.profile as any)?.suspensionReason!=='BILLING')throw new ForbiddenException('This company is suspended. Contact your software administrator.');
    await this.db.loginAttempt.deleteMany({where:{key}});
    await this.db.auditLog.create({data:{tenantId:user.tenantId,actorId:user.id,action:'LOGIN_SUCCEEDED',entity:'auth',ip:req.ip}});
    return this.setSession(user,req,res,input.remember);
  }
  async signup(body:unknown,req:Request,res:Response){
    if(process.env.PUBLIC_SIGNUP_ENABLED==='false')throw new ForbiddenException('Public signup is currently disabled. Contact TCW HR Software sales.');
    const input=z.object({companyName:z.string().trim().min(2).max(200),ownerName:z.string().trim().min(2).max(200),ownerEmail:z.email().max(200).transform(v=>v.toLowerCase()),phone:z.string().trim().min(7).max(30),plan:z.enum(['STARTER','GROWTH','ENTERPRISE']).default('STARTER'),acceptTerms:z.literal(true),contactConsent:z.literal(true)}).strict().parse(body);
    const throttleKey=digest(`public-signup:${req.ip??'unknown'}`),recent=await this.db.loginAttempt.findUnique({where:{key:throttleKey}});
    if(recent&&recent.updatedAt>new Date(Date.now()-30000))throw new HttpException('Please wait a moment before creating another trial.',429);
    const role=await this.db.role.findUnique({where:{code:'COMPANY_OWNER'}});if(!role)throw new BadRequestException('Platform roles are not initialized. Run the production seed first.');
    const plan=await this.db.plan.findUnique({where:{name:input.plan}});
    let code='';for(let i=0;i<30;i++){const candidate=`TCW-${String(Math.floor(100000+Math.random()*900000))}`;if(!await this.db.tenant.findUnique({where:{code:candidate}})){code=candidate;break;}}
    if(!code)throw new ConflictException('Unable to allocate a company code. Please try again.');
    const trialDays=Math.max(1,Math.min(30,Number(process.env.TRIAL_DAYS??3)||3)),trialEndsAt=new Date(Date.now()+trialDays*86400000),temporaryPassword=temporaryPassword8(),passwordHash=await hashPassword(temporaryPassword);
    const created=await this.db.$transaction(async tx=>{
      const company=await tx.tenant.create({data:{name:input.companyName,code,status:'TRIAL',plan:input.plan,employeeLimit:plan?.employeeLimit??25,expiresAt:trialEndsAt,profile:{trialDays,trialStartedAt:new Date().toISOString(),trialOriginalEndsAt:trialEndsAt.toISOString(),trialFollowupStatus:'PENDING',trialNextFollowupAt:trialEndsAt.toISOString(),signupSource:'SELF_SERVICE',ownerPhone:input.phone,contactConsentAt:new Date().toISOString(),contactConsent:'TRIAL_FOLLOW_UP'}}});
      const loginId=await allocateShortLoginId(tx as unknown as Database,company.id);
      const user=await tx.user.create({data:{tenantId:company.id,name:input.ownerName,email:input.ownerEmail,loginId,passwordHash,roleId:role.id,mustChangePassword:true},include:{role:true}});
      await tx.leaveType.createMany({data:[{tenantId:company.id,name:'Annual leave',annualDays:12},{tenantId:company.id,name:'Sick leave',annualDays:6},{tenantId:company.id,name:'Casual leave',annualDays:6}]});
      await tx.notification.create({data:{tenantId:company.id,title:'Welcome to TCW HR Software',message:`Your ${trialDays}-day ${input.plan.toLowerCase()} trial is active until ${trialEndsAt.toISOString().slice(0,10)}. Start by adding your company profile, employees and attendance rules.`}});
      const loginUrl=new URL('/login',process.env.WEB_URL??'http://localhost:3000');
      await tx.outbox.create({data:{tenantId:company.id,kind:'EMAIL',payload:{to:input.ownerEmail,subject:'Your TCW HR Software trial is ready',tempPassword:temporaryPassword,text:`Welcome to TCW HR Software. Company: ${input.companyName}. Company Code: ${code}. Login ID: ${loginId}. Sign in at ${loginUrl.toString()} using this temporary password: ${temporaryPassword}. You will be asked to set your own password after the first sign-in. Your ${trialDays}-day trial ends on ${trialEndsAt.toISOString().slice(0,10)}.`}}});
      if(String(process.env.SMS_PROVIDER??'').trim())await tx.outbox.create({data:{tenantId:company.id,kind:'SMS',payload:{to:input.phone,template:'LOGIN_READY',company:input.companyName,companyCode:code,loginId,tempPassword:temporaryPassword,loginUrl:loginUrl.toString(),text:`TCW HR: ${input.companyName} is ready. Company Code ${code}, User ID ${loginId}, Temp Password ${temporaryPassword}. Change it after first sign-in. Login: ${loginUrl.toString()}`}}});
      await tx.lead.create({data:{company:input.companyName,contactName:input.ownerName,email:input.ownerEmail,phone:input.phone,stage:'DEMO',value:0,nextFollowup:trialEndsAt,notes:`Self-service ${trialDays}-day trial signup · ${code}`}});
      await tx.auditLog.create({data:{tenantId:null,action:'PUBLIC_TRIAL_SIGNUP',entity:'tenants',entityId:company.id,after:{companyCode:code,companyName:input.companyName,ownerEmail:input.ownerEmail,ownerPhone:input.phone,plan:input.plan,contactConsent:true},ip:req.ip}});
      return {company,user,loginId};
    });
    await this.db.loginAttempt.upsert({where:{key:throttleKey},create:{key:throttleKey,failures:0},update:{failures:0,lockedUntil:null}});
    return {company:created.company,companyCode:code,loginId:created.loginId,temporaryPassword,trialEndsAt,email:input.ownerEmail};
  }
  async logout(ctx:Context,res:Response){await this.db.session.deleteMany({where:{id:ctx.session.id,userId:ctx.user.id}});const names=ctx.user.role.scope==='PLATFORM'?[sessionCookieName('PLATFORM'),'tcw_admin_session','peopleos_session']:[sessionCookieName('TENANT'),'tcw_hr_session','peopleos_session'];for(const name of names)res.clearCookie(name,{path:'/'});return {ok:true};}
  async forgot(body:unknown){
    const input=z.object({email:z.email().transform(v=>v.toLowerCase()),companyCode:z.string().optional()}).strict().parse(body);
    let company=input.companyCode?await this.db.tenant.findUnique({where:{code:input.companyCode.toUpperCase()}}):null;
    const user=input.companyCode&&!company?null:await this.db.user.findFirst({where:{email:input.email,tenantId:company?.id??null,active:true}});
    if(user){
      const raw=token();
      const url=new URL(user.tenantId?'/reset-password':'/admin-reset-password',user.tenantId?process.env.WEB_URL??'http://localhost:3000':process.env.ADMIN_URL??'http://localhost:3001');url.searchParams.set('token',raw);
      await this.db.$transaction(async tx=>{
        await tx.passwordReset.deleteMany({where:{userId:user.id,usedAt:null}});
        await tx.passwordReset.create({data:{tenantId:user.tenantId,userId:user.id,tokenHash:digest(raw),expiresAt:new Date(Date.now()+10*60000)}});
        await tx.outbox.create({data:{tenantId:user.tenantId,kind:'EMAIL',payload:{to:user.email,subject:'Reset your TCW HR Software password',text:`Create your new password within 10 minutes: ${url}. This reset link can be opened once and cannot be reused. If you did not request this, ignore this email.`}}});
      });
    }
    return {message:'If that account exists, a reset link will be sent.'};
  }
  async claimReset(body:unknown,req:Request,res:Response){
    const input=z.object({token:z.string().min(32).max(100)}).strict().parse(body);
    const now=new Date();
    const row=await this.db.passwordReset.findUnique({where:{tokenHash:digest(input.token)}});
    if(row&&!row.usedAt&&row.expiresAt>now){
      const claimToken=token();
      const claimed=await this.db.passwordReset.updateMany({where:{id:row.id,usedAt:null,expiresAt:{gt:now}},data:{tokenHash:digest(claimToken),usedAt:now}});
      if(claimed.count===1){
        res.cookie('tcw_reset_claim',claimToken,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:10*60*1000});
        return {ok:true,expiresInMinutes:10};
      }
    }
    // The email URL is single-open. A refresh in the same browser remains usable
    // through the short-lived HttpOnly claim cookie, without making the URL reusable.
    const existing=String(req.cookies?.tcw_reset_claim??'');
    if(existing){
      const claimedRow=await this.db.passwordReset.findUnique({where:{tokenHash:digest(existing)}});
      if(claimedRow?.usedAt&&claimedRow.expiresAt>now)return {ok:true,expiresInMinutes:Math.max(1,Math.ceil((claimedRow.expiresAt.getTime()-now.getTime())/60000))};
    }
    throw new BadRequestException('This reset link is invalid, expired, or has already been opened.');
  }
  async reset(body:unknown,req:Request,res:Response){
    const input=z.object({password}).strict().parse(body);
    const claimToken=String(req.cookies?.tcw_reset_claim??'');
    if(!claimToken)throw new BadRequestException('This reset link is invalid, expired, or has already been used.');
    const now=new Date(),row=await this.db.passwordReset.findUnique({where:{tokenHash:digest(claimToken)}});
    if(!row||!row.usedAt||row.expiresAt<=now)throw new BadRequestException('This reset link is invalid, expired, or has already been used.');
    const passwordHash=await hashPassword(input.password);
    await this.db.$transaction(async tx=>{
      const consumed=await tx.passwordReset.deleteMany({where:{id:row.id,tokenHash:digest(claimToken),usedAt:{not:null},expiresAt:{gt:now}}});
      if(consumed.count!==1)throw new BadRequestException('This reset link is invalid, expired, or has already been used.');
      await tx.user.update({where:{id:row.userId},data:{passwordHash,mustChangePassword:false}});
      await tx.session.deleteMany({where:{userId:row.userId}});
      await tx.auditLog.create({data:{tenantId:row.tenantId,actorId:row.userId,action:'PASSWORD_RESET',entity:'auth'}});
    });
    res.clearCookie('tcw_reset_claim',{path:'/'});
    return {message:'Password created. Sign in with your new password.'};
  }
  async change(ctx:Context,body:unknown,res:Response){
    const input=z.object({currentPassword:z.string().max(128),password}).strict().parse(body);
    if(!await verifyPassword(input.currentPassword,ctx.user.passwordHash))throw new BadRequestException('Current password is incorrect.');
    const passwordHash=await hashPassword(input.password);
    await this.db.$transaction([this.db.user.update({where:{id:ctx.user.id},data:{passwordHash,mustChangePassword:false}}),this.db.session.deleteMany({where:{userId:ctx.user.id}})]);
    const names=ctx.user.role.scope==='PLATFORM'?[sessionCookieName('PLATFORM'),'tcw_admin_session','peopleos_session']:[sessionCookieName('TENANT'),'tcw_hr_session','peopleos_session'];for(const name of names)res.clearCookie(name,{path:'/'});return {message:'Password changed. Please sign in again.'};
  }
}
