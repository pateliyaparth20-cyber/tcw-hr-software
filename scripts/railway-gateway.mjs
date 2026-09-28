import 'dotenv/config';
import http from 'node:http';
import {spawn} from 'node:child_process';

const publicPort=Number(process.env.PORT??8080);
const adminHost=(()=>{try{return new URL(process.env.ADMIN_URL??'').host.toLowerCase()}catch{return ''}})();
const webHost=(()=>{try{return new URL(process.env.WEB_URL??'').host.toLowerCase()}catch{return ''}})();
const children=[];
let stopping=false;

function start(name,cmd,args,extraEnv={}){
 const child=spawn(cmd,args,{stdio:'inherit',shell:process.platform==='win32',env:{...process.env,...extraEnv}});
 children.push(child);
 child.on('exit',(code,signal)=>{if(!stopping){console.error(`[${name}] exited (${signal??code??'unknown'}).`);shutdown(code&&code!==0?code:1)}});
 return child;
}
function shutdown(code=0){
 if(stopping)return;stopping=true;
 try{server.close()}catch{}
 for(const child of children){try{child.kill('SIGTERM')}catch{}}
 setTimeout(()=>process.exit(code),1500).unref();
}

// One Railway service, four internal TCW processes. PostgreSQL and Redis remain
// Railway managed services. Only this gateway listens on Railway's public PORT.
start('api','npm',['run','start:api'],{PORT:'4000',API_PORT:'4000',API_BIND_HOST:'127.0.0.1'});
start('web','npm',['run','start:web'],{PORT:'3000',API_INTERNAL_URL:process.env.API_INTERNAL_URL??'http://127.0.0.1:4000'});
start('admin','npm',['run','start:admin'],{PORT:'3001',API_INTERNAL_URL:process.env.API_INTERNAL_URL??'http://127.0.0.1:4000'});
start('worker','npm',['run','start:worker']);

function targetPort(req){
 const path=String(req.url??'/');
 // BioMax/ZKTeco PUSH/ADMS and Socket.IO are API-native protocols and must bypass Next.js.
 if(path==='/api'||path.startsWith('/api/')||path==='/iclock'||path.startsWith('/iclock/')||path.startsWith('/socket.io/'))return 4000;
 const host=String(req.headers.host??'').toLowerCase().split(':')[0];
 const admin=adminHost.split(':')[0];
 if(admin&&host===admin)return 3001;
 // Railway health probes or default *.up.railway.app domain serve HR by default.
 return 3000;
}
const server=http.createServer((req,res)=>{
 const port=targetPort(req);
 const upstream=http.request({hostname:'127.0.0.1',port,path:req.url,method:req.method,headers:{...req.headers,host:req.headers.host??(port===3001?adminHost:webHost)}},up=>{
  res.writeHead(up.statusCode??502,up.statusMessage,up.headers);up.pipe(res);
 });
 upstream.on('error',err=>{if(!res.headersSent)res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({message:'TCW HR service is starting. Please retry shortly.',detail:process.env.NODE_ENV==='production'?undefined:err.message}))});
 req.pipe(upstream);
});
server.listen(publicPort,'0.0.0.0',()=>console.log(`TCW HR Railway gateway listening on :${publicPort} · HR ${webHost||'default host'} · Admin ${adminHost||'admin host not set'}`));
process.on('SIGTERM',()=>shutdown(0));process.on('SIGINT',()=>shutdown(0));
