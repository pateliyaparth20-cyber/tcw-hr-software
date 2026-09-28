import 'dotenv/config';
import {db} from '../../../packages/database';
import {createApp} from './app';
async function main(){
  if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required. Run npm run setup.');
  if(process.env.NODE_ENV==='production'&&process.env.COOKIE_SECURE!=='true')throw new Error('Production requires COOKIE_SECURE=true and HTTPS.');
  await db.$connect();const {app}=await createApp(db);const port=Number(process.env.PORT??process.env.API_PORT??4000);await app.listen(port,process.env.API_BIND_HOST??'0.0.0.0');
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{await app.close();await db.$disconnect();process.exit(0);});
}
main().catch(e=>{console.error(e.message);process.exit(1)});
