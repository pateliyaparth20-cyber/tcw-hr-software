import {spawn} from 'node:child_process';

const processes = [
  ['api', 'npm', ['run','start:api']],
  ['web', 'npm', ['run','start','--workspace=@peopleos/web']],
  ['admin', 'npm', ['run','start','--workspace=@peopleos/super-admin']],
  ['worker', 'npm', ['run','start:worker']],
];

const children=[];
let shuttingDown=false;
function stop(code=0){
  if(shuttingDown)return;
  shuttingDown=true;
  for(const child of children){
    try{child.kill('SIGTERM')}catch{}
  }
  setTimeout(()=>process.exit(code),1500).unref();
}
for(const [name,cmd,args] of processes){
  const child=spawn(cmd,args,{stdio:'inherit',shell:process.platform==='win32',env:process.env});
  children.push(child);
  child.on('exit',(code,signal)=>{
    if(!shuttingDown){
      console.error(`[${name}] stopped (${signal??code??'unknown'}). Stopping TCW HR stack.`);
      stop(code&&code!==0?code:1);
    }
  });
}
process.on('SIGINT',()=>stop(0));
process.on('SIGTERM',()=>stop(0));
