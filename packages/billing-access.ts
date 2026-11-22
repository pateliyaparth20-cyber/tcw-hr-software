/** Billing limits supplement role permissions; expiry never suspends core HR access. */
export function billingLimited(company:any,now=new Date()):boolean{
 return !!company&&(company.status==='EXPIRED'||company.status==='SUSPENDED'&&company.profile?.suspensionReason==='BILLING'||!!company.expiresAt&&new Date(company.expiresAt)<now);
}
export function coreCompanyAccess(company:any):boolean{
 return !!company&&(['ACTIVE','TRIAL','EXPIRED'].includes(company.status)||company.status==='SUSPENDED'&&company.profile?.suspensionReason==='BILLING');
}
export function billingPermissionBlocked(resource:string,action:string):boolean{
 return action==='EXPORT'||resource==='reports'||resource==='employees'&&['CREATE','IMPORT'].includes(action)||resource==='payroll'&&!['VIEW'].includes(action);
}
export function billingRouteBlocked(resource:string,key:string|undefined,action:string|undefined,method:string,query:Record<string,any>={}):boolean{
 if(resource==='subscription'||resource==='auth')return false;
 if(resource==='reports')return true;
 if(resource==='employees'&&method==='POST'&&(!key||key==='import'))return true;
 if(resource==='payroll'&&!['GET','HEAD','OPTIONS'].includes(method))return true;
 if(['payroll-adjustments','salary-contracts','salary-versions','pay-items','payroll-loans','payroll-settings','payroll-payment-settings'].includes(resource)&&!['GET','HEAD','OPTIONS'].includes(method))return true;
 // Payroll documents and statutory templates are exports; billing invoices and
 // employee uploaded documents remain available through their own authorized routes.
 if(resource==='statutory-ids'&&key==='template')return true;
 if(resource==='payroll'&&action==='payment-challan')return true;
 return ['csv','xlsx','pdf'].includes(String(query.format??'').toLowerCase())||key==='export'||action==='export';
}
