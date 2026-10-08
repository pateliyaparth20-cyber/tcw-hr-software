// Local landmarks guide capture only. The server independently verifies identity and movement.
let engine:Promise<any>|undefined;
export function loadFaceGuide(){
 if(!engine)engine=(async()=>{
  let face=(window as any).faceapi;
  if(!face){await new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src='/face-guide-v1/face-api.js';script.onload=()=>resolve();script.onerror=()=>{script.remove();reject(new Error('Face guide could not load. Check your connection and reopen the camera.'))};document.head.appendChild(script)});face=(window as any).faceapi;}
  await face.tf.ready();await Promise.all([face.nets.tinyFaceDetector.loadFromUri('/face-guide-v1'),face.nets.faceLandmark68TinyNet.loadFromUri('/face-guide-v1')]);return face;
 })().catch(e=>{engine=undefined;throw e});return engine;
}
export async function guideFace(frame:string){
 const api=await loadFaceGuide(),image=await api.fetchImage(frame),faces=await api.detectAllFaces(image,new api.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:.55})).withFaceLandmarks(true);
 if(faces.length!==1)return {yaw:null,message:faces.length?'Only one person should be in view.':'Keep your face inside the guide in good light.'};
 const face=faces[0],box=face.detection.box;if(face.detection.score<.65||box.width*box.height/(image.width*image.height)<.06)return {yaw:null,message:'Move closer and keep your face clearly visible.'};
 const pts=face.landmarks.positions,left=pts.slice(36,42).reduce((n:number,p:any)=>n+p.x,0)/6,right=pts.slice(42,48).reduce((n:number,p:any)=>n+p.x,0)/6;
 return right-left<12?{yaw:null,message:'Keep your face clearly visible.'}:{yaw:(pts[30].x-(left+right)/2)/(right-left),message:''};
}
