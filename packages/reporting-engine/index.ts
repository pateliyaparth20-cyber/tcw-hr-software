const scalar=(v:unknown)=>{
  if(v instanceof Date)return v.toISOString();
  if(v===null||v===undefined)return '';
  if(typeof v==='object'){try{return JSON.stringify(v)}catch{return String(v)}}
  return String(v);
};

export function toCsv(rows:Record<string,unknown>[], columns?:string[]) {
  const keys=columns??Object.keys(rows[0]??{});
  const cell=(v:unknown)=>{
    let str=scalar(v);
    if(/^[=+\-@\t\r]/.test(str))str="'"+str;
    return '"'+str.replaceAll('"','""')+'"';
  };
  return '\uFEFF'+[keys.map(cell).join(','),...rows.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\r\n');
}

const xmlEscape=(v:unknown)=>scalar(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc32=(b:Buffer)=>{let c=0xffffffff;for(const x of b)c=crcTable[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
const zipStore=(files:{name:string,data:string|Buffer}[])=>{
  const local:Buffer[]=[],central:Buffer[]=[];let offset=0;
  for(const file of files){
    const name=Buffer.from(file.name),data=Buffer.isBuffer(file.data)?file.data:Buffer.from(file.data,'utf8'),crc=crc32(data);
    const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(0x0800,6);h.writeUInt16LE(0,8);h.writeUInt32LE(crc,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(name.length,26);
    local.push(h,name,data);
    const ch=Buffer.alloc(46);ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(0x0800,8);ch.writeUInt16LE(0,10);ch.writeUInt32LE(crc,16);ch.writeUInt32LE(data.length,20);ch.writeUInt32LE(data.length,24);ch.writeUInt16LE(name.length,28);ch.writeUInt32LE(offset,42);central.push(ch,name);
    offset+=h.length+name.length+data.length;
  }
  const centralSize=central.reduce((n,b)=>n+b.length,0),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,...central,end]);
};
const colName=(index:number)=>{let n=index+1,out='';while(n){n--;out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26)}return out;};

export function toXlsx(rows:Record<string,unknown>[],sheetName='TCW HR'){
  const keys=Object.keys(rows[0]??{});
  const widths=keys.map(k=>Math.max(12,Math.min(40,Math.max(k.length,...rows.slice(0,200).map(r=>scalar(r[k]).length))+2)));
  const header='<row r="1" ht="22" customHeight="1">'+keys.map((k,ci)=>'<c r="'+colName(ci)+'1" t="inlineStr" s="1"><is><t>'+xmlEscape(k)+'</t></is></c>').join('')+'</row>';
  const body=rows.map((row,ri)=>'<row r="'+(ri+2)+'">'+keys.map((k,ci)=>{
    const v=row[k],ref=colName(ci)+(ri+2);
    if(typeof v==='number'&&Number.isFinite(v))return '<c r="'+ref+'" t="n"><v>'+v+'</v></c>';
    if(typeof v==='boolean')return '<c r="'+ref+'" t="b"><v>'+(v?1:0)+'</v></c>';
    return '<c r="'+ref+'" t="inlineStr"><is><t xml:space="preserve">'+xmlEscape(v)+'</t></is></c>';
  }).join('')+'</row>').join('');
  const cols='<cols>'+widths.map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join('')+'</cols>';
  const last=keys.length?colName(keys.length-1):'A',filter=keys.length&&rows.length?'<autoFilter ref="A1:'+last+(rows.length+1)+'"/>':'';
  const sheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'+cols+'<sheetData>'+header+body+'</sheetData>'+filter+'</worksheet>';
  const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const safeName=xmlEscape(sheetName.replace(/[\[\]:*?\/\\]/g,' ').replace(/^'+|'+$/g,'').trim().slice(0,31)||'TCW HR');
  const files=[
    {name:'[Content_Types].xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'},
    {name:'_rels/.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
    {name:'xl/workbook.xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="'+safeName+'" sheetId="1" r:id="rId1"/></sheets></workbook>'},
    {name:'xl/_rels/workbook.xml.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'},
    {name:'xl/styles.xml',data:styles},
    {name:'xl/worksheets/sheet1.xml',data:sheet}
  ];
  return zipStore(files);
}

const pdfAscii=(v:unknown)=>scalar(v).replace(/[^\x20-\x7E]/g,'?').replace(/[()\\]/g,m=>'\\'+m);
const human=(k:string)=>k.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').replace(/^./,c=>c.toUpperCase());
const fit=(value:string,width:number)=>value.length<=width?value.padEnd(width):width<=3?value.slice(0,width):value.slice(0,width-3)+'...';

export function toPdf(rows:Record<string,unknown>[],title='TCW HR Report',options:{metadata?:string[];summary?:string[];wrapCells?:boolean}={}){
  const keys=Object.keys(rows[0]??{}),columnGroups:string[][]=[];
  if(keys.length){for(let i=0;i<keys.length;i+=6)columnGroups.push(keys.slice(i,i+6));}else columnGroups.push([]);
  const wrap=(value:string,width:number)=>{
    const lines:string[]=[];let rest=value.replace(/\s+/g,' ').trim();
    while(rest.length>width){let cut=rest.lastIndexOf(' ',width);if(cut<width/2)cut=width;lines.push(rest.slice(0,cut));rest=rest.slice(cut).trimStart();}
    lines.push(rest);return lines;
  };
  const metadata=(options.metadata??[]).flatMap(line=>wrap(line,160));
  const summary=(options.summary??[]).flatMap(line=>wrap(line,170));
  const tableTop=505-metadata.length*12,bottom=summary.length?55+summary.length*12:65;
  const pages:{content:string}[]=[];
  for(const group of columnGroups){
    const columnWidth=Math.max(10,Math.floor((options.wrapCells?174:110)/Math.max(1,group.length))),header=group.map(k=>fit(human(k),columnWidth)).join(' ');
    const rendered=rows.map(row=>{
      const cells=group.map(k=>options.wrapCells?wrap(scalar(row[k]),columnWidth):[fit(scalar(row[k]).replace(/\s+/g,' '),columnWidth)]);
      return Array.from({length:Math.max(1,...cells.map(c=>c.length))},(_,i)=>cells.map(c=>(c[i]??'').padEnd(columnWidth)).join(' '));
    });
    const chunks:string[][][]=[];let chunk:string[][]=[],used=0;
    for(const lines of rendered){
      const pageCapacity=Math.max(1,Math.floor((tableTop-18-bottom)/14));
      if(chunk.length&&lines.length<=pageCapacity&&used+lines.length>pageCapacity){chunks.push(chunk);chunk=[];used=0;}
      // Split oversized cells across pages rather than clipping their remaining text.
      for(let offset=0;offset<lines.length;){
        const capacity=Math.max(1,Math.floor((tableTop-18-bottom)/14)-used);
        const part=lines.slice(offset,offset+capacity);chunk.push(part);used+=part.length;offset+=part.length;
        if(used>=Math.floor((tableTop-18-bottom)/14)){chunks.push(chunk);chunk=[];used=0;}
      }
    }
    if(chunk.length||!chunks.length)chunks.push(chunk);
    for(const records of chunks){
      const commands:string[]=['0.15 0.23 0.36 rg','BT','/F1 15 Tf','32 556 Td','('+pdfAscii(title)+') Tj','ET','0.38 0.45 0.56 rg','BT','/F2 8 Tf','32 540 Td','('+pdfAscii('Generated '+new Date().toISOString().slice(0,19).replace('T',' ')+' UTC - '+rows.length+' record(s)')+') Tj','ET'];
      metadata.forEach((line,i)=>commands.push('BT','/F2 7 Tf',`32 ${524-i*12} Td`,'('+pdfAscii(line)+') Tj','ET'));
      if(group.length){
        commands.push('0.93 0.95 0.98 rg',`30 ${tableTop} 782 22 re f`,'0.18 0.25 0.36 rg','BT','/F2 7 Tf',`34 ${tableTop+7} Td`,'('+pdfAscii(header)+') Tj','ET');
        let lineIndex=0;
        records.forEach((lines,index)=>{for(const line of lines){const y=tableTop-18-lineIndex++*14;commands.push(index%2===1?'0.98 0.99 1 rg':'1 1 1 rg',`30 ${y-4} 782 14 re f`,'0.22 0.28 0.38 rg','BT','/F2 7 Tf',`34 ${y} Td`,'('+pdfAscii(line)+') Tj','ET');}});
      }else{
        commands.push('0.35 0.42 0.52 rg','BT','/F2 10 Tf','32 500 Td','(No records found for this report.) Tj','ET');
      }
      summary.forEach((line,i)=>commands.push('0.22 0.28 0.38 rg','BT','/F2 7 Tf',`32 ${38+(summary.length-1-i)*12} Td`,'('+pdfAscii(line)+') Tj','ET'));
      pages.push({content:commands.join('\n')});
    }
  }
  const objectCount=4+pages.length*2,objects=new Array<string>(objectCount+1);
  const kids=pages.map((_,i)=>(5+i*2)+' 0 R').join(' ');
  objects[1]='1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj';
  objects[2]='2 0 obj << /Type /Pages /Kids ['+kids+'] /Count '+pages.length+' >> endobj';
  objects[3]='3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj';
  objects[4]='4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Courier >> endobj';
  pages.forEach((page,i)=>{
    const pageId=5+i*2,contentId=pageId+1,footer='0.45 0.5 0.6 rg\nBT\n/F2 7 Tf\n760 20 Td\n(Page '+(i+1)+' of '+pages.length+') Tj\nET',content=page.content+'\n'+footer;
    objects[pageId]=pageId+' 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents '+contentId+' 0 R >> endobj';
    objects[contentId]=contentId+' 0 obj << /Length '+Buffer.byteLength(content,'utf8')+' >> stream\n'+content+'\nendstream endobj';
  });
  let pdf='%PDF-1.4\n',offsets=[0];
  for(let i=1;i<objects.length;i++){offsets[i]=Buffer.byteLength(pdf,'utf8');pdf+=objects[i]+'\n';}
  const xref=Buffer.byteLength(pdf,'utf8');pdf+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';
  for(let i=1;i<objects.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer << /Size '+objects.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
  return Buffer.from(pdf,'utf8');
}
