import {createHmac,randomBytes} from 'node:crypto';
import {safeEqual} from './index';
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes:Buffer){let bits=0,value=0,out='';for(const b of bytes){value=(value<<8)|b;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5;}}if(bits)out+=alphabet[(value<<(5-bits))&31];return out;}
export function decode32(secret:string){let bits=0,value=0;const out:number[]=[];for(const c of secret.toUpperCase().replace(/=+$/,'')){const n=alphabet.indexOf(c);if(n<0)throw new Error('Invalid authenticator secret.');value=(value<<5)|n;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);}
export const authenticatorSecret=()=>base32(randomBytes(20));
/** RFC 6238, 30-second steps, HMAC-SHA1. digits=8 is used only by published test vectors. */
export function totp(secret:string,time=Date.now(),digits=6){const counter=Math.floor(time/30000),buffer=Buffer.alloc(8);buffer.writeBigUInt64BE(BigInt(counter));const hash=createHmac('sha1',decode32(secret)).update(buffer).digest(),offset=hash[hash.length-1]&15;return ((hash.readUInt32BE(offset)&0x7fffffff)%10**digits).toString().padStart(digits,'0');}
export function totpCounter(secret:string,code:string,time=Date.now()){if(!/^\d{6}$/.test(code))return null;const current=Math.floor(time/30000);for(const offset of [0,-1,1]){const counter=current+offset;if(counter>=0&&safeEqual(totp(secret,counter*30000),code))return counter;}return null;}
