import {Router,Request} from 'express';
import multer from 'multer';
import {pipeline} from 'node:stream/promises';
import {pool} from '../config/database';
import {CHAT_FILE_LIMIT,chatFileType,safeFilename} from './chatFiles';
import {uploadPrivateChatFile,removePrivateChatFile,readPrivateChatFile} from './chatStorage';
type Sender={id:string;name:string;type:'agent'|'customer'};
export function mountSupportMedia(router:Router,authorize:(req:Request,ticketId:string,write:boolean)=>Promise<Sender>,middleware:any=(_req:any,_res:any,next:any)=>next()){
 const parser=multer({storage:multer.memoryStorage(),limits:{files:1,fileSize:CHAT_FILE_LIMIT}}).single('file');
 router.post('/tickets/:ticketId/attachments',middleware,async(req,res,next)=>{try{(req as any).supportMediaSender=await authorize(req,String(req.params.ticketId),true);next();}catch(e:any){res.status(e.status||401).json({success:false,message:e.message||'Sign in to attach media'});}},(req,res,next)=>parser(req,res,(e:any)=>e?res.status(400).json({success:false,message:e.code==='LIMIT_FILE_SIZE'?'Files must be under 25 MB':e.message}):next()),async(req,res)=>{
  let storage:string|undefined;let client:any;
  try{
   const sender=(req as any).supportMediaSender as Sender;
   if(!req.file)return res.status(400).json({success:false,message:'Select a file'});
   const filename=safeFilename(req.file.originalname);const mime=chatFileType(filename,req.file.buffer);
   storage=await uploadPrivateChatFile(req.file.buffer,filename);client=await pool.connect();await client.query('BEGIN');
   const attachment=(await client.query('INSERT INTO support_attachments(ticket_id,filename,mime_type,size_bytes,storage_public_id) VALUES($1,$2,$3,$4,$5) RETURNING id',[req.params.ticketId,filename,mime,req.file.size,storage])).rows[0];
   const message=(await client.query(`INSERT INTO platform_support_messages(ticket_id,customer_user_id,support_agent_id,sender_type,sender_name,message,attachment_id)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,sender_type AS "senderType",sender_name AS "senderName",message,created_at AS "createdAt",attachment_id`,[req.params.ticketId,sender.type==='customer'?sender.id:null,sender.type==='agent'?sender.id:null,sender.type,sender.name,filename,attachment.id])).rows[0];
   await client.query('COMMIT');storage=undefined;
   const payload={...message,attachment_name:filename,attachment_type:mime,attachment_size:req.file.size};
   req.app.get('io')?.to(`room-support-ticket-${req.params.ticketId}`).emit('support-message',payload);
   req.app.get('io')?.to('platform-support-queue').emit('support-message',{ticketId:req.params.ticketId,...payload});
   res.status(201).json({success:true,message:payload});
  }catch(e:any){if(client)await client.query('ROLLBACK').catch(()=>{});if(storage)await removePrivateChatFile(storage).catch(()=>{});res.status(e.status||400).json({success:false,message:e.message||'Attachment was not saved'});}
  finally{client?.release();}
 });
 router.get('/attachments/:id/content',middleware,async(req,res)=>{
  try{
   const found=await pool.query('SELECT * FROM support_attachments WHERE id::text=$1',[req.params.id]);
   if(!found.rowCount)return res.status(404).json({message:'Attachment not found'});
   const file=found.rows[0];await authorize(req,String(file.ticket_id),false);
   res.set({'Content-Type':file.mime_type,'Content-Disposition':`inline; filename="${safeFilename(file.filename)}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
   await pipeline(await readPrivateChatFile(file.storage_public_id),res);
  }catch(e:any){if(!res.headersSent)res.status(e.status||403).json({message:'Attachment is unavailable'});else res.destroy();}
 });
}
export const supportMessageQuery=`SELECT m.id,m.sender_type AS "senderType",m.sender_name AS "senderName",m.message,m.created_at AS "createdAt",m.attachment_id,a.filename AS attachment_name,a.mime_type AS attachment_type,a.size_bytes AS attachment_size FROM platform_support_messages m LEFT JOIN support_attachments a ON a.id=m.attachment_id WHERE m.ticket_id=$1 ORDER BY m.created_at ASC`;
