export function toCsv(rows:Record<string,unknown>[], columns?:string[]) {
  const keys=columns??Object.keys(rows[0]??{});
  const cell=(v:unknown)=>{
    let str=v instanceof Date?v.toISOString():v===null||v===undefined?'':typeof v==='object'?JSON.stringify(v):String(v);
    if(/^[=+\-@\t\r]/.test(str)) str="'"+str;
    return '"'+str.replaceAll('"','""')+'"';
  };
  return '\uFEFF'+[keys.map(cell).join(','),...rows.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\r\n');
}


const xmlEscape=(v:unknown)=>String(v instanceof Date?v.toISOString():v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc32=(b:Buffer)=>{let c=0xffffffff;for(const x of b)c=crcTable[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
const zipStore=(files:{name:string,data:string}[])=>{
  const local:Buffer[]=[],central:Buffer[]=[];let offset=0;
  for(const file of files){
    const name=Buffer.from(file.name),data=Buffer.from(file.data,'utf8'),crc=crc32(data);
    const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(0,6);h.writeUInt16LE(0,8);h.writeUInt32LE(crc,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(name.length,26);
    local.push(h,name,data);
    const ch=Buffer.alloc(46);ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(0,8);ch.writeUInt16LE(0,10);ch.writeUInt32LE(crc,16);ch.writeUInt32LE(data.length,20);ch.writeUInt32LE(data.length,24);ch.writeUInt16LE(name.length,28);ch.writeUInt32LE(offset,42);central.push(ch,name);
    offset+=h.length+name.length+data.length;
  }
  const centralSize=central.reduce((n,b)=>n+b.length,0),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,...central,end]);
};
export function toXlsx(rows:Record<string,unknown>[],sheetName='TCW HR'){
  const keys=Object.keys(rows[0]??{}),all=[keys,...rows.map(r=>keys.map(k=>r[k]))];
  const sheetRows=all.map((row,ri)=>'<row r="'+(ri+1)+'">'+row.map((v,ci)=>{let n=ci+1,col='';while(n){n--;col=String.fromCharCode(65+n%26)+col;n=Math.floor(n/26);}return '<c r="'+col+(ri+1)+'" t="inlineStr"><is><t>'+xmlEscape(v)+'</t></is></c>';}).join('')+'</row>').join('');
  const files=[
    {name:'[Content_Types].xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'},
    {name:'_rels/.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
    {name:'xl/workbook.xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="'+xmlEscape(sheetName).slice(0,31)+'" sheetId="1" r:id="rId1"/></sheets></workbook>'},
    {name:'xl/_rels/workbook.xml.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'},
    {name:'xl/worksheets/sheet1.xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+sheetRows+'</sheetData></worksheet>'}
  ];
  return zipStore(files);
}
