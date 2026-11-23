import {BadRequestException,NotFoundException,ServiceUnavailableException} from '@nestjs/common';
import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {randomUUID} from 'node:crypto';
import type {Database} from '../../../packages/database';
import {audit,assertEmployee,employeeScope,requirePermission,tenant,Context} from './context';
import {CloudStorage,storageClient} from './cloud-storage';
import {id,date} from '../../../packages/validation';
export class FilesService {
  constructor(private db:Database,private createClient=storageClient){}
  private async connection(){const config=await new CloudStorage(this.db).connection();if(!config)throw new ServiceUnavailableException('TCW Cloud Drive is not connected. Ask Super Admin to configure storage.');return {client:this.createClient(config),bucket:config.bucket};}
  async status(ctx:Context){tenant(ctx);requirePermission(ctx,'documents','VIEW');return new CloudStorage(this.db).status();}
  async list(ctx:Context,query:any={}){const tid=tenant(ctx);requirePermission(ctx,'documents','VIEW');const scope=await employeeScope(this.db,ctx),base={tenantId:tid,...(scope?{employeeId:{in:scope}}:{})};const q=String(query.q??'').trim().slice(0,200),page=Math.max(1,Math.min(100000,Number.parseInt(query.page)||1)),pageSize=Math.max(1,Math.min(100,Number.parseInt(query.pageSize)||25));const where={...base,...(q?{OR:[{title:{contains:q,mode:'insensitive' as const}},{fileName:{contains:q,mode:'insensitive' as const}},{category:{contains:q,mode:'insensitive' as const}}]}:{})};const [items,total,usage]=await Promise.all([this.db.document.findMany({where,select:{id:true,employeeId:true,title:true,category:true,fileName:true,mimeType:true,size:true,expiresAt:true,createdAt:true,updatedAt:true},orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(page-1)*pageSize,take:pageSize}),this.db.document.count({where}),this.db.document.aggregate({where:base,_sum:{size:true},_count:{_all:true}})]);return {items,total,page,pageSize,totalFiles:usage._count._all,totalBytes:usage._sum.size??0};}
  async upload(ctx:Context,file:Express.Multer.File|undefined,body:any){
    const tid=tenant(ctx);requirePermission(ctx,'documents','CREATE');if(!file)throw new BadRequestException('Choose a document.');
    if(file.size>10*1024*1024)throw new BadRequestException('Maximum file size is 10 MB.');
    const b=file.buffer,header=b.subarray(0,8);
    const allowed:Record<string,boolean>={'application/pdf':b.subarray(0,5).toString()==='%PDF-','image/png':header.equals(Buffer.from([137,80,78,71,13,10,26,10])),'image/jpeg':b[0]===255&&b[1]===216&&b[2]===255};
    if(!allowed[file.mimetype])throw new BadRequestException('Upload a valid PDF, PNG, or JPEG file.');
    const employeeId=body.employeeId?id.parse(body.employeeId):null;if(employeeId)await assertEmployee(this.db,ctx,employeeId);
    const title=String(body.title??file.originalname).trim().slice(0,200);if(!title)throw new BadRequestException('A title is required.');
    const expiresAt=body.expiresAt?date.parse(body.expiresAt):null;
    const key=`${tid}/${randomUUID()}`;const {client,bucket}=await this.connection();
    await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:b,ContentType:file.mimetype}));
    try{return await this.db.$transaction(async tx=>{const after=await tx.document.create({data:{tenantId:tid,employeeId,title,category:String(body.category??'General').slice(0,100),objectKey:key,fileName:file.originalname.replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,150),mimeType:file.mimetype,size:file.size,expiresAt}});await audit(tx,ctx,'DOCUMENT_UPLOADED','documents',after.id,undefined,after);return after;});}
    catch(e){await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key})).catch(()=>{});throw e;}
  }
  async download(ctx:Context,recordId:string){
    const tid=tenant(ctx);requirePermission(ctx,'documents','VIEW');const scope=await employeeScope(this.db,ctx);
    const row=await this.db.document.findFirst({where:{id:id.parse(recordId),tenantId:tid,...(scope?{employeeId:{in:scope}}:{})}});if(!row)throw new NotFoundException();
    const {client,bucket}=await this.connection();const result=await client.send(new GetObjectCommand({Bucket:bucket,Key:row.objectKey}));
    return {row,bytes:Buffer.from(await result.Body!.transformToByteArray())};
  }
}
