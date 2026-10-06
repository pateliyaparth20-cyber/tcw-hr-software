export const MANUAL_SALARY='MANUAL_NET_OVERRIDE';
export function manualSalary(components:unknown){
  if(!Array.isArray(components))return null;
  return components.find((c:any)=>c?.type===MANUAL_SALARY&&Number.isSafeInteger(c.net)&&c.net>=0&&typeof c.reason==='string') as {type:string;name:string;net:number;reason:string;actorId:string;updatedAt:string;calculatedGross:number;calculatedNet:number}|undefined??null;
}
export function manualSalaryValues(net:number,deductions:number){
  const gross=net+deductions;
  if(!Number.isSafeInteger(net)||net<0||!Number.isSafeInteger(gross)||gross>2147483647)throw new Error('Manual salary exceeds the supported amount.');
  return {gross,deductions,net};
}
