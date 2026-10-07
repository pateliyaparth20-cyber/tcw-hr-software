import {createHash} from 'node:crypto';
import {jsonObject,paymentConnection} from './payout-connections';
import {validEmployeeBank,employeePayoutIssues} from './payouts';
export async function paymentSnapshot(db:any,tid:string,runId:string,mode:string){
 const [run,company]=await Promise.all([db.payrollRun.findFirst({where:{id:runId,tenantId:tid},include:{items:{orderBy:{employeeCode:'asc'}}}}),db.tenant.findUnique({where:{id:tid}})]);
 if(!run||!company)return null;
 const [employees,payouts]=await Promise.all([db.employee.findMany({where:{tenantId:tid,id:{in:run.items.map((i:any)=>i.employeeId)}}}),db.payrollPayout.findMany({where:{tenantId:tid,runId}})]),byId=new Map<string,any>(employees.map((e:any)=>[e.id,e])),byPayout=new Map<string,any>(payouts.map((p:any)=>[p.employeeId,p]));
 const config=await paymentConnection(db,company);
 const fingerprint=createHash('sha256').update(JSON.stringify({runId,tenantId:tid,month:run.month,status:run.status,mode,revision:config.revision,provider:config.provider,items:run.items.map((i:any)=>{const e=byId.get(i.employeeId),p=jsonObject(e?.personal);return {id:i.id,employeeId:i.employeeId,net:i.net,bank:[String(p.accountNumber??'').trim(),String(p.ifsc??'').trim().toUpperCase(),String(p.accountHolder||`${e?.firstName} ${e?.lastName}`).trim()]};})})).digest('hex');
 const items=run.items.map((i:any)=>{const p=jsonObject(byId.get(i.employeeId)?.personal),payment=byPayout.get(i.employeeId);return {employeeId:i.employeeId,employeeCode:i.employeeCode,employeeName:i.employeeName,net:i.net,accountHint:p.accountNumber?'••••'+String(p.accountNumber).slice(-4):'',ifsc:String(p.ifsc??'').toUpperCase(),bankValid:validEmployeeBank(p),payoutUpdatedAt:payment?.updatedAt?.toISOString()??null,canRecordReplacement:!!payment?.providerRef&&['failed','reversed','rejected','cancelled'].includes(payment.status),paymentStatus:payment?.status??(i.net===0?'NO_PAYMENT_DUE':'NOT_STARTED'),issues:!payment&&i.net>0?employeePayoutIssues(config,byId.get(i.employeeId),i.net,mode):[]};});
 const issues=[...(run.status!=='LOCKED'?['Finalize payroll first']:[]),...(company.currency!=='INR'?['Live API payments support INR only']:[]),...(!config.enabled?['Connect and enable this company’s payment API']:[]),...(items.some((i:any)=>i.issues.length)?['Resolve employee bank or transfer-mode issues']:[]),...(!items.some((i:any)=>i.net>0&&i.paymentStatus==='NOT_STARTED')?['No unclaimed salary payments remain']:[])];
 return {run,company,config,fingerprint,items,issues,ready:issues.length===0,payouts};
}
