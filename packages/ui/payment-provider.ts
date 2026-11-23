/** Custom checkout keeps method selection in TCW. Only public order data reaches the SDK. */
export type CheckoutMode='STANDARD'|'CUSTOM';
export type PaymentResponse={razorpay_payment_id:string;razorpay_order_id:string;razorpay_signature:string};
export function checkedPayment(response:PaymentResponse,orderId:string){
 if(response?.razorpay_order_id!==orderId||!/^pay_[A-Za-z0-9]+$/.test(response.razorpay_payment_id??'')||!/^[a-f0-9]{64}$/i.test(response.razorpay_signature??''))throw new Error('Payment response did not match this order. Check payment status before retrying.');
 return response;
}
export function checkedUpiUri(value:string,amount:number){
 const uri=new URL(value);if(uri.protocol!=='upi:'||uri.hostname!=='pay'||!uri.searchParams.get('pa')||uri.searchParams.get('cu')!=='INR'||Math.round(Number(uri.searchParams.get('am'))*100)!==amount)throw new Error('The bank returned an invalid payment QR. Check payment status before retrying.');return uri.toString();
}
const constructors:Partial<Record<CheckoutMode,any>>={};let loading=Promise.resolve();
export function paymentSdk(mode:CheckoutMode):Promise<any>{
 if(constructors[mode])return Promise.resolve(constructors[mode]);
 const pending=loading.then(()=>{if(constructors[mode])return constructors[mode];return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/'+(mode==='CUSTOM'?'razorpay.js':'checkout.js');script.async=true;script.onload=()=>{const ctor=(window as any).Razorpay;if(typeof ctor!=='function'){reject(new Error('Payment service did not initialize. Please retry.'));return;}constructors[mode]=ctor;resolve(ctor)};script.onerror=()=>{script.remove();reject(new Error('Payment service could not load. Check your connection and retry.'))};document.head.appendChild(script)})});loading=pending.then(()=>{},()=>{});return pending;
}
