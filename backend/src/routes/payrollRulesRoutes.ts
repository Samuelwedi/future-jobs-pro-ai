import express from 'express';
import {pool} from '../config/database';
import {companyActor,manages} from '../middleware/companyActor';
import {ALBERTA_2026,SOURCES,RulesSchema,rulesHash,classification,previewPayroll} from '../services/payrollRules/engine';
import {COUNTRIES,CURRENCIES,globalTemplate} from '../services/payrollRules/worldwide';
const router=express.Router();
router.use(companyActor,(req,res,next)=>{if(!manages(res.locals.actor))return res.status(403).json({success:false,message:'Payroll manager access required'});next();});
router.get('/',async(req,res)=>{try{const r=await pool.query('SELECT revision,rules,rules_hash,classification,reason,created_at FROM company_payroll_rule_versions WHERE company_id=$1 ORDER BY revision DESC LIMIT 30',[res.locals.actor.company_id]);res.json({success:true,current:r.rows[0]||null,history:r.rows,template:ALBERTA_2026,worldwideTemplate:globalTemplate(),countries:COUNTRIES,currencies:CURRENCIES,sources:SOURCES,livePayouts:false,worldwideVerified:false});}catch{res.status(503).json({success:false,message:'Payroll rules are unavailable; apply the release migration first'});}});
router.post('/preview',(req,res)=>{try{res.json({success:true,result:previewPayroll(req.body.rules,req.body.input)});}catch(e:any){res.status(422).json({success:false,message:e.message});}});
router.post('/',async(req,res)=>{
 const client=await pool.connect();try{
  const rules=RulesSchema.parse(req.body.rules),expected=req.body.expectedRevision,reason=String(req.body.reason||'').trim();
  if(!Number.isInteger(expected)||expected<0||reason.length<8||reason.length>1000)throw new Error('Provide the current revision and a reason (8–1000 characters)');
  await client.query('BEGIN');await client.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[res.locals.actor.company_id]);
  const latest=await client.query('SELECT COALESCE(MAX(revision),0)::integer revision FROM company_payroll_rule_versions WHERE company_id=$1',[res.locals.actor.company_id]);
  if(latest.rows[0].revision!==expected){await client.query('ROLLBACK');return res.status(409).json({success:false,message:'Rules changed since you opened this page. Reload before saving.'});}
  const currencyConflict=await client.query("SELECT id FROM payrolls WHERE company_id=$1 AND manual_review IS NOT NULL AND manual_review->>'currency' IS NOT NULL AND manual_review->>'currency'<>$2 LIMIT 1",[res.locals.actor.company_id,rules.currency]);if(currencyConflict.rowCount)throw new Error('This workspace already has reviewed payroll in another currency. Use a separate workspace; no FX conversion is implemented.');
  const revision=expected+1;await client.query('INSERT INTO company_payroll_rule_versions(company_id,revision,rules,rules_hash,classification,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[res.locals.actor.company_id,revision,JSON.stringify(rules),rulesHash(rules),classification(rules),reason,res.locals.actor.id]);
  await client.query('COMMIT');res.status(201).json({success:true,revision,message:'New rule revision saved. Existing payroll records were not recalculated.'});
 }catch(e:any){await client.query('ROLLBACK').catch(()=>{});res.status(422).json({success:false,message:e.message});}finally{client.release();}
});
export default router;
