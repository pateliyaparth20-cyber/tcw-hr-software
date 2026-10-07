import {PayrollPayments} from '../../apps/api/src/payroll-payments';
import type {PayrollItem} from '@prisma/client';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {TestContext} from 'node:test';
import type {Database} from '../../packages/database';
import {roleDefinitions} from '../../packages/permissions';
import type {Context} from '../../apps/api/src/context';
import {preparePayrollMonth,reopenPayrollMonth,finalizePayrollMonth} from '../../apps/api/src/payroll-service';
import {PayoutService,type PayoutProvider} from '../../apps/api/src/payouts';
import {Workflows} from '../../apps/api/src/workflows';
import {lockPayrollPeriod} from '../../apps/api/src/payroll-lock';
import {unlockAttendanceMonth,reconcileAttendanceMonth} from '../../apps/api/src/attendance-automation';
import {manualSalary} from '../../packages/payroll-engine/manual';

const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done});return {promise,resolve};};

export async function payrollRegressions(db:Database,t:TestContext,concurrent=false){
  const company=await db.tenant.create({data:{name:'Synthetic payroll tests',code:'PAYROLL-'+randomUUID(),profile:{payoutProvider:'RAZORPAYX'}}});
  const tid=company.id,actorId=randomUUID();
  const role=roleDefinitions.find(r=>r.code==='COMPANY_OWNER')!;
  const ctx:Context={tenantId:tid,user:{id:actorId,role},session:{},ip:'127.0.0.1'};
  const shift=await db.shift.create({data:{tenantId:tid,name:'Test shift',startMinute:540,endMinute:1080}});
  const employee=await db.employee.create({data:{tenantId:tid,employeeCode:'SYNTHETIC-01',firstName:'Synthetic',lastName:'Employee',email:'payroll@example.test',joiningDate:new Date('2020-01-01'),monthlySalary:100000,shiftId:shift.id,personal:{accountNumber:'0000000000',ifsc:'TEST0000001'}}});
  const workflow=new Workflows(db);
  async function run(month:string){
    const period=await db.attendancePeriodLock.create({data:{tenantId:tid,month,status:'LOCKED',lockedBy:actorId,lockedAt:new Date()}});
    await db.attendanceDaily.create({data:{tenantId:tid,employeeId:employee.id,shiftId:shift.id,date:new Date(month+'-05'),status:'PRESENT',workMinutes:480,scheduledMinutes:480,payableUnits:100,syncedAt:new Date(),lockedAt:new Date()}});
    return db.payrollRun.create({data:{tenantId:tid,month,status:'REVIEW',attendanceLockId:period.id,totalGross:100000,totalNet:100000,items:{create:{employeeId:employee.id,employeeName:'Synthetic Employee',employeeCode:employee.employeeCode,gross:100000,deductions:0,net:100000,components:[]}}}});
  }
  const previous=Object.fromEntries(['PAYROLL_PAYOUTS_ENABLED','PAYOUT_PROVIDER','PAYOUT_COMPANY_CODE'].map(key=>[key,process.env[key]]));
  process.env.PAYROLL_PAYOUTS_ENABLED='true';process.env.PAYOUT_PROVIDER='RAZORPAYX';process.env.PAYOUT_COMPANY_CODE=company.code;
  try{
    await t.test('manual employee salary updates totals, survives recalculation and restores calculated pay',async()=>{
      const r=await run('2024-08');
      const second=await db.employee.create({data:{tenantId:tid,employeeCode:'SYNTHETIC-02',firstName:'Second',lastName:'Employee',email:'second@example.test',joiningDate:new Date('2020-01-01'),monthlySalary:200000,shiftId:shift.id}});
      await db.payrollItem.create({data:{tenantId:tid,runId:r.id,employeeId:second.id,employeeName:'Second Employee',employeeCode:second.employeeCode,gross:200000,deductions:0,net:200000,components:[]}});
      let item=await db.payrollItem.findFirstOrThrow({where:{runId:r.id,employeeId:employee.id}});
      item=await db.payrollItem.update({where:{id:item.id},data:{deductions:5000,net:95000}});
      const original={employeeId:employee.id,expectedUpdatedAt:item.updatedAt.toISOString(),expectedNet:item.net};
      const changed=await workflow.payroll(ctx,'POST',r.id,'manual-salary',{...original,net:250000,reason:'Agreed special final salary'}) as PayrollItem;
      assert.equal(changed.net,250000);assert.equal(changed.gross,255000);assert.equal(changed.deductions,5000);
      assert.equal(manualSalary(changed.components)?.calculatedNet,95000);
      assert.equal((await db.employee.findUniqueOrThrow({where:{id:employee.id}})).monthlySalary,100000);
      const total=await db.payrollRun.findUniqueOrThrow({where:{id:r.id}});assert.equal(total.totalGross,455000);assert.equal(total.totalNet,450000);assert.equal(total.totalDeductions,5000);
      assert.equal((await db.payrollItem.findFirstOrThrow({where:{runId:r.id,employeeId:second.id}})).net,200000);
      await assert.rejects(()=>workflow.payroll(ctx,'POST',r.id,'manual-salary',{...original,net:200000,reason:'Stale browser amount'}));
      const recalculated=await preparePayrollMonth(db,tid,r.month,actorId);
      item=recalculated.items.find(i=>i.employeeId===employee.id)!;
      assert.equal(item.net,250000);assert.equal(manualSalary(item.components)?.calculatedNet,100000);
      assert.equal(recalculated.totalNet,recalculated.items.reduce((n,i)=>n+i.net,0));
      const reset=await workflow.payroll(ctx,'POST',r.id,'manual-salary',{employeeId:employee.id,reset:true,expectedUpdatedAt:item.updatedAt.toISOString(),expectedNet:item.net}) as PayrollItem;
      assert.equal(reset.net,100000);assert.equal(manualSalary(reset.components),null);
      const zero=await workflow.payroll(ctx,'POST',r.id,'manual-salary',{employeeId:employee.id,expectedUpdatedAt:reset.updatedAt.toISOString(),expectedNet:reset.net,net:0,reason:'No payment this month'}) as PayrollItem;assert.equal(zero.net,0);
      assert.equal(await db.auditLog.count({where:{tenantId:tid,action:'PAYROLL_MANUAL_SALARY_SET'}}),2);
      await finalizePayrollMonth(db,tid,r.id,actorId);
      await assert.rejects(()=>workflow.payroll(ctx,'POST',r.id,'manual-salary',{employeeId:employee.id,expectedUpdatedAt:zero.updatedAt.toISOString(),expectedNet:0,net:100000,reason:'Locked salary must stay'}));
      await reopenPayrollMonth(db,tid,r.id,actorId);
      assert.equal(await db.payrollItem.count({where:{runId:r.id}}),0);
      // This fixture employee should not affect other regression totals.
      await db.employee.update({where:{id:second.id},data:{status:'INACTIVE'}});
    });
    await t.test('manual salary rejects unauthorized, foreign, invalid and payout-started edits',async()=>{
      const r=await run('2024-09'),item=await db.payrollItem.findFirstOrThrow({where:{runId:r.id}});
      const body={employeeId:employee.id,expectedUpdatedAt:item.updatedAt.toISOString(),expectedNet:item.net,net:120000,reason:'Synthetic valid manual salary'};
      const finance=roleDefinitions.find(r=>r.code==='FINANCE_USER')!;
      await assert.rejects(()=>workflow.payroll({...ctx,user:{...ctx.user,role:finance}},'POST',r.id,'manual-salary',body));
      await assert.rejects(()=>workflow.payroll({...ctx,tenantId:randomUUID()},'POST',r.id,'manual-salary',body));
      await assert.rejects(()=>workflow.payroll(ctx,'POST',r.id,'manual-salary',{...body,employeeId:randomUUID()}));
      for(const net of [-1,0.5,1000000001])await assert.rejects(()=>workflow.payroll(ctx,'POST',r.id,'manual-salary',{...body,net}));
      await assert.rejects(()=>workflow.payroll(ctx,'POST',r.id,'manual-salary',{...body,reason:'   '}));
      await db.payrollPayout.create({data:{tenantId:tid,runId:r.id,employeeId:employee.id,employeeName:'Synthetic Employee',employeeCode:employee.employeeCode,amount:100000,provider:'TEST',reference:'manual-guard'}});
      await assert.rejects(()=>workflow.payroll(ctx,'POST',r.id,'manual-salary',body));
      assert.equal((await db.payrollItem.findUniqueOrThrow({where:{id:item.id}})).net,100000);
    });
    await t.test('failed preparation rolls back reconciled days and the attendance lock',async()=>{
      const empty=await db.tenant.create({data:{name:'Empty synthetic company',code:'EMPTY-'+randomUUID()}});
      await db.shift.create({data:{tenantId:empty.id,name:'Test shift',startMinute:540,endMinute:1080}});
      await assert.rejects(()=>preparePayrollMonth(db,empty.id,'2024-01',actorId));
      assert.equal(await db.attendancePeriodLock.count({where:{tenantId:empty.id}}),0);
      assert.equal(await db.payrollRun.count({where:{tenantId:empty.id}}),0);
      const future=await db.employee.create({data:{tenantId:empty.id,employeeCode:'FUTURE',firstName:'Future',lastName:'Employee',email:'future@example.test',joiningDate:new Date('2024-02-01')}});
      await assert.rejects(()=>preparePayrollMonth(db,empty.id,'2024-01',actorId));
      assert.equal(await db.attendanceDaily.count({where:{employeeId:future.id}}),0);
      assert.equal(await db.attendancePeriodLock.count({where:{tenantId:empty.id}}),0);
      // This failure occurs after reconciliation, attendance locking and run creation.
      // It represents legacy invalid rule data, rather than an early input rejection.
      const active=await db.employee.create({data:{tenantId:empty.id,employeeCode:'ACTIVE',firstName:'Active',lastName:'Employee',email:'active@example.test',joiningDate:new Date('2020-01-01'),monthlySalary:100000}});
      await db.salaryRule.create({data:{tenantId:empty.id,name:'Invalid legacy rule',kind:'DEDUCTION',percent:101}});
      await assert.rejects(()=>preparePayrollMonth(db,empty.id,'2024-01',actorId),/Invalid deduction percentage/);
      assert.equal(await db.attendanceDaily.count({where:{employeeId:active.id}}),0);
      assert.equal(await db.attendancePeriodLock.count({where:{tenantId:empty.id}}),0);
      assert.equal(await db.payrollRun.count({where:{tenantId:empty.id}}),0);
    });
    await t.test('finalize is idempotent and reopening resets payroll and attendance together',async()=>{
      const r=await run('2024-02');
      assert.equal((await finalizePayrollMonth(db,tid,r.id,actorId)).changed,true);
      assert.equal((await finalizePayrollMonth(db,tid,r.id,actorId)).changed,false);
      await assert.rejects(()=>unlockAttendanceMonth(db,tid,r.month,actorId));
      await assert.rejects(()=>preparePayrollMonth(db,tid,r.month,actorId));
      const reopened=await reopenPayrollMonth(db,tid,r.id,actorId);
      assert.equal(reopened.status,'DRAFT');assert.equal(reopened.items.length,0);assert.equal(reopened.totalNet,0);
      assert.equal((await db.attendancePeriodLock.findUniqueOrThrow({where:{tenantId_month:{tenantId:tid,month:r.month}}})).status,'UNLOCKED');
      assert.equal((await db.attendanceDaily.findFirstOrThrow({where:{tenantId:tid,date:new Date(r.month+'-05')}})).lockedAt,null);
    });
    await t.test('payout timeout stays unverified and repeat Pay never resends it',async()=>{
      const r=await run('2024-03');await finalizePayrollMonth(db,tid,r.id,actorId);let sent=0;
      const provider:PayoutProvider={validateConfiguration(){},async send(){sent++;throw new Error('Synthetic timeout after provider accepted request');},async status(){throw new Error('No reference');}};
      const service=new PayoutService(db,provider),first=await service.pay(ctx,r.id,{confirm:true});
      assert.equal(first.unknown,1);assert.equal(first.items[0].status,'UNKNOWN');
      const repeat=await service.pay(ctx,r.id,{confirm:true,mode:'NEFT'});
      assert.equal(sent,1);assert.equal(repeat.initiated,0);assert.equal(repeat.skipped,1);assert.equal(repeat.items[0].mode,'IMPS');
      await db.payrollPayout.update({where:{id:first.items[0].id},data:{status:'FAILED'}});
      assert.equal((await service.pay(ctx,r.id,{confirm:true})).initiated,0);assert.equal(sent,1);
      await assert.rejects(()=>reopenPayrollMonth(db,tid,r.id,actorId));
      await assert.rejects(()=>workflow.payroll(ctx,'DELETE',r.id));
    });
    await t.test('invalid provider response never appears as a successful transfer',async()=>{
      const r=await run('2024-04');await finalizePayrollMonth(db,tid,r.id,actorId);
      const service=new PayoutService(db,{validateConfiguration(){},async send(){return {};},async status(){return {};}});
      const result=await service.pay(ctx,r.id,{confirm:true});assert.equal(result.unknown,1);assert.equal(result.processed,0);assert.equal(result.items[0].providerRef,null);
    });
    await t.test('configuration or bank validation fails before any payout is claimed',async()=>{
      const r=await run('2024-05');await finalizePayrollMonth(db,tid,r.id,actorId);
      const service=new PayoutService(db,{validateConfiguration(){throw new Error('Synthetic missing configuration');},async send(){throw new Error('Must not send');},async status(){return {};}});
      await assert.rejects(()=>service.pay(ctx,r.id,{confirm:true}));assert.equal(await db.payrollPayout.count({where:{runId:r.id}}),0);
      await db.employee.update({where:{id:employee.id},data:{personal:{}}});
      const configured=new PayoutService(db,{validateConfiguration(){},async send(){throw new Error('Must not send');},async status(){return {};}});
      await assert.rejects(()=>configured.pay(ctx,r.id,{confirm:true}));assert.equal(await db.payrollPayout.count({where:{runId:r.id}}),0);
      await db.employee.update({where:{id:employee.id},data:{personal:{accountNumber:'0000000000',ifsc:'TEST0000001'}}});
    });
    await t.test('prepared payroll separates employer contribution and uses the prorated Basic wage basis',async()=>{
      const r=await run('2024-10');await db.salaryVersion.create({data:{tenantId:tid,employeeId:employee.id,effectiveMonth:'2024-10',basic:50000,hra:50000,reason:'Synthetic salary structure',actorId}});
      await db.salaryRule.create({data:{tenantId:tid,name:'Synthetic employer contribution',kind:'EMPLOYER',percent:12,basis:'BASIC',wageCap:150000}});
      const prepared=await preparePayrollMonth(db,tid,r.month,actorId),item=prepared.items.find(i=>i.employeeId===employee.id)!;
      const components=item.components as any[],basic=components.find(c=>c.name==='Basic'),employer=components.find(c=>c.type==='EMPLOYER');assert.ok(employer);assert.equal(employer.amount,Math.round(basic.amount*0.12));assert.equal(item.net,item.gross);assert.equal(item.deductions,0);
    });
    if(concurrent){
      await t.test('finalize, reopen, delete and unlock serialize against an in-flight period change',async()=>{
        for(const [index,action] of ['finalize','reopen','delete','unlock','manual'].entries()){
          const r=await run(`2023-${String(index+1).padStart(2,'0')}`),entered=deferred(),release=deferred();
          const holding=db.$transaction(async tx=>{await lockPayrollPeriod(tx,tid,r.month);entered.resolve();await release.promise;await tx.payrollRun.update({where:{id:r.id},data:{status:'LOCKED',lockedAt:new Date()}});},{timeout:20000});
          await entered.promise;
          const manualItem=action==='manual'?await db.payrollItem.findFirstOrThrow({where:{runId:r.id}}):null;
          const operation=action==='manual'?workflow.payroll(ctx,'POST',r.id,'manual-salary',{employeeId:employee.id,expectedUpdatedAt:manualItem!.updatedAt.toISOString(),expectedNet:manualItem!.net,net:50000,reason:'Must reject after concurrent finalization'}):action==='finalize'?finalizePayrollMonth(db,tid,r.id,actorId):action==='reopen'?reopenPayrollMonth(db,tid,r.id,actorId):action==='delete'?workflow.payroll(ctx,'DELETE',r.id):unlockAttendanceMonth(db,tid,r.month,actorId);
          const outcome=operation.then(value=>({ok:true,value}),()=>({ok:false,value:null}));
          try{
            const deadline=Date.now()+5000;let waiting=false;
            while(Date.now()<deadline){const rows=await db.$queryRaw<{count:bigint}[]>`SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND NOT granted`;if(Number(rows[0].count)>0){waiting=true;break;}await new Promise(done=>setTimeout(done,25));}
            assert.equal(waiting,true,`${action} must wait on the period transaction`);
          }finally{release.resolve();await holding;}
          const result=await outcome;assert.equal(result.ok,['finalize','reopen'].includes(action));
          const after=await db.payrollRun.findUniqueOrThrow({where:{id:r.id}});
          assert.equal(after.status,action==='reopen'?'DRAFT':'LOCKED');
        }
      });
      await t.test('simultaneous Pay requests claim once and block reopen while provider is pending',async()=>{
        const r=await run('2024-06');await finalizePayrollMonth(db,tid,r.id,actorId);let sent=0;
        const entered=deferred(),release=deferred();
        const service=new PayoutService(db,{validateConfiguration(){},async send(id){sent++;entered.resolve();await release.promise;return {id:'synthetic-'+id,status:'processing'};},async status(){return {};}});
        const first=service.pay(ctx,r.id,{confirm:true});
        try{
          await entered.promise;
          const repeat=await service.pay(ctx,r.id,{confirm:true});assert.equal(repeat.initiated,0);assert.equal(repeat.items[0].status,'INITIATING');assert.equal(sent,1);
          await assert.rejects(()=>reopenPayrollMonth(db,tid,r.id,actorId));
          await assert.rejects(()=>workflow.payroll(ctx,'DELETE',r.id));
        }finally{release.resolve();await first;}
        assert.equal(await db.payrollPayout.count({where:{runId:r.id}}),1);
      });
      await t.test('two salary schedulers dispatch an approved run once while the other observes its claim',async()=>{
        const schedulerRole=await db.role.create({data:{code:'SCHEDULE-'+randomUUID(),name:'Synthetic scheduler approver',scope:'TENANT',permissions:role.permissions}});
        await db.user.create({data:{id:actorId,tenantId:tid,roleId:schedulerRole.id,name:'Synthetic approver',email:'schedule-'+randomUUID()+'@example.test',passwordHash:'unused'}});
        const r=await run('2024-11');await finalizePayrollMonth(db,tid,r.id,actorId);let sent=0;const entered=deferred(),release=deferred();
        const service=new PayoutService(db,{validateConfiguration(){},async send(id){sent++;entered.resolve();await release.promise;return {id:'synthetic-'+id,status:'processing'}},async status(){return {}}}),payments=new PayrollPayments(db,service),now=new Date(),due=new Date(now.getTime()+90000);
        const schedule=await payments.schedule(ctx,r.id,{scheduledAt:due.toISOString(),mode:'NEFT',confirm:true},now);const first=payments.executeDue(due);
        try{await entered.promise;assert.equal((await payments.executeDue(due)).started,0);await assert.rejects(()=>payments.cancel(ctx,r.id),/started/);await assert.rejects(()=>service.pay(ctx,r.id,{confirm:true}),/scheduled/);assert.equal(sent,1)}finally{release.resolve();await first}
        assert.equal((await db.payrollPaymentSchedule.findUniqueOrThrow({where:{id:schedule.id}})).status,'DISPATCHED');assert.equal(await db.payrollPayout.count({where:{runId:r.id}}),1);
      });
      await t.test('prepare, reopen and corrections wait for the same period transaction',async()=>{
        const r=await run('2024-07'),entered=deferred(),release=deferred();
        const holding=db.$transaction(async tx=>{await lockPayrollPeriod(tx,tid,r.month);entered.resolve();await release.promise;await tx.payrollRun.update({where:{id:r.id},data:{status:'LOCKED',lockedAt:new Date()}});},{timeout:20000});
        await entered.promise;
        const prepare=preparePayrollMonth(db,tid,r.month,actorId).then(()=>({ok:true}),()=>({ok:false}));
        // Poll PostgreSQL's lock table rather than inferring a lock from a timer.
        try{
          const deadline=Date.now()+5000;let waiting=false;
          while(Date.now()<deadline){const rows=await db.$queryRaw<{count:bigint}[]>`SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND NOT granted`;if(Number(rows[0].count)>0){waiting=true;break;}await new Promise(done=>setTimeout(done,25));}
          assert.equal(waiting,true,'prepare must wait on the held period lock');
        }finally{release.resolve();await holding;}
        assert.equal((await prepare).ok,false,'prepare must recheck finalized state after waiting');
        const reopened=await reopenPayrollMonth(db,tid,r.id,actorId);assert.equal(reopened.status,'DRAFT');
        const prepared=await preparePayrollMonth(db,tid,r.month,actorId);assert.equal(prepared.status,'REVIEW');assert.equal(prepared.totalNet,prepared.items.reduce((n,i)=>n+i.net,0));
        const day=await db.attendanceDaily.findFirstOrThrow({where:{tenantId:tid,date:new Date(r.month+'-05')}});
        await assert.rejects(()=>workflow.attendance(ctx,'POST',{status:'ABSENT',note:'Synthetic locked correction'},{},day.id,'correct'));
        await assert.rejects(()=>reconcileAttendanceMonth(db,tid,r.month));
      });
    }
  }finally{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
}
