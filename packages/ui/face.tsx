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
type FaceObservation={descriptor:number[];yaw:number};
function averagePoint(points:any[]){return {x:points.reduce((sum,p)=>sum+Number(p.x),0)/points.length,y:points.reduce((sum,p)=>sum+Number(p.y),0)/points.length};}
async function observeFace(video:HTMLVideoElement):Promise<FaceObservation>{
  const faceapi=await faceEngine();
  const options=new faceapi.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:0.62});
  const faces=await faceapi.detectAllFaces(video,options).withFaceLandmarks(true).withFaceDescriptors();
  if(faces.length===0)throw new Error('No face detected. Keep your face clearly inside the guide.');
  if(faces.length>1)throw new Error('More than one face detected. Only the employee should be in the camera.');
  const face=faces[0],box=face.detection.box;
  const area=(box.width*box.height)/Math.max(1,video.videoWidth*video.videoHeight);
  if(face.detection.score<0.70||area<0.08)throw new Error('Face is not clear enough. Move a little closer and use normal light.');
  const cx=(box.x+box.width/2)/video.videoWidth,cy=(box.y+box.height/2)/video.videoHeight;
  if(Math.abs(cx-.5)>.28||Math.abs(cy-.5)>.28)throw new Error('Center your face inside the guide and try again.');
  const positions=face.landmarks?.positions??[];
  if(positions.length<68)throw new Error('Face landmarks could not be verified. Keep your full face visible.');
  const leftEye=averagePoint(positions.slice(36,42)),rightEye=averagePoint(positions.slice(42,48)),nose=positions[30];
  const eyeDistance=Math.max(1,Math.abs(rightEye.x-leftEye.x));
  const yaw=(Number(nose.x)-(leftEye.x+rightEye.x)/2)/eyeDistance;
  return {descriptor:Array.from(face.descriptor as Float32Array).map(v=>Number(v.toFixed(8))),yaw:Number(yaw.toFixed(4))};
}
const delay=(ms:number)=>new Promise(resolve=>window.setTimeout(resolve,ms));
async function waitForLivePose(video:HTMLVideoElement,predicate:(face:FaceObservation)=>boolean,message:(value:string)=>void,label:string,timeoutMs=5500){
  const started=Date.now();let lastError=label;
  while(Date.now()-started<timeoutMs){
    try{
      const face=await observeFace(video);
      if(predicate(face))return {...face,frame:captureFrame(video)};
      lastError=label;
    }catch(e:any){lastError=String(e?.message??label)}
    message(lastError);await delay(170);
  }
  throw new Error(lastError);
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
  const prompts=['Look straight at the camera.','Turn your head clearly to either side.','Look straight at the camera again.'];
  const start=async()=>{stopStream(streamRef.current);streamRef.current=null;setError('');setState('starting');setMessage('Opening camera…');try{if(!videoRef.current)throw new Error('Camera view is unavailable.');const engine=faceEngine(),camera=startCamera(videoRef.current);const[,stream]=await Promise.all([engine,camera]);streamRef.current=stream;setState('ready');setMessage(prompts[samples.length]??prompts[0]);}catch(e:any){stopStream(streamRef.current);setState('error');setError(e?.message??'Face Setup could not start.');}};
  useEffect(()=>{start();return()=>stopStream(streamRef.current)},[]);
  const capture=async()=>{if(!videoRef.current||state!=='ready')return;setState('capturing');setError('');try{
    const face=await observeFace(videoRef.current);
    if(samples.length===0&&Math.abs(face.yaw)>.14)throw new Error('Look straight at the camera for the first capture.');
    if(samples.length===1&&Math.abs(face.yaw)<.18)throw new Error('Turn your head clearly to either side before the second capture.');
    if(samples.length===2&&Math.abs(face.yaw)>.14)throw new Error('Return to a straight, centered face for the final capture.');
    const next=[...samples,face.descriptor];setSamples(next);
    if(next.length<3){setState('ready');setMessage(prompts[next.length]);return;}
    setState('saving');setMessage('Securing your face template…');
    await api('attendance/face-profile','POST',{samples:next,engine:'face-api-1.7.15-v3'},session.csrf);
    try{localStorage.setItem('tcw_face_enrolled:'+String(session.user.employeeId??session.user.id),'1')}catch{}
    stopStream(streamRef.current);streamRef.current=null;setState('success');setMessage('Face Setup complete');await delay(300);await onComplete();
  }catch(e:any){setState('ready');setError(e?.message??'Face capture failed. Please try again.');}};
  const restart=()=>{setSamples([]);setMessage(prompts[0]);start();};
  return <div className="mandatory-overlay employee-face-onboarding"><div className="mandatory-card face-enrollment-card"><div className="face-enrollment-brand"><CompanyMark src={logo??session.company?.logo} name={companyName??session.company?.name}/><div><strong>{companyName??session.company?.name??'TCW Employee'}</strong><small>Employee Face Attendance</small></div></div><div className="face-enrollment-copy"><span className="login-eyebrow">ONE-TIME FACE SETUP</span><h2>Add your face</h2><p>Take three quick live captures. Attendance is accepted only when the current live face matches this employee template.</p></div><CameraStage videoRef={videoRef} state={state} message={message}/><div className="face-enrollment-progress">{[0,1,2].map(i=><span key={i} className={samples.length>i?'done':''}/>)}</div><div className="face-scan-status"><span className={'face-status-icon '+(error?'error':'ready')}><UserCheck size={18}/></span><div><strong>{error?'Face Setup needs attention':'Capture '+Math.min(samples.length+1,3)+' of 3'}</strong><p>{error||message}</p></div></div><div className="face-scan-privacy"><ShieldCheck size={16}/><p>An encrypted mathematical face template is stored for matching. Enrollment selfie images are not kept as attendance photos.</p></div><div className="face-enrollment-actions"><button className="btn secondary" type="button" onClick={onSignOut}><LogOut size={16}/>Sign out</button>{state==='error'?<button className="btn primary" type="button" onClick={restart}><RotateCcw size={16}/>Try again</button>:<button className="btn primary" type="button" disabled={state!=='ready'} onClick={capture}><Camera size={17}/>{samples.length===0?'Capture face':samples.length<2?'Capture next':'Finish setup'}</button>}</div></div></div>;
}
export function FaceScanAttendanceModal({onClose,onComplete}:{onClose:()=>void;onComplete?:(result?:any)=>void|Promise<any>}){
 const{session}=useApp();const videoRef=useRef<HTMLVideoElement>(null),streamRef=useRef<MediaStream|null>(null),autoTimerRef=useRef<number|null>(null),scanBusyRef=useRef(false);
 const[state,setState]=useState('starting'),[message,setMessage]=useState('Opening camera…'),[result,setResult]=useState<any>(null);
 const clearAuto=()=>{if(autoTimerRef.current!==null){window.clearTimeout(autoTimerRef.current);autoTimerRef.current=null}};
 const close=()=>{clearAuto();stopStream(streamRef.current);streamRef.current=null;onClose();};
 const start=async()=>{clearAuto();scanBusyRef.current=false;stopStream(streamRef.current);streamRef.current=null;setResult(null);setState('starting');setMessage('Opening camera…');try{if(!videoRef.current)throw new Error('Camera view is unavailable.');const engine=faceEngine(),camera=startCamera(videoRef.current);const[,stream]=await Promise.all([engine,camera]);streamRef.current=stream;setState('ready');setMessage('Hold still — scanning automatically…');}catch(e:any){stopStream(streamRef.current);setState('error');setMessage(e?.message??'Camera could not start.');}};
 const scan=async(auto=false)=>{if(!videoRef.current||state!=='ready'||scanBusyRef.current)return;scanBusyRef.current=true;clearAuto();setState('capturing');setMessage('Look straight at the camera…');try{
  const video=videoRef.current,started=Date.now();
  const first=await waitForLivePose(video,face=>Math.abs(face.yaw)<=.14,setMessage,'Look straight at the camera.');
  setMessage('Now turn your head clearly to either side…');
  const turned=await waitForLivePose(video,face=>Math.abs(face.yaw-first.yaw)>=.18,setMessage,'Turn your head clearly to either side.');
  setMessage('Return to the center and look straight again…');
  const returned=await waitForLivePose(video,face=>Math.abs(face.yaw-first.yaw)<=.12&&Math.abs(face.yaw)<=.16,setMessage,'Return your face to the center.');
  const response=await api('attendance/face-scan','POST',{
    frames:[first.frame,turned.frame,returned.frame],
    descriptors:[first.descriptor,turned.descriptor,returned.descriptor],
    liveness:{challenge:'TURN_AND_RETURN',durationMs:Date.now()-started,turnOffset:Number(Math.abs(turned.yaw-first.yaw).toFixed(4)),returnOffset:Number(Math.abs(returned.yaw-first.yaw).toFixed(4))},
    clientNonce:crypto.randomUUID()
  },session.csrf);
  setResult(response);setState('success');setMessage(response.punchType==='IN'?'Checked in — Working':'Checked out');stopStream(streamRef.current);streamRef.current=null;await onComplete?.(response);window.setTimeout(()=>onClose(),450);
 }catch(e:any){
  const detail=String(e?.message??'Face did not match. Attendance was not recorded.');
  const retryable=/no face detected|more than one face|not clear enough|center your face|too dark|camera is not ready/i.test(detail);
  if(auto&&retryable){setState('ready');setMessage(detail.replace(/\.$/,'')+' — retrying automatically…');}
  else{setState('error');setMessage(detail)}
 }finally{scanBusyRef.current=false}};
 useEffect(()=>{start();return()=>{clearAuto();stopStream(streamRef.current)}},[]);
 useEffect(()=>{if(state!=='ready')return;clearAuto();autoTimerRef.current=window.setTimeout(()=>void scan(true),550);return clearAuto},[state,message]);
 return <Modal title="Face attendance" onClose={close}><div className="face-scan-modal"><CameraStage videoRef={videoRef} state={state} message={message}/><div className="face-scan-status"><span className={'face-status-icon '+state}>{state==='success'?<Check size={18}/>:state==='error'?<RotateCcw size={18}/>:<UserCheck size={18}/>}</span><div><strong>{state==='success'?message:state==='error'?'Attendance not recorded':'Automatic face verification'}</strong><p>{state==='success'?(result?.punchType==='IN'?'Your working timer has started.':'Your work session is closed.') : message}</p></div></div><div className="face-scan-privacy"><ShieldCheck size={16}/><p>Three live camera moments are checked against your encrypted face template. Look straight, turn your head, then return to center; a mismatch creates no punch.</p></div><div className="face-scan-actions">{state==='error'?<button className="btn primary" type="button" onClick={start}><RotateCcw size={16}/>Try again</button>:state==='success'?<button className="btn primary" type="button" onClick={close}>Done</button>:<button className="btn primary face-scan-button" type="button" disabled><Camera size={17}/>{state==='capturing'?'Verifying…':'Scanning automatically…'}</button>}</div></div></Modal>;
}