/** Purchased module access supplements role permissions. Billing/core access is retained. */
const enterpriseResources=new Set(['performance','goals','reviews','review-cycles','review-templates','performance-reviews','training','courses','enrollments','training-certificates','assets','asset-events','expenses','travel','exit','offboarding','documents','reports','field-work','ai','agent']);
const payrollResources=new Set(['payroll','payroll-adjustments','salary-contracts','salary-versions','pay-items','payroll-loans','payroll-settings','payroll-payment-settings','payout-reconciliation','salary-templates','payroll-components','tax-declarations','statutory-ids']);
const recruitmentResources=new Set(['recruitment','jobs','candidates','interviews']);
export function planAllowsResource(plan:string|undefined,resource:string):boolean{
 if(plan==='ENTERPRISE')return true;
 if(enterpriseResources.has(resource))return false;
 if(payrollResources.has(resource)||recruitmentResources.has(resource))return plan==='GROWTH';
 return true;
}
export function planModuleFeatures(plan:string):string[]{
 const core=['Core HR','Attendance','Leave'];
 if(plan==='GROWTH')return [...core,'Payroll','Recruitment'];
 if(plan==='ENTERPRISE')return [...core,'Payroll','Recruitment','Performance','Training','Assets','Expenses','Travel','Documents','Offboarding','Reports','Field work','HR Assistant'];
 return core;
}
export function planAccessMessage(plan:string,resource:string){return `${resource.replace(/-/g,' ')} is not included in your ${plan.charAt(0)+plan.slice(1).toLowerCase()} plan. Upgrade your plan to use this module.`;}
