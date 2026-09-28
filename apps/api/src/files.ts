import {BadRequestException,NotFoundException,ServiceUnavailableException} from '@nestjs/common';
import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {randomUUID} from 'node:crypto';
import type {Database} from '../../../packages/database';
import {audit,assertEmployee,employeeScope,requirePermission,tenant,Context} from './context';
import {id} from '../../../packages/validation';
export class FilesService {
  constructor(private db:Database){}
  private client(){if(!process.env.S3_ENDPOINT||!process.env.S3_BUCKET||!process.env.S3_ACCESS_KEY||!process.env.S3_SECRET_KEY)throw new ServiceUnavailableException('Document storage is not configured.');return new S3Client({endpoint:process.env.S3_ENDPOINT,region:process.env.S3_REGION??'us-east-1',forcePathStyle:true,credentials:{accessKeyId:process.env.S3_ACCESS_KEY,secretAccessKey:process.env.S3_SECRET_KEY}});}
  async list(ctx:Context){const tid=tenant(ctx);requirePermission(ctx,'documents','VIEW');const scope=await employeeScope(this.db,ctx);return {items:await this.db.document.findMany({where:{tenantId:tid,...(scope?{employeeId:{in:scope}}:{})},orderBy:{createdAt:'desc'},take:500})};}
  async upload(ctx:Context,file:Express.Multer.File|undefined,body:any){
    const tid=tenant(ctx);requirePermission(ctx,'documents','CREATE');if(!file)throw new BadRequestException('Choose a document.');
    if(file.size>10*1024*1024)throw new BadRequestException('Maximum file size is 10 MB.');
    const b=file.buffer,header=b.subarray(0,8);
    const allowed:Record<string,boolean>={'application/pdf':b.subarray(0,5).toString()==='%PDF-','image/png':header.equals(Buffer.from([137,80,78,71,13,10,26,10])),'image/jpeg':b[0]===255&&b[1]===216&&b[2]===255};
    if(!allowed[file.mimetype])throw new BadRequestException('Upload a valid PDF, PNG, or JPEG file.');
    const employeeId=body.employeeId?id.parse(body.employeeId):null;if(employeeId)await assertEmployee(this.db,ctx,employeeId);
    const title=String(body.title??file.originalname).trim().slice(0,200);if(!title)throw new BadRequestException('A title is required.');
    const key=`${tid}/${randomUUID()}`;const client=this.client();
    await client.send(new PutObjectCommand({Bucket:process.env.S3_BUCKET,Key:key,Body:b,ContentType:file.mimetype}));
    try{return await this.db.$transaction(async tx=>{const after=await tx.document.create({data:{tenantId:tid,employeeId,title,category:String(body.category??'General').slice(0,100),objectKey:key,fileName:file.originalname.replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,150),mimeType:file.mimetype,size:file.size}});await audit(tx,ctx,'DOCUMENT_UPLOADED','documents',after.id,undefined,after);return after;});}
    catch(e){await client.send(new DeleteObjectCommand({Bucket:process.env.S3_BUCKET,Key:key})).catch(()=>{});throw e;}
  }
  async download(ctx:Context,recordId:string){
    const tid=tenant(ctx);requirePermission(ctx,'documents','VIEW');const scope=await employeeScope(this.db,ctx);
    const row=await this.db.document.findFirst({where:{id:id.parse(recordId),tenantId:tid,...(scope?{employeeId:{in:scope}}:{})}});if(!row)throw new NotFoundException();
    const result=await this.client().send(new GetObjectCommand({Bucket:process.env.S3_BUCKET,Key:row.objectKey}));
    return {row,bytes:Buffer.from(await result.Body!.transformToByteArray())};
  }
}
