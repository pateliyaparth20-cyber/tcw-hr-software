'use client';
import {useEffect,useState,type ReactNode} from 'react';
export function PagedCollection<T>({rows,children,resetKey='',pageSize=25}:{rows:T[];children:(rows:T[])=>ReactNode;resetKey?:string;pageSize?:number}){
 const [page,setPage]=useState(1),pages=Math.max(1,Math.ceil(rows.length/pageSize)),current=Math.min(page,pages),start=(current-1)*pageSize;
 useEffect(()=>setPage(1),[resetKey,rows.length]);
 return <><div className="collection-screen">{children(rows.slice(start,start+pageSize))}</div><div className="collection-print-only">{children(rows)}</div>{rows.length>pageSize&&<nav className="shared-pagination no-print" aria-label="List pagination"><span>{start+1}–{Math.min(start+pageSize,rows.length)} of {rows.length} records</span><div><button type="button" className="btn secondary small" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span>{current} / {pages}</span><button type="button" className="btn secondary small" disabled={current===pages} onClick={()=>setPage(current+1)}>Next</button></div></nav>}</>;
}
