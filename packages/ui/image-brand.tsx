'use client';
import {useEffect,useState,type ImgHTMLAttributes} from 'react';
import {DEFAULT_PRODUCT_LOGO,normalizeLogo} from '../branding';
export function LogoImage({src,alt='Logo',...props}:Omit<ImgHTMLAttributes<HTMLImageElement>,'src'>&{src?:string|null}){
 const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[src]);
 const value=!failed&&normalizeLogo(src)||DEFAULT_PRODUCT_LOGO;
 const kind=/^data:image\/jpe?g|\.jpe?g(?:[?#]|$)/i.test(value)?'jpeg':/^data:image\/png|\.png(?:[?#]|$)/i.test(value)?'png':'placeholder';
 return <img {...props} src={value} alt={alt} data-logo-format={kind} onError={e=>{setFailed(true);props.onError?.(e)}}/>;
}
