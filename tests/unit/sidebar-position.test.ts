import test from 'node:test';
import assert from 'node:assert/strict';
import {readSidebarState,saveSidebarState,sidebarPositionKey,sidebarRestoreTop} from '../../packages/sidebar-position';
test('sidebar position and expanded More state survive storage and remain per-user/company',()=>{
 const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}};
 const key=sidebarPositionKey('TENANT','hr-1','company-1');saveSidebarState(storage,key,{top:640,expanded:true});assert.deepEqual(readSidebarState(storage,key),{top:640,expanded:true});assert.equal(readSidebarState(storage,sidebarPositionKey('TENANT','hr-2','company-1')),null);assert.equal(readSidebarState(storage,sidebarPositionKey('TENANT','hr-1','company-2')),null);assert.equal(sidebarRestoreTop(readSidebarState(storage,key)!.top,0,900),640);
});
test('first navigation exposes the selected lower menu item by scrolling only its container',()=>{
 assert.equal(sidebarRestoreTop(null,0,900,{top:1100,bottom:1140,height:500}),640);assert.equal(sidebarRestoreTop(null,400,900,{top:-40,bottom:0,height:500}),360);assert.equal(sidebarRestoreTop(0,600,900,{top:1100,bottom:1140,height:500}),0);assert.equal(sidebarRestoreTop(1500,0,900),900);
});
test('unavailable or invalid session storage does not crash navigation',()=>{
 const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};assert.equal(readSidebarState(blocked,'key'),null);assert.doesNotThrow(()=>saveSidebarState(blocked,'key',{top:200,expanded:true}));for(const value of ['oops','{}','{"top":-1,"expanded":true}','{"top":"500","expanded":true}'])assert.equal(readSidebarState({getItem:()=>value},'key'),null);
});
