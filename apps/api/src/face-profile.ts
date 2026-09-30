import {BadRequestException,ConflictException,ForbiddenException} from '@nestjs/common';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import type {Database} from '../../../packages/database';
import type {Context} from './context';
import {audit,tenant} from './context';

const descriptorSchema=z.array(z.number().min(-5).max(5)).length(128);
export const FACE_MATCH_THRESHOLD=0.54;
const TEMPLATE_VERSION='face-api-1.7.15';

function masterKey(){
  const secret=process.env.CONFIG_ENCRYPTION_KEY?.trim();
  if(!secret)throw new Error('CONFIG_ENCRYPTION_KEY is required for encrypted face templates.');
  return createHash('sha256').update(secret).digest();
}
function normalize(values:number[]){
  if(values.length!==128||values.some(v=>!Number.isFinite(v)))throw new BadRequestException('Face descriptor is invalid.');
  const norm=Math.sqrt(values.reduce((n,v)=>n+v*v,0));
  if(!Number.isFinite(norm)||norm<0.1)throw new BadRequestException('Face descriptor is invalid.');
  return values.map(v=>v/norm);
}
function distance(a:number[],b:number[]){
  if(a.length!==b.length)return Number.POSITIVE_INFINITY;
  return Math.sqrt(a.reduce((sum,v,i)=>sum+(v-b[i])*(v-b[i]),0));
}
function average(samples:number[][]){
  const out=Array(128).fill(0) as number[];
  for(const sample of samples)for(let i=0;i<128;i++)out[i]+=sample[i]/samples.length;
  return normalize(out);
}
function encryptTemplate(values:number[]){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',masterKey(),iv);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(values),'utf8'),cipher.final()]);
  const tag=cipher.getAuthTag();
  return ['v1',iv.toString('base64url'),tag.toString('base64url'),encrypted.toString('base64url')].join(':');
}
function decryptTemplate(value:string){
  const parts=value.split(':');
  if(parts.length!==4||parts[0]!=='v1')throw new Error('Stored employee face template is invalid.');
  const decipher=createDecipheriv('aes-256-gcm',masterKey(),Buffer.from(parts[1],'base64url'));
  decipher.setAuthTag(Buffer.from(parts[2],'base64url'));
  const plain=Buffer.concat([decipher.update(Buffer.from(parts[3],'base64url')),decipher.final()]).toString('utf8');
  return normalize(JSON.parse(plain));
}
function ownEmployee(ctx:Context){
  if(ctx.user.role.code!=='EMPLOYEE')throw new ForbiddenException('Face enrollment is only available from an Employee account.');
  if(!ctx.user.employeeId)throw new BadRequestException('This Employee account is not linked to an employee record.');
  return ctx.user.employeeId;
}
export async function faceProfileStatus(db:Database,ctx:Context){
  const tid=tenant(ctx),employeeId=ownEmployee(ctx);
  const profile=await db.employeeFaceProfile.findUnique({where:{tenantId_employeeId:{tenantId:tid,employeeId}},select:{enrolledAt:true,templateVersion:true,sampleCount:true}});
  return profile?{enrolled:true,enrolledAt:profile.enrolledAt,templateVersion:profile.templateVersion,sampleCount:profile.sampleCount}:{enrolled:false,required:true};
}
export async function enrollEmployeeFace(db:Database,ctx:Context,body:unknown){
  const tid=tenant(ctx),employeeId=ownEmployee(ctx);
  const input=z.object({samples:z.array(descriptorSchema).length(3),engine:z.string().trim().min(1).max(80).default(TEMPLATE_VERSION)}).strict().parse(body);
  const current=await db.employeeFaceProfile.findUnique({where:{tenantId_employeeId:{tenantId:tid,employeeId}}});
  if(current)throw new ConflictException('Face is already enrolled. Ask HR/Admin to reset the face before enrolling again.');
  const samples=input.samples.map(normalize);
  let maxDistance=0;
  for(let i=0;i<samples.length;i++)for(let j=i+1;j<samples.length;j++)maxDistance=Math.max(maxDistance,distance(samples[i],samples[j]));
  if(maxDistance>0.62)throw new BadRequestException('The three face captures do not match closely enough. Use the same person, good light, and try again.');
  const template=average(samples);
  const row=await db.employeeFaceProfile.create({data:{tenantId:tid,employeeId,templateCiphertext:encryptTemplate(template),templateVersion:TEMPLATE_VERSION,sampleCount:samples.length}});
  await audit(db,ctx,'EMPLOYEE_FACE_ENROLLED','employees',employeeId,undefined,{templateVersion:row.templateVersion,sampleCount:row.sampleCount,enrolledAt:row.enrolledAt,maxEnrollmentDistance:Number(maxDistance.toFixed(4)),rawImageStored:false});
  return {enrolled:true,enrolledAt:row.enrolledAt,templateVersion:row.templateVersion,sampleCount:row.sampleCount};
}
export async function verifyEmployeeFace(db:Database,ctx:Context,descriptor:number[]){
  const tid=tenant(ctx),employeeId=ownEmployee(ctx);
  const profile=await db.employeeFaceProfile.findUnique({where:{tenantId_employeeId:{tenantId:tid,employeeId}}});
  if(!profile)return {enrolled:false,matched:false,distance:null,threshold:FACE_MATCH_THRESHOLD};
  const current=normalize(descriptorSchema.parse(descriptor));
  const stored=decryptTemplate(profile.templateCiphertext);
  const d=distance(stored,current);
  return {enrolled:true,matched:d<=FACE_MATCH_THRESHOLD,distance:Number(d.toFixed(4)),threshold:FACE_MATCH_THRESHOLD};
}