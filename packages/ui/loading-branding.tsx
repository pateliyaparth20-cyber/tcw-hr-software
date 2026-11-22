'use client';
import React,{useEffect,useState} from 'react';
import {useProductLogo} from './product-logo';
import './loading-branding.css';
export type LoadingBrand={title:string;message:string;logo:string|null;animation:'ORBIT'|'PULSE'|'SPINNER'|'NONE';accent:string;background:string;updatedAt?:string|null};
export const defaultLoadingBrand:LoadingBrand={title:'TCW HR Software',message:'Preparing your workspace…',logo:null,animation:'ORBIT',accent:'#7c3aed',background:'#f7f4fc'};
let cached:LoadingBrand|undefined,inFlight:Promise<LoadingBrand>|undefined,loadedAt=0;
export function publishLoadingBrand(value:LoadingBrand){cached=value;loadedAt=Date.now();try{localStorage.setItem('tcw_loading_brand',JSON.stringify(value));window.dispatchEvent(new Event('tcw-loading-brand-updated'))}catch{}}
function fetchBrand(){if(cached&&Date.now()-loadedAt<30000)return Promise.resolve(cached);return inFlight??=(fetch('/api/branding',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Branding unavailable');return r.json()}).then(v=>{const next={...defaultLoadingBrand,...v.loading,logo:v.loading?.logo||null};publishLoadingBrand(next);return next}).finally(()=>{inFlight=undefined}));}
export function BrandedLoading({full=false,preview}:{full?:boolean;preview?:LoadingBrand}){
 const productLogo=useProductLogo();
 const[brand,setBrand]=useState(defaultLoadingBrand),[reduce,setReduce]=useState(false);
 useEffect(()=>{if(preview)return;let active=true;const update=()=>{if(cached&&active)setBrand(cached)};try{const stored=JSON.parse(localStorage.getItem('tcw_loading_brand')||'null');if(stored)setBrand({...defaultLoadingBrand,...stored});}catch{}update();fetchBrand().then(v=>{if(active)setBrand(v)}).catch(()=>{});window.addEventListener('tcw-loading-brand-updated',update);return()=>{active=false;window.removeEventListener('tcw-loading-brand-updated',update)}},[!!preview]);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReduce(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[]);
 const value=preview??brand,animation=reduce?'NONE':value.animation,logo=reduce&&value.logo?.startsWith('data:image/gif')?productLogo:value.logo||productLogo;
 return <div className={'tcw-branded-loading '+(full?'full ':'')+'animation-'+animation.toLowerCase()} role="status" aria-live="polite" style={{'--loading-accent':value.accent,'--loading-background':value.background} as React.CSSProperties}><div className="tcw-loading-card"><div className="tcw-loading-art" aria-hidden="true"><span className="tcw-loading-orbit"/><img src={logo} alt="" onError={e=>{if(!e.currentTarget.src.endsWith('/tcw-logo.png'))e.currentTarget.src='/tcw-logo.png'}}/></div><strong>{value.title}</strong><span>{value.message}</span><div className="tcw-loading-progress" aria-hidden="true"><i/></div></div></div>;
}
