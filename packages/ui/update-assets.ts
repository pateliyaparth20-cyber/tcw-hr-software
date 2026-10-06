import {readdir,stat} from 'node:fs/promises';
import path from 'node:path';
export async function releaseAssets(root=process.cwd()){
 const buildRoot=path.join(root,'.next'),files:{url:string;bytes:number}[]=[];
 async function collect(relative:string){
  const entries=await readdir(path.join(buildRoot,relative),{withFileTypes:true});
  for(const entry of entries){const file=relative+'/'+entry.name;
   if(entry.isDirectory())await collect(file);
   else if(entry.isFile()&&/^static\/[a-zA-Z0-9_./()\[\]-]+\.(js|css)$/.test(file)&&!file.split('/').some(part=>part==='..'||part==='.')){
    const size=(await stat(path.join(buildRoot,file))).size;if(size>0)files.push({url:'/_next/'+file,bytes:size});
   }
  }
 }
 await collect('static');if(!files.length||files.length>1000)throw new Error('Build assets unavailable');
 return {version:process.env.RAILWAY_GIT_COMMIT_SHA??process.env.GIT_COMMIT_SHA??'local',files:files.sort((a,b)=>a.url.localeCompare(b.url))};
}
