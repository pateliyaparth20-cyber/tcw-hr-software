/** Payroll money remains in integer minor units; never recalculate an issued net salary. */
export function payslipLines(item:{gross:number;deductions:number;components?:unknown}){
 const components=Array.isArray(item.components)?item.components:[];
 const build=(type:string,total:number)=>{
  const lines=components.filter(c=>c&&c.type===type&&Number.isSafeInteger(c.amount)&&c.amount!==0).map(c=>({name:String(c.name||type),amount:Number(c.amount)}));
  const difference=total-lines.reduce((n,c)=>n+c.amount,0);
  if(difference)lines.push({name:type==='EARNING'?'Salary / payroll adjustment':'Other deductions / adjustment',amount:difference});
  return lines;
 };
 return {earnings:build('EARNING',item.gross),deductions:build('DEDUCTION',item.deductions)};
}
