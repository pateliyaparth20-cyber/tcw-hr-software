import {NextRequest} from 'next/server';
export const runtime='nodejs';
export async function POST(request:NextRequest){
 const form=await request.formData(),grant=form.get('grant');
 if(typeof grant!=='string'||grant.length>128)return new Response('Invalid proxy login.',{status:400});
 const upstream=await fetch(new URL('/api/auth/proxy-claim',process.env.API_INTERNAL_URL??'http://127.0.0.1:4000'),{method:'POST',headers:{'content-type':'application/json','origin':request.headers.get('origin')??'','x-peopleos-portal':'TENANT','user-agent':request.headers.get('user-agent')??''},body:JSON.stringify({grant}),cache:'no-store',signal:AbortSignal.timeout(30000)});
 if(!upstream.ok)return new Response('Proxy login could not be opened. Return to Super Admin and try again.',{status:upstream.status,headers:{'cache-control':'no-store'}});
 const headers=new Headers({'location':'/dashboard?proxy=1','cache-control':'no-store','referrer-policy':'no-referrer'});
 for(const cookie of upstream.headers.getSetCookie())headers.append('set-cookie',cookie);
 return new Response(null,{status:303,headers});
}
