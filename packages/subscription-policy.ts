const ranks:Record<string,number>={STARTER:0,GROWTH:1,ENTERPRISE:2};
export function isPlanDowngrade(current:string,next:string){return (ranks[next]??-1)<(ranks[current]??-1);}
export function salePrice(original:number|null|undefined,discountPercent=15){return original==null?null:Math.round(original*(100-Math.max(0,Math.min(100,discountPercent)))/100);}
export function pricedPlan<T extends {monthlyPrice:number;yearlyPrice?:number|null;monthlyDiscountPercent?:number;yearlyDiscountPercent?:number}>(plan:T){
 const monthlyDiscountPercent=Math.max(0,Math.min(100,Number(plan.monthlyDiscountPercent??0)));
 const yearlyDiscountPercent=Math.max(0,Math.min(100,Number(plan.yearlyDiscountPercent??15)));
 return {...plan,monthlyListPrice:plan.monthlyPrice,yearlyListPrice:plan.yearlyPrice??null,monthlyPrice:salePrice(plan.monthlyPrice,monthlyDiscountPercent)!,yearlyPrice:salePrice(plan.yearlyPrice,yearlyDiscountPercent),monthlyDiscountPercent,yearlyDiscountPercent,discountPercent:yearlyDiscountPercent};
}
