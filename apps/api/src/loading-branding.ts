import {BadRequestException,ConflictException} from '@nestjs/common';
import {z} from 'zod';
import type {Database} from '../../../packages/database';
import {audit,platform,requirePermission,type Context} from './context';

export const defaultLoading={title:'TCW HR Software',message:'Preparing your workspace…',logo:null as string|null,animation:'ORBIT',accent:'#7c3aed',background:'#f7f4fc'};
const schema=z.object({title:z.string().trim().min(1).max(80),message:z.string().trim().min(1).max(140),logo:z.string().max(2_900_000).nullable(),animation:z.enum(['ORBIT','PULSE','SPINNER','NONE']),accent:z.string().regex(/^#[a-f0-9]{6}$/i),background:z.string().regex(/^#[a-f0-9]{6}$/i)}).strict();
export function validateLoading(value:unknown){
 const input=schema.parse(value);
 if(input.logo){
  const match=input.logo.match(/^data:image\/(png|jpeg|gif);base64,([A-Za-z0-9+/]+={0,2})$/);if(!match)throw new BadRequestException('Use a PNG, JPEG or animated GIF.');
  const bytes=Buffer.from(match[2],'base64'),valid=match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):match[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString());
  if(!valid||bytes.length>2*1024*1024)throw new BadRequestException('Use a valid logo or GIF up to 2 MB.');
 }
 return input;
}
export async function publicLoading(db:Database){const row=await db.platformSetting.findUnique({where:{key:'loading-branding'}});const parsed=schema.safeParse(row?.value);return {...(parsed.success?parsed.data:defaultLoading),updatedAt:row?.updatedAt?.toISOString()??null};}
export async function loadingSettings(db:Database,ctx:Context,method:string,body:any){
 platform(ctx);requirePermission(ctx,'system',method==='GET'?'VIEW':'EDIT');
 if(method==='GET')return publicLoading(db);
 const {expectedUpdatedAt,...rest}=z.object({...schema.shape,expectedUpdatedAt:z.string().datetime().nullable()}).strict().parse(body),input=validateLoading(rest);
 return db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('tcw-loading-branding'))`;
  const old=await tx.platformSetting.findUnique({where:{key:'loading-branding'}});
  if((old?.updatedAt?.toISOString()??null)!==expectedUpdatedAt)throw new ConflictException('Loading settings changed in another window. Refresh before saving.');
  const row=await tx.platformSetting.upsert({where:{key:'loading-branding'},create:{key:'loading-branding',value:input},update:{value:input}});
  await audit(tx,ctx,'LOADING_BRANDING_UPDATED','system',undefined,undefined,{animation:input.animation,hasLogo:!!input.logo});return {...input,updatedAt:row.updatedAt.toISOString()};
 });
}
