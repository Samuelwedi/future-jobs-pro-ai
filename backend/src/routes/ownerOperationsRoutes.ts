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
 const [jobs,schedules,audit,snapshot,leads]=await Promise.all([
 pool.query('SELECT * FROM owner_operations_jobs WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100',[req.supportAgent!.id]),
 pool.query('SELECT * FROM owner_operations_schedules WHERE owner_id=$1',[req.supportAgent!.id]),
 pool.query('SELECT * FROM owner_operations_audit WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100',[req.supportAgent!.id]), operationsSnapshot(),pool.query('SELECT * FROM owner_sales_leads WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT 200',[req.supportAgent!.id])]);
 res.json({leads:leads.rows,jobs:jobs.rows,schedules:schedules.rows,audit:audit.rows,snapshot,workerEnabled:process.env.OWNER_OPERATIONS_WORKER==='true',apiConfigured:Boolean(process.env.OPENAI_API_KEY?.trim()),dailyRunLimit:12});
 }catch{res.status(503).json({message:'Operations schema or data sources unavailable. Run the owner operations migration.'});}
});
router.post('/jobs',async(req:AgentRequest,res)=>{
 const {department,instruction}=req.body||{};
 if(!departments.includes(department)||typeof instruction!=='string'||!instruction.trim()||instruction.length>4000) return res.status(400).json({message:'Choose a department and enter 1–4000 characters.'});
 if(process.env.OWNER_OPERATIONS_WORKER!=='true'||!process.env.OPENAI_API_KEY?.trim())return res.status(503).json({message:'Operations worker is not enabled and configured.'});
 const ticketId=req.body.ticketId;
 if(ticketId!==undefined&&(department!=='support'||typeof ticketId!=='string'||ticketId.length>100))return res.status(400).json({message:'Invalid support ticket'});
 const db=await pool.connect();
 try {
 await db.query('BEGIN');
 await db.query('SELECT id FROM platform_support_agents WHERE id=$1 FOR UPDATE',[req.supportAgent!.id]);
 const pending=await db.query("SELECT count(*)::int AS n FROM owner_operations_jobs WHERE owner_id=$1 AND status IN ('queued','running')",[req.supportAgent!.id]);
 if(pending.rows[0].n>=12){await db.query('ROLLBACK');return res.status(429).json({message:'Your queue is full. Wait for a review or cancel a task.'});}
 if(ticketId){const ticket=await db.query("SELECT id FROM support_tickets WHERE id::text=$1 AND status='open'",[ticketId]);if(!ticket.rowCount){await db.query('ROLLBACK');return res.status(404).json({message:'Open ticket not found'});}}
 const result=await db.query('INSERT INTO owner_operations_jobs(owner_id,department,instruction,ticket_id) VALUES($1,$2,$3,$4) RETURNING *',[req.supportAgent!.id,department,instruction.trim(),ticketId||null]);
 await db.query("INSERT INTO owner_operations_audit(owner_id,job_id,action) VALUES($1,$2,'queued')",[req.supportAgent!.id,result.rows[0].id]);
 await db.query('COMMIT');
 res.status(201).json({job:result.rows[0]});
 }catch{await db.query('ROLLBACK').catch(()=>{});res.status(503).json({message:'Could not queue task'});}finally{db.release();}
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
 await pool.query(`WITH saved AS (INSERT INTO owner_operations_schedules(owner_id,department,enabled,interval_hours) VALUES($1,$2,$3,$4)
 ON CONFLICT(owner_id,department) DO UPDATE SET enabled=$3,interval_hours=$4,next_run_at=now() RETURNING owner_id,department,enabled) INSERT INTO owner_operations_audit(owner_id,action) SELECT owner_id,'schedule:'||department||':'||enabled FROM saved`,[req.supportAgent!.id,department,enabled,intervalHours]);
 res.json({success:true});
 }catch{res.status(503).json({message:'Could not save schedule'});}
});
router.post('/leads',async(req:AgentRequest,res)=>{
 const {name,contact='',notes=''}=req.body||{};
 if(typeof name!=='string'||!name.trim()||name.length>200||typeof contact!=='string'||contact.length>300||typeof notes!=='string'||notes.length>4000)return res.status(400).json({message:'Enter a name (up to 200 characters), contact (300) and notes (4000).'});
 const result=await pool.query(`WITH created AS (INSERT INTO owner_sales_leads(owner_id,name,contact,notes) VALUES($1,$2,$3,$4) RETURNING *), audited AS (INSERT INTO owner_operations_audit(owner_id,action) SELECT owner_id,'lead_created:'||id FROM created) SELECT * FROM created`,[req.supportAgent!.id,name.trim(),contact.trim(),notes.trim()]);
 res.status(201).json({lead:result.rows[0]});
});
router.patch('/leads/:id',async(req:AgentRequest,res)=>{
 const {stage,nextFollowUp}=req.body||{};
 if(!validId(String(req.params.id))||!['new','qualified','proposal','won','lost'].includes(stage)||(nextFollowUp!==null&&(typeof nextFollowUp!=='string'||!Number.isFinite(Date.parse(nextFollowUp)))))return res.status(400).json({message:'Invalid stage or follow-up date'});
 const result=await pool.query(`WITH changed AS (UPDATE owner_sales_leads SET stage=$3,next_follow_up=$4,updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING *), audited AS (INSERT INTO owner_operations_audit(owner_id,action) SELECT owner_id,'lead_stage:'||id||':'||stage FROM changed) SELECT * FROM changed`,[req.params.id,req.supportAgent!.id,stage,nextFollowUp]);
 if(!result.rowCount)return res.status(404).json({message:'Lead not found'});
 res.json({lead:result.rows[0]});
});
export default router;
