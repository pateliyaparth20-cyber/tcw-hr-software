import test from 'node:test';
import assert from 'node:assert/strict';
import {cardPaymentFields,checkedPayment,checkedUpiUri,paymentSdk} from '../../packages/ui/payment-provider';
test('payment callback must match the stored order and include a verifiable signature',()=>{
 const response={razorpay_payment_id:'pay_Synthetic',razorpay_order_id:'order_Synthetic',razorpay_signature:'a'.repeat(64)};
 assert.equal(checkedPayment(response,'order_Synthetic'),response);
 assert.throws(()=>checkedPayment({...response,razorpay_order_id:'order_Other'},'order_Synthetic'),/did not match/);
 assert.throws(()=>checkedPayment({...response,razorpay_signature:'success'},'order_Synthetic'),/did not match/);
});
test('QR accepts only UPI INR requests with the exact server amount',()=>{
 assert.match(checkedUpiUri('upi://pay?pa=synthetic%40bank&cu=INR&am=100.30',10030),/^upi:\/\/pay/);
 for(const uri of ['https://evil.example/?pa=a&cu=INR&am=100.30','upi://pay?pa=a&cu=INR&am=1','upi://pay?pa=a&cu=USD&am=100.30','upi://pay?cu=INR&am=100.30'])assert.throws(()=>checkedUpiUri(uri,10030));
});
test('only the Custom SDK is loaded, even if a hosted constructor was already present',async()=>{
 const oldWindow=(globalThis as any).window,oldDocument=(globalThis as any).document,urls:string[]=[];
 const Hosted=class{open(){throw new Error('Hosted checkout is forbidden')}},Custom=class{};(globalThis as any).window={Razorpay:Hosted};
 (globalThis as any).document={createElement:()=>({remove(){}}),head:{appendChild(script:any){urls.push(script.src);queueMicrotask(()=>{(globalThis as any).window.Razorpay=Custom;script.onload()})}}};
 try{const [first,second]=await Promise.all([paymentSdk(),paymentSdk()]);assert.equal(first,Custom);assert.equal(second,Custom);assert.equal(await paymentSdk(),Custom);assert.deepEqual(urls,['https://checkout.razorpay.com/v1/razorpay.js']);}finally{(globalThis as any).window=oldWindow;(globalThis as any).document=oldDocument;}
});
test('card fields are validated and shaped only for the direct processor SDK',()=>{
 const card={name:' Synthetic Buyer ',number:'4242 4242 4242 4242',expiry:'12 / 35',cvv:'123'},now=new Date('2026-11-23');
 const result=cardPaymentFields(card,now);assert.equal(result['card[number]'],'4242424242424242');assert.equal(result['card[expiry_year]'],'35');assert.equal(result['card[name]'],'Synthetic Buyer');
 for(const fields of [{number:'0000000000000000'},{number:'4242424242424241'},{expiry:'13 / 35'},{expiry:'10 / 26'},{cvv:'1'},{name:''}])assert.throws(()=>cardPaymentFields({...card,...fields},now));
});
