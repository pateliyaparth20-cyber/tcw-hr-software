import {test,expect} from '@playwright/test';

test('employee face setup fits narrow phones and opens camera only on tap with permission recovery',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.addInitScript(()=>{
  localStorage.setItem('tcw_cookie_consent_v1','essential');
  const w=window as any;w.cameraCalls=0;w.cameraDenied=true;
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{w.cameraCalls++;if(w.cameraDenied)throw new DOMException('Permission denied','NotAllowedError');const canvas=document.createElement('canvas');canvas.width=640;canvas.height=640;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#c8dae5';ctx.fillRect(0,0,640,640);const stream=canvas.captureStream(5);w.cameraTrack=stream.getVideoTracks()[0];w.cameraCanvas=canvas;const timer=setInterval(()=>ctx.fillRect(0,0,640,640),50),stop=w.cameraTrack.stop.bind(w.cameraTrack);w.cameraTrack.stop=()=>{clearInterval(timer);stop()};return stream;}}});
 });
 let faceWrites=0;page.on('request',r=>{if(r.method()==='POST'&&/\/attendance\/face-(profile|scan|challenge)$/.test(new URL(r.url()).pathname))faceWrites++;});
 await page.route('**/api/attendance/face-profile',r=>r.fulfill({json:{enrolled:false,status:'LEGACY',attendanceReady:false}}));
 await page.goto('/login');await page.locator('input[name=companyCode]').fill(process.env.DEMO_COMPANY_CODE!);await page.locator('input[name=username]').fill('phone-employee@example.test');await page.locator('input[name=password]').fill(process.env.E2E_EMPLOYEE_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 const gate=page.locator('.employee-face-onboarding');await expect(gate.getByRole('heading',{name:'Add your face',exact:true})).toBeVisible();await expect(gate.getByText('Your camera is off',{exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).cameraCalls)).toBe(0);await expect(page.locator('.tcw-ios-notice')).not.toBeVisible();
 for(const width of [390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();const card=await gate.locator('.face-enrollment-card').boundingBox();expect(card!.x).toBeGreaterThanOrEqual(0);expect(card!.x+card!.width).toBeLessThanOrEqual(width);await gate.getByRole('button',{name:'Open camera',exact:true}).scrollIntoViewIfNeeded();const button=await gate.getByRole('button',{name:'Open camera',exact:true}).boundingBox();expect(button!.x+button!.width).toBeLessThanOrEqual(width);await page.screenshot({path:`test-results/people-face-idle-${width}.png`,fullPage:true,animations:'disabled'});}
 await gate.getByRole('button',{name:'Open camera',exact:true}).click();await expect(gate.getByRole('alert')).toContainText('Camera access is blocked');expect(await page.evaluate(()=>(window as any).cameraCalls)).toBe(1);await expect(gate.getByRole('heading',{name:'Allow camera access'})).toBeVisible();await expect(gate).not.toContainText('The request is not allowed by the user agent');expect(faceWrites).toBe(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:'test-results/people-face-permission-mobile.png',fullPage:true,animations:'disabled'});
 await page.evaluate(()=>{(window as any).cameraDenied=false});await gate.getByRole('button',{name:'Open camera',exact:true}).click();expect(await page.evaluate(()=>(window as any).cameraCalls)).toBe(2);await expect(gate.locator('.face-camera')).toHaveClass(/ (ready|preview)$/);if(await gate.getByRole('button',{name:'Start preview',exact:true}).count())await gate.getByRole('button',{name:'Start preview',exact:true}).click();await expect(gate.getByRole('button',{name:'Scanning automatically…',exact:true})).toBeDisabled();await expect(gate.getByRole('alert')).toHaveCount(0);await expect(gate.locator('video')).toHaveAttribute('playsinline','');await expect.poll(()=>page.evaluate(()=>document.querySelector('video')!.videoWidth)).toBeGreaterThan(0);expect(faceWrites).toBe(0);await page.screenshot({path:'test-results/people-face-ready-mobile.png',fullPage:true,animations:'disabled'});
 await gate.getByRole('button',{name:'Sign out',exact:true}).click();await expect(gate).toHaveCount(0);expect(await page.evaluate(()=>(window as any).cameraTrack.readyState)).toBe('ended');
});

test('face frames capture automatically after stable straight, turn and return poses',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.addInitScript(()=>{
  const w=window as any;w.scanCalls=0;
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=640;const context=canvas.getContext('2d')!;let counter=0;
   const draw=()=>{context.fillStyle='#d8dde5';context.fillRect(0,0,640,640);context.fillStyle='#436483';context.fillRect((counter++*13)%400,180,160,200)};draw();
   const stream=canvas.captureStream(10),timer=setInterval(draw,100),track=stream.getVideoTracks()[0],stop=track.stop.bind(track);track.stop=()=>{clearInterval(timer);stop()};w.cameraTrack=track;return stream;
  }}});
  w.faceapi={tf:{ready:async()=>{}},nets:{tinyFaceDetector:{loadFromUri:async()=>{}},faceLandmark68TinyNet:{loadFromUri:async()=>{}}},fetchImage:async()=>({width:420,height:420}),TinyFaceDetectorOptions:class{},detectAllFaces:()=>({withFaceLandmarks:async()=>{
   const stage=document.querySelectorAll('.face-enrollment-progress .done').length,yaw=stage===1?.23:0,positions=Array.from({length:68},()=>({x:150,y:180}));for(let i=36;i<42;i++)positions[i].x=100;for(let i=42;i<48;i++)positions[i].x=200;positions[30].x=150+yaw*100;
   return [{detection:{score:.99,box:{width:300,height:300}},landmarks:{positions}}];
  }})};
 });
 let writes=0;
 await page.route('**/api/attendance/face-challenge',route=>route.fulfill({json:{challengeId:'6b41514e-5c8d-4d60-9e4a-1dbb1d00eebc',turn:'LEFT',expiresAt:new Date(Date.now()+120000).toISOString()}}));
 await page.route('**/api/attendance/face-profile',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{enrolled:false,status:'NOT_ENROLLED'}});
  writes++;const payload=route.request().postDataJSON();expect(payload.frames).toHaveLength(3);expect(new Set(payload.frames).size).toBe(3);await route.fulfill({json:{enrolled:true,status:'PENDING'}});
 });
 await page.goto('/login');await page.locator('input[name=companyCode]').fill(process.env.DEMO_COMPANY_CODE!);await page.locator('input[name=username]').fill('phone-employee@example.test');await page.locator('input[name=password]').fill(process.env.E2E_EMPLOYEE_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 const gate=page.locator('.employee-face-onboarding');await gate.getByRole('button',{name:'Open camera',exact:true}).click();
 await expect(gate.getByRole('button',{name:'Scanning automatically…'})).toBeDisabled();await expect.poll(()=>writes,{timeout:15000}).toBe(1);await expect(gate).toHaveCount(0);expect(await page.evaluate(()=>(window as any).cameraTrack.readyState)).toBe('ended');expect(writes).toBe(1);
});

test('field check IN requires location before camera and mobile and desktop navigation differ',async({page})=>{
 await page.addInitScript(()=>{
  const w=window as any;w.cameraCalls=0;
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(_:any,reject:any)=>reject({code:1})}});
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{w.cameraCalls++;throw new Error('Camera must not open without GPS')}}});
 });
 await page.route('**/api/attendance/face-profile',route=>route.fulfill({json:{enrolled:true,status:'APPROVED',attendanceReady:true}}));
 await page.route('**/api/field-work/session',route=>route.fulfill({json:{eligible:true,session:null,policy:{enabled:true,maxAccuracyMeters:100,intervalSeconds:30}}}));
 let faceWrites=0;page.on('request',request=>{if(request.method()==='POST'&&/\/attendance\/face-(scan|challenge)$/.test(new URL(request.url()).pathname))faceWrites++;});
 await page.goto('/login');await page.locator('input[name=companyCode]').fill(process.env.DEMO_COMPANY_CODE!);await page.locator('input[name=username]').fill('phone-employee@example.test');await page.locator('input[name=password]').fill(process.env.E2E_EMPLOYEE_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.locator('.employee-home-dashboard')).toBeVisible();
 for(const width of [1440,1024,768,390,320]){
  await page.setViewportSize({width,height:900});
  if(width>768){await expect(page.locator('.employee-desktop-sidebar')).toBeVisible();await expect(page.locator('.employee-app-bottom-nav')).toBeHidden();}else{await expect(page.locator('.employee-desktop-sidebar')).toBeHidden();await expect(page.locator('.employee-app-bottom-nav')).toBeVisible();}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:`test-results/people-employee-layout-${width}.png`,fullPage:true,animations:'disabled'});
 }
 await page.locator('.employee-home-face-button').click();const modal=page.getByRole('dialog');await expect(modal.getByRole('button',{name:'Open camera'})).toBeDisabled();await modal.getByRole('checkbox').check();await modal.getByRole('button',{name:'Open camera'}).click();await expect(modal.getByRole('alert')).toContainText('Location permission is denied');expect(await page.evaluate(()=>(window as any).cameraCalls)).toBe(0);expect(faceWrites).toBe(0);await modal.getByRole('button',{name:'Cancel',exact:true}).click();
});
