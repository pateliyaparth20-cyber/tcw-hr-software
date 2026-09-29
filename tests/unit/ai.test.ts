import test from 'node:test';
import assert from 'node:assert/strict';
import {CompatibleProvider} from '../../packages/ai';

test('AI provider forwards bounded conversation history and current question',async()=>{
  const original=globalThis.fetch;
  let body:any;
  globalThis.fetch=async(_input:any,init:any)=>{
    body=JSON.parse(String(init?.body??'{}'));
    return new Response(JSON.stringify({choices:[{message:{content:'Context-aware answer'}}]}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  try{
    const provider=new CompatibleProvider({baseUrl:'https://ai.example.test/v1/',apiKey:'test-key',model:'test-model'});
    const answer=await provider.summarize('What about yesterday?',{
      company:{name:'QA Company'},
      conversationHistory:[
        {role:'user',text:'How was attendance today?'},
        {role:'assistant',text:'Attendance was 92%.'}
      ]
    });
    assert.equal(answer,'Context-aware answer');
    assert.equal(body.model,'test-model');
    assert.equal(body.messages[1].role,'user');
    assert.match(body.messages[1].content,/attendance today/i);
    assert.equal(body.messages[2].role,'assistant');
    assert.match(body.messages[2].content,/92%/);
    const final=body.messages.at(-1);
    assert.equal(final.role,'user');
    assert.match(final.content,/What about yesterday\?/);
    assert.doesNotMatch(final.content,/conversationHistory/);
  }finally{globalThis.fetch=original;}
});
