import {inflateRawSync} from 'node:zlib';
/** Bounded CSV/XLSX reader for the employee template. No formulas, macros or external XML entities. */
export function parseCsv(text:string):string[][]{
  text=text.replace(/^\uFEFF/,'');const rows:string[][]=[],row:string[]=[];let value='',quoted=false,afterQuote=false;
  const cell=()=>{row.push(value);value='';afterQuote=false;};const line=()=>{cell();if(row.some(v=>v.trim()))rows.push([...row]);row.length=0;};
  for(let i=0;i<text.length;i++){
    const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;afterQuote=true;}}else value+=c;}
    else if(c==='"'&&!value&&!afterQuote)quoted=true;
    else if(c===',')cell();else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;line();}
    else {if(afterQuote&&!/\s/.test(c))throw new Error('Invalid CSV: unexpected text after a quoted cell.');value+=c;}
    if(value.length>10000||row.length>40||rows.length>201)throw new Error('Use at most 200 rows and 40 columns.');
  }
  if(quoted)throw new Error('Invalid CSV: a quoted cell is not closed.');if(value||row.length)line();return rows;
}
const unescape=(text:string)=>text.replace(/&#x([a-f0-9]+);|&#(\d+);|&(amp|lt|gt|quot|apos);/gi,(_,hex,dec,name)=>hex||dec?String.fromCodePoint(Number.parseInt(hex??dec,hex?16:10)):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"} as any)[name.toLowerCase()]);
function xmlText(xml:string){return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m=>unescape(m[1])).join('');}
function unzip(bytes:Buffer){
  let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
  if(end<0)throw new Error('Invalid Excel workbook.');const entries=bytes.readUInt16LE(end+10);if(entries>100)throw new Error('Workbook contains too many entries.');
  let cursor=bytes.readUInt32LE(end+16),total=0;const files=new Map<string,string>();
  for(let i=0;i<entries;i++){
    if(cursor+46>bytes.length||bytes.readUInt32LE(cursor)!==0x02014b50)throw new Error('Invalid Excel archive.');
    const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),compressed=bytes.readUInt32LE(cursor+20),size=bytes.readUInt32LE(cursor+24),nameLen=bytes.readUInt16LE(cursor+28),extra=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32),offset=bytes.readUInt32LE(cursor+42);
    if(flags&1||![0,8].includes(method)||size>4_000_000||(total+=size)>12_000_000)throw new Error('Unsupported or oversized Excel archive.');
    const name=bytes.subarray(cursor+46,cursor+46+nameLen).toString();cursor+=46+nameLen+extra+comment;
    if(/vbaProject|externalLinks/i.test(name))throw new Error('Macros and external links are not supported.');
    if(!/^xl\/(?:sharedStrings\.xml|worksheets\/sheet1\.xml)$/.test(name))continue;
    if(offset+30>bytes.length||bytes.readUInt32LE(offset)!==0x04034b50)throw new Error('Invalid Excel entry.');
    const start=offset+30+bytes.readUInt16LE(offset+26)+bytes.readUInt16LE(offset+28);if(start+compressed>bytes.length)throw new Error('Truncated Excel entry.');
    const raw=bytes.subarray(start,start+compressed),data=method===0?raw:inflateRawSync(raw,{maxOutputLength:4_000_000});if(data.length!==size)throw new Error('Invalid Excel entry size.');
    const xml=data.toString('utf8');if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('External XML entities are not supported.');files.set(name,xml);
  }
  return files;
}
export function spreadsheetRows(fileName:string,bytes:Buffer):string[][]{
  if(bytes.length>2_000_000)throw new Error('Maximum import size is 2 MB.');
  if(/\.csv$/i.test(fileName))return parseCsv(bytes.toString('utf8'));
  if(!/\.xlsx$/i.test(fileName))throw new Error('Use CSV or XLSX; older XLS files are not supported.');
  const files=unzip(bytes),sheet=files.get('xl/worksheets/sheet1.xml');if(!sheet)throw new Error('Use the first worksheet in the employee template.');
  const strings=[...(files.get('xl/sharedStrings.xml')??'').matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(m=>xmlText(m[1]));
  const rows:string[][]=[];
  for(const row of sheet.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)){
    const values:string[]=[];
    for(const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
      const ref=/\br="([A-Z]+)\d+"/.exec(cell[1]);if(!ref)throw new Error('Workbook cells require column references.');
      let column=0;for(const c of ref[1])column=column*26+c.charCodeAt(0)-64;column--;if(column>=40)throw new Error('Use at most 40 columns.');
      const content=cell[2]??'';if(/<f\b/.test(content))throw new Error('Replace formulas with their values before importing.');
      const type=/\bt="([^"]+)"/.exec(cell[1])?.[1],raw=/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(content)?.[1]??'';
      values[column]=type==='inlineStr'?xmlText(content):type==='s'?(strings[Number(raw)]??''):unescape(raw);
    }
    if(values.some(v=>v?.trim()))rows.push(Array.from({length:values.length},(_,i)=>values[i]??''));
    if(rows.length>201)throw new Error('Import at most 200 employees at a time.');
  }
  return rows;
}
