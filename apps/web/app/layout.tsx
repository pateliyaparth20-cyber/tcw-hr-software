import type {Metadata,Viewport} from 'next';
import '../../../packages/ui/styles.css';
import '../../../packages/ui/sky-theme.css';
import {PwaClient} from '../../../packages/ui/pwa';
import {CookieConsent} from '../../../packages/ui/legal';
export const metadata:Metadata={title:'TCW HR Software',description:'TCW HR Software · HR and workforce management',manifest:'/manifest.webmanifest',icons:{icon:[{url:'/favicon-32.png',type:'image/png'},{url:'/tcw-logo.png',type:'image/png'}],shortcut:'/favicon-32.png',apple:'/icons/icon-180.png'},appleWebApp:{capable:true,statusBarStyle:'black-translucent',title:'TCW HR'}};
export const viewport:Viewport={themeColor:'#ffffff',width:'device-width',initialScale:1,viewportFit:'cover'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><PwaClient/>{children}<CookieConsent/></body></html>}
