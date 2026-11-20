import test from 'node:test';
import assert from 'node:assert/strict';
import {startEmailOutbox} from '../../apps/api/src/email-outbox';
import {buildEmailHtml,redactDeliveredCredential,sendEmail} from '../../packages/email';

test('email templates escape user content and remove delivered credentials',()=>{
  assert.match(buildEmailHtml({subject:'<unsafe>',text:'<script>alert(1)</script>'}),/&lt;script&gt;/);
  const redacted=redactDeliveredCredential({tempPassword:'private-test-value',text:'Password private-test-value'});
  assert.equal(redacted.tempPassword,'[delivered]');assert.equal(redacted.text,'Password [delivered]');
  const reset=redactDeliveredCredential({resetUrl:'https://example.test/reset?token=secret',text:'Open https://example.test/reset?token=secret'});
  assert.equal(reset.resetUrl,'[delivered]');assert.equal(reset.text,'Open [delivered]');
});

test('Resend requests reuse an outbox idempotency key and reject delivery failures',async()=>{
  const previousKey=process.env.RESEND_API_KEY,previousFetch=globalThis.fetch;
  process.env.RESEND_API_KEY='test-placeholder';
  try{
    let key='';
    globalThis.fetch=async(_input,init)=>{key=new Headers(init?.headers).get('Idempotency-Key')??'';return new Response('{"id":"test"}',{status:200});};
    await sendEmail({to:'recipient@example.test',subject:'Synthetic test',text:'Synthetic only'},'tcw-outbox/test-id');
    assert.equal(key,'tcw-outbox/test-id');
    globalThis.fetch=async()=>new Response('Unavailable',{status:503});
    await assert.rejects(sendEmail({to:'recipient@example.test'},'tcw-outbox/test-id'),/Resend API failed \(503\)/);
  }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=previousKey;}
});

test('embedded dispatcher respects locks, retries failures and refuses expired reset links',async()=>{
  const previousKey=process.env.RESEND_API_KEY,previousEnabled=process.env.EMAIL_OUTBOX_ENABLED,previousFetch=globalThis.fetch;
  process.env.RESEND_API_KEY='test-placeholder';process.env.EMAIL_OUTBOX_ENABLED='true';
  let sends=0;
  try{
    for(const scenario of ['locked','expired','success','failure']){
      const updates:any[]=[];
      const row={id:'synthetic-outbox',createdAt:new Date(),sentAt:null,attempts:0,payload:scenario==='expired'?{type:'PASSWORD_RESET',resetUrl:'https://example.test/reset?token=expired',text:'Expired reset'}:{to:'recipient@example.test',subject:'Synthetic test',tempPassword:'temporary-test',text:'Password temporary-test'}};
      const tx={
        $queryRaw:async()=>[{locked:scenario!=='locked'}],
        passwordReset:{findUnique:async()=>null},
        outbox:{findUnique:async()=>row,update:async(arg:any)=>{updates.push(arg.data);}},
      };
      const db={outbox:{findMany:async()=>[{id:row.id}]},$transaction:async(fn:any)=>fn(tx)};
      globalThis.fetch=async()=>{sends++;return new Response('{}',{status:scenario==='failure'?503:200});};
      const before=sends,stop=startEmailOutbox(db as any);
      await new Promise(resolve=>setImmediate(resolve));await stop();
      if(scenario==='locked'){assert.equal(sends,before);assert.equal(updates.length,0);}
      if(scenario==='expired'){assert.equal(sends,before);assert.equal(updates[0].attempts,5);assert.equal(updates[0].payload.resetUrl,'[expired]');}
      if(scenario==='success'){assert.equal(sends,before+1);assert.ok(updates[0].sentAt instanceof Date);assert.equal(updates[0].payload.tempPassword,'[delivered]');}
      if(scenario==='failure'){assert.equal(sends,before+1);assert.deepEqual(updates[0].attempts,{increment:1});assert.equal(updates[0].sentAt,undefined);}
    }
  }finally{
    globalThis.fetch=previousFetch;
    for(const [name,value] of Object.entries({RESEND_API_KEY:previousKey,EMAIL_OUTBOX_ENABLED:previousEnabled}))if(value===undefined)delete process.env[name];else process.env[name]=value;
  }
});
