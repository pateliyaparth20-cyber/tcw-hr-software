import {notFound} from 'next/navigation';
import {Login,ProtectedPortal} from '../../../../packages/ui/portal';
import {AppsPage} from '../../../../packages/ui/apps';
import {LegalPage} from '../../../../packages/ui/legal';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{path?:string[]}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {path}=await params;const search=await searchParams;const page=path?.[0]??'login';
 if(page==='downloads')return <AppsPage/>;
 if(['privacy','cookies','terms'].includes(page))return <LegalPage kind={page as 'privacy'|'cookies'|'terms'}/>;
 // Super Admin is deliberately isolated in the separate Super Admin application.
 // Never expose platform login/reset routes from the HR/company portal.
 const platformOnly=new Set(['super-admin','trials','companies','plans','leads','invoices','payments','system']);
 if(page.startsWith('admin-')||platformOnly.has(page))notFound();
 if(['login','signup','forgot-password','reset-password'].includes(page))return <Login scope="TENANT" mode={page} resetToken={search.token??''}/>;
 return <ProtectedPortal scope="TENANT" page={page}/>;
}
