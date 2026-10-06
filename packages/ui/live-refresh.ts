export type LiveRefreshInterval = number | false;

const FAST_ROOTS=new Set([
  'dashboard','attendance','workforce','devices','notifications','leave','calendar','support'
]);
const NORMAL_ROOTS=new Set([
  'employees','shifts','payroll','expenses','travel','assets','goals','courses','recruitment',
  'candidates','companies','trials','leads','invoices','payments','subscription','organization'
]);
const NO_POLL_ROOTS=new Set(['ai','branding','tenant-branding','health','version']);

function cleanRoot(path:string){
  const clean=String(path??'').replace(/^\/+/, '').split('?')[0];
  return clean.split('/')[0]??'';
}

export function liveRefreshInterval(path:string):LiveRefreshInterval{
  const clean=String(path??'').replace(/^\/+/, '').split('?')[0],root=cleanRoot(path);
  if(!root||NO_POLL_ROOTS.has(root)||clean.includes('/export'))return false;
  if(FAST_ROOTS.has(root))return 10_000;
  if(NORMAL_ROOTS.has(root))return 30_000;
  return 60_000;
}

const RELATED:Record<string,Set<string>>={
  attendance:new Set(['attendance','workforce','dashboard','devices']),
  leave:new Set(['leave','attendance','workforce','dashboard','payroll']),
  employees:new Set(['employees','attendance','workforce','dashboard','payroll','organization','shifts']),
  shifts:new Set(['shifts','attendance','workforce','dashboard']),
  devices:new Set(['devices','attendance','workforce','dashboard']),
  calendar:new Set(['calendar','dashboard']),
  notifications:new Set(['notifications','dashboard']),
  payroll:new Set(['payroll','dashboard','reports']),
  expenses:new Set(['expenses','dashboard','payroll']),
  travel:new Set(['travel','dashboard']),
  assets:new Set(['assets','dashboard']),
  goals:new Set(['goals','dashboard']),
  courses:new Set(['courses','dashboard']),
  recruitment:new Set(['recruitment','candidates','calendar','dashboard']),
  candidates:new Set(['recruitment','candidates','calendar','dashboard']),
  support:new Set(['support','dashboard']),
  companies:new Set(['companies','trials','subscription','dashboard']),
  trials:new Set(['trials','companies','dashboard']),
  leads:new Set(['leads','dashboard']),
  invoices:new Set(['invoices','payments','dashboard']),
  payments:new Set(['payments','invoices','dashboard']),
  organization:new Set(['organization','employees','dashboard']),
  company:new Set(['company','dashboard','employees','shifts']),
  'employee-app':new Set(['employees','attendance','dashboard'])
};

export function shouldRefreshForServerChange(path:string,resource?:string|null){
  const root=cleanRoot(path),changed=cleanRoot(resource??'');
  if(!root)return false;
  if(!changed)return true;
  if(root==='dashboard'||root===changed)return true;
  return RELATED[changed]?.has(root)??false;
}
