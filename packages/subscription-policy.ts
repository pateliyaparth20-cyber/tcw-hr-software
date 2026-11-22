export const subscriptionDiscountPercent=15;
const ranks:Record<string,number>={STARTER:0,GROWTH:1,ENTERPRISE:2};
export function isPlanDowngrade(current:string,next:string){return (ranks[next]??-1)<(ranks[current]??-1);}
export function salePrice(original:number|null|undefined){return original==null?null:Math.round(original*(100-subscriptionDiscountPercent)/100);}
export function pricedPlan<T extends {monthlyPrice:number;yearlyPrice?:number|null}>(plan:T){return {...plan,monthlyListPrice:plan.monthlyPrice,yearlyListPrice:plan.yearlyPrice??null,monthlyPrice:salePrice(plan.monthlyPrice)!,yearlyPrice:salePrice(plan.yearlyPrice),discountPercent:subscriptionDiscountPercent};}
