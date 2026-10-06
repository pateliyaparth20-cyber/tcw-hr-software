'use client';
import {TwoFactorSettings} from './two-factor';
import React,{useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {Plus,Upload,Download,FileText,ShieldCheck,LogOut,Send,Printer,Pencil,Eye,Check,Bell,Trash2,Sparkles,KeyRound,RefreshCw,Search,Clock3,AlertTriangle,Building2,UserCircle,UserRound,Mail,IdCard,Sheet,FileDown,BarChart3,CalendarDays} from 'lucide-react';
import {useApp,useData,api,PageTitle,Table,Modal,PhotoViewer,RecordForm,Confirm,Loading,Failure,Empty,Badge,Avatar,notificationTarget,displayDate,currencyValue} from './core';
import {Row,Field,readable} from './config';
import {avatarInitials} from './avatar';
export {SoftwareUpdatePage} from './software-update';
function PaymentSettingsCard(){
 const q=useData('system/payment-settings');const{session,notify}=useApp();const[upiId,setUpiId]=useState(''),[payeeName,setPayeeName]=useState('TCW HR Software'),[gstPercent,setGstPercent]=useState(18),[saving,setSaving]=useState(false);
 useEffect(()=>{if(q.data){setUpiId(String(q.data.upiId??''));setPayeeName(String(q.data.payeeName??'TCW HR Software'));setGstPercent(Number(q.data.gstPercent??18))}},[q.data]);
 async function save(){setSaving(true);try{await api('system/payment-settings','PUT',{upiId:upiId.trim(),payeeName:payeeName.trim(),gstPercent:Number(gstPercent)},session.csrf);notify('Payment settings saved.');await q.refetch()}catch(e:any){notify(e?.message??'Could not save payment settings.',true)}finally{setSaving(false)}}
 return <section className="panel payment-settings-card"><div className="panel-heading"><div><small>SUBSCRIPTION PAYMENTS</small><h2>UPI receiving account</h2><p>Companies can pay expired subscriptions by QR or any UPI app. GST is calculated automatically. Card payments require a payment gateway.</p></div></div>{q.isLoading?<Loading/>:<div className="payment-settings-grid"><label>UPI ID<input value={upiId} onChange={e=>setUpiId(e.target.value)} placeholder="yourname@bank"/></label><label>Payee name<input value={payeeName} onChange={e=>setPayeeName(e.target.value)} placeholder="TCW HR Software"/></label><label>GST percentage<input type="number" min="0" max="100" step="0.01" value={gstPercent} onChange={e=>setGstPercent(Number(e.target.value))}/></label><div className="payment-settings-note"><ShieldCheck size={17}/><span>Payment is verified by UTR before software access is restored.</span></div><button className="btn primary" disabled={saving||!payeeName.trim()} onClick={save}>{saving?'Saving…':'Save payment settings'}</button></div>}</section>
}
export function PlatformSettingsPage(){return <><PageTitle title="Settings" subtitle="Application preferences and payment receiving details for the Super Admin workspace."/><PaymentSettingsCard/></>;}

export function CompanySettings(){
 const q=useData('company');const{mutate,can,notify}=useApp();const[logo,setLogo]=useState<string|null|undefined>(undefined),[saved,setSaved]=useState(false);
 const fields:Field[]=[{key:'name',label:'Company name',required:true},{key:'legalName',label:'Legal name'},{key:'industry',label:'Industry'},{key:'companyType',label:'Company type',hint:'For example: Private Limited, LLP, Partnership, Proprietorship.'},{key:'registrationNumber',label:'Registration / CIN number'},{key:'foundedYear',label:'Founded year',hint:'Four-digit year, for example 2021.'},{key:'contactPerson',label:'Primary contact person'},{key:'contactDesignation',label:'Contact designation'},{key:'website',label:'Website',type:'url'},{key:'email',label:'Company email',type:'email'},{key:'billingEmail',label:'Billing email',type:'email'},{key:'phone',label:'Phone'},{key:'address',label:'Address',type:'textarea'},{key:'city',label:'City'},{key:'state',label:'State'},{key:'country',label:'Country'},{key:'postalCode',label:'Postal code'},{key:'taxId',label:'GST / Tax ID'},{key:'pan',label:'PAN'},{key:'currency',label:'Currency code',required:true},{key:'timezone',label:'Timezone',required:true},{key:'financialYear',label:'Financial year'},{key:'dateFormat',label:'Date format'},{key:'supportEmail',label:'Support email',type:'email'},{key:'footer',label:'Document footer'},{key:'primaryColor',label:'Brand color',type:'color'},{key:'salaryDay',label:'Monthly salary processing day',type:'number',required:true,default:1,min:1,max:31,hint:'Choose the monthly payroll processing day.'},{key:'autoPayroll',label:'Automatically prepare payroll',type:'checkbox',default:false},{key:'payoutProvider',label:'Salary payout method',type:'select',required:true,default:'NONE',options:['NONE','BANK_FILE','BANK_API','RAZORPAYX'],hint:'Choose per-company payout method. BANK_API requires a supported bank integration configured securely on the server.'},{key:'payoutMode',label:'Default live payout mode',type:'select',required:true,default:'IMPS',options:['IMPS','NEFT','RTGS']},{key:'payoutAccountLabel',label:'Payout account / label',hint:'Enter a clear label for the payout account.'}];
 if(q.isLoading)return <Loading/>;if(q.error)return <Failure error={q.error}/>;
 const company=q.data!;
 return <><div className="company-profile-v2-head"><div><span>ORGANIZATION SETTINGS</span><h1>Company Profile</h1><p>Keep your company identity, business details, payroll preferences and workspace branding in one place.</p></div><div className="company-profile-v2-state"><Badge value={company.status}/><small>{company.plan} plan</small></div></div><div className="company-profile-v2-banner" style={{'--company-accent':company.profile?.primaryColor??'#3474ef'} as React.CSSProperties}><div className="company-profile-v2-logo">{(logo??company.logo)?<img src={logo??company.logo} alt={company.name+' logo'}/>:<span>{String(company.name??'Company').split(/\s+/).filter(Boolean).slice(0,2).map((v:string)=>v[0]?.toUpperCase()).join('')||'CO'}</span>}</div><div><small>YOUR WORKSPACE</small><h2>{company.name}</h2><p>{company.profile?.industry||'HR Management'} · {company.profile?.city||company.profile?.state||'Company workspace'}</p></div><div className="company-profile-v2-code"><span>Company code</span><strong>{company.code}</strong></div></div><div className="panel settings-panel company-profile-panel company-profile-v2-panel company-profile-v2-form-only">{can('company','EDIT')&&<div className="company-summary-logo-actions"><label className="btn secondary small"><Upload size={15}/>{(logo??company.logo)?'Change logo':'Upload logo'}<input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>5*1024*1024){notify('Choose a logo up to 5 MB.',true);return;}const reader=new FileReader();reader.onload=()=>{const data=String(reader.result);const image=new Image();image.onload=()=>{if(image.naturalWidth<256||image.naturalHeight<256){notify('Choose a clearer logo of at least 256 × 256 px.',true);return;}setLogo(data)};image.onerror=()=>notify('The selected logo could not be read.',true);image.src=data};reader.readAsDataURL(file)}}/></label>{(logo??company.logo)&&<button type="button" className="btn secondary small" onClick={()=>setLogo(null)}><Trash2 size={15}/>Remove logo</button>}</div>}<RecordForm fields={fields} initial={{...company,...company.profile,primaryColor:company.profile?.primaryColor??'#3474ef'}} onCancel={()=>{setLogo(undefined);q.refetch()}} submit="Save company profile" onSave={async body=>{if(!can('company','EDIT'))throw new Error('You do not have permission to edit company settings.');const{name,currency,timezone,...profile}=body;await mutate('company','PATCH',{name,currency,timezone,profile,logo:logo===undefined?company.logo:logo});setSaved(true)}}/>{saved&&<p className="saved-note">Company profile saved.</p>}</div></>;
}
export function UsersPage(){
 const q=useData('users'),roles=useData('roles');const{mutate}=useApp();const[edit,setEdit]=useState<Row|null|undefined>(undefined),[roleView,setRoleView]=useState<Row|null>(null),[credentials,setCredentials]=useState<Row|null>(null);
 const adminRoles=(roles.data?.items??[]).filter((r:Row)=>!['EMPLOYEE','MANAGER','TEAM_LEADER'].includes(r.code));
 const fields:Field[]=[{key:'name',label:'Full name',required:true,hint:'Enter the administrator’s full name as it should appear in TCW HR.'},{key:'email',label:'Email address',type:'email',required:true,hint:'Used for account recovery and important notifications.'},{key:'loginId',label:'User ID',hint:'Optional. Leave blank and TCW HR will generate a short ID such as TCW2104.'},{key:'password',label:edit?'New password':'Temporary password',type:'password',required:false,hint:edit?'Optional. Leave blank to keep the current password.':'Optional. Leave blank to generate a secure temporary password.'},{key:'role',label:'Role',type:'select',required:true,options:adminRoles.map((r:Row)=>r.code),hint:'Employee app access is managed from People → Employee App Access.'},{key:'active',label:'Active account',type:'checkbox',default:true,hint:'Turn this off to block sign-in without deleting the user.'}];
 return <><PageTitle title="Users & roles" subtitle="Manage HR and administrator accounts, roles and permissions. Employee app access is managed from People."><button className="btn primary" onClick={()=>setEdit(null)}><Plus size={18}/>Add admin user</button></PageTitle><div className="panel">{q.isLoading?<Loading/>:q.error?<Failure error={q.error}/>:<Table columns={['name','email','loginId','role','active']} rows={q.data?.items??[]} cell={(r,k)=>k==='name'?<div className="person-cell"><Avatar name={r.name} src={r.avatar}/><strong>{r.name}</strong></div>:k==='role'?<button className="text-button" onClick={()=>setRoleView(roles.data?.items?.find((v:Row)=>v.code===r.role.code))}>{r.role.name}</button>:k==='active'?<Badge value={r.active?'ACTIVE':'INACTIVE'}/>:undefined} actions={r=><button className="icon-button" aria-label={'Edit '+r.name} onClick={()=>setEdit({...r,role:r.role.code})}><Pencil size={16}/></button>}/>}</div>{edit!==undefined&&<Modal title={edit?'Edit user':'Add user'} onClose={()=>setEdit(undefined)}><RecordForm fields={fields} initial={edit??undefined} onCancel={()=>setEdit(undefined)} onSave={async body=>{if(!body.password)delete body.password;if(!body.loginId)delete body.loginId;const result=await mutate('users'+(edit?'/'+edit.id:''),edit?'PATCH':'POST',body);setEdit(undefined);if(!edit&&result?.temporaryPassword)setCredentials({name:result.name,email:result.email,loginId:result.loginId,temporaryPassword:result.temporaryPassword})}}/></Modal>}{credentials&&<Modal title="User login created" onClose={()=>setCredentials(null)}><div className="modal-body credential-sheet"><p>Save these temporary credentials now. The password is only shown once.</p><div className="profile-grid"><div><span>User</span><strong>{credentials.name}</strong></div><div><span>User ID</span><strong>{credentials.loginId}</strong></div><div><span>Email</span><strong>{credentials.email}</strong></div><div><span>Temporary password</span><strong className="mono-secret">{credentials.temporaryPassword}</strong></div></div><button className="btn primary" type="button" onClick={()=>navigator.clipboard?.writeText(`User ID: ${credentials.loginId}\nTemporary Password: ${credentials.temporaryPassword}\nEmail: ${credentials.email}`)}>Copy login details</button></div></Modal>}{roleView&&<Modal title={roleView.name+' permissions'} onClose={()=>setRoleView(null)}><div className="modal-body permissions-grid">{roleView.permissions.map((p:string)=><span key={p}><Check size={14}/>{readable(p.replace(':',' · '))}</span>)}</div></Modal>}</>;
}

function ProfilePhotoEditor({value,name,onChange,notify,showPreview=true}:{value?:string|null;name:string;onChange:(value:string|null)=>void;notify:(message:string,error?:boolean)=>void;showPreview?:boolean}){
 const[open,setOpen]=useState(false),[source,setSource]=useState(''),[zoom,setZoom]=useState(1),[x,setX]=useState(0),[y,setY]=useState(0);
 function choose(file?:File){
  if(!file)return;
  if(!['image/png','image/jpeg'].includes(file.type)){notify('Only PNG, JPG or JPEG profile photos are allowed.',true);return;}
  if(file.size>5*1024*1024){notify('Choose a profile photo up to 5 MB.',true);return;}
  const reader=new FileReader();
  reader.onload=()=>{
   const data=String(reader.result??'');const image=new Image();
   image.onload=()=>{if(image.naturalWidth<256||image.naturalHeight<256){notify('Choose a clearer photo of at least 256 × 256 px. 512 × 512 px or larger is recommended.',true);return;}setSource(data);setZoom(1);setX(0);setY(0);setOpen(true)};
   image.onerror=()=>notify('The selected photo could not be read on this device. Choose another image.',true);
   image.src=data;
  };
  reader.readAsDataURL(file);
 }
 function applyCrop(){
  if(!source)return;
  const image=new Image();
  image.onload=()=>{
   const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
   const ctx=canvas.getContext('2d');if(!ctx){notify('Unable to crop this photo.',true);return;}
   const base=Math.min(image.naturalWidth,image.naturalHeight),crop=base/zoom;
   const maxX=Math.max(0,(image.naturalWidth-crop)/2),maxY=Math.max(0,(image.naturalHeight-crop)/2);
   const centerX=image.naturalWidth/2+(x/100)*maxX,centerY=image.naturalHeight/2+(y/100)*maxY;
   const sx=Math.max(0,Math.min(image.naturalWidth-crop,centerX-crop/2)),sy=Math.max(0,Math.min(image.naturalHeight-crop,centerY-crop/2));
   ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,sx,sy,crop,crop,0,0,512,512);
   onChange(canvas.toDataURL('image/jpeg',.92));setOpen(false);
  };
  image.src=source;
 }
 const initials=avatarInitials(name);
 return <>
  <div className={'profile-photo-editor '+(!showPreview?'profile-photo-actions-only':'')}>
   {showPreview&&<div className="profile-photo-preview">{value?<img src={value} alt={name+' profile photo'}/>:<span>{initials}</span>}</div>}
   <div className="profile-photo-copy">{showPreview&&<><strong>Profile photo</strong><p>Choose and adjust your photo inside the round frame.</p></>}<div className="profile-photo-buttons"><label className="btn secondary small"><Upload size={15}/>{value?'Change photo':'Upload photo'}<input className="sr-only" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={e=>{choose(e.target.files?.[0]);e.currentTarget.value=''}}/></label>{value&&<button type="button" className="btn secondary small" onClick={()=>onChange(null)}><Trash2 size={15}/>Remove photo</button>}</div></div>
  </div>
  {open&&<Modal title="Adjust profile photo" onClose={()=>setOpen(false)}>
   <div className="profile-crop-modal">
    <div className="profile-crop-stage"><div className="profile-crop-circle"><img src={source} alt="Crop preview" style={{transform:`translate(${x*.18}%, ${y*.18}%) scale(${zoom})`}}/></div></div>
    <div className="profile-crop-controls"><label><span>Zoom</span><input type="range" min="1" max="3" step=".01" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label><label><span>Horizontal</span><input type="range" min="-100" max="100" value={x} onChange={e=>setX(Number(e.target.value))}/></label><label><span>Vertical</span><input type="range" min="-100" max="100" value={y} onChange={e=>setY(Number(e.target.value))}/></label></div>
    <div className="profile-crop-actions"><button type="button" className="btn secondary" onClick={()=>setOpen(false)}>Cancel</button><button type="button" className="btn primary" onClick={applyCrop}><Check size={16}/>Use photo</button></div>
   </div>
  </Modal>}
 </>;
}

export function MyProfilePage(){
 const profile=useData('auth/profile');const{session,notify}=useApp();
 const[form,setForm]=useState<Row>({name:'',email:'',avatar:null}),[saving,setSaving]=useState(false),[photoPreview,setPhotoPreview]=useState(false);
 useEffect(()=>{if(profile.data?.user)setForm({name:profile.data.user.name??'',email:profile.data.user.email??'',avatar:profile.data.user.avatar??null})},[profile.data]);
 async function save(e:React.FormEvent){e.preventDefault();setSaving(true);try{await api('auth/profile','PATCH',{name:form.name,email:form.email,avatar:form.avatar??null},session.csrf);await profile.refetch();notify('Profile saved.');setTimeout(()=>window.location.reload(),300)}catch(e:any){notify(e.message,true)}finally{setSaving(false)}}
 if(profile.isLoading)return <Loading/>;if(profile.error)return <Failure error={profile.error}/>;
 const user=profile.data?.user??session.user,employee=profile.data?.employee;
 return <><PageTitle title="My profile" subtitle="Manage your account identity and profile photo."/>
  <div className="my-profile-layout single-profile-layout">
   <section className="panel my-profile-card">
    <div className="my-profile-cover"/>
    <div className="my-profile-main">
     <div className={'my-profile-photo '+(form.avatar?'clickable':'')} role={form.avatar?'button':undefined} tabIndex={form.avatar?0:undefined} aria-label={form.avatar?'Open profile photo':undefined} onClick={()=>form.avatar&&setPhotoPreview(true)} onKeyDown={e=>{if(form.avatar&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setPhotoPreview(true)}}}>{form.avatar?<img src={form.avatar} alt={form.name+' profile photo'}/>:<span>{avatarInitials(form.name||user.name)}</span>}</div>
     <div className="my-profile-identity"><h2>{form.name||user.name}</h2><p>{user.role==='COMPANY_OWNER'?'HR Admin':user.roleName}</p><div><Badge value={employee?.status??'ACTIVE'}/><span>{user.loginId??user.email}</span></div></div>
    </div>
    <form onSubmit={save} className="my-profile-form">
     <ProfilePhotoEditor value={form.avatar} name={form.name||user.name} onChange={avatar=>setForm(v=>({...v,avatar}))} notify={notify} showPreview={false}/>
     <div className="platform-profile-fields">
      <label><span>Full name</span><div className="profile-field-control"><UserRound size={19}/><input required value={form.name??''} onChange={e=>setForm(v=>({...v,name:e.target.value}))}/></div></label>
      <label><span>Email address</span><div className="profile-field-control"><Mail size={19}/><input type="email" required value={form.email??''} onChange={e=>setForm(v=>({...v,email:e.target.value}))}/></div></label>
      <label><span>User ID</span><div className="profile-field-control readonly"><IdCard size={19}/><input value={user.loginId??''} readOnly/></div></label>
      <label><span>Role</span><div className="profile-field-control readonly"><ShieldCheck size={19}/><input value={user.role==='COMPANY_OWNER'?'HR Admin':(user.roleName??'')} readOnly/></div></label>
     </div>
     <div className="form-actions-end profile-actions-end"><button className="btn primary" disabled={saving}>{saving?'Saving…':'Save profile changes'}</button></div>
    </form>
    {photoPreview&&form.avatar&&<PhotoViewer src={form.avatar} name={form.name||user.name} onClose={()=>setPhotoPreview(false)}/>} 
    {user.role==='EMPLOYEE'&&employee&&<section className="employee-profile-details">
     <div className="employee-profile-details-head"><div><small>EMPLOYEE INFORMATION</small><h3>Your work profile</h3><p>Employment details are maintained by your HR team.</p></div><Badge value={employee.status??'ACTIVE'}/></div>
     <div className="employee-profile-detail-grid">
      <div><span>Employee ID</span><strong>{employee.employeeCode||'—'}</strong></div>
      <div><span>Phone</span><strong>{employee.phone||'—'}</strong></div>
      <div><span>Department</span><strong>{employee.departmentName||'—'}</strong></div>
      <div><span>Designation</span><strong>{employee.designation||'—'}</strong></div>
      <div><span>Branch</span><strong>{employee.branchName||'—'}</strong><small>{[employee.branchLocation,employee.branchCity].filter(Boolean).join(' · ')}</small></div>
      <div><span>Employment type</span><strong>{readable(String(employee.employmentType??'').toLowerCase())||'—'}</strong></div>
      <div><span>Joining date</span><strong>{employee.joiningDate?new Date(employee.joiningDate).toLocaleDateString('en-IN'):'—'}</strong></div>
      <div><span>Shift</span><strong>{employee.shiftName||(employee.personal as any)?.shiftName||'—'}</strong></div>
     </div>
    </section>}
   </section>
  </div>
 </>;
}

export function PlatformProfilePage(){
 const company=useData('system/platform-profile'),account=useData('auth/profile');const{session,notify}=useApp();
 const[companyForm,setCompanyForm]=useState<Row>({}),[accountForm,setAccountForm]=useState<Row>({}),[logo,setLogo]=useState<string|null|undefined>(undefined),[savingCompany,setSavingCompany]=useState(false),[savingAccount,setSavingAccount]=useState(false),[adminPhotoPreview,setAdminPhotoPreview]=useState(false);
 useEffect(()=>{if(company.data)setCompanyForm({companyName:company.data.companyName??'Tech Cyber Warrior',legalName:company.data.legalName??'',companyType:company.data.companyType??'',registrationNumber:company.data.registrationNumber??'',foundedYear:company.data.foundedYear??'',contactPerson:company.data.contactPerson??'',contactDesignation:company.data.contactDesignation??'',billingEmail:company.data.billingEmail??'',email:company.data.email??'',phone:company.data.phone??'',website:company.data.website??'',address:company.data.address??'',city:company.data.city??'',state:company.data.state??'',country:company.data.country??'',postalCode:company.data.postalCode??'',taxId:company.data.taxId??'',pan:company.data.pan??'',supportEmail:company.data.supportEmail??''})},[company.data]);
 useEffect(()=>{if(account.data?.user)setAccountForm({name:account.data.user.name??'',email:account.data.user.email??'',avatar:account.data.user.avatar??null})},[account.data]);
 const currentLogo=logo===undefined?(company.data?.logo??'/tcw-logo.png'):logo;
 async function saveCompany(e:React.FormEvent){e.preventDefault();setSavingCompany(true);try{await api('system/platform-profile','PUT',{...companyForm,logo:currentLogo},session.csrf);setLogo(undefined);await company.refetch();notify('Super Admin company profile saved.')}catch(e:any){notify(e.message,true)}finally{setSavingCompany(false)}}
 async function saveAccount(e:React.FormEvent){e.preventDefault();setSavingAccount(true);try{await api('auth/profile','PATCH',{name:accountForm.name,email:accountForm.email,avatar:accountForm.avatar??null},session.csrf);await account.refetch();notify('Super Admin profile saved.');setTimeout(()=>window.location.reload(),350)}catch(e:any){notify(e.message,true)}finally{setSavingAccount(false)}}
 function updateCompany(key:string,value:any){setCompanyForm(v=>({...v,[key]:value}))}
 return <><PageTitle title="Company & admin profile" subtitle="Manage Tech Cyber Warrior platform identity and your Super Admin account. Customer company profiles are not changed from this page."/>
 <div className="platform-profile-grid">
  <section className="panel platform-company-profile"><div className="panel-heading"><div><h2>Tech Cyber Warrior company profile</h2><p>Main company details used for the Super Admin platform identity.</p></div><Building2 size={21}/></div>
   {company.isLoading?<Loading/>:company.error?<Failure error={company.error}/>:<form onSubmit={saveCompany}>
    <div className="platform-profile-logo"><div className="platform-profile-logo-preview">{currentLogo?<img src={currentLogo} alt="Tech Cyber Warrior logo"/>:<span>TCW</span>}</div><div><strong>Main company logo</strong><p>This logo is used across the HR and Super Admin product branding. Use a clear PNG or JPEG, ideally 512 × 512 px or larger.</p><div className="platform-profile-logo-actions"><label className="btn secondary small"><Upload size={15}/>Change logo<input className="sr-only" type="file" accept="image/png,image/jpeg" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>5*1024*1024){notify('Choose a PNG or JPEG logo up to 5 MB.',true);return;}const reader=new FileReader();reader.onload=()=>setLogo(String(reader.result));reader.readAsDataURL(file)}}/></label><button type="button" className="btn secondary small" onClick={()=>setLogo('/tcw-logo.png')}><RefreshCw size={15}/>Reset logo</button></div></div></div>
    <div className="platform-profile-fields">
     <label><span>Company name</span><input required value={companyForm.companyName??''} onChange={e=>updateCompany('companyName',e.target.value)}/></label>
     <label><span>Legal name</span><input value={companyForm.legalName??''} onChange={e=>updateCompany('legalName',e.target.value)}/></label>
     <label><span>Company type</span><input value={companyForm.companyType??''} onChange={e=>updateCompany('companyType',e.target.value)} placeholder="Private Limited / LLP / Partnership"/></label>
     <label><span>Registration / CIN number</span><input value={companyForm.registrationNumber??''} onChange={e=>updateCompany('registrationNumber',e.target.value)}/></label>
     <label><span>Founded year</span><input inputMode="numeric" maxLength={4} value={companyForm.foundedYear??''} onChange={e=>updateCompany('foundedYear',e.target.value.replace(/\D/g,'').slice(0,4))}/></label>
     <label><span>Primary contact person</span><input value={companyForm.contactPerson??''} onChange={e=>updateCompany('contactPerson',e.target.value)}/></label>
     <label><span>Contact designation</span><input value={companyForm.contactDesignation??''} onChange={e=>updateCompany('contactDesignation',e.target.value)}/></label>
     <label><span>Company email</span><input type="email" value={companyForm.email??''} onChange={e=>updateCompany('email',e.target.value)}/></label>
     <label><span>Phone</span><input value={companyForm.phone??''} onChange={e=>updateCompany('phone',e.target.value)}/></label>
     <label><span>Website</span><input type="url" value={companyForm.website??''} onChange={e=>updateCompany('website',e.target.value)}/></label>
     <label><span>Support email</span><input type="email" value={companyForm.supportEmail??''} onChange={e=>updateCompany('supportEmail',e.target.value)}/></label>
     <label><span>Billing email</span><input type="email" value={companyForm.billingEmail??''} onChange={e=>updateCompany('billingEmail',e.target.value)}/></label>
     <label className="span-two"><span>Address</span><textarea rows={3} value={companyForm.address??''} onChange={e=>updateCompany('address',e.target.value)}/></label>
     <label><span>City</span><input value={companyForm.city??''} onChange={e=>updateCompany('city',e.target.value)}/></label>
     <label><span>State</span><input value={companyForm.state??''} onChange={e=>updateCompany('state',e.target.value)}/></label>
     <label><span>Country</span><input value={companyForm.country??''} onChange={e=>updateCompany('country',e.target.value)}/></label>
     <label><span>Postal code</span><input value={companyForm.postalCode??''} onChange={e=>updateCompany('postalCode',e.target.value)}/></label>
     <label><span>GST / Tax ID</span><input value={companyForm.taxId??''} onChange={e=>updateCompany('taxId',e.target.value)}/></label>
     <label><span>PAN</span><input value={companyForm.pan??''} onChange={e=>updateCompany('pan',e.target.value)}/></label>
    </div>
    <div className="form-footer"><button className="btn primary" disabled={savingCompany}>{savingCompany?'Saving…':'Save company profile'}</button></div>
   </form>}
  </section>
  <section className="panel platform-admin-profile"><div className="panel-heading"><div><h2>Super Admin profile</h2><p>Your own platform administrator identity.</p></div><UserCircle size={21}/></div>
   {account.isLoading?<Loading/>:account.error?<Failure error={account.error}/>:<form onSubmit={saveAccount}><div className="platform-admin-card"><div className={'platform-admin-avatar '+(accountForm.avatar?'clickable':'')} role={accountForm.avatar?'button':undefined} tabIndex={accountForm.avatar?0:undefined} aria-label={accountForm.avatar?'Open Super Admin photo':undefined} onClick={()=>accountForm.avatar&&setAdminPhotoPreview(true)} onKeyDown={e=>{if(accountForm.avatar&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setAdminPhotoPreview(true)}}}>{accountForm.avatar?<img src={accountForm.avatar} alt="Super Admin profile"/>:<span>{avatarInitials(accountForm.name||'Super Admin')}</span>}</div><div><strong>{accountForm.name||'Super Admin'}</strong><small>{session.user.loginId??session.user.email} · {session.user.roleName}</small></div></div><ProfilePhotoEditor value={accountForm.avatar} name={accountForm.name||'Super Admin'} onChange={avatar=>setAccountForm(v=>({...v,avatar}))} notify={notify} showPreview={false}/><div className="platform-profile-fields single"><label><span>Full name</span><input required value={accountForm.name??''} onChange={e=>setAccountForm(v=>({...v,name:e.target.value}))}/></label><label><span>Email address</span><input type="email" required value={accountForm.email??''} onChange={e=>setAccountForm(v=>({...v,email:e.target.value}))}/></label></div><div className="form-footer"><a className="btn secondary" href="/security">Password & sessions</a><button className="btn primary" disabled={savingAccount}>{savingAccount?'Saving…':'Save admin profile'}</button></div></form>}
  </section>
 </div>
 {adminPhotoPreview&&accountForm.avatar&&<PhotoViewer src={accountForm.avatar} name={accountForm.name||'Super Admin'} onClose={()=>setAdminPhotoPreview(false)}/>}
 </>;
}
export function SecurityPage(){
 const{mutate,session}=useApp();const q=useData('auth/sessions');const[revoke,setRevoke]=useState<Row|null>(null),[formKey,setFormKey]=useState(0);
 return <><TwoFactorSettings/><PageTitle title="My security" subtitle="Manage your password and signed-in sessions."/><div className="settings-grid"><section className="panel"><div className="panel-heading"><h2>Change password</h2><ShieldCheck size={20}/></div><RecordForm key={formKey} fields={[{key:'currentPassword',label:'Current password',type:'password',required:true},{key:'password',label:'New password',type:'password',required:true,hint:'At least 8 characters with uppercase, lowercase, number and symbol.'}]} onCancel={()=>setFormKey(v=>v+1)} onSave={async body=>{await mutate('auth/change-password','POST',body);window.location.assign(session.user.scope==='PLATFORM'?'/admin-login':'/login')}} submit="Change password"/></section><section className="panel"><div className="panel-heading"><h2>Active sessions</h2></div>{q.isLoading?<Loading/>:q.error?<Failure error={q.error}/>:q.data?.items?.map((r:Row)=><div className="session-row" key={r.id}><div><strong>{r.userAgent.slice(0,90)||'Unknown device'}</strong><small>{r.ip} · {displayDate(r.createdAt)}</small>{r.id===q.data?.currentId&&<Badge value="CURRENT"/>}</div><button className="icon-button" title="Revoke session" aria-label="Revoke session" onClick={()=>setRevoke(r)}><LogOut size={18}/></button></div>)}</section></div>{revoke&&<Confirm title="Revoke this session?" description="This device will need to sign in again." onClose={()=>setRevoke(null)} onConfirm={async()=>{await mutate('auth/sessions/'+revoke.id,'DELETE');if(revoke.id===q.data?.currentId)window.location.assign(session.user.scope==='PLATFORM'?'/admin-login':'/login')}}/>}</>;
}
export function DocumentsPage(){
 const q=useData('documents');const{can,mutate}=useApp();const[open,setOpen]=useState(false),[file,setFile]=useState<File|null>(null);
 return <><PageTitle title="Document center" subtitle="Secure company and employee documents in one place.">{can('documents','CREATE')&&<button className="btn primary" onClick={()=>setOpen(true)}><Upload size={17}/>Upload document</button>}</PageTitle><div className="panel">{q.isLoading?<Loading/>:q.error?<Failure error={q.error}/>:q.data?.items?.length?<Table columns={['title','category','fileName','size','expiresAt','createdAt']} rows={q.data.items} cell={(r,k)=>k==='size'?`${(r.size/1024).toFixed(1)} KB`:k==='createdAt'?displayDate(r.createdAt):k==='expiresAt'?r.expiresAt?<span className={new Date(r.expiresAt)<new Date()?'hr-error':''}>{displayDate(r.expiresAt)}</span>:'No expiry':undefined} actions={r=><a className="icon-button" href={'/api/documents/'+r.id} aria-label={'Download '+r.title}><Download size={17}/></a>}/>:<Empty title="A home for your documents" description="Upload PDF, PNG, or JPEG files up to 10 MB."/>}</div>{open&&<Modal title="Upload document" onClose={()=>setOpen(false)}><div className="modal-body upload-zone"><FileText size={28}/><label>Choose PDF, PNG, or JPEG<input type="file" accept="application/pdf,image/png,image/jpeg" onChange={e=>setFile(e.target.files?.[0]??null)}/></label></div><RecordForm fields={[{key:'title',label:'Document title',required:true},{key:'category',label:'Category',required:true},{key:'expiresAt',label:'Expiry date (optional)',type:'date'},{key:'employeeId',label:'Employee (optional)',type:'select',source:'employees',required:false}]} onCancel={()=>setOpen(false)} onSave={async body=>{if(!file)throw new Error('Choose a file to upload.');const form=new FormData();form.append('file',file);Object.entries(body).forEach(([k,v])=>{if(v)form.append(k,String(v))});await mutate('documents','POST',form);setOpen(false);setFile(null)}} submit="Upload document"/></Modal>}</>;
}
export function ReportsPage(){
 const{can}=useApp();const[departmentId,setDepartmentId]=useState(''),[branchId,setBranchId]=useState('');const departments=useData('departments',can('organization')),branches=useData('branches',can('organization'));const[preview,setPreview]=useState<string|null>(null),[from,setFrom]=useState(new Date(Date.now()-30*86400000).toISOString().slice(0,10)),[to,setTo]=useState(new Date().toISOString().slice(0,10));
 const reports=[
  {name:'employees',label:'Employee directory',resource:'employees',description:'Employee codes, contact and employment records.'},
  {name:'attendance',label:'Attendance records',resource:'attendance',description:'Attendance status, work time, overtime and exceptions.'},
  {name:'leave',label:'Time off & leave',resource:'leave',description:'Leave requests, dates, days and approval status.'},
  {name:'payroll-items',label:'Employee payroll',resource:'payroll',description:'Per-employee gross, deductions, net and overtime by payroll month.'},
  {name:'payroll',label:'Payroll runs',resource:'payroll',description:'Payroll run status, month and payroll totals.'},
  {name:'expenses',label:'Expense claims',resource:'expenses',description:'Employee expense claims and approval status.'},
  {name:'assets',label:'Asset inventory',resource:'assets',description:'Assigned assets, serials, ownership and status.'},
  {name:'goals',label:'Performance goals',resource:'performance',description:'Goals, targets, progress and completion status.'},
  {name:'candidates',label:'Recruitment pipeline',resource:'recruitment',description:'Candidate pipeline and current recruitment stage.'}
 ];
 const allowed=reports.filter(r=>can(r.resource,'EXPORT'));
 const filters=new URLSearchParams({from,to,departmentId,branchId});
 const q=useData(preview===null?'':`reports/${preview}?preview=true&${filters}`,!!preview);
 const href=(name:string,format:'csv'|'xlsx'|'pdf')=>{
  const params=new URLSearchParams({format});
  for(const [key,value] of filters)if(value)params.set(key,value);
  return `/api/reports/${name}?${params.toString()}`;
 };
 const active=reports.find(r=>r.name===preview);
 return <div className="reports-v2">
  <PageTitle title="Reports & analytics" subtitle="Preview authorized HR data and download real PDF, Excel or CSV files."/>
  <section className="reports-v2-summary">
   <article><span className="reports-v2-summary-icon"><BarChart3 size={21}/></span><div><small>Available reports</small><strong>{allowed.length}</strong><p>Based on your export permissions</p></div></article>
   <article><span className="reports-v2-summary-icon"><FileDown size={21}/></span><div><small>Export formats</small><strong>3</strong><p>PDF · Excel · CSV</p></div></article>
   <article><span className="reports-v2-summary-icon"><ShieldCheck size={21}/></span><div><small>File integrity</small><strong>Native</strong><p>Correct file type and extension</p></div></article>
  </section>

  <section className="panel reports-v2-range">
   <div className="reports-v2-range-copy"><span><CalendarDays size={20}/></span><div><h2>Report filters</h2><p>Dates filter attendance, leave overlap, expenses, goal due dates, recruitment creation and payroll months. Employee directory and asset inventory show current assignments.</p></div></div>
   <div className="reports-v2-range-fields">
    <label><span>From</span><input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label>
    <label><span>To</span><input type="date" value={to} min={from} onChange={e=>setTo(e.target.value)}/></label><label><span>Department</span><select value={departmentId} onChange={e=>setDepartmentId(e.target.value)}><option value="">All departments</option>{departments.data?.items?.map((r:Row)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label><span>Branch</span><select value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">All branches</option>{branches.data?.items?.map((r:Row)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
   </div>
  </section>

  <div className="reports-v2-grid">
   {allowed.map(report=><section className="panel reports-v2-card" key={report.name}>
    <div className="reports-v2-card-head"><span className="reports-v2-card-icon"><FileText size={22}/></span><span className="reports-v2-ready">READY</span></div>
    <h2>{report.label}</h2>
    <p>{report.description}</p>
    <div className="reports-v2-meta"><span>{report.name==='attendance'?from+' → '+to:'Current authorized records'}</span></div>
    <div className="reports-v2-card-actions">
     <button type="button" className="btn secondary reports-v2-preview" onClick={()=>setPreview(report.name)}><Eye size={17}/>Preview</button>
     <div className="reports-v2-export-actions">
      <a className="reports-v2-format csv" href={href(report.name,'csv')} download><FileText size={16}/><span><strong>CSV</strong><small>.csv</small></span></a>
      <a className="reports-v2-format excel" href={href(report.name,'xlsx')} download><Sheet size={16}/><span><strong>Excel</strong><small>.xlsx</small></span></a>
      <a className="reports-v2-format pdf" href={href(report.name,'pdf')} download><FileDown size={16}/><span><strong>PDF</strong><small>.pdf</small></span></a>
     </div>
    </div>
   </section>)}
  </div>

  {!allowed.length&&<Empty title="No report exports available" description="Your current role does not have export permission for these reports."/>}

  {preview&&<Modal title={(active?.label??readable(preview))+' preview'} onClose={()=>setPreview(null)} wide>
   <div className="modal-body reports-v2-preview-modal">
    <div className="reports-v2-preview-top">
     <div><strong>Report preview</strong><p>Showing up to the first 25 records. Downloads include the full authorized export result.</p></div>
     <div className="reports-v2-preview-downloads">
      <a className="btn secondary small" href={href(preview,'csv')} download><FileText size={16}/>CSV</a>
      <a className="btn secondary small" href={href(preview,'xlsx')} download><Sheet size={16}/>Excel</a>
      <a className="btn primary small" href={href(preview,'pdf')} download><FileDown size={16}/>PDF</a>
     </div>
    </div>
    {q.isLoading?<Loading/>:q.error?<Failure error={q.error}/>:q.data?.items?.length?<div className="reports-v2-preview-table"><Table rows={q.data.items.slice(0,25)} columns={Object.keys(q.data.items[0]).filter(k=>!['tenantId','personal','items','passwordHash','updatedAt'].includes(k)).slice(0,8)} cell={(r,k)=>typeof r[k]==='object'?JSON.stringify(r[k]):String(r[k]??'—')}/></div>:<Empty title="No report data" description="There are no authorized records for the current report selection."/>}
   </div>
  </Modal>}
 </div>;
}
export function AuditPage(){const q=useData('audit');return <><PageTitle title="Audit trail" subtitle="A record of important changes and sign-in events. Latest 200 events."/><div className="panel">{q.isLoading?<Loading/>:q.error?<Failure error={q.error}/>:q.data?.items?.length?<Table columns={['action','entity','actorId','ip','createdAt']} rows={q.data.items} cell={(r,k)=>k==='action'?readable(r.action.toLowerCase()):k==='createdAt'?new Date(r.createdAt).toLocaleString('en-IN'):undefined}/>:<Empty title="No events recorded"/>}</div></>}
export function SystemPage(){
 const q=useData('system'),companies=useData('platform/companies');const{session,notify}=useApp();
 const[updateForm,setUpdateForm]=useState({tenantId:'',title:'',message:''}),[updateSending,setUpdateSending]=useState(false);
 async function sendCompanyUpdate(e:React.FormEvent){e.preventDefault();setUpdateSending(true);try{const r=await api('system/company-update','POST',updateForm,session.csrf);notify(`Update sent to ${r.company.name}.`);setUpdateForm({tenantId:'',title:'',message:''})}catch(e:any){notify(e.message,true)}finally{setUpdateSending(false)}}
 return <><PageTitle title="System health" subtitle="Monitor platform services and send operational updates to customer companies."/>
 {q.isLoading?<Loading/>:q.error?<Failure error={q.error}/>:<div className="record-cards system-health-cards">{Object.entries(q.data??{}).map(([k,v])=><div className="panel report-card" key={k}><h2>{readable(k)}</h2>{typeof v==='string'?<Badge value={v}/>:<strong className="large-number">{String(v)}</strong>}</div>)}</div>}
 <section className="panel company-update-panel"><div className="panel-heading"><div><h2>Send company update</h2><p>Publish a targeted announcement to one customer company. It appears in that company’s Notification center for all users.</p></div><Send size={21}/></div><form className="company-update-form" onSubmit={sendCompanyUpdate}><label><span>Company</span><select required value={updateForm.tenantId} onChange={e=>setUpdateForm({...updateForm,tenantId:e.target.value})}><option value="">Select company</option>{(companies.data?.items??[]).map((r:Row)=><option key={r.id} value={r.id}>{r.name} · {r.code}</option>)}</select></label><label><span>Update title</span><input required maxLength={160} value={updateForm.title} onChange={e=>setUpdateForm({...updateForm,title:e.target.value})} placeholder="Example: Payroll module update"/></label><label className="span-two"><span>Message</span><textarea required maxLength={2000} rows={5} value={updateForm.message} onChange={e=>setUpdateForm({...updateForm,message:e.target.value})} placeholder="Write the update that company users should see."/></label><div className="form-footer span-two"><button className="btn primary" disabled={updateSending||!updateForm.tenantId}>{updateSending?'Sending…':'Send update to company'}<Send size={16}/></button></div></form></section></>;
}
export function NotificationsPage(){
 const q=useData('notifications');const{session}=useApp();const router=useRouter();const rows:Row[]=q.data?.items??[];
 useEffect(()=>{if(!q.data||!rows.some(r=>!r.readAt))return;let active=true;(async()=>{try{await api('notifications/all','PATCH',{},session.csrf);if(active)await q.refetch()}catch{}})();return()=>{active=false}},[q.data,session.csrf]);
 const openNotice=(r:Row)=>router.push(notificationTarget(r));
 return <><PageTitle title="Notifications" subtitle="Tap a notification to open the related workspace."/><section className="panel notification-center simple-notification-center">{q.isLoading?<Loading/>:q.error?<Failure error={q.error}/>:rows.length?<div className="notification-timeline">{rows.map(r=><article className="notification-row notification-row-link" role="button" tabIndex={0} key={r.id} onClick={()=>openNotice(r)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openNotice(r)}}}><span className="notification-icon"><Bell size={18}/></span><div className="grow"><div className="row-between"><strong>{r.title}</strong><small><Clock3 size={13}/>{new Date(r.createdAt).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}</small></div><p>{r.message}</p></div></article>)}</div>:<Empty title="No notifications" description="New HR and system notifications will appear here."/ >}</section></>
}
export function AIPage(){
 const{session}=useApp();const status=useData('ai/status');const[question,setQuestion]=useState(''),[messages,setMessages]=useState<Row[]>([]),[busy,setBusy]=useState(false);
 const suggestions=['Summarize attendance exceptions this week','What should HR review before payroll?','Summarize current leave activity','Give me a concise workforce overview'];
 async function ask(text:string){if(!text.trim()||busy)return;const prompt=text.trim(),history=messages.filter(m=>m.role==='user'||m.role==='assistant').slice(-10).map(m=>({role:m.role,text:String(m.text??'')}));setQuestion('');setBusy(true);setMessages(m=>[...m,{role:'user',text:prompt}]);try{const r=await api('ai','POST',{question:prompt,history},session.csrf);setMessages(m=>[...m,{role:'assistant',text:r.answer,model:r.model}])}catch(e:any){setMessages(m=>[...m,{role:'error',text:e.message}])}finally{setBusy(false)}}
 async function send(e:React.FormEvent){e.preventDefault();await ask(question)}
 return <><PageTitle title="TCW HR AI assistant" subtitle="Ask questions about the HR information available to your role."><span className={'ai-ready-chip '+(status.data?.configured?'ready':'')}>{status.data?.configured?'Available':'Unavailable'}</span></PageTitle><div className="ai-workspace"><aside className="panel ai-prompt-panel"><div className="ai-orb"><Sparkles size={28}/></div><h2>Start with a useful question</h2><p>The assistant can summarize attendance, leave and workforce signals visible to your role.</p><div className="ai-suggestions">{suggestions.map(v=><button key={v} disabled={!status.data?.configured||busy} onClick={()=>ask(v)}>{v}</button>)}</div><small>{status.data?.configured?'Ready to help with your HR workspace.':'The AI assistant is currently unavailable.'}</small></aside><div className="panel chat-panel ai-chat-panel"><div className="ai-chat-head"><span className="ai-chat-avatar"><Sparkles size={18}/></span><div><strong>TCW HR Copilot</strong><small>{status.data?.configured?'Available':'Unavailable'}</small></div>{messages.length>0&&<button type="button" className="btn secondary small" onClick={()=>setMessages([])}>New chat</button>}</div><div className="chat-messages">{!messages.length&&<div className="ai-empty-state"><span className="ai-empty-orb"><Sparkles size={25}/></span><h3>{status.data?.configured?'How can I help HR today?':'AI is currently unavailable'}</h3><p>{status.data?.configured?'Ask a specific question. Follow-up questions keep the recent conversation context.':'The assistant becomes available after the Super Admin saves and tests an AI provider.'}</p>{status.data?.configured&&<div className="ai-inline-suggestions">{suggestions.slice(0,3).map(v=><button type="button" key={v} onClick={()=>ask(v)}>{v}</button>)}</div>}</div>} {messages.map((m,i)=><div className={'chat-message '+m.role} key={i}><div className="chat-message-head"><span>{m.role==='user'?'You':m.role==='error'?'!':'AI'}</span><strong>{m.role==='user'?'You':m.role==='error'?'Service status':'TCW HR Copilot'}</strong></div><p>{m.text}</p>{m.model&&<small>{m.model}</small>}</div>)}{busy&&<div className="ai-thinking"><span/><span/><span/><small>Reviewing authorized HR data…</small></div>}</div><form className="chat-compose" onSubmit={send}><input aria-label="Ask the assistant" value={question} maxLength={1000} onChange={e=>setQuestion(e.target.value)} placeholder="Ask about attendance, leave, payroll, workforce…" required disabled={!status.data?.configured}/><button className="btn primary" disabled={busy||!status.data?.configured||!question.trim()}><Send size={18}/><span>Send</span></button></form><small className="chat-note">AI assists with summaries and analysis. Hiring, pay and disciplinary decisions remain with your team.</small></div></div></>;
}

