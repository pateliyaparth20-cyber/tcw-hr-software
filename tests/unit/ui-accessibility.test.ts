import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(`${process.cwd()}/tests/unit/ui-accessibility.test.ts`);
require.extensions['.css']=()=>{};
const loadCore=()=>import('../../packages/ui/core');

test('notification links stay inside the HR application',async()=>{
  const {notificationTarget}=await loadCore();
  assert.equal(notificationTarget({url:'/payroll?month=2026-08'}),'/payroll?month=2026-08');
  for(const url of ['//outside.example','/\\outside.example','/\n/outside.example','https://outside.example'])assert.equal(notificationTarget({url}),'/notifications');
});

test('record dialogs expose their title as the accessible name',async()=>{
  const {Modal}=await loadCore();
  const html=renderToStaticMarkup(React.createElement(Modal,{title:'Edit employee',onClose:()=>{},children:'Form'}));
  const labelledBy=html.match(/aria-labelledby="([^"]+)"/)?.[1];
  assert(labelledBy);assert(html.includes(`<h2 id="${labelledBy}">Edit employee</h2>`));
});

test('time and duration inputs retain their distinct field labels',async()=>{
  const {RecordForm}=await loadCore();
  const html=renderToStaticMarkup(React.createElement(RecordForm,{fields:[{key:'start',label:'Shift start',type:'time'},{key:'duration',label:'Working time',type:'duration'}],onSave:async()=>{},onCancel:()=>{}}));
  assert.match(html,/<input id="field-start"/);assert.match(html,/for="field-start"/);
  assert.match(html,/<input id="field-duration"/);assert(!html.includes('aria-label="Time"'));
});

test('attendance badges distinguish Half Day from Insufficient Time',async()=>{
 const {Badge}=await loadCore();
 const half=renderToStaticMarkup(React.createElement(Badge,{value:'HALF_DAY'}));
 const insufficient=renderToStaticMarkup(React.createElement(Badge,{value:'INSUFFICIENT_HOURS'}));
 assert.match(half,/>Half Day</);assert.doesNotMatch(half,/Insufficient/);assert.match(insufficient,/>Insufficient Time</);
});
