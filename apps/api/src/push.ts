import * as webpush from 'web-push';
import type {Database} from '../../../packages/database';

const publicKey=String(process.env.VAPID_PUBLIC_KEY??'').trim();
const privateKey=String(process.env.VAPID_PRIVATE_KEY??'').trim();
const subject=String(process.env.VAPID_SUBJECT??'https://techcyberwarrior.in').trim();

if(publicKey&&privateKey){
  webpush.setVapidDetails(subject,publicKey,privateKey);
}

export function pushConfig(){
  return {enabled:!!(publicKey&&privateKey),publicKey:publicKey||null};
}

export async function savePushSubscription(db:Database,input:{tenantId:string|null;userId:string;endpoint:string;p256dh:string;auth:string;userAgent?:string}){
  return db.pushSubscription.upsert({
    where:{endpoint:input.endpoint},
    create:{tenantId:input.tenantId,userId:input.userId,endpoint:input.endpoint,p256dh:input.p256dh,auth:input.auth,userAgent:input.userAgent??''},
    update:{tenantId:input.tenantId,userId:input.userId,p256dh:input.p256dh,auth:input.auth,userAgent:input.userAgent??''}
  });
}

export async function deletePushSubscription(db:Database,userId:string,endpoint:string){
  await db.pushSubscription.deleteMany({where:{userId,endpoint}});
  return {ok:true};
}

export async function sendPush(db:Database,args:{tenantId?:string|null;userId?:string|null;title:string;body:string;url?:string;tag?:string}){
  if(!publicKey||!privateKey)return;
  const rows=await db.pushSubscription.findMany({where:{...(args.tenantId!==undefined?{tenantId:args.tenantId}:{}) ,...(args.userId?{userId:args.userId}:{})}});
  const payload=JSON.stringify({title:args.title,body:args.body,url:args.url??'/notifications',tag:args.tag??'tcw-notification'});
  await Promise.allSettled(rows.map(async row=>{
    try{
      await webpush.sendNotification({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}},payload,{TTL:60*60*24});
    }catch(error:any){
      if([404,410].includes(Number(error?.statusCode??0)))await db.pushSubscription.deleteMany({where:{id:row.id}});
    }
  }));
}
