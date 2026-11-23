import test from 'node:test';
import assert from 'node:assert/strict';
import {checkedPayment,checkedUpiUri,paymentSdk} from '../../packages/ui/payment-provider';
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
test('SDK loader captures separate constructors and serializes shared Razorpay namespace',async()=>{
 const oldWindow=(globalThis as any).window,oldDocument=(globalThis as any).document,urls:string[]=[];
 const Standard=class{},Custom=class{};(globalThis as any).window={};
 (globalThis as any).document={createElement:()=>({remove(){}}),head:{appendChild(script:any){urls.push(script.src);queueMicrotask(()=>{(globalThis as any).window.Razorpay=script.src.endsWith('/razorpay.js')?Custom:Standard;script.onload()})}}};
 try{const [standard,custom]=await Promise.all([paymentSdk('STANDARD'),paymentSdk('CUSTOM')]);assert.equal(standard,Standard);assert.equal(custom,Custom);assert.equal(await paymentSdk('STANDARD'),Standard);assert.equal(urls.length,2);assert.ok(urls[1].endsWith('/razorpay.js'));}finally{(globalThis as any).window=oldWindow;(globalThis as any).document=oldDocument;}
});
