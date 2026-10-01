import express from 'express';
import { pool } from '../config/database';
import { companyActor, manages } from '../middleware/companyActor';
import { validDate } from '../services/payPeriodCalendar';
const router=express.Router();router.use(companyActor);
router.get('/',async(_req,res)=>{const a=res.locals.actor;try{
 const rows=await pool.query('SELECT e.*,a.file_url receipt_url FROM expense_claims e LEFT JOIN attachments a ON a.id=e.attachment_id AND a.company_id=e.company_id WHERE e.company_id=$1 AND ($2 OR e.user_id=$3) ORDER BY e.created_at DESC LIMIT 200',[a.company_id,manages(a),a.id]);res.json({expenses:rows.rows,manager:manages(a)});
}catch{res.status(503).json({message:'Expenses unavailable; check the release migration'});}});
router.post('/',async(req,res)=>{const a=res.locals.actor;try{
 const {vendor,amount,spentOn,projectId,notes,attachmentId}=req.body;const currency=String(req.body.currency||'CAD').toUpperCase();
 if(!String(vendor||'').trim()||String(vendor).length>200||!Number.isFinite(Number(amount))||Number(amount)<=0||Number(amount)>1000000||!validDate(String(spentOn))||!['CAD','USD'].includes(currency))return res.status(400).json({message:'Enter vendor, positive amount, valid date and CAD or USD currency'});
 if(projectId && !(await pool.query('SELECT id FROM projects WHERE id=$1 AND company_id=$2',[projectId,a.company_id])).rowCount)return res.status(403).json({message:'Project is outside your company'});
 if(attachmentId && !(await pool.query('SELECT id FROM attachments WHERE id=$1 AND company_id=$2 AND uploaded_by=$3',[attachmentId,a.company_id,a.id])).rowCount)return res.status(403).json({message:'Receipt must be your company upload'});
 const duplicate=await pool.query('SELECT id FROM expense_claims WHERE company_id=$1 AND user_id=$2 AND vendor=$3 AND amount=$4 AND spent_on=$5 AND currency=$6 AND status<>\'rejected\'',[a.company_id,a.id,String(vendor).trim(),amount,spentOn,currency]);
 if(duplicate.rowCount)return res.status(409).json({message:'A matching expense already exists. Review it before submitting again.'});
 const result=await pool.query(`INSERT INTO expense_claims(company_id,user_id,project_id,vendor,amount,currency,spent_on,notes,attachment_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[a.company_id,a.id,projectId||null,String(vendor).trim(),Number(amount),currency,spentOn,String(notes||'').slice(0,4000),attachmentId||null]);res.status(201).json({id:result.rows[0].id});
}catch{res.status(400).json({message:'Expense could not be saved. Check the fields and receipt.'});}});
router.post('/:id/review',async(req,res)=>{const a=res.locals.actor;if(!manages(a))return res.status(403).json({message:'Manager access required'});
 if(!['approved','rejected'].includes(req.body.status))return res.status(400).json({message:'Choose approve or reject'});
 try{const updated=await pool.query(`UPDATE expense_claims SET status=$1,reviewed_by=$2,reviewed_at=NOW() WHERE id=$3 AND company_id=$4 AND status='pending' AND user_id<>$2 RETURNING id`,[req.body.status,a.id,req.params.id,a.company_id]);
 if(!updated.rowCount)return res.status(409).json({message:'Claim is resolved, unavailable, or needs another manager to review your own expense'});
 res.json({success:true});}catch{res.status(400).json({message:'Expense review failed'});}});
export default router;
