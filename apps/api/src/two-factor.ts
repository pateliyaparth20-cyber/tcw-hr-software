import {BadRequestException,ConflictException,HttpException,ServiceUnavailableException,UnauthorizedException} from '@nestjs/common';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {authenticatorSecret,totpCounter} from '../../../packages/auth/totp';
import {digest,safeEqual,verifyPassword} from '../../../packages/auth';
import type {Database} from '../../../packages/database';
import {audit,Context} from './context';
const configured=()=>String(process.env.CONFIG_ENCRYPTION_KEY??'').trim().length>=32;
const key=()=>{if(!configured())throw new ServiceUnavailableException('Authenticator setup is not configured on the server.');return createHash('sha256').update(process.env.CONFIG_ENCRYPTION_KEY!.trim()+':tcw-totp-v1').digest();};
function encrypt(value:string,userId:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(userId));return Buffer.concat([iv,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64');}
function decrypt(value:string,userId:string){const bytes=Buffer.from(value,'base64'),decipher=createDecipheriv('aes-256-gcm',key(),bytes.subarray(0,12));decipher.setAAD(Buffer.from(userId));decipher.setAuthTag(bytes.subarray(-16));return Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]).toString('utf8');}
const codeInput=z.string().trim().min(6).max(40),passwordInput=z.string().min(1).max(128);
async function throttle(db:any,userId:string){const attempt=await db.loginAttempt.findUnique({where:{key:digest('mfa:'+userId)}});if(attempt?.lockedUntil&&attempt.lockedUntil>new Date())throw new HttpException('Too many authenticator attempts. Try again in 15 minutes.',429);}
async function failed(db:any,userId:string){const attempt=await db.loginAttempt.upsert({where:{key:digest('mfa:'+userId)},create:{key:digest('mfa:'+userId),failures:1},update:{failures:{increment:1}}});if(attempt.failures>=5)await db.loginAttempt.update({where:{key:attempt.key},data:{failures:0,lockedUntil:new Date(Date.now()+900000)}});throw new UnauthorizedException('Password or authenticator code is incorrect.');}
function matches(row:any,userId:string,code:string){
  const counter=row.secret?totpCounter(decrypt(row.secret,userId),code):null;if(counter!==null&&counter>row.lastCounter)return {counter,recoveryIndex:-1};
  const recovery=code.replaceAll('-','').toUpperCase(),hashes:Array<string>=Array.isArray(row.recoveryHashes)?row.recoveryHashes:[];
  const recoveryIndex=/^[A-F0-9]{16}$/.test(recovery)?hashes.findIndex(hash=>safeEqual(hash,digest(recovery))):-1;
  return recoveryIndex>=0?{counter:row.lastCounter,recoveryIndex}:null;
}
export async function verifySecondFactor(db:Database,userId:string,code:string){
  await throttle(db,userId);
  const accepted=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT user_id FROM user_security WHERE user_id = ${userId}::uuid FOR UPDATE`;
    const row=await tx.userSecurity.findUnique({where:{userId}});if(!row?.enabled)return false;
    const match=matches(row,userId,code);if(!match)return false;
    const hashes=(row.recoveryHashes as string[]).filter((_,i)=>i!==match.recoveryIndex);
    await tx.userSecurity.update({where:{userId},data:{lastCounter:match.counter,recoveryHashes:hashes}});return true;
  });
  if(!accepted)return failed(db,userId);await db.loginAttempt.deleteMany({where:{key:digest('mfa:'+userId)}});return true;
}
export async function twoFactor(db:Database,ctx:Context,method:string,action:string|undefined,body:unknown){
  const userId=ctx.user.id;
  if(method==='GET'){const row=await db.userSecurity.findUnique({where:{userId}});return {configured:configured(),enabled:!!row?.enabled,recoveryCodesRemaining:Array.isArray(row?.recoveryHashes)?row.recoveryHashes.length:0};}
  await throttle(db,userId);
  const input=z.object({currentPassword:passwordInput,code:codeInput.optional()}).strict().parse(body),user=await db.user.findUniqueOrThrow({where:{id:userId}});
  if(!await verifyPassword(input.currentPassword,user.passwordHash))return failed(db,userId);
  if(action==='setup'&&method==='POST'){
    const secret=authenticatorSecret();await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const row=await tx.userSecurity.findUnique({where:{userId}});if(row?.enabled)throw new ConflictException('Authenticator is already enabled.');
      await tx.userSecurity.upsert({where:{userId},create:{userId,pendingSecret:encrypt(secret,userId),pendingExpiresAt:new Date(Date.now()+600000)},update:{pendingSecret:encrypt(secret,userId),pendingExpiresAt:new Date(Date.now()+600000)}});
      await audit(tx,ctx,'TWO_FACTOR_SETUP_STARTED','auth',userId);
    });
    const label='TCW HR:'+user.email;return {secret,uri:`otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=TCW%20HR&algorithm=SHA1&digits=6&period=30`};
  }
  if(!input.code)throw new BadRequestException('Enter the authenticator or recovery code.');
  if(action==='enable'&&method==='POST'){
    const codes=Array.from({length:10},()=>randomBytes(8).toString('hex').toUpperCase());
    const accepted=await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const row=await tx.userSecurity.findUnique({where:{userId}});if(row?.enabled)throw new ConflictException('Authenticator is already enabled.');
      if(!row?.pendingSecret||!row.pendingExpiresAt||row.pendingExpiresAt<new Date())throw new BadRequestException('Setup expired. Start setup again.');
      const counter=totpCounter(decrypt(row.pendingSecret,userId),input.code!);if(counter===null)return false;
      await tx.userSecurity.update({where:{userId},data:{enabled:true,secret:row.pendingSecret,pendingSecret:null,pendingExpiresAt:null,lastCounter:counter,recoveryHashes:codes.map(digest)}});
      await tx.session.deleteMany({where:{userId,id:{not:ctx.session.id}}});await audit(tx,ctx,'TWO_FACTOR_ENABLED','auth',userId);return true;
    });
    if(!accepted)return failed(db,userId);await db.loginAttempt.deleteMany({where:{key:digest('mfa:'+userId)}});
    return {enabled:true,recoveryCodes:codes.map(c=>c.match(/.{4}/g)!.join('-'))};
  }
  if(action==='disable'&&method==='POST'){
    const accepted=await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT user_id FROM user_security WHERE user_id = ${userId}::uuid FOR UPDATE`;
      const row=await tx.userSecurity.findUnique({where:{userId}});if(!row?.enabled)throw new ConflictException('Authenticator is not enabled.');if(!matches(row,userId,input.code!))return false;
      await tx.userSecurity.delete({where:{userId}});await tx.session.deleteMany({where:{userId,id:{not:ctx.session.id}}});await audit(tx,ctx,'TWO_FACTOR_DISABLED','auth',userId);return true;
    });
    if(!accepted)return failed(db,userId);await db.loginAttempt.deleteMany({where:{key:digest('mfa:'+userId)}});return {enabled:false};
  }
  throw new BadRequestException('Unsupported authenticator operation.');
}
