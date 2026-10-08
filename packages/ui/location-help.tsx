'use client';
import React from 'react';
import {Settings2} from 'lucide-react';
export function LocationHelp(){
 const bridge=typeof window==='undefined'?null:(window as any).TCWNative;
 const native=!!bridge,canOpen=typeof bridge?.openLocationSettings==='function';
 return <aside className="face-camera-help location-access-help"><h3>Allow precise location</h3><p>Location permission is requested when you start field work or Check IN. If you previously allowed or blocked it, your phone may not show another popup.</p><ol><li>Turn your phone’s Location / GPS on.</li><li>{native?'Open Android App info → Permissions → Location. Select Allow only while using the app and turn Use precise location on.':'Allow Location for this website in your browser’s site settings, and allow precise location for the browser in your phone settings.'}</li><li>{native&&!canOpen?'If Location is missing from App info, install the latest TCW Employee APK. Updating the website does not update Android app permissions.':'Return to TCW and retry Check IN. Camera access starts only after precise GPS is available.'}</li></ol>{canOpen&&<button type="button" className="btn secondary" onClick={()=>bridge.openLocationSettings()}><Settings2 size={16}/>Open location settings</button>}</aside>;
}
