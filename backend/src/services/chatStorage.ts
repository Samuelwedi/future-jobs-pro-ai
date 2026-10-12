import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import axios from 'axios';
cloudinary.config({cloud_name:process.env.CLOUDINARY_CLOUD_NAME,api_key:process.env.CLOUDINARY_API_KEY,api_secret:process.env.CLOUDINARY_API_SECRET});

export async function uploadPrivateChatFile(buffer:Buffer,filename:string):Promise<string> {
 const publicId=`future-jobs-pro-ai/private-chat/${randomUUID()}${path.extname(filename).toLowerCase()}`;
 await new Promise<void>((resolve,reject)=>{
  const stream=cloudinary.uploader.upload_stream({public_id:publicId,resource_type:'raw',type:'authenticated',overwrite:false},(error)=>error?reject(error):resolve());
  Readable.from(buffer).pipe(stream);
 });
 return publicId;
}
export async function removePrivateChatFile(publicId:string) {
 await cloudinary.uploader.destroy(publicId,{resource_type:'raw',type:'authenticated',invalidate:true});
}
export async function readPrivateChatFile(publicId:string) {
 // Signed URL stays on the server. Members receive bytes, never a reusable CDN link.
 const url=cloudinary.utils.private_download_url(publicId,'',{resource_type:'raw',type:'authenticated',expires_at:Math.floor(Date.now()/1000)+60});
 return (await axios.get(url,{responseType:'stream',timeout:60000})).data as Readable;
}
