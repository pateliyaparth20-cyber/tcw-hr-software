'use client';
import {useLayoutEffect,useState} from 'react';
import {DEFAULT_PRODUCT_LOGO,normalizeLogo} from '../branding';
const CACHE_KEY='tcw_brand_logo_v3',MAX_AGE=24*60*60*1000;
let current:string|undefined,inFlight:Promise<string>|undefined;
function restoreLogo(){try{const saved=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');if(saved?.version===3&&typeof saved.savedAt==='number'&&saved.savedAt<=Date.now()&&Date.now()-saved.savedAt<MAX_AGE&&typeof saved.logo==='string')return normalizeLogo(saved.logo)||DEFAULT_PRODUCT_LOGO;}catch{}return undefined;}
export function publishProductLogo(value:string){current=normalizeLogo(value)||DEFAULT_PRODUCT_LOGO;try{localStorage.setItem(CACHE_KEY,JSON.stringify({version:3,logo:current,savedAt:Date.now()}))}catch{}try{window.dispatchEvent(new Event('tcw-product-logo-updated'))}catch{}}
export function useProductLogo(){
 const [logo,setLogo]=useState(current??DEFAULT_PRODUCT_LOGO);
 useLayoutEffect(()=>{let active=true;current??=restoreLogo();if(current)setLogo(current);try{localStorage.removeItem('tcw_brand_logo');localStorage.removeItem('tcw_brand_logo_v2');localStorage.removeItem('tcw_loading_brand');}catch{}const update=()=>{if(active&&current)setLogo(current)};
 const load=()=>inFlight??=(fetch('/api/branding?logoOnly=1',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Branding unavailable');return r.json()}).then(v=>{publishProductLogo(normalizeLogo(v.logo)||DEFAULT_PRODUCT_LOGO);return current!}).finally(()=>{inFlight=undefined}));
 const refresh=()=>{void load().then(update).catch(()=>{})};refresh();window.addEventListener('tcw-product-logo-updated',update);window.addEventListener('focus',refresh);return()=>{active=false;window.removeEventListener('tcw-product-logo-updated',update);window.removeEventListener('focus',refresh)};
 },[]);return logo;
}
