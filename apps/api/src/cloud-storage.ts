import {BadRequestException,ConflictException,ServiceUnavailableException} from '@nestjs/common';
import {S3Client,HeadBucketCommand} from '@aws-sdk/client-s3';
import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {SupabaseObjectStore} from './supabase-storage';
import type {Database} from '../../../packages/database';
import {audit,platform,requirePermission,type Context} from './context';
const settingKey='tcw-cloud-drive';
const schema=z.object({accountId:z.string().regex(/^[a-f0-9]{32}$/),bucket:z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),accessKeyId:z.string().min(16).max(200).optional(),secretAccessKey:z.string().min(16).max(200).optional(),expectedRevision:z.string().uuid().nullable()}).strict();
type Connection={provider?:'SUPABASE';signingKey?:string;endpoint:string;bucket:string;region:string;accessKeyId:string;secretAccessKey:string};
function key(){const value=process.env.CONFIG_ENCRYPTION_KEY?.trim();if(!value||value.length<32)throw new ServiceUnavailableException('Secure credential storage is not configured.');return createHash('sha256').update(value+':tcw-cloud-drive-v1').digest();}
function seal(value:Connection){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(settingKey));return Buffer.concat([iv,cipher.update(JSON.stringify(value)),cipher.final(),cipher.getAuthTag()]).toString('base64');}
function open(value:string):Connection{try{const b=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));cipher.setAAD(Buffer.from(settingKey));cipher.setAuthTag(b.subarray(-16));return JSON.parse(Buffer.concat([cipher.update(b.subarray(12,-16)),cipher.final()]).toString());}catch{throw new ServiceUnavailableException('Cloud Drive credentials cannot be opened. Ask Super Admin to reconnect storage.');}}
export function storageClient(c:Connection){if(c.provider==='SUPABASE')return new SupabaseObjectStore({endpoint:c.endpoint,bucket:c.bucket,signingKey:c.signingKey!}) as unknown as S3Client;return new S3Client({endpoint:c.endpoint,region:c.region,forcePathStyle:true,credentials:{accessKeyId:c.accessKeyId,secretAccessKey:c.secretAccessKey},requestHandler:{connectionTimeout:5000,requestTimeout:15000}});}
export class CloudStorage{
 constructor(private db:Database,private checkBucket=async(c:Connection)=>{const client=storageClient(c);try{await client.send(new HeadBucketCommand({Bucket:c.bucket}))}finally{client.destroy()}}){}
 async connection():Promise<Connection|null>{const row=await this.db.platformSetting.findUnique({where:{key:settingKey}});const value=row?.value as any;if(value?.ciphertext)return open(value.ciphertext);const e=process.env;if(e.CLOUD_DRIVE_SUPABASE_URL&&e.CLOUD_DRIVE_SUPABASE_BUCKET&&e.CLOUD_DRIVE_SIGNING_KEY)return {provider:'SUPABASE',endpoint:e.CLOUD_DRIVE_SUPABASE_URL,bucket:e.CLOUD_DRIVE_SUPABASE_BUCKET,signingKey:e.CLOUD_DRIVE_SIGNING_KEY,region:'auto',accessKeyId:'',secretAccessKey:''};return e.S3_ENDPOINT&&e.S3_BUCKET&&e.S3_ACCESS_KEY&&e.S3_SECRET_KEY?{endpoint:e.S3_ENDPOINT,bucket:e.S3_BUCKET,region:e.S3_REGION??'us-east-1',accessKeyId:e.S3_ACCESS_KEY,secretAccessKey:e.S3_SECRET_KEY}:null;}
 async status(){const c=await this.connection();return {configured:!!c,provider:c?.provider??(c?'S3':null),freeStorageBytes:c?.provider==='SUPABASE'?1_000_000_000:null,name:'TCW Cloud Drive',maxFileBytes:10*1024*1024,acceptedTypes:['application/pdf','image/png','image/jpeg']};}
 async settings(ctx:Context,method:string,body:any={}){
  platform(ctx);requirePermission(ctx,'system',method==='GET'?'VIEW':'EDIT');
  const row=await this.db.platformSetting.findUnique({where:{key:settingKey}}),stored=row?.value as any,current=await this.connection();
  const safe=()=>({configured:!!current,provider:current?.provider??(current?'S3':null),freeStorageBytes:current?.provider==='SUPABASE'?1_000_000_000:null,source:stored?.ciphertext?'DATABASE':current?'ENVIRONMENT':'NONE',accountId:current?.endpoint.match(/^https:\/\/([a-f0-9]{32})\.r2\.cloudflarestorage\.com$/)?.[1]??'',bucket:current?.bucket??'',hasCredentials:!!current,revision:stored?.revision??null,verifiedAt:stored?.verifiedAt??null,secureStorageReady:(process.env.CONFIG_ENCRYPTION_KEY?.trim().length??0)>=32});
  if(method==='GET')return safe();
  const input=schema.parse(body),endpoint=`https://${input.accountId}.r2.cloudflarestorage.com`,same=!!current&&current.endpoint===endpoint&&current.bucket===input.bucket;
  if((stored?.revision??null)!==input.expectedRevision)throw new ConflictException('Storage settings changed. Refresh before saving.');
  if(current&&!same)throw new ConflictException('A storage connection already exists. Keep its bucket; changing storage requires a separate migration.');
  if(!same&&await this.db.document.count())throw new ConflictException('Files already exist. Keep the current bucket; migrating existing files requires a separate migration.');
  const c:Connection={endpoint,bucket:input.bucket,region:'auto',accessKeyId:input.accessKeyId??(same?current!.accessKeyId:''),secretAccessKey:input.secretAccessKey??(same?current!.secretAccessKey:'')};
  if(!c.accessKeyId||!c.secretAccessKey)throw new BadRequestException('Enter both R2 access key ID and secret access key.');
  const ciphertext=seal(c);
  try{await this.checkBucket(c)}catch{throw new BadRequestException('Could not access the R2 bucket. Check account ID, bucket and scoped Object Read & Write credentials.');}
  const saved=await this.db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('tcw-cloud-drive'))`;
   const latest=(await tx.platformSetting.findUnique({where:{key:settingKey}}))?.value as any;
   if((latest?.revision??null)!==input.expectedRevision)throw new ConflictException('Storage settings changed. Refresh before saving.');
   if(!same&&await tx.document.count())throw new ConflictException('Files already exist. Keep the current storage bucket.');
   const value={ciphertext,revision:randomUUID(),verifiedAt:new Date().toISOString()};
   await tx.platformSetting.upsert({where:{key:settingKey},create:{key:settingKey,value},update:{value}});
   await audit(tx,ctx,'CLOUD_DRIVE_CONFIGURED','system',undefined,undefined,{bucket:c.bucket,provider:'CLOUDFLARE_R2'});return value;
  });return {configured:true,source:'DATABASE',accountId:input.accountId,bucket:c.bucket,hasCredentials:true,revision:saved.revision,verifiedAt:saved.verifiedAt,secureStorageReady:true};
 }
}
