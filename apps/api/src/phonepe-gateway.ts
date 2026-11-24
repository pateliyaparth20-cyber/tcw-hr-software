import {BadRequestException,ConflictException,ForbiddenException,ServiceUnavailableException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Database} from '../../../packages/database';
import {audit,platform,requirePermission,type Context} from './context';
import {jsonObject,openPayoutCredentials,sealPayoutCredentials} from './payout-connections';

const modeSchema=z.enum(['TEST','LIVE']);
export type PhonePeVersion={provider:'PHONEPE';mode:'TEST'|'LIVE';clientId:string;clientVersion:number;ciphertext:string};
type PhonePeCredentials={clientId:string;clientVersion:number;clientSecret:string};
type Config=Record<string,any>;
const tokens=new Map<string,{token:string;expiresAt:number}>();

export class PhonePeGateway{
 constructor(private db:Database,private transport:typeof fetch=fetch){}
 async config():Promise<Config>{return jsonObject((await this.db.platformSetting.findUnique({where:{key:'phonepe-gateway'}}))?.value);}
 async version(revision:string):Promise<PhonePeVersion>{
  const row=await this.db.platformSetting.findUnique({where:{key:'billing-phonepe-version:'+revision}});
  if(!row)throw new ServiceUnavailableException('This PhonePe configuration is unavailable. Contact support.');
  return row.value as unknown as PhonePeVersion;
 }
 async settings(ctx:Context,method:string,body:any,query:any={}){
  platform(ctx);requirePermission(ctx,'system',method==='GET'?'VIEW':'EDIT');const current=await this.config();
  if(method==='GET'){
   const mode=modeSchema.parse(query.mode??current.mode??'TEST'),revision=current.revisions?.[mode],v=revision?await this.version(String(revision)):null;
   return {enabled:current.enabled===true&&current.mode===mode,mode,activeMode:current.mode??'TEST',clientId:v?.clientId??'',clientVersion:v?.clientVersion??1,hasCredentials:!!v,revision:current.revision??null};
  }
  const input=z.object({mode:modeSchema,enabled:z.boolean(),clientId:z.string().trim().min(3).max(200),clientVersion:z.number().int().min(1).max(100000),clientSecret:z.string().trim().min(8).max(500).optional(),expectedRevision:z.string().uuid().nullable()}).strict().parse(body);
  return this.db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('tcw-phonepe-gateway'))`;
   const active=jsonObject((await tx.platformSetting.findUnique({where:{key:'phonepe-gateway'}}))?.value);
   if((active.revision??null)!==input.expectedRevision)throw new ConflictException('PhonePe settings changed in another window. Refresh first.');
   const oldId=String(active.revisions?.[input.mode]??''),oldRow=oldId?await tx.platformSetting.findUnique({where:{key:'billing-phonepe-version:'+oldId}}):null;
   const old=oldRow?.value as unknown as PhonePeVersion|undefined;
   const previous:Partial<PhonePeCredentials>=old&&old.clientId===input.clientId&&old.clientVersion===input.clientVersion?openPayoutCredentials('PHONEPE:'+input.mode,old.ciphertext) as PhonePeCredentials:{};
   const clientSecret=input.clientSecret??previous.clientSecret;
   if(!clientSecret)throw new BadRequestException('Enter the PhonePe Client Secret for this Client ID and version.');
   const revision=randomUUID(),settingsRevision=randomUUID(),version:PhonePeVersion={provider:'PHONEPE',mode:input.mode,clientId:input.clientId,clientVersion:input.clientVersion,ciphertext:sealPayoutCredentials('PHONEPE:'+input.mode,{clientId:input.clientId,clientVersion:input.clientVersion,clientSecret})};
   // Verify the credentials before making them active. This only requests an OAuth token and creates no payment.
   await this.accessToken(version);
   await tx.platformSetting.create({data:{key:'billing-phonepe-version:'+revision,value:version}});
   const next={revision:settingsRevision,mode:input.mode,enabled:input.enabled,revisions:{...active.revisions,[input.mode]:revision}};
   await tx.platformSetting.upsert({where:{key:'phonepe-gateway'},create:{key:'phonepe-gateway',value:next},update:{value:next}});
   await audit(tx,ctx,'PHONEPE_GATEWAY_CONFIGURED','system',revision,undefined,{mode:input.mode,enabled:input.enabled,clientId:input.clientId,clientVersion:input.clientVersion});
   return {ok:true,revision:settingsRevision};
  });
 }
 private endpoint(mode:'TEST'|'LIVE'){return mode==='TEST'?'https://api-preprod.phonepe.com/apis/pg-sandbox':'https://api.phonepe.com/apis/pg';}
 private authEndpoint(mode:'TEST'|'LIVE'){return mode==='TEST'?'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token':'https://api.phonepe.com/apis/identity-manager/v1/oauth/token';}
 private credentials(v:PhonePeVersion){return openPayoutCredentials('PHONEPE:'+v.mode,v.ciphertext) as PhonePeCredentials;}
 async accessToken(v:PhonePeVersion){
  const cacheKey=v.mode+':'+v.clientId+':'+v.clientVersion,existing=tokens.get(cacheKey);
  if(existing&&existing.expiresAt>Date.now()+60000)return existing.token;
  const c=this.credentials(v),form=new URLSearchParams({client_id:c.clientId,client_version:String(c.clientVersion),client_secret:c.clientSecret,grant_type:'client_credentials'});
  let response:Response;try{response=await this.transport(this.authEndpoint(v.mode),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form.toString(),signal:AbortSignal.timeout(15000)});}catch{throw new ServiceUnavailableException('PhonePe could not be reached. Check the connection and retry.');}
  const result=await response.json().catch(()=>null) as any;
  if(!response.ok||!result?.access_token)throw new ServiceUnavailableException('PhonePe authentication failed. Check the selected environment and matching Client ID, version and Client Secret.');
  const expiresAt=Number(result.expires_at??0)*1000||Date.now()+25*60*1000;
  tokens.set(cacheKey,{token:String(result.access_token),expiresAt});return String(result.access_token);
 }
 async request(v:PhonePeVersion,path:string,body?:any){
  if(!/^[A-Za-z0-9_/?=&.-]+$/.test(path)||path.startsWith('/'))throw new BadRequestException('Invalid PhonePe API path.');
  const token=await this.accessToken(v);let response:Response;
  try{response=await this.transport(this.endpoint(v.mode)+'/'+path,{method:body===undefined?'GET':'POST',redirect:'error',headers:{authorization:'O-Bearer '+token,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});}catch{throw new ServiceUnavailableException('PhonePe did not confirm the request. Check payment status before retrying.');}
  const result=await response.json().catch(()=>null) as any;
  if(!response.ok||!result)throw new ServiceUnavailableException('PhonePe: '+String(result?.message??result?.code??'request unavailable').slice(0,220));
  return result;
 }
 async activeVersion(mode:'TEST'|'LIVE'){
  const c=await this.config(),revision=c.mode===mode?c.revisions?.[mode]:null;
  return revision?this.version(String(revision)):null;
 }
}
