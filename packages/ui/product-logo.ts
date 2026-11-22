'use client';
import {useEffect,useState} from 'react';
import {DEFAULT_PRODUCT_LOGO} from '../branding';
let current:string|undefined,inFlight:Promise<string>|undefined;
export function publishProductLogo(value:string){current=value||DEFAULT_PRODUCT_LOGO;try{localStorage.setItem('tcw_brand_logo',current)}catch{}try{window.dispatchEvent(new Event('tcw-product-logo-updated'))}catch{}}
export function useProductLogo(){
 const [logo,setLogo]=useState(()=>{try{return current||localStorage.getItem('tcw_brand_logo')||DEFAULT_PRODUCT_LOGO}catch{return DEFAULT_PRODUCT_LOGO}});
 useEffect(()=>{let active=true;const update=()=>{if(active&&current)setLogo(current)};
 const load=()=>inFlight??=(fetch('/api/branding?logoOnly=1',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Branding unavailable');return r.json()}).then(v=>{publishProductLogo(String(v.logo||DEFAULT_PRODUCT_LOGO));return current!}).finally(()=>{inFlight=undefined}));
 const refresh=()=>{void load().then(update).catch(()=>{})};refresh();window.addEventListener('tcw-product-logo-updated',update);window.addEventListener('focus',refresh);return()=>{active=false;window.removeEventListener('tcw-product-logo-updated',update);window.removeEventListener('focus',refresh)};
 },[]);return logo;
}
