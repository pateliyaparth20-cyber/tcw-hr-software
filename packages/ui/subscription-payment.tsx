'use client';
import React,{useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import qrcode from 'qrcode-generator';
import {ArrowLeft,ArrowRight,CheckCircle2,Clock3,CreditCard,Download,Landmark,Layers,Loader2,LockKeyhole,RefreshCw,ShieldCheck,Wallet} from 'lucide-react';
import {api,useApp,useData,Loading,Failure,currencyValue,displayDate} from './core';
import {cardPaymentFields,checkedPayment,checkedUpiUri,paymentSdk} from './payment-provider';
import type {Row} from './config';
import './subscription-payment.css';
const planTitle=(v:string)=>v.charAt(0)+v.slice(1).toLowerCase();
const emptyCard={name:'',number:'',expiry:'',cvv:''};
const appNames:Record<string,string>={any:'Choose a UPI app',gpay:'Google Pay',phonepe:'PhonePe',paytm:'Paytm',cred:'CRED',bhim:'BHIM',mobikwik:'MobiKwik',popclubapp:'POP',super_money:'super.money'};
export function SubscriptionPayment({checkoutId}:{checkoutId:string}){
 const router=useRouter(),{session,currency,can}=useApp(),q=useData('subscription/checkout/'+checkoutId),row=q.data as Row|undefined;
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[methods,setMethods]=useState<Row>({}),[method,setMethod]=useState('upi'),[bank,setBank]=useState(''),[wallet,setWallet]=useState(''),[phone,setPhone]=useState(''),[card,setCard]=useState(emptyCard),[qr,setQr]=useState<{image:string;expires:number}|null>(null),[remaining,setRemaining]=useState(0),[downloading,setDownloading]=useState(false);
 const [surface,setSurface]=useState<'DESKTOP'|'ANDROID'|'IOS'>('DESKTOP'),[apps,setApps]=useState<string[]>([]),[upiApp,setUpiApp]=useState(''),[intentReady,setIntentReady]=useState(false);
 const sdk=useRef<any>(null),alive=useRef(true),checking=useRef(false),sending=useRef(false),canPay=can('company','EDIT');
 const money=(n:number)=>currencyValue(n,currency),verified=row?.verified===true,expired=!!row?.quote?.upgrade&&new Date(row.quote.validUntil).getTime()<Date.now(),mobile=surface!=='DESKTOP';
 useEffect(()=>{alive.current=true;const ua=navigator.userAgent;setSurface(/Android/i.test(ua)?'ANDROID':/iPhone|iPad|iPod/i.test(ua)||/Macintosh/i.test(ua)&&navigator.maxTouchPoints>1?'IOS':'DESKTOP');return()=>{alive.current=false}},[]);
 async function refresh(){if(checking.current||!canPay)return;checking.current=true;try{const result=await api('subscription/gateway-status','POST',{checkoutId},session.csrf);if(alive.current){setMessage(result.message??'Waiting for bank confirmation.');await q.refetch();}}catch(e:any){if(alive.current)setError(e.message)}finally{checking.current=false}}
 useEffect(()=>{
  if(!row||verified||!row.providerRef||row.state!=='READY'||!canPay||expired)return;
  let active=true,timeout:ReturnType<typeof setTimeout>;setReady(false);setError('');setMethods({});setQr(null);setCard(emptyCard);
  async function success(response:any){if(!active)return;setBusy(true);setCard(emptyCard);try{const checked=checkedPayment(response,row!.providerRef);await api('subscription/gateway-verify','POST',{checkoutId,paymentId:checked.razorpay_payment_id,signature:checked.razorpay_signature},session.csrf);if(active){setMessage('Payment received. Checking your receipt…');await q.refetch();}}catch(e:any){if(active)setError(e.message)}finally{if(active){sending.current=false;setBusy(false)}}}
  paymentSdk().then(Constructor=>{
   if(!active)return;
   const instance=new Constructor({key:row.keyId,redirect:false});sdk.current=instance;
   const failed=(response:any)=>{if(!active)return;sending.current=false;setBusy(false);setQr(null);setCard(emptyCard);const reason=String(response?.error?.description??response?.description??response?.message??'Payment was not completed. Check its status before retrying.').slice(0,300).replace(/\b(?:\d[ -]?){12,19}\b/g,'[redacted]');setError(/feature.*not.*enabled|non-redirection flow not supported/i.test(reason)?'In-page UPI QR is not activated for this merchant account. Contact billing to activate Custom Checkout and non-redirect UPI QR.':reason);};
   instance.on('payment.error',failed);
   instance.on('payment.success',success);
   instance.on('payment.upi.qr',(event:any)=>{if(!active)return;try{if(event.status==='expired'){setQr(null);sending.current=false;setBusy(false);setMessage('QR expired. Check status before generating another QR.');return;}const uri=checkedUpiUri(event.qr_url,row.amount),expires=Number(event.expires_on);if(!Number.isFinite(expires)||expires<=Date.now()||expires>Date.now()+11*60*1000)throw new Error('Payment QR has expired or is invalid.');const code=qrcode(0,'M');code.addData(uri);code.make();setQr({image:code.createDataURL(6,8),expires});setBusy(false);setMessage('Scan this QR with your UPI app. Approve the payment in your bank app.');}catch(e:any){failed(e)}});
   timeout=setTimeout(()=>{if(active)setError('Payment methods could not load. Reload this payment page to retry.');},20000);
   instance.once('ready',(response:any)=>{if(!active)return;clearTimeout(timeout);const available=response?.methods??instance.methods??{};setMethods(available);setMethod(available.upi?'upi':available.card?'card':available.netbanking?'netbanking':'wallet');setReady(true)});
  }).catch(e=>{if(active)setError(e.message)});
  return()=>{active=false;clearTimeout(timeout);sdk.current=null};
 },[row?.id,row?.state,verified,canPay,session.csrf]);
 useEffect(()=>{
  if(!ready||!mobile||!methods.upi||!sdk.current)return;let active=true;setIntentReady(false);setApps([]);
  const supported=surface==='ANDROID'?Object.keys(appNames):Object.keys(appNames).filter(v=>v!=='any');
  const instance=sdk.current;
  if(typeof instance.getSupportedUpiIntentApps!=='function'){setIntentReady(true);return;}
  Promise.resolve().then(()=>instance.getSupportedUpiIntentApps()).then((value:any)=>{if(!active)return;const values=Array.isArray(value)?value:Array.isArray(value?.apps)?value.apps:null;const returned=values?.filter((v:any)=>typeof v==='string'&&supported.includes(v));const options=returned??(surface==='ANDROID'?['any']:['gpay','phonepe','paytm']);setApps(options);setUpiApp(options[0]??'');setIntentReady(true)}).catch(()=>{if(active){setIntentReady(true);setApps([]);setUpiApp('')}});return()=>{active=false};
 },[ready,mobile,surface,methods]);
 useEffect(()=>{if(!row||verified||!canPay||!row.providerRef)return;const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh()},10000);return()=>clearInterval(timer)},[row?.id,verified,canPay]);
 useEffect(()=>{if(!qr)return;const update=()=>{const left=Math.max(0,Math.ceil((qr.expires-Date.now())/1000));setRemaining(left);if(left===0){setQr(null);sending.current=false;setBusy(false);setMessage('QR expired. Check payment status before retrying.')}};update();const timer=setInterval(update,1000);return()=>clearInterval(timer)},[qr]);
 function pay(){
  if(!ready||busy||sending.current||!sdk.current||!row||verified||!canPay||expired)return;
  setError('');setMessage('');
  try{
   if(method==='netbanking'&&!bank)throw new Error('Select your bank first.');
   if(method==='wallet'&&!wallet)throw new Error('Select your wallet first.');
   if(method==='upi'&&mobile&&(!intentReady||!upiApp))throw new Error('Choose an available UPI app.');
   const contact=phone.replace(/[\s()-]/g,'');if((method!=='upi'||mobile)&&!/^\+?[1-9]\d{9,14}$/.test(contact))throw new Error('Enter your mobile number with 10 to 15 digits.');
   const data={order_id:row.providerRef,amount:row.amount,currency:'INR',name:session.user.name,email:session.user.email,method,...(contact?{contact}:{}),...(method==='netbanking'?{bank}:method==='wallet'?{wallet}:method==='card'?cardPaymentFields(card):{})};
   sending.current=true;setBusy(true);
   if(method==='upi')sdk.current.createPayment(data,mobile?{app:upiApp}:{app:'any',flow:'qr'});else sdk.current.createPayment(data);
   if(method==='card')setCard(emptyCard);
  }catch(e:any){sending.current=false;setBusy(false);setError(e.message)}
 }
 function cancelWait(){try{sdk.current?.emit?.('payment.cancel')}catch{}setQr(null);sending.current=false;setBusy(false);setCard(emptyCard);setMessage('Payment attempt closed. Checking its status before you retry.');void refresh()}
 async function download(){const invoice=row?.receipt?.invoice;if(!invoice)return;setDownloading(true);try{const response=await fetch('/api/subscription/invoices/'+encodeURIComponent(invoice.id)+'/download',{credentials:'same-origin',cache:'no-store'});if(!response.ok||!response.headers.get('content-type')?.includes('application/pdf'))throw new Error('Invoice could not be downloaded. Try again shortly.');const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=invoice.number+'.pdf';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}catch(e:any){setError(e.message)}finally{setDownloading(false)}}
 if(q.isLoading)return <Loading/>;if(q.error)return <Failure error={q.error}/>;if(!row)return null;
 const receipt=row.receipt,test=row.mode==='TEST',review=row.reviewRequired===true,banks=methods.netbanking&&typeof methods.netbanking==='object'?Object.entries(methods.netbanking):[],wallets=methods.wallet&&typeof methods.wallet==='object'?Object.entries(methods.wallet).filter(([code,enabled])=>(enabled===true||enabled===1||typeof enabled==='string'&&!!enabled)&&/^[a-z][a-z0-9_]{1,30}$/.test(code)):[],cards=methods.card===true||methods.card===1||typeof methods.card==='object'&&methods.card&&Object.values(methods.card).some(Boolean),hasMethods=!!methods.upi||cards||banks.length>0||wallets.length>0;
 return <section className="tcw-pay-page">
  <header className="tp-header"><button type="button" onClick={()=>router.push('/subscription')}><ArrowLeft size={16}/> Plans & billing</button><span><Layers size={20}/> TCW HR Software</span><small><LockKeyhole size={14}/> Secure payment</small></header>
  <div className="tp-steps"><span className="done">1 · Review plan</span><i/><span className={verified?'done':'current'}>2 · Payment</span><i/><span className={verified?'current':''}>3 · Receipt</span></div>
  <div className="tp-layout"><aside className="tp-summary"><span className="tp-eyebrow">YOUR SUBSCRIPTION</span><h1>{planTitle(row.planName)} plan</h1><p>{row.cycle==='YEARLY'?'Annual':'Monthly'} billing · One-time payment</p><div className="tp-company"><strong>{row.customer?.name}</strong><small>{row.customer?.code} · {session.user.email}</small></div><dl><div><dt>Plan subtotal</dt><dd>{money(row.quote?.recurring?.subtotal??row.subtotal)}</dd></div><div><dt>GST</dt><dd>{money(row.quote?.recurring?.tax??row.tax)}</dd></div>{row.quote?.credit>0&&<div><dt>Credit applied</dt><dd>−{money(row.quote.credit)}</dd></div>}<div className="tp-total"><dt>{verified?'Amount paid':'Total to pay'}</dt><dd>{money(verified?receipt.amount:row.amount)}</dd></div></dl><p className="tp-note"><ShieldCheck size={18}/>Payment confirmation is verified by the server. Your UPI PIN stays in your bank app.</p><div className="tp-renewal"><Clock3 size={17}/><span>No automatic debits. Renew manually when your paid plan ends.</span></div></aside>
  <main className="tp-main">{test&&<div className="tp-test">TEST MODE · No real charge or live plan activation</div>}
   {verified?<div className="tp-receipt"><div className="tp-success-icon"><CheckCircle2 size={38}/></div><span className="tp-eyebrow">{test?'SANDBOX RECEIPT':review?'PAYMENT RECEIVED':'PAYMENT COMPLETE'}</span><h2>{test?'Test payment verified':review?'Payment needs a review':'You’re all set'}</h2><p>{test?'Your test succeeded. It does not change your live subscription or create a production invoice.':review?'We received your payment, but your workspace changed during checkout. Contact support to apply the correct plan.':'Your payment for the '+planTitle(row.planName)+' plan has been verified.'}</p><dl><div><dt>Payment reference</dt><dd>{receipt.paymentId}</dd></div><div><dt>Received</dt><dd>{displayDate(receipt.createdAt)}</dd></div>{!test&&!review&&<div><dt>Plan period</dt><dd>{displayDate(receipt.periodStart)} – {displayDate(receipt.periodEnd)}</dd></div>}{receipt.invoice&&<div><dt>Invoice</dt><dd>{receipt.invoice.number}</dd></div>}</dl>{receipt.invoice&&<button className="tp-primary" onClick={download} disabled={downloading}><Download size={17}/>{downloading?'Preparing invoice…':'Download invoice PDF'}</button>}<button className="tp-secondary" onClick={()=>router.push('/subscription')}>Back to plans & billing <ArrowRight size={16}/></button></div>:<>
    <span className="tp-eyebrow">TCW SECURE CHECKOUT</span><h2>Choose how to pay</h2><p>Complete your payment here. Your bank or UPI app may ask you to approve it.</p>
    {row.state!=='READY'||expired?<div className="tp-pending"><Clock3 size={30}/><h3>{row.state==='ABANDONED'?'Checkout replaced':expired?'Quote expired':'Awaiting payment confirmation'}</h3><p>{expired?'Return to plans and replace the unpaid checkout to review a fresh credit and total. Your current paid plan is unchanged.':row.state==='ABANDONED'?'This old checkout is closed in TCW. Return to plans and review a fresh payment quote. Any late payment on this order will be recorded for billing review.':'This payment session needs confirmation. Check the status before starting a new payment.'}</p></div>:<>
     <div className="tp-methods" role="group" aria-label="Payment methods">
      {methods.upi&&<button disabled={busy||!!qr} aria-pressed={method==='upi'} className={method==='upi'?'selected':''} onClick={()=>setMethod('upi')}><Wallet size={23}/><strong>{mobile?'UPI app':'UPI QR'}</strong><small>{mobile?'Approve with your UPI app':'Scan with your UPI app'}</small></button>}
      {cards&&<button disabled={busy||!!qr} aria-pressed={method==='card'} className={method==='card'?'selected':''} onClick={()=>setMethod('card')}><CreditCard size={23}/><strong>Debit / credit card</strong><small>Secure card payment</small></button>}
      {banks.length>0&&<button disabled={busy||!!qr} aria-pressed={method==='netbanking'} className={method==='netbanking'?'selected':''} onClick={()=>setMethod('netbanking')}><Landmark size={23}/><strong>Netbanking</strong><small>Approve with your bank</small></button>}
      {wallets.length>0&&<button disabled={busy||!!qr} aria-pressed={method==='wallet'} className={method==='wallet'?'selected':''} onClick={()=>setMethod('wallet')}><Wallet size={23}/><strong>Wallet</strong><small>Choose your wallet</small></button>}
     </div>
     {ready&&!hasMethods&&<div className="tp-alert">No supported payment methods are active for this account. Contact billing to complete payment setup.</div>}
     {method==='upi'&&mobile&&<label className="tp-bank">Your UPI app<select value={upiApp} disabled={!intentReady||busy} onChange={e=>setUpiApp(e.target.value)}><option value="">{intentReady?'Choose a UPI app':'Checking UPI apps…'}</option>{apps.map(app=><option key={app} value={app}>{appNames[app]??app}</option>)}</select>{intentReady&&!apps.length&&<small>No compatible UPI app is available in this browser. Choose another payment method.</small>}</label>}
     {method==='netbanking'&&banks.length>0&&<label className="tp-bank">Your bank<select value={bank} disabled={busy||!!qr} onChange={e=>setBank(e.target.value)}><option value="">Select your bank</option>{banks.map(([code,name])=><option key={code} value={code}>{String(name)}</option>)}</select></label>}
     {method==='wallet'&&wallets.length>0&&<label className="tp-bank">Your wallet<select value={wallet} disabled={busy||!!qr} onChange={e=>setWallet(e.target.value)}><option value="">Select your wallet</option>{wallets.map(([code,name])=><option key={code} value={code}>{typeof name==='string'?name:planTitle(code)}</option>)}</select></label>}
     {method==='card'&&cards&&<div className="tp-card-fields"><label>Cardholder name<input autoComplete="cc-name" value={card.name} maxLength={120} disabled={busy} onChange={e=>setCard(v=>({...v,name:e.target.value}))}/></label><label>Card number<input autoComplete="cc-number" inputMode="numeric" value={card.number} maxLength={23} placeholder="1234 5678 9012 3456" disabled={busy} onChange={e=>setCard(v=>({...v,number:e.target.value}))}/></label><div><label>Expiry<input autoComplete="cc-exp" inputMode="numeric" value={card.expiry} maxLength={9} placeholder="MM / YY" disabled={busy} onChange={e=>setCard(v=>({...v,expiry:e.target.value}))}/></label><label>Security code<input type="password" autoComplete="cc-csc" inputMode="numeric" value={card.cvv} maxLength={4} placeholder="CVV" disabled={busy} onChange={e=>setCard(v=>({...v,cvv:e.target.value}))}/></label></div><p><LockKeyhole size={13}/> Card details are sent directly to the payment processor and are not saved by TCW.</p></div>}
     {hasMethods&&(method!=='upi'||mobile)&&<label className="tp-bank">Mobile number<input type="tel" autoComplete="tel" inputMode="tel" placeholder="Your mobile number" value={phone} maxLength={20} disabled={busy} onChange={e=>setPhone(e.target.value)}/></label>}
     {qr&&<div className="tp-qr"><img src={qr.image} alt="UPI payment QR" width={240} height={240}/><strong>Scan to pay {money(row.amount)}</strong><small>Expires in {Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')}</small><p>Approve this payment in your UPI app. Never share your UPI PIN.</p></div>}
     {!qr&&<button className="tp-primary" onClick={pay} disabled={!ready||busy||!canPay||!hasMethods||method==='netbanking'&&!bank||method==='wallet'&&!wallet||method==='upi'&&mobile&&(!intentReady||!upiApp)}>{busy||!ready?<Loader2 size={18} className="pricing-spin"/>:<LockKeyhole size={17}/>} {!ready?'Loading payment methods…':busy?'Waiting for payment…':method==='upi'&&!mobile?'Generate payment QR':'Pay '+money(row.amount)}</button>}
     {(busy||qr)&&<button className="tp-secondary" onClick={cancelWait}>Cancel attempt & check status</button>}
    </>}
    {(expired||row.state==='ABANDONED')&&<button className="tp-secondary" onClick={()=>router.push('/subscription')}>Review a fresh plan <ArrowRight size={16}/></button>}
    <button className="tp-secondary" disabled={!canPay} onClick={()=>void refresh()}><RefreshCw size={16}/> Check payment status</button>
   </>}
   {message&&!verified&&<p className="tp-message" role="status">{message}</p>}{error&&<p className="tp-alert" role="alert">{error}</p>}<p className="tp-powered"><ShieldCheck size={15}/> Securely processed by Razorpay</p>
  </main></div>
 </section>;
}
