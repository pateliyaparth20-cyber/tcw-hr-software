'use client';
import {usePathname,useRouter,useSearchParams} from 'next/navigation';
import {selectedUrlTab,urlTabHref} from '../navigation-state';
/** URL owns the selected section, so refresh and browser history restore it. */
export function useUrlTab(key:string,allowed:readonly string[],fallback:string){
 const pathname=usePathname(),params=useSearchParams(),router=useRouter();
 const selected=selectedUrlTab(params.toString(),key,allowed,fallback);
 const select=(next:string)=>{if(!allowed.includes(next)||next===selected)return;router.push(urlTabHref(pathname,params.toString(),key,next),{scroll:false})};
 return [selected,select] as const;
}
