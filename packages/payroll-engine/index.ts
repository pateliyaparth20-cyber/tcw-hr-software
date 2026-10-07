export interface DeductionRule {name:string; percent:number; cap?:number|null;basis?:'GROSS'|'BASIC';calculation?:'PERCENT'|'FIXED';fixedAmount?:number;wageCap?:number|null;kind?:string}
/** All money uses integer minor units. Statutory rates are deliberately supplied by configuration. */
export function calculatePay(gross:number,rules:DeductionRule[],adjustment=0,basic=gross) {
  if(!Number.isSafeInteger(basic)||basic<0||basic>gross)throw new Error('Invalid basic salary');
  if(!Number.isSafeInteger(gross)||gross<0||!Number.isSafeInteger(adjustment)) throw new Error('Invalid monetary amount');
  const components=rules.map(rule=>{
    if(!Number.isFinite(rule.percent)||rule.percent<0||rule.percent>100) throw new Error('Invalid deduction percentage');
    if(rule.cap!=null&&(!Number.isSafeInteger(rule.cap)||rule.cap<0)) throw new Error('Invalid deduction cap');
    if(rule.basis&&!['GROSS','BASIC'].includes(rule.basis)||rule.calculation&&!['PERCENT','FIXED'].includes(rule.calculation)||rule.kind&&!['DEDUCTION','EMPLOYER'].includes(rule.kind))throw new Error('Invalid contribution rule');
    if(rule.wageCap!=null&&(!Number.isSafeInteger(rule.wageCap)||rule.wageCap<0))throw new Error('Invalid wage cap');
    const fixed=rule.fixedAmount??0;if(!Number.isSafeInteger(fixed)||fixed<0)throw new Error('Invalid fixed contribution');
    const basis=Math.min(rule.basis==='BASIC'?basic:gross,rule.wageCap??Number.MAX_SAFE_INTEGER);
    return {name:rule.name,amount:Math.min(rule.calculation==='FIXED'?fixed:Math.round(basis*rule.percent/100),rule.cap??Number.MAX_SAFE_INTEGER),...(rule.kind==='EMPLOYER'?{type:'EMPLOYER'}:{})};
  });
  const deductions=components.reduce((total,c)=>total+(c.type==='EMPLOYER'?0:c.amount),0);
  const net=gross-deductions+adjustment;
  if(!Number.isSafeInteger(gross+adjustment)||!Number.isSafeInteger(deductions)||!Number.isSafeInteger(net))throw new Error('Monetary amount exceeds the safe integer range');
  if(net<0) throw new Error('Deductions exceed pay');
  return {gross: gross+adjustment,deductions,net,components:[...components,...(adjustment?[{name:'Adjustment',amount:adjustment}]:[])]};
}
export const payrollTransitions: Record<string,string[]> = {DRAFT:['REVIEW'],REVIEW:['DRAFT','LOCKED'],APPROVED:['DRAFT','LOCKED'],LOCKED:[]};
export function assertPayrollTransition(from:string,to:string) {
  if(!payrollTransitions[from]?.includes(to)) throw new Error(`Payroll cannot transition from ${from} to ${to}`);
}
