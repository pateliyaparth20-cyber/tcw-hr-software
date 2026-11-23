'use client';
import React,{useEffect,useState} from 'react';
import Link from 'next/link';
import {Plus,PanelLeft,Sun,Moon,Menu} from 'lucide-react';
import './workspace-navigation.css';

type Item=readonly string[];
export function useNavigationAppearance(){
 const[collapsed,setCollapsed]=useState(false),[dark,setDark]=useState(false);
 useEffect(()=>{try{setCollapsed(localStorage.getItem('tcw:nav-collapsed')==='1');setDark(localStorage.getItem('tcw:nav-dark')==='1')}catch{}},[]);
 const toggleCollapsed=()=>setCollapsed(value=>{try{localStorage.setItem('tcw:nav-collapsed',value?'0':'1')}catch{}return !value});
 const changeDark=(value:boolean)=>{setDark(value);try{localStorage.setItem('tcw:nav-dark',value?'1':'0')}catch{}};
 return {collapsed,dark,toggleCollapsed,changeDark};
}
export function SidebarToggle({collapsed,onClick}:{collapsed:boolean;onClick:()=>void}){
 return <button type="button" className="nav-collapse-control" onClick={onClick} aria-expanded={!collapsed} aria-label={collapsed?'Expand sidebar':'Collapse sidebar'} title={collapsed?'Expand sidebar':'Collapse sidebar'}><Menu size={21}/><span>Navigation</span></button>;
}
export function SidebarAppearance({dark,onChange}:{dark:boolean;onChange:(value:boolean)=>void}){
 return <div className="nav-appearance" role="group" aria-label="Sidebar appearance"><button type="button" aria-label="Light sidebar" aria-pressed={!dark} onClick={()=>onChange(false)}><Sun size={18}/><span>Light</span></button><button type="button" aria-label="Dark sidebar" aria-pressed={dark} onClick={()=>onChange(true)}><Moon size={18}/><span>Dark</span></button></div>;
}
export function NavigationDock({items,keys,page,icons,menuOpen,onMenu,onNavigate,onQuick}:{items:ReadonlyArray<Item>;keys:string[];page:string;icons:Record<string,React.ElementType>;menuOpen:boolean;onMenu:()=>void;onNavigate:()=>void;onQuick:()=>void}){
 const slots=keys.map(key=>items.find(item=>item[0]===key)).filter((item):item is Item=>!!item).slice(0,3);
 const link=(item:Item)=>{const Icon=icons[item[0]]??PanelLeft;return <Link key={item[0]} href={'/'+item[0]} className={'dock-link '+(page===item[0]?'active':'')} aria-current={page===item[0]?'page':undefined} onClick={onNavigate}><Icon size={22}/><span>{({dashboard:'Home',attendance:'Attendance',leave:'Time off',employees:'People'} as Record<string,string>)[item[0]]??item[1]}</span></Link>};
 return <nav className="workspace-fab-dock" aria-label="Workspace shortcuts"><div className="dock-side">{slots.slice(0,2).map(link)}</div><button type="button" className="dock-fab" aria-label="Open quick actions" aria-haspopup="dialog" onClick={onQuick}><Plus size={30}/></button><div className="dock-side">{slots.slice(2).map(link)}<button type="button" className={'dock-link '+(menuOpen?'active':'')} aria-label={menuOpen?'Close menu':'Open menu'} aria-expanded={menuOpen} onClick={onMenu}><PanelLeft size={22}/><span>More</span></button></div></nav>;
}
