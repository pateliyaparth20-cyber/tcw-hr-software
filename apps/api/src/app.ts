import 'reflect-metadata';
import {All,Controller,Inject,Module,Req,Res,NotFoundException,BadRequestException,ForbiddenException,HttpException,ServiceUnavailableException} from '@nestjs/common';
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
      if(key==='reset-password'&&method==='POST')return this.auth.reset(req.body);
    }
    const ctx=await authenticate(this.db,req);
    const body=req.body;
    if(ctx.tenantId){
      const company=await this.db.tenant.findUnique({where:{id:ctx.tenantId}});
      const billingLocked=company&&(company.status==='EXPIRED'||(company.status==='SUSPENDED'&&(company.profile as any)?.suspensionReason==='BILLING')||(company.expiresAt&&company.expiresAt<new Date()));
      if(billingLocked&&!['auth','subscription'].includes(resource))throw new ForbiddenException('Your trial or subscription has ended. Complete payment to unlock HR modules.');
    }
    if(resource==='subscription'&&method==='GET'){
      const tid=tenant(ctx);const company=await this.db.tenant.findUniqueOrThrow({where:{id:tid}});const invoices=await this.db.invoice.findMany({where:{tenantId:tid},orderBy:{createdAt:'desc'},take:24});
      return {company,invoices,gatewayConfigured:!!process.env.PAYMENT_GATEWAY_PROVIDER,paymentMessage:process.env.PAYMENT_INSTRUCTIONS??'Contact TCW HR Software billing support to complete payment. Access is restored after payment confirmation.'};
    }
    if(resource==='auth'){
      if(key==='me'&&method==='GET')return {user:this.auth.publicUser(ctx.user),csrf:ctx.session.csrf,company:ctx.tenantId?await this.db.tenant.findUnique({where:{id:ctx.tenantId}}):null};
      if(key==='logout'&&method==='POST')return this.auth.logout(ctx,res);
      if(key==='change-password'&&method==='POST')return this.auth.change(ctx,body,res);
      if(key==='sessions'&&method==='GET')return {items:await this.db.session.findMany({where:{userId:ctx.user.id},select:{id:true,createdAt:true,expiresAt:true,userAgent:true,ip:true}}),currentId:ctx.session.id};
      if(key==='sessions'&&action&&method==='DELETE'){await this.db.session.deleteMany({where:{id:id.parse(action),userId:ctx.user.id}});return {ok:true};}
      throw new NotFoundException();
    }
    if(resource==='dashboard'&&method==='GET')return this.data.dashboard(ctx);
    if(resource==='support'&&key&&action==='messages')return this.data.supportMessages(ctx,key,method,body);
    if(resource==='company'&&['GET','PATCH'].includes(method))return this.data.company(ctx,method==='PATCH'?body:undefined);
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
      if(method==='GET'){const items=await this.db.notification.findMany({where,orderBy:{createdAt:'desc'},take:200});return {items,unread:items.filter(r=>!r.readAt).length};}
      if(method==='PATCH'&&key==='all'){await this.db.notification.updateMany({where:{...where,readAt:null},data:{readAt:new Date()}});return {ok:true};}
      if(method==='PATCH'&&key){await this.db.notification.updateMany({where:{...where,id:id.parse(key)},data:{readAt:new Date()}});return {ok:true};}
    }
    if(resource==='system'&&key==='ai-config'){
      platform(ctx);
      if(method==='GET'){requirePermission(ctx,'system','VIEW');return publicAIConfig(this.db);}
      if(method==='PUT'){requirePermission(ctx,'system','EDIT');const input=z.object({provider:z.string().max(60).default('OPENAI_COMPATIBLE'),baseUrl:z.string().max(500),model:z.string().max(200),apiKey:z.string().max(500).optional(),enabled:z.boolean()}).strict().parse(body);try{const result=await saveAIConfig(this.db,input);await audit(this.db,ctx,'AI_CONFIG_UPDATED','system');return result;}catch(e:any){throw new BadRequestException(e.message);}}
      if(action==='test'&&method==='POST'){requirePermission(ctx,'system','EDIT');try{return await testAIConnection(this.db);}catch(e:any){throw new ServiceUnavailableException(e.message);}}
    }
    if(resource==='system'&&method==='GET'){platform(ctx);requirePermission(ctx,'system','VIEW');await this.db.$queryRaw`SELECT 1`;const ai=await publicAIConfig(this.db);const sms=String(process.env.SMS_PROVIDER??'').trim();const payouts=process.env.PAYROLL_PAYOUTS_ENABLED==='true'&&process.env.PAYOUT_PROVIDER==='RAZORPAYX';return {database:'CONNECTED',email:process.env.SMTP_HOST?'CONFIGURED':'NOT_CONFIGURED',sms:sms?'CONFIGURED':'NOT_CONFIGURED',storage:process.env.S3_ENDPOINT?'CONFIGURED':'NOT_CONFIGURED',ai:ai.configured?'CONFIGURED':'NOT_CONFIGURED',salaryPayouts:payouts?'CONFIGURED':'SAFE_MODE',pendingMessages:await this.db.outbox.count({where:{sentAt:null}})};}
    if(resource==='reports'&&method==='GET')return this.report(ctx,key,req,res);
    if(resource==='ai'&&key==='status'&&method==='GET'){tenant(ctx);requirePermission(ctx,'ai','VIEW');return publicAIConfig(this.db);}
    if(resource==='ai'&&method==='POST'){
      tenant(ctx);requirePermission(ctx,'ai','VIEW');const {question}=z.object({question:z.string().min(3).max(1000)}).strict().parse(body);
      const dashboard=await this.data.dashboard(ctx);
      const facts={employeeCount:dashboard.employees?.length,attendance:dashboard.attendance?.map((r:any)=>({date:r.date,status:r.status,workMinutes:r.workMinutes,lateMinutes:r.lateMinutes,overtimeMinutes:r.overtimeMinutes})),leave:dashboard.leave?.map((r:any)=>({startDate:r.startDate,endDate:r.endDate,status:r.status,days:r.days})),openJobs:dashboard.jobs};
      try{const cfg=await effectiveAIConfig(this.db);if(!cfg.enabled)throw new Error('AI is not configured. Ask your TCW Super Admin to configure it in System health.');const answer=await new CompatibleProvider({baseUrl:cfg.baseUrl,apiKey:cfg.apiKey,model:cfg.model}).summarize(question,facts);await audit(this.db,ctx,'AI_SUMMARY','ai');return {answer,model:cfg.model};}catch(e:any){throw new ServiceUnavailableException(e.message);}
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
