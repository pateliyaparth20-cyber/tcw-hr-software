/** TCW owns method selection; sensitive payment details go directly to the processor SDK. */
export type PaymentResponse={razorpay_payment_id:string;razorpay_order_id:string;razorpay_signature:string};
export function checkedPayment(response:PaymentResponse,orderId:string){
 if(response?.razorpay_order_id!==orderId||!/^pay_[A-Za-z0-9]+$/.test(response.razorpay_payment_id??'')||!/^[a-f0-9]{64}$/i.test(response.razorpay_signature??''))throw new Error('Payment response did not match this order. Check payment status before retrying.');
 return response;
}
export function checkedUpiUri(value:string,amount:number){
 const uri=new URL(value);if(uri.protocol!=='upi:'||uri.hostname!=='pay'||!uri.searchParams.get('pa')||uri.searchParams.get('cu')!=='INR'||Math.round(Number(uri.searchParams.get('am'))*100)!==amount)throw new Error('The bank returned an invalid payment QR. Check payment status before retrying.');return uri.toString();
}
let constructor:any,loading:Promise<any>|undefined;
export function paymentSdk():Promise<any>{
 if(constructor)return Promise.resolve(constructor);
 if(loading)return loading;
 loading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/razorpay.js';script.async=true;script.onload=()=>{const ctor=(window as any).Razorpay;if(typeof ctor!=='function'){loading=undefined;reject(new Error('Payment service did not initialize. Please retry.'));return;}constructor=ctor;resolve(ctor)};script.onerror=()=>{script.remove();loading=undefined;reject(new Error('Payment service could not load. Check your connection and retry.'))};document.head.appendChild(script)});return loading;
}
/** These fields go directly to the processor SDK, never the TCW API. */
export function cardPaymentFields(card:{name:string;number:string;expiry:string;cvv:string},now=new Date()){
 const number=card.number.replace(/\s/g,''),parts=card.expiry.match(/^\s*(\d{2})\s*\/\s*(\d{2}|\d{4})\s*$/);
 if(!card.name.trim()||(!/^\d{12,19}$/.test(number)||/^(\d)\1+$/.test(number)))throw new Error('Enter the cardholder name and a valid card number.');
 let sum=0,double=false;for(let i=number.length-1;i>=0;i--){let digit=Number(number[i]);if(double){digit*=2;if(digit>9)digit-=9;}sum+=digit;double=!double;}if(sum%10!==0)throw new Error('Check your card number.');
 const month=Number(parts?.[1]),year=parts?Number(parts[2])+(parts[2].length===2?2000:0):0;if(!parts||month<1||month>12||year<now.getFullYear()||year===now.getFullYear()&&month<now.getMonth()+1)throw new Error('Enter a valid card expiry as MM / YY.');
 if(!/^\d{3,4}$/.test(card.cvv))throw new Error('Enter a valid card security code.');
 return {'card[name]':card.name.trim(),'card[number]':number,'card[expiry_month]':String(month).padStart(2,'0'),'card[expiry_year]':String(year%100).padStart(2,'0'),'card[cvv]':card.cvv};
}
