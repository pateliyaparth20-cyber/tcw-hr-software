export type Scope = 'PLATFORM' | 'TENANT';
export type Action = 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' | 'APPROVE' | 'REJECT' | 'EXPORT' | 'IMPORT' | 'MANAGE';
const actions: Action[] = ['VIEW','CREATE','EDIT','DELETE','APPROVE','REJECT','EXPORT','IMPORT','MANAGE'];
export const tenantResources = ['dashboard','company','organization','employees','attendance','devices','shifts','leave','calendar','payroll','recruitment','performance','training','documents','assets','expenses','travel','exit','workforce','users','reports','audit','support','ai'];
export const platformResources = ['dashboard','tenants','plans','sales','billing','support','audit','system'];
const grants = (resources: string[], allowed: Action[] = actions) => resources.flatMap(r => allowed.map(a => `${r}:${a}`));
export const roleDefinitions = [
  {code:'SUPER_ADMIN',name:'Super Admin',scope:'PLATFORM',permissions:grants(platformResources)},
  {code:'ADMIN',name:'Admin',scope:'PLATFORM',permissions:grants(platformResources.filter(r=>r!=='system'))},
  ...['SALES_ADMIN','SALES_EXECUTIVE'].map(code=>({code,name:code.replaceAll('_',' '),scope:'PLATFORM',permissions:grants(['dashboard','sales'],code==='SALES_ADMIN'?actions:['VIEW','CREATE','EDIT','EXPORT'])})),
  ...['SUPPORT_ADMIN','SUPPORT_AGENT'].map(code=>({code,name:code.replaceAll('_',' '),scope:'PLATFORM',permissions:grants(['dashboard','support'])})),
  {code:'FINANCE_ADMIN',name:'Finance Admin',scope:'PLATFORM',permissions:grants(['dashboard','billing','plans'])},
  {code:'COMPANY_OWNER',name:'Company Owner',scope:'TENANT',permissions:grants(tenantResources)},
  {code:'HR_ADMIN',name:'HR Admin',scope:'TENANT',permissions:grants(tenantResources.filter(r=>r!=='users'))},
  {code:'HR_EXECUTIVE',name:'HR Executive',scope:'TENANT',permissions:grants(['dashboard','organization','employees','attendance','leave','calendar','documents','assets','expenses','travel','support'],['VIEW','CREATE','EDIT','EXPORT'])},
  {code:'PAYROLL_MANAGER',name:'Payroll Manager',scope:'TENANT',permissions:grants(['dashboard','payroll','attendance','reports'])},
  {code:'RECRUITER',name:'Recruiter',scope:'TENANT',permissions:grants(['dashboard','recruitment','calendar'])},
  {code:'FINANCE_USER',name:'Finance User',scope:'TENANT',permissions:grants(['dashboard','payroll','expenses','travel','reports'],['VIEW','APPROVE','REJECT','EXPORT'])},
  ...['MANAGER','TEAM_LEADER'].map(code=>({code,name:code.replaceAll('_',' '),scope:'TENANT',permissions:grants(['dashboard','employees','attendance','leave','performance','expenses','travel','workforce','calendar'],['VIEW','CREATE','EDIT','APPROVE','REJECT'])})),
  {code:'EMPLOYEE',name:'Employee',scope:'TENANT',permissions:[...grants(['dashboard','employees','attendance','leave','payroll','performance','documents','assets','expenses','travel','workforce','calendar','support'],['VIEW']),...grants(['leave','expenses','travel','workforce','support'],['CREATE'])]}
];
export const hasPermission = (permissions: string[], resource: string, action: string) => permissions.includes(`${resource}:${action}`);
export const restrictedRoles = new Set(['EMPLOYEE','MANAGER','TEAM_LEADER']);
