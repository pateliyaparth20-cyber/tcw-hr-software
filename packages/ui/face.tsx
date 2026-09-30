'use client';
import React,{useEffect,useRef,useState} from 'react';
import {Camera,Check,LogOut,RotateCcw,ShieldCheck,UserCheck} from 'lucide-react';
import {api,BrandLogo,Modal,useApp} from './core';

const FACE_API_SRC='https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.js';
const FACE_MODEL_URL='https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model';
let enginePromise:Promise<any>|null=null;

function loadScript(){
  return new Promise<void>((resolve,reject)=>{
    if((window as any).faceapi){resolve();return;}
    const existing=document.querySelector('script[data-tcw-face-api]') as HTMLScriptElement|null;
    if(existing){existing.addEventListener('load',()=>resolve(),{once:true});existing.addEventListener('error',()=>reject(new Error('Face engine could not be loaded.')),{once:true});return;}
    const script=document.createElement('script');
    script.src=FACE_API_SRC;script.async=true;script.crossOrigin='anonymous';script.dataset.tcwFaceApi='1';
    script.onload=()=>resolve();script.onerror=()=>reject(new Error('Face engine could not be loaded. Check internet access and try again.'));
    document.head.appendChild(script);
  });
}
async function faceEngine(){
  if(!enginePromise)enginePromise=(async()=>{
    await loadScript();
    const faceapi=(window as any).faceapi;
    if(!faceapi)throw new Error('Face engine is unavailable.');
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL)
    ]);
    return faceapi;
  })();
  return enginePromise;
}
async function startCamera(video:HTMLVideoElement){
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access is not supported on this device/browser.');
  const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:720},height:{ideal:720}}});
  video.srcObject=stream;await video.play();return stream;
}
function stopStream(stream:MediaStream|null){stream?.getTracks().forEach(track=>track.stop());}
function captureFrame(video:HTMLVideoElement){
  const canvas=document.createElement('canvas'),size=480;canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Camera frame could not be prepared.');
  const sw=video.videoWidth,sh=video.videoHeight;if(!sw||!sh)throw new Error('Camera is not ready yet.');
  const side=Math.min(sw,sh),sx=(sw-side)/2,sy=(sh-side)/2;
  ctx.drawImage(video,sx,sy,side,side,0,0,size,size);
  const pixels=ctx.getImageData(0,0,size,size).data;let mean=0;
  for(let i=0;i<pixels.length;i+=16)mean+=(pixels[i]+pixels[i+1]+pixels[i+2])/3;
  mean/=Math.max(1,pixels.length/16);
  if(mean<35)throw new Error('Image is too dark. Move to better light and try again.');
  return canvas.toDataURL('image/jpeg',0.72);
}
async function descriptorFromVideo(video:HTMLVideoElement){
  const faceapi=await faceEngine();
  const options=new faceapi.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:0.68});
  const faces=await faceapi.detectAllFaces(video,options).withFaceLandmarks(true).withFaceDescriptors();
  if(faces.length===0)throw new Error('No face detected. Keep your face clearly inside the guide.');
  if(faces.length>1)throw new Error('More than one face detected. Only the employee should be in the camera.');
  const face=faces[0],box=face.detection.box;
  const area=(box.width*box.height)/Math.max(1,video.videoWidth*video.videoHeight);
  if(face.detection.score<0.72||area<0.08)throw new Error('Face is not clear enough. Move closer and use better light.');
  const cx=(box.x+box.width/2)/video.videoWidth,cy=(box.y+box.height/2)/video.videoHeight;
  if(Math.abs(cx-.5)>.3||Math.abs(cy-.5)>.3)throw new Error('Center your face inside the guide and try again.');
  return Array.from(face.descriptor as Float32Array).map(v=>Number(v.toFixed(8)));
}
function CameraStage({videoRef,state,message}:{videoRef:React.RefObject<HTMLVideoElement|null>;state:string;message:string}){
  return <div className={'face-camera '+state}><video ref={videoRef} autoPlay muted playsInline/><div className="face-scan-shade"/><div className="face-scan-guide"><span/><i/><i/><i/><i/></div>{['starting','capturing','saving','success'].includes(state)&&<div className={'face-scan-overlay '+(state==='success'?'success':'')}>{state==='success'?<span><Check size={30}/></span>:<span className="auth-spinner"/>}<strong>{message}</strong></div>}</div>;
}
export function EmployeeFaceEnrollmentGate({onComplete,onSignOut}:{onComplete:()=>void|Promise<any>;onSignOut:()=>void|Promise<any>}){
  const{session}=useApp();const videoRef=useRef<HTMLVideoElement>(null),streamRef=useRef<MediaStream|null>(null);
  const[state,setState]=useState('starting'),[message,setMessage]=useState('Preparing secure Face Setup…'),[samples,setSamples]=useState<number[][]>([]),[error,setError]=useState('');
  const prompts=['Look straight at the camera.','Turn your face slightly to the left.','Turn your face slightly to the right.'];
  const start=async()=>{stopStream(streamRef.current);streamRef.current=null;setError('');setState('starting');setMessage('Preparing secure Face Setup…');try{await faceEngine();if(!videoRef.current)throw new Error('Camera view is unavailable.');streamRef.current=await startCamera(videoRef.current);setState('ready');setMessage(prompts[samples.length]??prompts[0]);}catch(e:any){setState('error');setError(e?.message??'Face Setup could not start.');}};
  useEffect(()=>{start();return()=>stopStream(streamRef.current)},[]);
  const capture=async()=>{if(!videoRef.current||state!=='ready')return;setState('capturing');setError('');try{const descriptor=await descriptorFromVideo(videoRef.current);const next=[...samples,descriptor];setSamples(next);if(next.length<3){setState('ready');setMessage(prompts[next.length]);return;}setState('saving');setMessage('Saving encrypted face template…');await api('attendance/face-profile','POST',{samples:next,engine:'face-api-1.7.15'},session.csrf);stopStream(streamRef.current);streamRef.current=null;setState('success');setMessage('Face Setup complete');await new Promise(r=>setTimeout(r,500));await onComplete();}catch(e:any){setState('ready');setError(e?.message??'Face capture failed. Please try again.');}};
  const restart=()=>{setSamples([]);setMessage(prompts[0]);start();};
  return <div className="mandatory-overlay"><div className="mandatory-card face-enrollment-card"><div className="auth-text-brand"><BrandLogo/><strong>TCW Employee</strong><small>SECURE FACE ATTENDANCE</small></div><div className="face-enrollment-copy"><span className="login-eyebrow">FIRST-TIME FACE SETUP</span><h2>Add your face for attendance</h2><p>Complete three quick captures. After this, Face Scan attendance is accepted only when the current face matches this enrolled employee template.</p></div><CameraStage videoRef={videoRef} state={state} message={message}/><div className="face-enrollment-progress">{[0,1,2].map(i=><span key={i} className={samples.length>i?'done':''}/>)}</div><div className="face-scan-status"><span className={'face-status-icon '+(error?'error':'ready')}><UserCheck size={18}/></span><div><strong>{error?'Face Setup needs attention':'Capture '+Math.min(samples.length+1,3)+' of 3'}</strong><p>{error||message}</p></div></div><div className="face-scan-privacy"><ShieldCheck size={16}/><p>TCW stores an encrypted mathematical face template for attendance matching. Enrollment selfie images are not stored. If HR resets the face, this setup is required again.</p></div><p className="face-model-note">Keep only one person in frame and use normal front lighting.</p><div className="face-enrollment-actions"><button className="btn secondary" type="button" onClick={onSignOut}><LogOut size={16}/>Sign out</button>{state==='error'?<button className="btn primary" type="button" onClick={restart}><RotateCcw size={16}/>Try again</button>:<button className="btn primary" type="button" disabled={state!=='ready'} onClick={capture}><Camera size={17}/>{samples.length===0?'Add Face':samples.length<2?'Capture next':'Finish Face Setup'}</button>}</div></div></div>;
}
export function FaceScanAttendanceModal({onClose,onComplete}:{onClose:()=>void;onComplete?:()=>void|Promise<any>}){
 const{session}=useApp();const videoRef=useRef<HTMLVideoElement>(null),streamRef=useRef<MediaStream|null>(null);
 const[state,setState]=useState('starting'),[message,setMessage]=useState('Preparing face verification…'),[result,setResult]=useState<any>(null);
 const close=()=>{stopStream(streamRef.current);streamRef.current=null;onClose();};
 const start=async()=>{stopStream(streamRef.current);streamRef.current=null;setResult(null);setState('starting');setMessage('Preparing face verification…');try{await faceEngine();if(!videoRef.current)throw new Error('Camera view is unavailable.');streamRef.current=await startCamera(videoRef.current);setState('ready');setMessage('Center your face inside the guide, then scan.');}catch(e:any){setState('error');setMessage(e?.message??'Camera could not start.');}};
 useEffect(()=>{start();return()=>stopStream(streamRef.current)},[]);
 const scan=async()=>{if(!videoRef.current||state!=='ready')return;setState('capturing');setMessage('Matching your face…');try{const descriptor=await descriptorFromVideo(videoRef.current),frame=captureFrame(videoRef.current);const response=await api('attendance/face-scan','POST',{frame,descriptor,clientNonce:crypto.randomUUID()},session.csrf);setResult(response);setState('success');setMessage(response.punchType==='IN'?'Check-in recorded':'Check-out recorded');stopStream(streamRef.current);streamRef.current=null;await onComplete?.();}catch(e:any){setState('error');setMessage(e?.message??'Face verification failed. Attendance was not recorded.');}};
 return <Modal title="Face Scan attendance" onClose={close}><div className="face-scan-modal"><CameraStage videoRef={videoRef} state={state} message={message}/><div className="face-scan-status"><span className={'face-status-icon '+state}>{state==='success'?<Check size={18}/>:state==='error'?<RotateCcw size={18}/>:<UserCheck size={18}/>}</span><div><strong>{state==='success'?message:state==='error'?'Face verification failed':'Enrolled face verification'}</strong><p>{state==='success'?'Attendance status: '+String(result?.status??'recorded').replaceAll('_',' ').toLowerCase()+'.':message}</p></div></div><div className="face-scan-privacy"><ShieldCheck size={16}/><p>Your live face descriptor is compared with your encrypted enrolled template. If it does not match, TCW does not create an attendance punch. Raw scan images are not stored in the attendance database.</p></div><div className="face-scan-actions">{state==='error'?<button className="btn secondary" type="button" onClick={start}><RotateCcw size={16}/>Try again</button>:state==='success'?<button className="btn primary" type="button" onClick={close}>Done</button>:<button className="btn primary face-scan-button" type="button" disabled={state!=='ready'} onClick={scan}><Camera size={17}/>{state==='capturing'?'Matching…':'Scan face & record attendance'}</button>}</div></div></Modal>;
}