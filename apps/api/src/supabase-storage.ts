import {createHash,createPrivateKey,sign} from 'node:crypto';
import {ServiceUnavailableException} from '@nestjs/common';
export type SupabaseDriveConnection={endpoint:string;bucket:string;signingKey:string};
export class SupabaseObjectStore{
 constructor(private config:SupabaseDriveConnection,private transport:typeof fetch=fetch,private now=()=>Date.now()){}
 async send(command:any):Promise<any>{
  const name=command.constructor.name,method=({HeadBucketCommand:'HEAD',PutObjectCommand:'PUT',GetObjectCommand:'GET',DeleteObjectCommand:'DELETE'} as Record<string,string>)[name];if(!method)throw new Error('Unsupported Cloud Drive operation.');
  const key=String(command.input.Key??''),body=command.input.Body===undefined?Buffer.alloc(0):Buffer.from(command.input.Body),mime=method==='PUT'?String(command.input.ContentType??''):'';
  if(command.input.Bucket!==this.config.bucket)throw new Error('Invalid Cloud Drive bucket.');
  const timestamp=String(Math.floor(this.now()/1000)),hash=createHash('sha256').update(body).digest('hex'),payload=[method,this.config.bucket,key,timestamp,hash,mime].join('\n');
  const privateKey=createPrivateKey({key:Buffer.from(this.config.signingKey,'base64'),type:'pkcs8',format:'der'}),signature=sign(null,Buffer.from(payload),privateKey).toString('base64url');
  const url=new URL(this.config.endpoint);if(key)url.searchParams.set('key',key);
  let response:Response;try{response=await this.transport(url,{method,headers:{'x-tcw-time':timestamp,'x-tcw-hash':hash,'x-tcw-signature':signature,...(mime?{'content-type':mime}:{})},...(method==='PUT'?{body}:{}),signal:AbortSignal.timeout(20000),redirect:'error'});}catch{throw new ServiceUnavailableException('TCW Cloud Drive is temporarily unavailable. Try again.');}
  if(!response.ok)throw new ServiceUnavailableException(response.status===413?'Free storage or file size limit reached.':'Cloud Drive could not complete the request. Try again or contact support.');
  if(method==='GET'){const bytes=new Uint8Array(await response.arrayBuffer());return {Body:{transformToByteArray:async()=>bytes}};}return {};
 }
 destroy(){}
}
