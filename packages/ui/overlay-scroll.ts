// Shared ownership prevents a nested dialog from unlocking the page beneath it.
let owners=0,restore:(()=>void)|undefined;
export function lockBackgroundScroll(){
 if(owners++===0){
  const body=document.body,root=document.documentElement,x=window.scrollX,y=window.scrollY;
  const properties=['position','top','left','width','overflow','padding-right'] as const;
  const saved=properties.map(key=>[key,body.style.getPropertyValue(key),body.style.getPropertyPriority(key)]);
  const overflow=root.style.getPropertyValue('overflow'),priority=root.style.getPropertyPriority('overflow');
  const gutter=Math.max(0,window.innerWidth-root.clientWidth),padding=parseFloat(getComputedStyle(body).paddingRight)||0;
  body.style.setProperty('position','fixed');body.style.setProperty('top',`${-y}px`);body.style.setProperty('left',`${-x}px`);body.style.setProperty('width','100%');body.style.setProperty('overflow','hidden');
  if(gutter)body.style.setProperty('padding-right',`${padding+gutter}px`);
  root.style.setProperty('overflow','hidden');
  restore=()=>{for(const[key,value,p]of saved){if(value)body.style.setProperty(key,value,p);else body.style.removeProperty(key)}if(overflow)root.style.setProperty('overflow',overflow,priority);else root.style.removeProperty('overflow');window.scrollTo({left:x,top:y,behavior:'instant'});};
 }
 let released=false;return()=>{if(released)return;released=true;if(--owners===0){restore?.();restore=undefined}};
}
