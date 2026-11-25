import nodemailer from 'nodemailer';
const transport=process.env.SMTP_HOST?nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT??1025),secure:process.env.SMTP_SECURE==='true',...(process.env.SMTP_USER?{auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}}:{})}):null;
function escapeHtml(value:any){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch] as string))}
function emailShell(title:string,content:string,cta?:{label:string,url:string}){
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"></head><body style="margin:0;background:#f3f7fb;font-family:Arial,Helvetica,sans-serif;color:#20364d"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f7fb;padding:24px 10px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden;box-shadow:0 16px 44px rgba(31,64,99,.10)"><tr><td style="padding:28px 28px 24px;background:linear-gradient(135deg,#0f63d5,#2c82ed);color:#fff"><div style="font-size:12px;font-weight:700;letter-spacing:.12em;opacity:.8">TECH CYBER WARRIOR</div><div style="font-size:24px;font-weight:800;margin-top:6px">TCW HR Software</div><div style="font-size:13px;opacity:.82;margin-top:4px">Secure HR workspace</div></td></tr><tr><td style="padding:30px 28px"><h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;color:#183b5c">${escapeHtml(title)}</h1>${content}${cta?`<div style="margin-top:24px"><a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#176ee0;color:#fff;text-decoration:none;font-weight:700;font-size:14px">${escapeHtml(cta.label)}</a></div>`:''}<div style="margin-top:28px;padding-top:18px;border-top:1px solid #edf1f5;color:#8795a5;font-size:12px;line-height:1.6">This email was sent by TCW HR Software. For security, never share temporary passwords or reset links with anyone.</div></td></tr></table></td></tr></table></body></html>`;
}
export function buildEmailHtml(payload:any){
  if(payload.type==='TRIAL_CREDENTIALS'){
    const ends=payload.trialEndsAt?new Date(payload.trialEndsAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'';
    const content=`<p style="margin:0 0 18px;color:#60758a;font-size:14px;line-height:1.7">Hi ${escapeHtml(payload.ownerName||'there')}, your TCW HR Software workspace for <strong style="color:#284660">${escapeHtml(payload.company)}</strong> is ready.</p><div style="padding:16px;border:1px solid #dfe7f0;border-radius:14px;background:#f8fbff"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:8px 0;color:#7f8fa0;font-size:12px">Company Code</td><td align="right" style="padding:8px 0;font-weight:800;color:#203b56;font-size:14px">${escapeHtml(payload.companyCode)}</td></tr><tr><td style="padding:8px 0;color:#7f8fa0;font-size:12px;border-top:1px solid #e8eef5">User ID</td><td align="right" style="padding:8px 0;font-weight:800;color:#203b56;font-size:14px;border-top:1px solid #e8eef5">${escapeHtml(payload.loginId)}</td></tr><tr><td style="padding:8px 0;color:#7f8fa0;font-size:12px;border-top:1px solid #e8eef5">Temporary Password</td><td align="right" style="padding:8px 0;font-family:monospace;font-weight:800;color:#0f63d5;font-size:15px;border-top:1px solid #e8eef5">${escapeHtml(payload.tempPassword)}</td></tr></table></div><p style="margin:16px 0 0;color:#60758a;font-size:13px;line-height:1.65">Use the temporary password for your first sign-in. You will then be asked to create your own private password.${ends?` Your ${escapeHtml(payload.trialDays)}-day trial runs until <strong>${escapeHtml(ends)}</strong>.`:''}</p>`;
    return emailShell('Your HR workspace is ready',content,{label:'Open TCW HR Software',url:String(payload.loginUrl??process.env.WEB_URL??'https://hr.techcyberwarrior.in/login')});
  }
  if(payload.type==='EMPLOYEE_LOGIN'){
    const content=`<p style="margin:0 0 18px;color:#60758a;font-size:14px;line-height:1.7">Hi ${escapeHtml(payload.employeeName||'there')}, your employee account for <strong style="color:#284660">${escapeHtml(payload.company||'your company')}</strong> is ready.</p><div style="padding:16px;border:1px solid #dfe7f0;border-radius:14px;background:#f8fbff"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:8px 0;color:#7f8fa0;font-size:12px">Company Code</td><td align="right" style="padding:8px 0;font-weight:800;color:#203b56;font-size:14px">${escapeHtml(payload.companyCode)}</td></tr><tr><td style="padding:8px 0;color:#7f8fa0;font-size:12px;border-top:1px solid #e8eef5">User ID</td><td align="right" style="padding:8px 0;font-weight:800;color:#203b56;font-size:14px">${escapeHtml(payload.loginId)}</td></tr><tr><td style="padding:8px 0;color:#7f8fa0;font-size:12px;border-top:1px solid #e8eef5">Employee ID</td><td align="right" style="padding:8px 0;font-weight:700;color:#203b56;font-size:14px;border-top:1px solid #e8eef5">${escapeHtml(payload.employeeCode)}</td></tr><tr><td style="padding:8px 0;color:#7f8fa0;font-size:12px;border-top:1px solid #e8eef5">Temporary password</td><td align="right" style="padding:8px 0;font-family:monospace;font-weight:800;color:#0f63d5;font-size:15px;border-top:1px solid #e8eef5">${escapeHtml(payload.tempPassword)}</td></tr></table></div><p style="margin:16px 0 0;color:#60758a;font-size:13px;line-height:1.65">For your security, you will create a private password after your first sign-in.</p><div style="margin-top:18px;padding:16px;border:1px solid #e2e8f0;border-radius:14px"><strong style="display:block;color:#203b56;font-size:14px;margin-bottom:8px">Get started on your phone</strong><p style="margin:0;color:#60758a;font-size:13px;line-height:1.65">Open the Employee app link below. On Android, tap <strong>Install app</strong> in your browser. On iPhone, open the link in Safari, tap Share, then <strong>Add to Home Screen</strong>.</p></div><p style="margin:18px 0 0;color:#60758a;font-size:13px;line-height:1.65"><strong>In your employee workspace:</strong> check in and out, review attendance, submit leave requests, view payslips, and update your profile.</p><p style="margin:14px 0 0;font-size:13px"><a href="${escapeHtml(payload.loginUrl)}" style="color:#176ee0">Sign in to your employee workspace</a></p>`;
    return emailShell('Your Employee account is ready',content,{label:'Open / install TCW Employee',url:String(payload.installUrl??payload.loginUrl??'https://employee.techcyberwarrior.in/login')});
  }
  if(payload.type==='SUBSCRIPTION_RECEIPT')return emailShell('Payment received',`<p style="white-space:pre-line">${escapeHtml(payload.text??'')}</p>`,{label:'Open billing & download invoice',url:String(payload.invoiceUrl??'')});
  if(payload.type==='PASSWORD_RESET'){
    const content=`<p style="margin:0;color:#60758a;font-size:14px;line-height:1.7">We received a request to reset your TCW HR Software password. This secure link can be opened once and expires in 10 minutes.</p><p style="margin:16px 0 0;color:#8795a5;font-size:12px;line-height:1.6">If you did not request a password reset, you can ignore this email.</p>`;
    return emailShell('Reset your password',content,{label:'Create new password',url:String(payload.resetUrl??'')});
  }
  const content=`<p style="margin:0;color:#60758a;font-size:14px;line-height:1.7;white-space:pre-line">${escapeHtml(payload.text??'')}</p>`;
  return emailShell(String(payload.subject??'TCW HR Software'),content);
}
export async function sendEmail(payload:any,idempotencyKey?:string){
  const html=buildEmailHtml(payload);
  const resendKey=process.env.RESEND_API_KEY?.trim();
  let resendError='';
  if(resendKey){
    try{
      const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json',...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},body:JSON.stringify({from:process.env.SMTP_FROM??'TCW HR Software <noreply@techcyberwarrior.in>',to:[String(payload.to)],subject:String(payload.subject??'TCW HR Software'),text:String(payload.text??''),html})});
      if(response.ok)return;
      let detail='';try{detail=await response.text()}catch{}
      resendError=`Resend API failed (${response.status})${detail?`: ${detail.slice(0,180)}`:''}`;
    }catch(e:any){resendError=String(e?.message??e??'Resend request failed').slice(0,220)}
  }
  // Never switch providers after an ambiguous API failure: it can duplicate mail.
  if(resendKey)throw new Error(resendError||'Resend delivery failed');
  if(transport){
    try{await transport.sendMail({from:process.env.SMTP_FROM,to:payload.to,subject:payload.subject,text:payload.text,html});return}
    catch(e:any){throw new Error(`${resendError?resendError+'; ':''}SMTP fallback failed: ${String(e?.message??e).slice(0,180)}`)}
  }
  if(resendError)throw new Error(resendError);
  throw new Error('Email provider is not configured');
}
export function redactDeliveredCredential(payload:any,label='[delivered]'){
  const secret=typeof payload?.tempPassword==='string'?payload.tempPassword:'';
  const text=secret&&typeof payload?.text==='string'?payload.text.split(secret).join(label):payload?.text;
  const resetUrl=typeof payload?.resetUrl==='string'?payload.resetUrl:'';
  const safeText=resetUrl&&typeof text==='string'?text.split(resetUrl).join(label):text;
  return {...payload,...(resetUrl?{resetUrl:label}:{}),...(safeText!==undefined?{text:safeText}:{}),delivered:label==='[delivered]',...(secret?{tempPassword:label}:{})};
}
