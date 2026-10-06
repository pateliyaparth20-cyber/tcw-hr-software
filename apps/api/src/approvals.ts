import {BadRequestException,ConflictException,ForbiddenException} from '@nestjs/common';
import {z} from 'zod';
import {hasPermission} from '../../../packages/permissions';
import {Context,audit,requirePermission,tenant} from './context';
import type {Database} from '../../../packages/database';

export async function approvalEnabled(tx:any,tid:string,resource:string){return (await tx.approvalPolicy.findUnique({where:{tenantId_resource:{tenantId:tid,resource}}}))?.mode==='MANAGER_HR';}
export async function createApproval(tx:any,tid:string,resource:string,row:any){
  if(!await approvalEnabled(tx,tid,resource))return;
  const employee=await tx.employee.findFirst({where:{tenantId:tid,id:row.employeeId},select:{managerId:true}});
  await tx.approvalRequest.create({data:{tenantId:tid,resource,requestId:row.id,managerEmployeeId:employee?.managerId??null,stage:employee?.managerId?'MANAGER':'HR'}});
}
export async function approvalRows(db:any,tid:string,resource:string,rows:any[]){
  const approvals=await db.approvalRequest.findMany({where:{tenantId:tid,resource,requestId:{in:rows.map(r=>r.id)}}});
  const byId=new Map(approvals.map((r:any)=>[r.requestId,r]));return rows.map(r=>({...r,approval:byId.get(r.id)??null}));
}
export async function reviewApproval(tx:any,ctx:Context,resource:string,row:any,input:{decision:string;note:string}){
  const tid=tenant(ctx),approval=await tx.approvalRequest.findUnique({where:{tenantId_resource_requestId:{tenantId:tid,resource,requestId:row.id}}});
  if(input.decision==='REJECTED'&&!input.note.trim())throw new BadRequestException('A rejection reason is required.');
  if(!approval)return {status:input.decision,stage:'SINGLE'};
  if(!['MANAGER','HR'].includes(approval.stage))throw new ConflictException('This request has already been reviewed.');
  const rejecting=input.decision==='REJECTED',now=new Date();
  if(approval.stage==='MANAGER'){
    if(!ctx.user.employeeId||ctx.user.employeeId!==approval.managerEmployeeId)throw new ForbiddenException('This step requires the assigned reporting manager.');
    await tx.approvalRequest.update({where:{id:approval.id},data:{stage:rejecting?'REJECTED':'HR',managerReviewerId:ctx.user.id,managerNote:input.note,managerReviewedAt:now}});
    return {status:rejecting?'REJECTED':'PENDING',stage:rejecting?'REJECTED':'HR'};
  }
  const roles=resource==='leave'?['HR_ADMIN','COMPANY_OWNER']:['HR_ADMIN','COMPANY_OWNER','FINANCE_USER','PAYROLL_MANAGER'];
  if(!roles.includes(ctx.user.role.code))throw new ForbiddenException('This step requires HR or an authorized finance reviewer.');
  if(approval.managerReviewerId===ctx.user.id)throw new ForbiddenException('The final review must be completed by a different person.');
  await tx.approvalRequest.update({where:{id:approval.id},data:{stage:input.decision,finalReviewerId:ctx.user.id,finalNote:input.note,finalReviewedAt:now}});
  return {status:input.decision,stage:input.decision};
}
export async function approvalPolicies(db:Database,ctx:Context,method:string,body?:unknown){
  const tid=tenant(ctx);if(method!=='GET')requirePermission(ctx,'company','MANAGE');else if(!['leave','expenses','travel'].some(r=>hasPermission(ctx.user.role.permissions,r,'VIEW')))throw new ForbiddenException();
  if(method==='GET'){const rows=await db.approvalPolicy.findMany({where:{tenantId:tid}});return {items:['leave','expenses','travel'].map(resource=>rows.find(r=>r.resource===resource)??{resource,mode:'SINGLE'})};}
  if(method!=='POST')throw new BadRequestException('Unsupported policy operation.');
  const input=z.object({resource:z.enum(['leave','expenses','travel']),mode:z.enum(['SINGLE','MANAGER_HR'])}).strict().parse(body);
  return db.$transaction(async tx=>{const before=await tx.approvalPolicy.findUnique({where:{tenantId_resource:{tenantId:tid,resource:input.resource}}});const after=await tx.approvalPolicy.upsert({where:{tenantId_resource:{tenantId:tid,resource:input.resource}},create:{tenantId:tid,...input},update:{mode:input.mode}});await audit(tx,ctx,'APPROVAL_POLICY_UPDATED','company',after.id,before,after);return after;});
}
