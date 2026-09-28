export interface DeductionRule {name:string; percent:number; cap?:number|null}
/** All money uses integer minor units. Statutory rates are deliberately supplied by configuration. */
export function calculatePay(gross:number,rules:DeductionRule[],adjustment=0) {
  if(!Number.isSafeInteger(gross)||gross<0||!Number.isSafeInteger(adjustment)) throw new Error('Invalid monetary amount');
  const components=rules.map(rule=>{
    if(rule.percent<0||rule.percent>100) throw new Error('Invalid deduction percentage');
    return {name:rule.name,amount:Math.min(Math.round(gross*rule.percent/100),rule.cap??Number.MAX_SAFE_INTEGER)};
  });
  const deductions=components.reduce((total,c)=>total+c.amount,0);
  const net=gross-deductions+adjustment;
  if(net<0) throw new Error('Deductions exceed pay');
  return {gross: gross+adjustment,deductions,net,components:[...components,...(adjustment?[{name:'Adjustment',amount:adjustment}]:[])]};
}
export const payrollTransitions: Record<string,string[]> = {DRAFT:['REVIEW'],REVIEW:['DRAFT','APPROVED'],APPROVED:['LOCKED'],LOCKED:[]};
export function assertPayrollTransition(from:string,to:string) {
  if(!payrollTransitions[from]?.includes(to)) throw new Error(`Payroll cannot transition from ${from} to ${to}`);
}
