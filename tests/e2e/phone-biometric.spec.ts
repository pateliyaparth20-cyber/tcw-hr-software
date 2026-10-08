import {test,expect} from '@playwright/test';
import {createHash,generateKeyPairSync} from 'node:crypto';
const publicKey=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({type:'spki',format:'der'}).toString('base64'),keyHash=createHash('sha256').update(Buffer.from(publicKey,'base64')).digest('hex');
const deviceId='448f727b-ab6e-402f-9597-e6aaf86beaa1',accountKey='ab20cdd1-b4ed-449a-bcd6-4a60e31a634a:80a9db41-5611-47f1-bce6-f67f7f4c45cb';
test.use({serviceWorkers:'block'});
test.beforeEach(async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.addInitScript(({publicKey})=>{localStorage.setItem('tcw_cookie_consent_v1','essential');const w=window as any;w.signCalls=0;w.cameraCalls=0;w.nativeDenied=false;w.gpsDenied=false;w.deviceHasKey=true;w.cancelCalls=0;
  w.TCWBiometric={postMessage:(raw:string)=>{const request=JSON.parse(raw);if(request.action==='cancel'){w.cancelCalls++;return;}if(request.action==='sign')w.signCalls++;const result=request.action==='status'?{supported:true}:request.action==='key'?{publicKey:w.deviceHasKey?publicKey:null}:{publicKey,signature:'A'.repeat(96)};setTimeout(()=>w.TCWBiometric.onmessage({data:JSON.stringify(request.action==='sign'&&w.nativeDenied?{id:request.id,error:'Phone verification cancelled.'}:{id:request.id,result})}),25)}};
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{w.cameraCalls++;throw new Error('Camera must not open during phone biometrics')}}});
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(resolve:any,reject:any)=>w.gpsDenied?reject({code:1}):resolve({coords:{latitude:23,longitude:72,accuracy:10},timestamp:Date.now()})}});
 },{publicKey});
 await page.route('**/api/attendance/face-profile',route=>route.fulfill({json:{enrolled:true,status:'APPROVED',attendanceReady:true}}));
 await page.route('**/api/field-work/session',route=>route.fulfill({json:{eligible:true,session:null,policy:{enabled:true,maxAccuracyMeters:100}}}));
 await page.route('**/api/attendance/biometric-device',route=>route.fulfill({json:{accountKey,items:[{id:deviceId,keyHash,label:'Own phone',status:'APPROVED'}]}}));
 await page.route('**/api/attendance/biometric-challenge',route=>{const body=route.request().postDataJSON();expect(body.purpose).toBe('PUNCH');expect(body.deviceId).toBe(deviceId);return route.fulfill({json:{challengeId:'56ba1f88-2820-4a15-8b0a-aa8791e47f74',payload:'TCW_PHONE_V1|fixture',accountKey}})});
});
async function open(page:any){await page.goto('/login');await page.locator('input[name=companyCode]').fill(process.env.DEMO_COMPANY_CODE!);await page.locator('input[name=username]').fill('phone-employee@example.test');await page.locator('input[name=password]').fill(process.env.E2E_EMPLOYEE_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('.employee-home-dashboard')).toBeVisible();await page.locator('.employee-home-face-button').click();await expect(page.getByRole('heading',{name:'Phone biometric verification'})).toBeVisible();return page.getByRole('dialog');}

test('approved phone uses one system biometric request, preserves GPS consent, and never opens camera',async({page})=>{
 let punches=0;await page.route('**/api/attendance/biometric-scan',route=>{const body=route.request().postDataJSON();expect(body.intent).toBe('IN');expect(body.locationConsent).toBe(true);expect(body.point.accuracy).toBe(10);expect(body.frames).toBeUndefined();punches++;return route.fulfill({json:{ok:true,punchType:'IN'}})});
 const modal=await open(page);await expect(modal.getByRole('button',{name:'Verify with phone',exact:true})).toBeDisabled();await modal.getByRole('checkbox').check();
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:`test-results/people-phone-biometric-${width}.png`,fullPage:true,animations:'disabled'});}
 await modal.getByRole('button',{name:'Verify with phone',exact:true}).click();await expect.poll(()=>punches).toBe(1);await expect(modal).toHaveCount(0);expect(await page.evaluate(()=>(window as any).signCalls)).toBe(1);expect(await page.evaluate(()=>(window as any).cameraCalls)).toBe(0);
});

test('GPS denial and cancelled phone authentication cannot submit attendance',async({page})=>{
 let punches=0;await page.route('**/api/attendance/biometric-scan',route=>{punches++;return route.fulfill({json:{ok:true,punchType:'IN'}})});
 const modal=await open(page);await modal.getByRole('checkbox').check();await page.evaluate(()=>{(window as any).gpsDenied=true});await modal.getByRole('button',{name:'Verify with phone',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Location permission is denied');expect(await page.evaluate(()=>(window as any).signCalls)).toBe(0);expect(punches).toBe(0);
 await page.evaluate(()=>{(window as any).gpsDenied=false;(window as any).nativeDenied=true});await modal.getByRole('button',{name:'Verify with phone',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Phone verification cancelled');expect(punches).toBe(0);await modal.getByRole('button',{name:'Cancel',exact:true}).click();expect(await page.evaluate(()=>(window as any).cancelCalls)).toBeGreaterThan(0);
});

test('new phone links for HR approval without creating attendance',async({page})=>{
 await page.route('**/api/attendance/biometric-challenge',route=>{expect(route.request().postDataJSON().purpose).toBe('REGISTER');return route.fulfill({json:{challengeId:'56ba1f88-2820-4a15-8b0a-aa8791e47f74',payload:'TCW_PHONE_V1|fixture',accountKey}})});
 let registrations=0,punches=0;await page.route('**/api/attendance/biometric-device',route=>{if(route.request().method()==='POST'){registrations++;expect(route.request().postDataJSON().publicKey).toBe(publicKey);return route.fulfill({json:{id:deviceId,status:'PENDING'}})}return route.fulfill({json:{accountKey,items:[]}})});await page.route('**/api/attendance/biometric-scan',route=>{punches++;return route.fulfill({json:{ok:true}})});
 const modal=await open(page);await page.evaluate(()=>{(window as any).deviceHasKey=false});await modal.getByRole('checkbox').check();await modal.getByRole('button',{name:'Verify with phone',exact:true}).click();await expect(modal.getByRole('status')).toContainText('Phone linked. Ask HR to approve it');expect(registrations).toBe(1);expect(punches).toBe(0);expect(await page.evaluate(()=>(window as any).signCalls)).toBe(1);
});
