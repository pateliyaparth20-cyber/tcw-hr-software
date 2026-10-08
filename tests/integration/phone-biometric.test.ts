import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {embeddedDatabase} from '../helpers/database';
import {roleDefinitions} from '../../packages/permissions';
import {digest} from '../../packages/auth';
import {createBiometricChallenge,phoneBiometricStatus,registerBiometricDevice,reviewBiometricDevices,verifyBiometricPunch} from '../../apps/api/src/phone-biometric';
import {Workflows} from '../../apps/api/src/workflows';
import {faceProfileStatus} from '../../apps/api/src/face-profile';

test('phone biometrics bind signed one-use challenges to employee, session, intent and HR-approved device; field GPS remains required',async()=>{
 const fixture=await embeddedDatabase(),db=fixture.db;
 try{
  const empRole=await db.role.create({data:roleDefinitions.find(r=>r.code==='EMPLOYEE')!}),hrRole=await db.role.create({data:roleDefinitions.find(r=>r.code==='HR_ADMIN')!});
  const tenant=await db.tenant.create({data:{name:'Biometric test',code:'BIO-TEST'}});
  const employee=async(code:string)=>db.employee.create({data:{tenantId:tenant.id,employeeCode:code,email:code+'@example.test',firstName:code,lastName:'Fixture',joiningDate:new Date('2020-01-01')}});
  const own=await employee('OWN'),peer=await employee('PEER');
  await db.shift.create({data:{tenantId:tenant.id,name:'Day',startMinute:540,endMinute:1080,timezone:'Asia/Kolkata'}});
  const context=async(role:any,eid?:string)=>{const user=await db.user.create({data:{tenantId:tenant.id,roleId:role.id,name:'Fixture',email:randomUUID()+'@example.test',passwordHash:'synthetic',employeeId:eid}}),session=await db.session.create({data:{tenantId:tenant.id,userId:user.id,tokenHash:digest(randomUUID()),csrf:'synthetic',expiresAt:new Date(Date.now()+3600000),userAgent:'fixture',ip:'127.0.0.1'}});return {tenantId:tenant.id,user:{...user,role},session,ip:'127.0.0.1'};};
  const self=await context(empRole,own.id),other=await context(empRole,peer.id),hr=await context(hrRole),workflow=new Workflows(db);
  // Phone enrollment and HR-approved attendance work without a camera face profile.
  assert.equal(await db.employeeFaceProfile.count(),0);
  const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),publicKey=keys.publicKey.export({format:'der',type:'spki'}).toString('base64');
  const signed=(c:any)=>({challengeId:c.challengeId,signature:sign('sha256',Buffer.from(c.payload),keys.privateKey).toString('base64')});
  const register=await createBiometricChallenge(db,self,{purpose:'REGISTER',intent:'IN'});
  await assert.rejects(registerBiometricDevice(db,other,{...signed(register),publicKey,label:'Phone A',intent:'IN'}),/expired/);
  const device=await registerBiometricDevice(db,self,{...signed(register),publicKey,label:'Phone A',intent:'IN'});assert.equal(device.status,'PENDING');assert.equal((await faceProfileStatus(db,self)).phoneLinked,true);assert.equal((await faceProfileStatus(db,self)).phoneAttendanceReady,false);
  await assert.rejects(registerBiometricDevice(db,self,{...signed(register),publicKey,label:'Phone A',intent:'IN'}),/already used/);
  await assert.rejects(createBiometricChallenge(db,self,{purpose:'PUNCH',intent:'IN',deviceId:device.id}),/HR approval/);
  let row=await db.employeeBiometricDevice.findUniqueOrThrow({where:{id:device.id}});
  await assert.rejects(reviewBiometricDevices(db,self,'POST',{deviceId:row.id,decision:'APPROVE',expectedUpdatedAt:row.updatedAt.toISOString(),identityConfirmed:true}),/permission/);
  await reviewBiometricDevices(db,hr,'POST',{deviceId:row.id,decision:'APPROVE',expectedUpdatedAt:row.updatedAt.toISOString(),identityConfirmed:true});
  assert.equal((await phoneBiometricStatus(db,self)).items[0].status,'APPROVED');assert.equal((await faceProfileStatus(db,self)).phoneAttendanceReady,true);assert.equal((await faceProfileStatus(db,self)).attendanceReady,false);assert.equal((await phoneBiometricStatus(db,other)).items.length,0);
  // Tests need several independent challenges; clear the completed attempt window between groups.
  await db.biometricChallenge.deleteMany();
  const first=await createBiometricChallenge(db,self,{purpose:'PUNCH',intent:'IN',deviceId:device.id});
  await assert.rejects(verifyBiometricPunch(db,{...self,session:{...self.session,id:randomUUID()}},signed(first),'IN'),/Sign in/);
  await assert.rejects(verifyBiometricPunch(db,self,signed(first),'OUT'),/expired/);
  const proof=await verifyBiometricPunch(db,self,signed(first),'IN');assert.equal(proof.deviceId,device.id);
  await assert.rejects(verifyBiometricPunch(db,self,signed(first),'IN'),/already used/);
  const bad=await createBiometricChallenge(db,self,{purpose:'PUNCH',intent:'IN',deviceId:device.id});
  await assert.rejects(verifyBiometricPunch(db,self,{...signed(bad),signature:sign('sha256',Buffer.from('wrong payload'),keys.privateKey).toString('base64')},'IN'),/signature/);
  await assert.rejects(verifyBiometricPunch(db,self,signed(bad),'IN'),/already used/);
  const expired=await createBiometricChallenge(db,self,{purpose:'PUNCH',intent:'IN',deviceId:device.id});await db.biometricChallenge.update({where:{id:expired.challengeId},data:{expiresAt:new Date(Date.now()-1)}});await assert.rejects(verifyBiometricPunch(db,self,signed(expired),'IN'),/expired/);
  await db.biometricChallenge.deleteMany();
  const challenge=await createBiometricChallenge(db,self,{purpose:'PUNCH',intent:'IN',deviceId:device.id});
  await db.fieldWorkPolicy.create({data:{tenantId:tenant.id,enabled:true,employeeIds:[own.id],maxAccuracyMeters:100}});
  const body={...signed(challenge),clientNonce:randomUUID(),intent:'IN'};
  await assert.rejects(workflow.attendance(self,'POST',body,{},'biometric-scan'),/precise location/);assert.equal(await db.attendancePunch.count({where:{verificationType:'PHONE_BIOMETRIC'}}),0);
  const result:any=await workflow.attendance(self,'POST',{...body,point:{latitude:23,longitude:72,accuracy:10,capturedAt:new Date().toISOString()},locationConsent:true},{},'biometric-scan');assert.equal(result.punchType,'IN');
  assert.equal(await db.fieldWorkSession.count({where:{employeeId:own.id,endedAt:null}}),1);const punch=await db.attendancePunch.findFirstOrThrow({where:{verificationType:'PHONE_BIOMETRIC'}});assert.equal((punch.rawPayload as any).deviceId,device.id);assert.equal((punch.rawPayload as any).faceMatched,undefined);
  const revoked=await createBiometricChallenge(db,self,{purpose:'PUNCH',intent:'OUT',deviceId:device.id});row=await db.employeeBiometricDevice.findUniqueOrThrow({where:{id:device.id}});await reviewBiometricDevices(db,hr,'POST',{deviceId:row.id,decision:'REVOKE',expectedUpdatedAt:row.updatedAt.toISOString(),identityConfirmed:true});await assert.rejects(verifyBiometricPunch(db,self,signed(revoked),'OUT'),/removed/);
  assert.equal(await db.attendancePunch.count({where:{verificationType:'PHONE_BIOMETRIC'}}),1);
 }finally{await fixture.close();}
});
