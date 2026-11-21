import test from 'node:test';
import assert from 'node:assert/strict';
import {responseErrorMessage} from '../../packages/ui/api-error';
test('preserves distinct API credential, company, user and lockout messages',async()=>{
 for(const [status,message] of [[401,'Incorrect password.'],[401,'Company Code not found.'],[401,'User ID not found in this company.'],[429,'Too many attempts. Try again in 15 minutes.'],[403,'This company is suspended.']] as const){assert.equal(await responseErrorMessage(Response.json({message},{status}),'auth/login'),message);}
});
test('plain-text provider rate limits are never mislabeled as wrong passwords',async()=>{
 const message=await responseErrorMessage(new Response('Too Many Requests',{status:429}),'auth/login');assert.match(message,/Too many requests/);assert.doesNotMatch(message,/Incorrect password|The request failed/);
});
test('HTML security challenge is identified without displaying provider HTML',async()=>{
 const message=await responseErrorMessage(new Response('<script>private provider content</script>',{status:403,headers:{'cf-mitigated':'challenge'}}),'auth/login');assert.match(message,/Hosting security verification/);assert.doesNotMatch(message,/script|private/);
});
test('timeouts, unavailable service and server failures have separate fallbacks',async()=>{
 for(const [status,pattern] of [[504,/too long/],[503,/temporarily unavailable/],[500,/server error/],[404,/could not be found/],[401,/could not be verified/]] as const)assert.match(await responseErrorMessage(new Response('upstream',{status}),'auth/login'),pattern);
});
test('malformed and missing messages cannot become an object or HTML in the UI',async()=>{
 for(const message of [null,{},false,[],42])assert.match(await responseErrorMessage(Response.json({message},{status:400}),'auth/login'),/check the entered details/);
 assert.equal(await responseErrorMessage(Response.json({message:['Company Code is required.','User ID is required.']},{status:400}),'auth/login'),'Company Code is required. User ID is required.');
});
