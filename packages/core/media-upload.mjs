import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { invariant, DomainError } from '../contracts/index.mjs';
const exec=promisify(execFile);
export async function uploadImage(db,root,{name,base64},actorUserId){
  invariant(typeof name==='string'&&name.length>0&&name.length<=200,'INVALID_NAME','请提供文件名');
  invariant(typeof base64==='string'&&base64.length<=4*1024*1024&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64),'INVALID_IMAGE','图片最大 3MB，内容必须为 Base64');
  const input=Buffer.from(base64,'base64');invariant(input.length>0&&input.length<=3*1024*1024,'INVALID_IMAGE','图片为空或超过 3MB');
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'nc-upload-'));
  try{
    await fs.writeFile(path.join(temp,'input'),input);
    let result;
    try{result=await exec('python3',[path.join(root,'scripts/process-admin-image.py'),path.join(temp,'input'),path.join(temp,'output.webp')],{timeout:15000,maxBuffer:8192});}catch(error){if(error.code==='ENOENT'||String(error.stderr).includes('No module named'))throw new DomainError('IMAGE_PROCESSOR_UNAVAILABLE','图片处理环境未安装 Python/Pillow',503);throw new DomainError('INVALID_IMAGE','无法解码图片，请使用静态 JPG、PNG 或 WebP（最多1600万像素）');}
    const dimensions=JSON.parse(result.stdout),buffer=await fs.readFile(path.join(temp,'output.webp'));
    const hash=createHash('sha256').update(buffer).digest('hex'),id='upload-'+randomUUID(),storagePath=hash+'.webp',now=Date.now();
    await fs.mkdir(path.join(root,'var/media'),{recursive:true});
    await fs.writeFile(path.join(root,'var/media',storagePath),buffer,{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
    await db.transaction('media:'+id,async tx=>{
      await tx.query('INSERT INTO media_assets(id,storage_path,mime_type,width,height,rights_status,match_status,evidence,payload_json,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,storagePath,'image/webp',dimensions.width,dimensions.height,'pending','pending','{}',JSON.stringify({name,uploadedBy:actorUserId}),now]);
      await tx.query('INSERT INTO media_audit_log(id,media_id,action,actor_user_id,before_json,after_json,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),id,'upload',actorUserId,null,JSON.stringify({name,storagePath,...dimensions}),now]);
    });
    return {id,url:'/media/'+storagePath,rightsStatus:'pending',matchStatus:'pending',...dimensions};
  }finally{await fs.rm(temp,{recursive:true,force:true});}
}
