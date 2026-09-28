import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import type {Database} from '../../../packages/database';
import {CompatibleProvider} from '../../../packages/ai';

type EffectiveAIConfig={provider:string;baseUrl:string;model:string;apiKey:string;enabled:boolean;source:'DATABASE'|'ENV'|'NONE';apiKeyHint?:string|null};
function masterKey(){
  const secret=process.env.CONFIG_ENCRYPTION_KEY?.trim();
  if(!secret)throw new Error('CONFIG_ENCRYPTION_KEY is missing. Run npm run setup once to upgrade your local .env.');
  return createHash('sha256').update(secret).digest();
}
function encrypt(value:string){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',masterKey(),iv);
  const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);const tag=cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}
function decrypt(value:string){
  const [version,ivText,tagText,dataText]=value.split(':');if(version!=='v1'||!ivText||!tagText||!dataText)throw new Error('Stored AI secret is invalid. Re-enter the API key.');
  const decipher=createDecipheriv('aes-256-gcm',masterKey(),Buffer.from(ivText,'base64url'));decipher.setAuthTag(Buffer.from(tagText,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataText,'base64url')),decipher.final()]).toString('utf8');
}
export async function effectiveAIConfig(db:Database):Promise<EffectiveAIConfig>{
  const row=await db.platformAIConfig.findUnique({where:{id:'default'}});
  if(row){
    if(row.enabled&&row.baseUrl&&row.model&&row.apiKeyCiphertext)return {provider:row.provider,baseUrl:row.baseUrl,model:row.model,apiKey:decrypt(row.apiKeyCiphertext),enabled:true,source:'DATABASE',apiKeyHint:row.apiKeyHint};
    return {provider:row.provider,baseUrl:row.baseUrl,model:row.model,apiKey:'',enabled:false,source:'DATABASE',apiKeyHint:row.apiKeyHint};
  }
  if(process.env.AI_BASE_URL&&process.env.AI_MODEL&&process.env.AI_API_KEY)return {provider:'OPENAI_COMPATIBLE',baseUrl:process.env.AI_BASE_URL,model:process.env.AI_MODEL,apiKey:process.env.AI_API_KEY,enabled:true,source:'ENV',apiKeyHint:`••••${process.env.AI_API_KEY.slice(-4)}`};
  return {provider:'OPENAI_COMPATIBLE',baseUrl:'',model:'',apiKey:'',enabled:false,source:'NONE',apiKeyHint:null};
}
export async function publicAIConfig(db:Database){
  const row=await db.platformAIConfig.findUnique({where:{id:'default'}});
  if(row){const configured=!!(row.enabled&&row.apiKeyCiphertext&&row.baseUrl&&row.model);return {provider:row.provider,baseUrl:row.baseUrl,model:row.model,enabled:row.enabled,configured,apiKeyHint:row.apiKeyHint,source:'DATABASE'};}
  const envConfigured=!!(process.env.AI_BASE_URL&&process.env.AI_MODEL&&process.env.AI_API_KEY);
  return {provider:'OPENAI_COMPATIBLE',baseUrl:process.env.AI_BASE_URL??'',model:process.env.AI_MODEL??'',enabled:envConfigured,configured:envConfigured,apiKeyHint:process.env.AI_API_KEY?`••••${process.env.AI_API_KEY.slice(-4)}`:null,source:envConfigured?'ENV':'NONE'};
}
export async function saveAIConfig(db:Database,input:{provider?:string;baseUrl:string;model:string;apiKey?:string;enabled:boolean}){
  const existing=await db.platformAIConfig.findUnique({where:{id:'default'}});
  const key=input.apiKey?.trim();
  if(input.enabled&&!key&&!existing?.apiKeyCiphertext)throw new Error('Enter an API key before enabling AI.');
  const data:any={provider:input.provider??'OPENAI_COMPATIBLE',baseUrl:input.baseUrl.trim().replace(/\/+$/,''),model:input.model.trim(),enabled:input.enabled};
  if(data.baseUrl){const url=new URL(data.baseUrl);if(url.protocol!=='https:')throw new Error('AI provider URL must use HTTPS.');}
  if(input.enabled&&(!data.baseUrl||!data.model))throw new Error('Base URL and model are required when AI is enabled.');
  if(key){data.apiKeyCiphertext=encrypt(key);data.apiKeyHint=`••••${key.slice(-4)}`;}
  await db.platformAIConfig.upsert({where:{id:'default'},create:{id:'default',...data},update:data});
  return publicAIConfig(db);
}
export async function testAIConnection(db:Database){
  const cfg=await effectiveAIConfig(db);if(!cfg.enabled||!cfg.apiKey)throw new Error('Configure and enable AI first.');
  const answer=await new CompatibleProvider({baseUrl:cfg.baseUrl,apiKey:cfg.apiKey,model:cfg.model}).summarize('Reply with a short confirmation that the TCW HR AI connection is working.',{connectionTest:true});
  return {ok:true,answer,model:cfg.model};
}
