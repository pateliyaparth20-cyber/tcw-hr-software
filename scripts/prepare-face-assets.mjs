import {mkdir,copyFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url),source=path.dirname(require.resolve('@vladmandic/face-api/package.json'));
for(const app of ['web','super-admin']){
 const destination=path.resolve(`apps/${app}/public/face-guide-v1`);await mkdir(destination,{recursive:true});
 await copyFile(path.join(source,'dist/face-api.js'),path.join(destination,'face-api.js'));
 for(const file of await readdir(path.join(source,'model')))if(file.startsWith('tiny_face_detector_')||file.startsWith('face_landmark_68_tiny_'))await copyFile(path.join(source,'model',file),path.join(destination,file));
}
