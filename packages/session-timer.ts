export const MAX_NODE_TIMER_MS=2_147_000_000;

function timestamp(value:Date|string|number){
  if(value instanceof Date)return value.getTime();
  if(typeof value==='number')return value;
  return new Date(value).getTime();
}

export function sessionExpiryTimerDelay(expiresAt:Date|string|number,now=Date.now()){
  const expiry=timestamp(expiresAt);
  if(!Number.isFinite(expiry))return 0;
  return Math.min(MAX_NODE_TIMER_MS,Math.max(0,expiry-now));
}
