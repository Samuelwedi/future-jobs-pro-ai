import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { createHash } from 'node:crypto';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';
import { isManagerRole } from '../middleware/companyActor';
import { uploadPrivateChatFile, readPrivateChatFile } from '../services/chatStorage';

const router = express.Router({mergeParams:true});
const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1,fields:3,fieldSize:16000}});
const uuid = (s:unknown) => typeof s==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
async function authorize(req:Request, db:any=pool, lock=false) {
 const id=verifyToken(req).id;
 if(!uuid(req.params.id))throw new Error('Unavailable');
 const user=await db.query(`SELECT id,company_id,role FROM users WHERE id=$1 AND COALESCE(is_active,TRUE)=TRUE${lock?' FOR SHARE':''}`,[id]);
 const actor=user.rows[0];
 if(!actor?.company_id)throw new Error('Unavailable');
 const task=await db.query(`SELECT id FROM tasks WHERE id=$1 AND company_id=$2 AND ($3::boolean OR assigned_to=$4)${lock?' FOR SHARE':''}`,[req.params.id,actor.company_id,isManagerRole(actor.role),id]);
 if(!task.rowCount)throw new Error('Unavailable');
 return actor;
}
async function admission(req:Request,res:Response,next:NextFunction){try{res.locals.actor=await authorize(req);res.set('Cache-Control','no-store');next();}catch{res.status(403).json({message:'Task unavailable',retryAllowed:true});}}
const metadata=(r:any)=>({id:r.id,request_key:r.request_key,note:r.note,file_name:r.file_name,file_type:r.file_type,file_size:r.file_size,uploaded_by:r.uploaded_by,created_at:r.created_at,content_path:r.file_name?`/tasks/${r.task_id}/evidence/${r.id}/content`:null});
router.use(admission);
router.get('/',async(req:Request,res:Response)=>{try{const a=await authorize(req);const r=await pool.query("SELECT * FROM task_evidence WHERE company_id=$1 AND task_id=$2 AND state='completed' ORDER BY created_at DESC",[a.company_id,req.params.id]);res.json({evidence:r.rows.map(metadata)});}catch{res.status(403).json({message:'Task evidence unavailable'});}});
function mime(buffer:Buffer):string|undefined {
 if(buffer.subarray(0,5).toString()==='%PDF-')return 'application/pdf';
 if(buffer.length>=8&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(buffer[0]===255&&buffer[1]===216&&buffer[2]===255)return 'image/jpeg';
 if(buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP')return 'image/webp';
}
router.post('/',(req,res,next)=>upload.single('file')(req,res,error=>error?res.status(400).json({message:'Choose one PDF, JPEG, PNG or WebP up to 10 MB',retryAllowed:true}):next()),async(req:Request,res:Response)=>{
 let claimed:string|undefined;let db:any;let committing=false;
 try{
  const a=await authorize(req),key=req.body.requestKey,note=req.body.note??'',file=req.file;
  if(typeof key!=='string'||! /^[a-zA-Z0-9_.:-]{16,100}$/.test(key)||typeof note!=='string'||note.length>4000||(!file&&!note.trim()))return res.status(400).json({message:'Add a receipt or note and valid request key',retryAllowed:true});
  const name=file?String(req.body.originalFileName||file.originalname):null,type=file?mime(file.buffer):null;
  if(file&&(!file.size||!type||!name||name.length>255||/[\\/\x00-\x1f\x7f]/.test(name)||! /\.(pdf|png|jpe?g|webp)$/i.test(name)))return res.status(400).json({message:'Choose a valid PDF, JPEG, PNG or WebP receipt',retryAllowed:true});
  const fingerprint=createHash('sha256').update(JSON.stringify([note,name,type])).update(file?.buffer||'').digest('hex');
  const claim=await pool.query("INSERT INTO task_evidence(task_id,company_id,uploaded_by,request_key,fingerprint,state,note,file_name,file_type,file_size) VALUES($1,$2,$3,$4,$5,'processing',$6,$7,$8,$9) ON CONFLICT(company_id,uploaded_by,task_id,request_key) DO NOTHING RETURNING id",[req.params.id,a.company_id,a.id,key,fingerprint,note,name,type,file?.size||null]);
  if(!claim.rowCount){const old=(await pool.query('SELECT * FROM task_evidence WHERE company_id=$1 AND uploaded_by=$2 AND task_id=$3 AND request_key=$4',[a.company_id,a.id,req.params.id,key])).rows[0];
   if(!old||old.fingerprint!==fingerprint)return res.status(409).json({message:'Request key already used'});
   return res.status(old.state==='completed'?200:202).json({state:old.state,evidence:old.state==='completed'?metadata(old):undefined});}
  claimed=claim.rows[0].id;
  db=await pool.connect();await db.query('BEGIN');const live=await authorize(req,db,true);
  if(live.company_id!==a.company_id)throw new Error('Changed');
  const privateId=file?await uploadPrivateChatFile(file.buffer,name!):null;
  const saved=await db.query("UPDATE task_evidence SET state='completed',private_id=$2 WHERE id=$1 RETURNING *",[claimed,privateId]);
  committing=true;await db.query('COMMIT');committing=false;
  res.status(201).json({state:'completed',evidence:metadata(saved.rows[0])});
 }catch{
  if(db&&!committing)await db.query('ROLLBACK').catch(()=>{});
  if(claimed)await pool.query("UPDATE task_evidence SET state='uncertain' WHERE id=$1 AND state='processing'",[claimed]).catch(()=>{});
  res.status(500).json({state:claimed?'uncertain':'unavailable',message:'Save not confirmed. Refresh the task before submitting again.'});
 }finally{if(db)db.release(committing);}
});
router.get('/:evidenceId/content',async(req:Request,res:Response)=>{
 let stream:any;
 try{const a=await authorize(req);if(!uuid(req.params.evidenceId))return res.sendStatus(404);
  const r=await pool.query("SELECT * FROM task_evidence WHERE id=$1 AND task_id=$2 AND company_id=$3 AND state='completed'",[req.params.evidenceId,req.params.id,a.company_id]);const row=r.rows[0];if(!row?.private_id)return res.sendStatus(404);
  stream=await readPrivateChatFile(row.private_id);const live=await authorize(req);if(live.company_id!==a.company_id)throw new Error('Changed');
  res.set({'Content-Type':row.file_type,'Content-Disposition':`attachment; filename="receipt"; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
  stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
 }catch{stream?.destroy();if(!res.headersSent)res.status(403).json({message:'Receipt unavailable'});}
});
export default router;
