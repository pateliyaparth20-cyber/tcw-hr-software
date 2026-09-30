'use client';
import React,{useEffect,useRef,useState} from 'react';
import {Camera,Check,LogOut,RotateCcw,ShieldCheck,UserCheck} from 'lucide-react';
import {api,Modal,TCW_PRODUCT_LOGO,useApp} from './core';

const FACE_API_SRC='https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.js';
const FACE_MODEL_URL='https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model';
let enginePromise:Promise<any>|null=null;

function warmNetwork(){
  for(const href of ['https://cdn.jsdelivr.net']){
    if(document.querySelector('link[data-tcw-face-preconnect="'+href+'"]'))continue;
    const link=document.createElement('link');link.rel='preconnect';link.href=href;link.crossOrigin='anonymous';link.dataset.tcwFacePreconnect=href;document.head.appendChild(link);
  }
}
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
  if(!enginePromise){
    warmNetwork();
    enginePromise=(async()=>{
      await loadScript();
      const faceapi=(window as any).faceapi;
      if(!faceapi)throw new Error('Face engine is unavailable.');
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL)
      ]);
      return faceapi;
    })().catch(error=>{enginePromise=null;throw error});
  }
  return enginePromise;
}
export function preloadFaceEngine(){if(typeof window!=='undefined')void faceEngine().catch(()=>{});}
async function startCamera(video:HTMLVideoElement){
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access is not supported on this device/browser.');
  const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:640}}});
  video.srcObject=stream;await video.play();return stream;
}
function stopStream(stream:MediaStream|null){stream?.getTracks().forEach(track=>track.stop());}
function captureFrame(video:HTMLVideoElement){
  const canvas=document.createElement('canvas'),size=420;canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Camera frame could not be prepared.');
  const sw=video.videoWidth,sh=video.videoHeight;if(!sw||!sh)throw new Error('Camera is not ready yet.');
  const side=Math.min(sw,sh),sx=(sw-side)/2,sy=(sh-side)/2;
  ctx.drawImage(video,sx,sy,side,side,0,0,size,size);
  const pixels=ctx.getImageData(0,0,size,size).data;let mean=0,samples=0;
  for(let i=0;i<pixels.length;i+=32){mean+=(pixels[i]+pixels[i+1]+pixels[i+2])/3;samples++;}
  mean/=Math.max(1,samples);
  if(mean<30)throw new Error('Image is too dark. Move to better light and try again.');
  return canvas.toDataURL('image/jpeg',0.68);
}
async function descriptorFromVideo(video:HTMLVideoElement){
  const faceapi=await faceEngine();
  const options=new faceapi.TinyFaceDetectorOptions({inputSize:224,scoreThreshold:0.55});
  const faces=await faceapi.detectAllFaces(video,options).withFaceLandmarks(true).withFaceDescriptors();
  if(faces.length===0)throw new Error('No face detected. Keep your face clearly inside the guide.');
  if(faces.length>1)throw new Error('More than one face detected. Only the employee should be in the camera.');
  const face=faces[0],box=face.detection.box;
  const area=(box.width*box.height)/Math.max(1,video.videoWidth*video.videoHeight);
  if(face.detection.score<0.62||area<0.06)throw new Error('Face is not clear enough. Move a little closer and use normal light.');
  const cx=(box.x+box.width/2)/video.videoWidth,cy=(box.y+box.height/2)/video.videoHeight;
  if(Math.abs(cx-.5)>.32||Math.abs(cy-.5)>.32)throw new Error('Center your face inside the guide and try again.');
  return Array.from(face.descriptor as Float32Array).map(v=>Number(v.toFixed(8)));
}
function CompanyMark({src,name}:{src?:string|null;name?:string}){
  return <img src={src||TCW_PRODUCT_LOGO} alt={(name||'Company')+' logo'} className="face-company-logo" onError={e=>{(e.currentTarget as HTMLImageElement).src=TCW_PRODUCT_LOGO}}/>;
}
function CameraStage({videoRef,state,message}:{videoRef:React.RefObject<HTMLVideoElement|null>;state:string;message:string}){
  return <div className={'face-camera '+state}><video ref={videoRef} autoPlay muted playsInline/><div className="face-scan-shade"/><div className="face-scan-guide"><span/><i/><i/><i/><i/></div>{['starting','capturing','saving','success'].includes(state)&&<div className={'face-scan-overlay '+(state==='success'?'success':'')}>{state==='success'?<span><Check size={30}/></span>:<span className="auth-spinner"/>}<strong>{message}</strong></div>}</div>;
}
export function EmployeeFaceEnrollmentGate({onComplete,onSignOut,logo,companyName}:{onComplete:()=>void|Promise<any>;onSignOut:()=>void|Promise<any>;logo?:string|null;companyName?:string}){
  const{session}=useApp();const videoRef=useRef<HTMLVideoElement>(null),streamRef=useRef<MediaStream|null>(null);
  const[state,setState]=useState('starting'),[message,setMessage]=useState('Opening camera…'),[samples,setSamples]=useState<number[][]>([]),[error,setError]=useState('');
  const prompts=['Look straight at the camera.','Turn your face slightly to the left.','Turn your face slightly to the right.'];
  const start=async()=>{stopStream(streamRef.current);streamRef.current=null;setError('');setState('starting');setMessage('Opening camera…');try{if(!videoRef.current)throw new Error('Camera view is unavailable.');const engine=faceEngine(),camera=startCamera(videoRef.current);const[,stream]=await Promise.all([engine,camera]);streamRef.current=stream;setState('ready');setMessage(prompts[samples.length]??prompts[0]);}catch(e:any){stopStream(streamRef.current);setState('error');setError(e?.message??'Face Setup could not start.');}};
  useEffect(()=>{start();return()=>stopStream(streamRef.current)},[]);
  const capture=async()=>{if(!videoRef.current||state!=='ready')return;setState('capturing');setError('');try{const descriptor=await descriptorFromVideo(videoRef.current);const next=[...samples,descriptor];setSamples(next);if(next.length<3){setState('ready');setMessage(prompts[next.length]);return;}setState('saving');setMessage('Securing your face template…');await api('attendance/face-profile','POST',{samples:next,engine:'face-api-1.7.15-v2'},session.csrf);try{localStorage.setItem('tcw_face_enrolled:'+String(session.user.employeeId??session.user.id),'1')}catch{}stopStream(streamRef.current);streamRef.current=null;setState('success');setMessage('Face Setup complete');await new Promise(r=>setTimeout(r,300));await onComplete();}catch(e:any){setState('ready');setError(e?.message??'Face capture failed. Please try again.');}};
  const restart=()=>{setSamples([]);setMessage(prompts[0]);start();};
  return <div className="mandatory-overlay employee-face-onboarding"><div className="mandatory-card face-enrollment-card"><div className="face-enrollment-brand"><CompanyMark src={logo??session.company?.logo} name={companyName??session.company?.name}/><div><strong>{companyName??session.company?.name??'TCW Employee'}</strong><small>Employee Face Attendance</small></div></div><div className="face-enrollment-copy"><span className="login-eyebrow">ONE-TIME FACE SETUP</span><h2>Add your face</h2><p>Take three quick live captures. Attendance is accepted only when the current live face matches this employee template.</p></div><CameraStage videoRef={videoRef} state={state} message={message}/><div className="face-enrollment-progress">{[0,1,2].map(i=><span key={i} className={samples.length>i?'done':''}/>)}</div><div className="face-scan-status"><span className={'face-status-icon '+(error?'error':'ready')}><UserCheck size={18}/></span><div><strong>{error?'Face Setup needs attention':'Capture '+Math.min(samples.length+1,3)+' of 3'}</strong><p>{error||message}</p></div></div><div className="face-scan-privacy"><ShieldCheck size={16}/><p>An encrypted mathematical face template is stored for matching. Enrollment selfie images are not kept as attendance photos.</p></div><div className="face-enrollment-actions"><button className="btn secondary" type="button" onClick={onSignOut}><LogOut size={16}/>Sign out</button>{state==='error'?<button className="btn primary" type="button" onClick={restart}><RotateCcw size={16}/>Try again</button>:<button className="btn primary" type="button" disabled={state!=='ready'} onClick={capture}><Camera size={17}/>{samples.length===0?'Capture face':samples.length<2?'Capture next':'Finish setup'}</button>}</div></div></div>;
}
export function FaceScanAttendanceModal({onClose,onComplete}:{onClose:()=>void;onComplete?:(result?:any)=>void|Promise<any>}){
 const{session}=useApp();const videoRef=useRef<HTMLVideoElement>(null),streamRef=useRef<MediaStream|null>(null);
 const[state,setState]=useState('starting'),[message,setMessage]=useState('Opening camera…'),[result,setResult]=useState<any>(null);
 const close=()=>{stopStream(streamRef.current);streamRef.current=null;onClose();};
 const start=async()=>{stopStream(streamRef.current);streamRef.current=null;setResult(null);setState('starting');setMessage('Opening camera…');try{if(!videoRef.current)throw new Error('Camera view is unavailable.');const engine=faceEngine(),camera=startCamera(videoRef.current);const[,stream]=await Promise.all([engine,camera]);streamRef.current=stream;setState('ready');setMessage('Ready — center your face and scan.');}catch(e:any){stopStream(streamRef.current);setState('error');setMessage(e?.message??'Camera could not start.');}};
 useEffect(()=>{start();return()=>stopStream(streamRef.current)},[]);
 const scan=async()=>{if(!videoRef.current||state!=='ready')return;setState('capturing');setMessage('Verifying live face…');try{
  const submit=async()=>{if(!videoRef.current)throw new Error('Camera view is unavailable.');const descriptor=await descriptorFromVideo(videoRef.current),frame=captureFrame(videoRef.current);return api('attendance/face-scan','POST',{frame,descriptor,clientNonce:crypto.randomUUID()},session.csrf)};
  let response:any;
  try{response=await submit()}catch(first:any){
    if(!/did not match|face mismatch/i.test(String(first?.message??'')))throw first;
    setMessage('Rechecking face…');await new Promise(resolve=>window.setTimeout(resolve,160));response=await submit();
  }
  setResult(response);setState('success');setMessage(response.punchType==='IN'?'Checked in — Working':'Checked out');stopStream(streamRef.current);streamRef.current=null;await onComplete?.(response);window.setTimeout(()=>onClose(),450);
 }catch(e:any){setState('error');setMessage(e?.message??'Face did not match. Attendance was not recorded.');}};
 return <Modal title="Face attendance" onClose={close}><div className="face-scan-modal"><CameraStage videoRef={videoRef} state={state} message={message}/><div className="face-scan-status"><span className={'face-status-icon '+state}>{state==='success'?<Check size={18}/>:state==='error'?<RotateCcw size={18}/>:<UserCheck size={18}/>}</span><div><strong>{state==='success'?message:state==='error'?'Attendance not recorded':'Live face verification'}</strong><p>{state==='success'?(result?.punchType==='IN'?'Your working timer has started.':'Your work session is closed.') : message}</p></div></div><div className="face-scan-privacy"><ShieldCheck size={16}/><p>The live camera descriptor is matched against your encrypted enrolled face. A mismatch does not create a punch.</p></div><div className="face-scan-actions">{state==='error'?<button className="btn primary" type="button" onClick={start}><RotateCcw size={16}/>Scan again</button>:state==='success'?<button className="btn primary" type="button" onClick={close}>Done</button>:<button className="btn primary face-scan-button" type="button" disabled={state!=='ready'} onClick={scan}><Camera size={17}/>{state==='capturing'?'Verifying…':'Scan & verify'}</button>}</div></div></Modal>;
}