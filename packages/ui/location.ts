export type GPSPoint={latitude:number;longitude:number;accuracy:number;capturedAt:string};
export function freshLocation():Promise<GPSPoint>{return new Promise((resolve,reject)=>{
 if(!navigator.geolocation){reject(new Error('GPS is not available on this device.'));return;}
 navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,capturedAt:new Date(p.timestamp).toISOString()}),e=>reject(new Error(e.code===1?'Location permission is denied. Enable precise location in your browser and phone settings before checking IN.':e.code===3?'GPS timed out. Keep location on, move outside and retry.':'GPS is unavailable. Turn location on and retry.')),{enableHighAccuracy:true,maximumAge:0,timeout:15000});
});}
