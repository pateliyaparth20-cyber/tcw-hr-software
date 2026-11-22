import type {Database} from '../../../packages/database';
import {requirePermission,type Context} from './context';
type Weather={status:'AVAILABLE';city:string;country:string;temperature:number;feelsLike:number|null;humidity:number|null;windKmph:number|null;condition:string;code:string;fetchedAt:string;source:string;stale?:boolean};
type Entry={data?:Weather;retryAt:number;expiresAt:number};
const cache=new Map<string,Entry>(),pending=new Map<string,Promise<any>>();
function numeric(value:unknown,min:number,max:number){if(value===null||value===undefined||String(value).trim()==='')return null;const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max?n:null}
export function parseWeather(body:any,city:string,country:string,now=Date.now()):Weather|null{
 const c=(body?.current_condition??body?.data?.current_condition)?.[0],temperature=numeric(c?.temp_C,-100,65);if(!c||temperature===null)return null;
 return {status:'AVAILABLE',city,country,temperature,feelsLike:numeric(c.FeelsLikeC,-110,75),humidity:numeric(c.humidity,0,100),windKmph:numeric(c.windspeedKmph,0,500),condition:String(c.weatherDesc?.[0]?.value??'Current conditions').slice(0,100),code:String(c.weatherCode??''),fetchedAt:new Date(now).toISOString(),source:'https://wttr.in'};
}
export async function cityWeather(city:string,country:string,fetcher:typeof fetch=fetch,now=Date.now()){
 const location=[city,country].filter(Boolean).join(', '),key=location.toLowerCase(),stored=cache.get(key);
 if(stored&&stored.expiresAt>now&&stored.data)return stored.data;
 if(stored&&stored.retryAt>now)return stored.data?{...stored.data,stale:true}:{status:'UNAVAILABLE',city,country};
 if(pending.has(key))return pending.get(key);
 const work=(async()=>{const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try{const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Weather timeout'))},8000)});
   const body=await Promise.race([(async()=>{const r=await fetcher('https://wttr.in/'+encodeURIComponent(location)+'?format=j2',{signal:controller.signal,headers:{Accept:'application/json','User-Agent':'TCW-HR-Weather/1.0'}});if(!r.ok)throw Error('Weather unavailable');return r.json()})(),deadline]);
   const data=parseWeather(body,city,country,now);if(!data)throw Error('Invalid weather response');cache.set(key,{data,expiresAt:now+15*60000,retryAt:0});return data;
  }catch{const data=stored?.data&&Date.parse(stored.data.fetchedAt)>now-60*60000?stored.data:undefined;cache.set(key,{data,expiresAt:0,retryAt:now+60000});return data?{...data,stale:true}:{status:'UNAVAILABLE',city,country};}
  finally{if(timer)clearTimeout(timer);pending.delete(key);while(cache.size>100)cache.delete(cache.keys().next().value!)}
 })();pending.set(key,work);return work;
}
export async function workspaceWeather(db:Database,ctx:Context){
 requirePermission(ctx,'dashboard','VIEW');let profile:any={},timezone='Asia/Kolkata';
 if(ctx.user.role.scope==='PLATFORM'){const row=await db.platformSetting.findUnique({where:{key:'platform-profile'}});profile=row?.value??{}}
 else{const company=await db.tenant.findUnique({where:{id:ctx.tenantId!},select:{profile:true,timezone:true}});profile=company?.profile??{};timezone=company?.timezone||timezone}
 const city=String(profile.city??'').trim().slice(0,120),country=String(profile.country??'').trim().slice(0,80);
 if(!city||/[@/\\\u0000-\u001f]/.test(city+country))return {status:'LOCATION_REQUIRED',timezone,city:'',country};
 return {...await cityWeather(city,country),timezone};
}
