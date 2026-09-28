import {createHash} from 'node:crypto';

/**
 * BioMax SpeedFace 5SE Lite connector.
 *
 * BioMax documents Push Data support and states that its devices support the
 * ZKTeco PUSH SDK / REST integration model. This adapter accepts the common
 * ZK Push/ADMS ATTLOG format while preserving every vendor field in `raw`.
 * The normalized TCW gateway format remains available as a fallback.
 */
export type BiomaxVerification='FACE'|'FINGERPRINT'|'CARD'|'PIN'|'UNKNOWN';
export type BiomaxPunchType='IN'|'OUT'|'AUTO';
export type BiomaxNormalizedPunch={
  eventId:string;
  userId:string;
  timestamp:string;
  type?:BiomaxPunchType;
  verification?:BiomaxVerification;
  raw?:unknown;
};

export interface BiomaxNativeParser{
  parse(input:{headers:Record<string,string|string[]|undefined>;body:unknown}):BiomaxNormalizedPunch[];
}

const stableId=(value:string)=>createHash('sha256').update(value).digest('hex').slice(0,40);

const localParts=(date:Date,timeZone:string)=>{
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const parts=Object.fromEntries(formatter.formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return {year:Number(parts.year),month:Number(parts.month),day:Number(parts.day),hour:Number(parts.hour),minute:Number(parts.minute),second:Number(parts.second)};
};

/** Convert a device-local wall-clock timestamp to UTC without adding a runtime dependency. */
export function biomaxLocalTimestamp(value:string,timeZone='Asia/Kolkata'){
  const match=value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if(!match)throw new Error(`Invalid BioMax timestamp: ${value}`);
  const target={year:+match[1],month:+match[2],day:+match[3],hour:+match[4],minute:+match[5],second:+match[6]};
  let guess=Date.UTC(target.year,target.month-1,target.day,target.hour,target.minute,target.second);
  for(let i=0;i<4;i++){
    const actual=localParts(new Date(guess),timeZone);
    const delta=Date.UTC(target.year,target.month-1,target.day,target.hour,target.minute,target.second)-Date.UTC(actual.year,actual.month-1,actual.day,actual.hour,actual.minute,actual.second);
    if(!delta)break;
    guess+=delta;
  }
  const parsed=new Date(guess);
  if(Number.isNaN(+parsed))throw new Error(`Invalid BioMax timestamp: ${value}`);
  return parsed;
}

function punchType(status?:string):BiomaxPunchType{
  switch(String(status??'').trim()){
    case '0':case '3':case '4': return 'IN';
    case '1':case '2':case '5': return 'OUT';
    default:return 'AUTO';
  }
}

function verification(code?:string):BiomaxVerification{
  switch(String(code??'').trim()){
    case '1':case '5':case '6': return 'FINGERPRINT';
    case '2':case '4':case '7': return 'CARD';
    case '0':case '3':case '8': return 'PIN';
    case '15':case '20':case '200': return 'FACE';
    default:return 'UNKNOWN';
  }
}

export type ZkAttLogRecord={pin:string;time:string;status?:string;verify?:string;workCode?:string;reserved?:string;raw:string};

export function parseZkAttLog(body:string):ZkAttLogRecord[]{
  const rows:ZkAttLogRecord[]=[];
  for(const rawLine of body.replace(/\0/g,'').split(/\r?\n/)){
    const raw=rawLine.trim();if(!raw)continue;
    let cols=rawLine.split('\t').map(v=>v.trim());
    if(cols.length<2){
      const m=raw.match(/^(\S+)\s+(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})(?:\s+(\S+))?(?:\s+(\S+))?(?:\s+(\S+))?(?:\s+(\S+))?/);
      if(!m)continue;
      cols=[m[1],m[2],m[3]??'',m[4]??'',m[5]??'',m[6]??''];
    }
    if(!cols[0]||!/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(cols[1]??''))continue;
    rows.push({pin:cols[0],time:cols[1],status:cols[2],verify:cols[3],workCode:cols[4],reserved:cols[5],raw});
  }
  return rows;
}

export function normalizeZkAttLog(serial:string,body:string,timeZone='Asia/Kolkata'):BiomaxNormalizedPunch[]{
  return parseZkAttLog(body).map(row=>({
    eventId:`zk-${stableId(`${serial}|${row.raw}`)}`,
    userId:row.pin,
    timestamp:biomaxLocalTimestamp(row.time,timeZone).toISOString(),
    type:punchType(row.status),
    verification:verification(row.verify),
    raw:{protocol:'ZK_PUSH',statusCode:row.status??'',verifyCode:row.verify??'',workCode:row.workCode??'',reserved:row.reserved??'',line:row.raw}
  }));
}

export function zkPushOptions(serial:string){
  return [
    `GET OPTION FROM: ${serial}`,
    'Stamp=9999',
    'OpStamp=9999',
    'PhotoStamp=9999',
    'ErrorDelay=60',
    'Delay=10',
    'TransTimes=00:00;14:05',
    'TransInterval=1',
    'TransFlag=1111000000',
    'Realtime=1',
    'Encrypt=0'
  ].join('\n');
}
