import test from 'node:test';
import assert from 'node:assert/strict';
import {lockBackgroundScroll} from '../../packages/ui/overlay-scroll';
test('nested overlays hold background scroll and restore original styles and position only after final close',()=>{
 const style=()=>{const values=new Map<string,[string,string]>();return {getPropertyValue:(k:string)=>values.get(k)?.[0]??'',getPropertyPriority:(k:string)=>values.get(k)?.[1]??'',setProperty:(k:string,v:string,p='')=>values.set(k,[v,p]),removeProperty:(k:string)=>values.delete(k)}};
 const body=style(),root=style(),scrolls:any[]=[];body.setProperty('position','relative','important');body.setProperty('padding-right','4px');root.setProperty('overflow','auto');
 const original={document:globalThis.document,window:globalThis.window,getComputedStyle:globalThis.getComputedStyle};
 Object.assign(globalThis,{document:{body:{style:body},documentElement:{style:root,clientWidth:980}},window:{scrollX:12,scrollY:460,innerWidth:1000,scrollTo:(v:any)=>scrolls.push(v)},getComputedStyle:()=>({paddingRight:'4px'})});
 try{const parent=lockBackgroundScroll(),child=lockBackgroundScroll();assert.equal(body.getPropertyValue('top'),'-460px');assert.equal(body.getPropertyValue('padding-right'),'24px');assert.equal(root.getPropertyValue('overflow'),'hidden');parent();parent();assert.equal(body.getPropertyValue('position'),'fixed');assert.equal(scrolls.length,0);child();assert.equal(body.getPropertyValue('position'),'relative');assert.equal(body.getPropertyPriority('position'),'important');assert.equal(body.getPropertyValue('padding-right'),'4px');assert.equal(root.getPropertyValue('overflow'),'auto');assert.deepEqual(scrolls,[{left:12,top:460,behavior:'instant'}]);child();assert.equal(scrolls.length,1)}finally{Object.assign(globalThis,original)}
});
