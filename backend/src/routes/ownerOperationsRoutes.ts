import express, { Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { authenticateAgent, AgentRequest } from './supportAgentRoutes';
import { departments, operationsSnapshot } from '../services/ownerOperationsService';
export const router=express.Router();
export function requireOwner(req:AgentRequest,res:Response,next:NextFunction) {
 if(req.supportAgent?.role!=='owner') return res.status(403).json({message:'Platform owner access required'});
 next();
}
router.use(authenticateAgent,requireOwner,(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
const validId=(v:string)=>/^[0-9a-f-]{36}$/i.test(v);
router.get('/',async(req:AgentRequest,res)=>{
 try {
 const [jobs,schedules,audit,snapshot]=await Promise.all([
 pool.query('SELECT * FROM owner_operations_jobs WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100',[req.supportAgent!.id]),
 pool.query('SELECT * FROM owner_operations_schedules WHERE owner_id=$1',[req.supportAgent!.id]),
 pool.query('SELECT * FROM owner_operations_audit WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100',[req.supportAgent!.id]), operationsSnapshot()]);
 res.json({jobs:jobs.rows,schedules:schedules.rows,audit:audit.rows,snapshot,workerEnabled:process.env.OWNER_OPERATIONS_WORKER==='true',apiConfigured:Boolean(process.env.OPENAI_API_KEY?.trim()),dailyRunLimit:12});
 }catch{res.status(503).json({message:'Operations schema or data sources unavailable. Run the owner operations migration.'});}
});
router.post('/jobs',async(req:AgentRequest,res)=>{
 const {department,instruction}=req.body||{};
 if(!departments.includes(department)||typeof instruction!=='string'||!instruction.trim()||instruction.length>4000) return res.status(400).json({message:'Choose a department and enter 1–4000 characters.'});
 if(process.env.OWNER_OPERATIONS_WORKER!=='true'||!process.env.OPENAI_API_KEY?.trim())return res.status(503).json({message:'Operations worker is not enabled and configured.'});
 try {
 const result=await pool.query(`INSERT INTO owner_operations_jobs(owner_id,department,instruction) VALUES($1,$2,$3) RETURNING *`,[req.supportAgent!.id,department,instruction.trim()]);
 res.status(201).json({job:result.rows[0]});
 }catch{res.status(503).json({message:'Could not queue task'});}
});
router.post('/jobs/:id/review',async(req:AgentRequest,res)=>{
 const {decision}=req.body||{};
 if(!validId(String(req.params.id))||!['accepted','dismissed','cancelled'].includes(decision))return res.status(400).json({message:'Invalid decision'});
 const db=await pool.connect();
 try {
 await db.query('BEGIN');
 const result=await db.query("UPDATE owner_operations_jobs SET status=$3 WHERE id=$1 AND owner_id=$2 AND status=$4 RETURNING id",[req.params.id,req.supportAgent!.id,decision,decision==='cancelled'?'queued':'review']);
 if(!result.rowCount){await db.query('ROLLBACK');return res.status(409).json({message:'Task is unavailable or its status changed'});}
 await db.query('INSERT INTO owner_operations_audit(owner_id,job_id,action) VALUES($1,$2,$3)',[req.supportAgent!.id,req.params.id,decision]);
 await db.query('COMMIT');res.json({success:true,message:'Review recorded. No external action executed.'});
 }catch{await db.query('ROLLBACK');res.status(503).json({message:'Could not record review'});}finally{db.release();}
});
router.put('/schedules/:department',async(req:AgentRequest,res)=>{
 const department=String(req.params.department),{enabled,intervalHours}=req.body||{};
 if(!departments.includes(department as any)||typeof enabled!=='boolean'||!Number.isInteger(intervalHours)||intervalHours<6||intervalHours>168)return res.status(400).json({message:'Interval must be 6–168 hours'});
 try {
 await pool.query(`INSERT INTO owner_operations_schedules(owner_id,department,enabled,interval_hours) VALUES($1,$2,$3,$4)
 ON CONFLICT(owner_id,department) DO UPDATE SET enabled=$3,interval_hours=$4,next_run_at=now()`,[req.supportAgent!.id,department,enabled,intervalHours]);
 res.json({success:true});
 }catch{res.status(503).json({message:'Could not save schedule'});}
});
export default router;
