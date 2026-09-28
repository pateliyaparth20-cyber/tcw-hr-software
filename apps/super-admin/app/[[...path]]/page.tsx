import {Login,ProtectedPortal} from '../../../../packages/ui/portal';
import {LegalPage} from '../../../../packages/ui/legal';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{path?:string[]}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {path}=await params;const search=await searchParams;const page=path?.[0]??'dashboard';
 if(['privacy','cookies','terms'].includes(page))return <LegalPage kind={page as 'privacy'|'cookies'|'terms'}/>;
 if(page==='admin-login')return <Login scope="PLATFORM" mode="login"/>;
 if(page==='admin-forgot-password')return <Login scope="PLATFORM" mode="forgot-password"/>;
 if(page==='admin-reset-password')return <Login scope="PLATFORM" mode="reset-password" resetToken={search.token??''}/>;
 if(['login','forgot-password','reset-password'].includes(page))return <Login scope="PLATFORM" mode={page} resetToken={search.token??''}/>;
 return <ProtectedPortal scope="PLATFORM" page={page}/>;
}
