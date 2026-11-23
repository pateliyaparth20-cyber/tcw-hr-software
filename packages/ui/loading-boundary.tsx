'use client';
import React,{createContext,useCallback,useContext,useLayoutEffect,useRef,useState} from 'react';
import {BrandedLoading} from './loading-branding';
const LoadingGroup=createContext<null|(()=>()=>void)>(null);
// Keep existing page DOM intact; show one shared loader while any initial section loads.
export function LoadingBoundary({children}:{children:React.ReactNode}){
 const owners=useRef(new Set<symbol>()),[count,setCount]=useState(0);
 const register=useCallback(()=>{const key=Symbol();owners.current.add(key);setCount(owners.current.size);let released=false;return()=>{if(released)return;released=true;owners.current.delete(key);setCount(owners.current.size)}},[]);
 return <LoadingGroup.Provider value={register}>{children}{count>0&&<div className="tcw-group-loader"><BrandedLoading/></div>}</LoadingGroup.Provider>;
}
export function LocalLoadingScope({children}:{children:React.ReactNode}){return <LoadingGroup.Provider value={null}>{children}</LoadingGroup.Provider>}
export function ScopedLoading(){const register=useContext(LoadingGroup);useLayoutEffect(()=>register?.(),[register]);return register?null:<BrandedLoading/>}
