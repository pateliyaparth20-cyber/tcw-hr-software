import type {Database} from '../../../packages/database';

const DAY=86_400_000;
const jsonObject=(value:any):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?{...value}:{};
const autoSuspendEnabled=()=>process.env.AUTO_SUSPEND_OVERDUE!=='false';
const graceDays=()=>Math.max(0,Math.min(90,Number(process.env.OVERDUE_GRACE_DAYS??3)||0));

export async function syncCompanyAccess(db:Database,tenantId?:string){
  const now=new Date();
  const today=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
  const tenantWhere:any=tenantId?{id:tenantId}:{};

  // Expiry is always authoritative, regardless of billing automation settings.
  const expired=await db.tenant.findMany({where:{...tenantWhere,status:{in:['ACTIVE','TRIAL']},expiresAt:{lt:now}}});
  for(const company of expired){
    const profile=jsonObject(company.profile),isTrial=company.status==='TRIAL'||!!profile.trialDays;
    const trialProfile=isTrial?{...profile,trialFollowupStatus:['CONTACTED','NO_ANSWER','FOLLOW_UP','INTERESTED','NOT_INTERESTED'].includes(String(profile.trialFollowupStatus))?profile.trialFollowupStatus:'CALL_DUE',trialNextFollowupAt:profile.trialNextFollowupAt??now.toISOString(),trialExpiredAt:profile.trialExpiredAt??now.toISOString()}:profile;
    await db.$transaction(async tx=>{
      await tx.tenant.update({where:{id:company.id},data:{status:'EXPIRED',profile:trialProfile}});
      await tx.session.deleteMany({where:{tenantId:company.id}});
      await tx.auditLog.create({data:{tenantId:company.id,action:isTrial?'TRIAL_EXPIRED':'SUBSCRIPTION_EXPIRED',entity:'tenants',entityId:company.id}});
    });
  }

  // Keep invoice labels accurate even when auto-suspension is disabled.
  await db.invoice.updateMany({where:{...(tenantId?{tenantId}:{}),status:{in:['ISSUED','PART_PAID']},dueDate:{lt:today}},data:{status:'OVERDUE'}});
  if(!autoSuspendEnabled())return;

  const cutoff=new Date(today.getTime()-graceDays()*DAY);
  const companies=await db.tenant.findMany({where:tenantWhere});
  for(const company of companies){
    if(company.status==='ARCHIVED'||company.status==='EXPIRED')continue;
    const overdue=await db.invoice.count({where:{tenantId:company.id,status:'OVERDUE',dueDate:{lte:cutoff}}});
    const profile=jsonObject(company.profile);
    if(overdue>0&&['ACTIVE','TRIAL'].includes(company.status)){
      await db.$transaction(async tx=>{
        await tx.tenant.update({where:{id:company.id},data:{status:'SUSPENDED',profile:{...profile,suspensionReason:'BILLING',billingPreviousStatus:company.status,billingSuspendedAt:now.toISOString()}}});
        await tx.session.deleteMany({where:{tenantId:company.id}});
        await tx.auditLog.create({data:{tenantId:company.id,action:'BILLING_AUTO_SUSPENDED',entity:'tenants',entityId:company.id,after:{overdueInvoices:overdue,graceDays:graceDays()}}});
      });
    }else if(overdue===0&&company.status==='SUSPENDED'&&profile.suspensionReason==='BILLING'){
      const {suspensionReason,billingPreviousStatus,billingSuspendedAt,...cleanProfile}=profile;
      const restore=['ACTIVE','TRIAL'].includes(String(billingPreviousStatus))?String(billingPreviousStatus):'ACTIVE';
      await db.$transaction(async tx=>{
        await tx.tenant.update({where:{id:company.id},data:{status:restore,profile:cleanProfile}});
        await tx.auditLog.create({data:{tenantId:company.id,action:'BILLING_AUTO_REACTIVATED',entity:'tenants',entityId:company.id}});
      });
    }
  }
}
