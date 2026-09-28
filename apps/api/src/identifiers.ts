import {randomInt} from 'node:crypto';
import type {Database} from '../../../packages/database';

export async function allocateShortLoginId(db:Database,tenantId:string){
  for(let i=0;i<200;i++){
    const candidate=`TCW${String(randomInt(1000,10000))}`;
    const exists=await db.user.findFirst({where:{tenantId,loginId:candidate},select:{id:true}});
    if(!exists)return candidate;
  }
  throw new Error('Unable to allocate a short user ID. Please try again.');
}

export function temporaryPassword8(){
  const uppers='ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowers='abcdefghijkmnopqrstuvwxyz';
  const digits='23456789';
  const symbols='@#$%';
  const all=uppers+lowers+digits+symbols;
  const chars=[
    uppers[randomInt(uppers.length)],
    lowers[randomInt(lowers.length)],
    digits[randomInt(digits.length)],
    symbols[randomInt(symbols.length)]
  ];
  while(chars.length<8)chars.push(all[randomInt(all.length)]);
  for(let i=chars.length-1;i>0;i--){const j=randomInt(i+1);[chars[i],chars[j]]=[chars[j],chars[i]];}
  return chars.join('');
}
