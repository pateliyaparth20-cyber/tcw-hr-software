import test from 'node:test';
import assert from 'node:assert/strict';
import {metersBetween,fieldPointSchema,fieldPolicySchema} from '../../apps/api/src/field-work';
import {analyzeFace,validateHeadMovement} from '../../apps/api/src/face-engine';
import {faceDistance} from '../../apps/api/src/face-profile';
import sharp from 'sharp';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
test('GPS distance and field policy bounds reject invalid coordinates and unsafe intervals',()=>{assert.equal(metersBetween({latitude:0,longitude:0},{latitude:0,longitude:0}),0);assert(Math.abs(metersBetween({latitude:0,longitude:0},{latitude:0,longitude:.001})-111.2)<1);assert.throws(()=>fieldPointSchema.parse({latitude:91,longitude:0,accuracy:1,capturedAt:new Date().toISOString()}));assert.throws(()=>fieldPolicySchema.parse({enabled:true,intervalSeconds:1,maxAccuracyMeters:100,maxSessionHours:100,employeeIds:[]}));});
test('head challenge rejects a static photo, wrong turn, return failure and duplicate frame hashes',()=>{const f=(yaw:number,hash:string)=>({yaw,hash});validateHeadMovement([f(0,'a'),f(.2,'b'),f(.02,'c')],'LEFT');validateHeadMovement([f(0,'a'),f(-.2,'b'),f(.02,'c')],'RIGHT');for(const frames of [[f(0,'a'),f(0,'b'),f(0,'c')],[f(0,'a'),f(-.2,'b'),f(0,'c')],[f(0,'a'),f(.2,'b'),f(.3,'c')],[f(0,'a'),f(.2,'a'),f(0,'a')]])assert.throws(()=>validateHeadMovement(frames,'LEFT'));});
test('server recognition decodes actual images and separates two people without browser descriptors',async()=>{
 const sample=await readFile(path.join(path.dirname(require.resolve('@vladmandic/face-api/package.json')),'demo/sample6.jpg'));
 const meta=await sharp(sample).metadata();assert(meta.width&&meta.height);
 // The upstream demonstration image contains several people. Crop two faces independently.
 const api=require('@vladmandic/face-api/dist/face-api.node-wasm.js');await api.tf.setBackend('wasm');await api.tf.ready();const models=path.join(path.dirname(require.resolve('@vladmandic/face-api/package.json')),'model');await api.nets.tinyFaceDetector.loadFromDisk(models);const {data,info}=await sharp(sample).resize(640,640,{fit:'inside'}).removeAlpha().raw().toBuffer({resolveWithObject:true}),tensor=api.tf.tensor3d(new Uint8Array(data),[info.height,info.width,3]);let detected:any[];try{detected=await api.detectAllFaces(tensor,new api.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:.55}));}finally{tensor.dispose();}assert(detected.length>=2);
 const resized=await sharp(sample).resize(640,640,{fit:'inside'}).toBuffer();const frames=[];for(const f of detected.slice(0,2)){const b=f.box,margin=30,left=Math.max(0,Math.floor(b.x)-margin),top=Math.max(0,Math.floor(b.y)-margin),width=Math.min(info.width-left,Math.ceil(b.width)+margin*2),height=Math.min(info.height-top,Math.ceil(b.height)+margin*2);const bytes=await sharp(resized).extract({left,top,width,height}).resize(420,420,{fit:'inside'}).jpeg({quality:95}).toBuffer();frames.push('data:image/jpeg;base64,'+bytes.toString('base64'));}
 const a=await analyzeFace(frames[0]),repeat=await analyzeFace(frames[0]),b=await analyzeFace(frames[1]);const norm=(v:number[])=>{const n=Math.sqrt(v.reduce((s,x)=>s+x*x,0));return v.map(x=>x/n)};assert(faceDistance(norm(a.descriptor),norm(repeat.descriptor))<.01);assert(faceDistance(norm(a.descriptor),norm(b.descriptor))>.42);await assert.rejects(analyzeFace('data:image/jpeg;base64,'+sample.toString('base64')),/More than one face/);
});
