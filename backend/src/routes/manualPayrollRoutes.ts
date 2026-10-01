import express from 'express';
import Big from 'big.js';
import {pool} from '../config/database';
import {companyActor,manages} from '../middleware/companyActor';
import {previewPayroll} from '../services/payrollRules/engine';
const router=express.Router();
router.use(companyActor,(req,res,next)=>{if(!manages(res.locals.actor))return res.status(403).json({success:false,message:'Payroll manager access required'});next();});
router.get('/:id',async(req,res)=>{try{
 const p=await pool.query('SELECT * FROM payrolls WHERE id=$1 AND company_id=$2',[req.params.id,res.locals.actor.company_id]);if(!p.rowCount)return res.status(404).json({success:false,message:'Payroll not found'});
 const r=await pool.query(`SELECT pi.*,u.first_name,u.last_name,m.paid_on,m.reference payment_reference,m.amount payment_amount FROM payroll_items pi JOIN users u ON u.id=pi.employee_id LEFT JOIN manual_payroll_payments m ON m.payroll_item_id=pi.id WHERE pi.payroll_id=$1`,[req.params.id]);
 res.json({success:true,payroll:p.rows[0],items:r.rows,moneyMovement:false});
}catch{res.status(503).json({success:false,message:'Manual payroll is unavailable; confirm the migration is installed'});}});
router.post('/:id/:action',async(req,res)=>{
 const client=await pool.connect();try{
 await client.query('BEGIN');const p=await client.query('SELECT * FROM payrolls WHERE id=$1 AND company_id=$2 FOR UPDATE',[req.params.id,res.locals.actor.company_id]);if(!p.rowCount)throw new Error('Payroll not found');
 const payroll=p.rows[0],action=req.params.action;
 if(action==='calculate'){
  if(payroll.status!=='draft')throw new Error('Only draft payroll can be recalculated');
  const rr=await client.query('SELECT revision,rules FROM company_payroll_rule_versions WHERE company_id=$1 ORDER BY revision DESC LIMIT 1',[res.locals.actor.company_id]);if(!rr.rowCount)throw new Error('Save company payroll rules first');
  if(req.body.rulesRevision!==rr.rows[0].revision)throw new Error('Rules changed. Reload the rules revision before calculating.');
  const item=await client.query('SELECT * FROM payroll_items WHERE id=$1 AND payroll_id=$2',[req.body.itemId,req.params.id]);if(!item.rowCount)throw new Error('Payroll item not found');
  const result=previewPayroll(rr.rows[0].rules,req.body.input),snapshot={...result,input:req.body.input,rules:rr.rows[0].rules,revision:rr.rows[0].revision,calculatedBy:res.locals.actor.id,calculatedAt:new Date().toISOString()};
  const deductions=Number(result.cpp)+Number(result.cpp2);
  await client.query(`UPDATE payroll_items SET adjustments=$1::numeric-hours*hourly_rate,cpp_deduction=$2,ei_deduction=$3,tax_deduction=$4,calculation_snapshot=$5 WHERE id=$6 AND payroll_id=$7`,[result.net,deductions,result.ei,result.incomeTax,JSON.stringify(snapshot),req.body.itemId,req.params.id]);
  await client.query('UPDATE payrolls SET manual_review=NULL WHERE id=$1',[req.params.id]);
  await client.query('COMMIT');return res.json({success:true,result,message:'Calculation saved for review. No payment was made.'});
 }
 if(action==='review'){
  if(payroll.status!=='draft')throw new Error('Only a draft can be reviewed');
  const reference=String(req.body.reference||'').trim();if(req.body.confirmed!==true||reference.length<8||reference.length>500)throw new Error('Confirm gross, YTD and deductions against an independent payroll review and provide its reference');
  const rows=await client.query('SELECT id,calculation_snapshot FROM payroll_items WHERE payroll_id=$1',[req.params.id]);
  if(!rows.rowCount||rows.rows.some((r:any)=>!r.calculation_snapshot))throw new Error('Every employee needs a saved calculation before review');
  const dates=new Set(rows.rows.map((r:any)=>r.calculation_snapshot.payDate));if(dates.size!==1)throw new Error('All employees must have the same pay date');
  const jurisdictions=new Set(rows.rows.map((r:any)=>[r.calculation_snapshot.rules.country,r.calculation_snapshot.rules.subdivision,r.calculation_snapshot.currency].join('|')));if(jurisdictions.size!==1)throw new Error('A payroll must use one country, subdivision and currency');
  await client.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[res.locals.actor.company_id]);
  const currentRules=await client.query('SELECT rules FROM company_payroll_rule_versions WHERE company_id=$1 ORDER BY revision DESC LIMIT 1',[res.locals.actor.company_id]);
  if(currentRules.rows[0]?.rules.currency!==rows.rows[0].calculation_snapshot.currency)throw new Error('Current company currency differs from these calculations; review the company configuration before approval');
  const currency=rows.rows[0].calculation_snapshot.currency,decimals=rows.rows[0].calculation_snapshot.decimals??2;
  const netTotal=rows.rows.reduce((sum:any,r:any)=>sum.plus(r.calculation_snapshot.net),new Big(0)).toFixed(decimals);
  await client.query(`UPDATE payrolls SET status='approved',manual_review=$1,total_pay=(SELECT SUM((calculation_snapshot->>'net')::numeric) FROM payroll_items WHERE payroll_id=$2),updated_at=now() WHERE id=$2`,[JSON.stringify({currency,decimals,netTotal,reviewedBy:res.locals.actor.id,reviewedAt:new Date().toISOString(),reference,items:rows.rows.map((r:any)=>({id:r.id,rulesHash:r.calculation_snapshot.rulesHash,net:r.calculation_snapshot.net})),label:'Company-reviewed, not bank-confirmed'}),req.params.id]);
  await client.query('COMMIT');return res.json({success:true,message:'Payroll reviewed. Pay through your bank, then record each payment.'});
 }
 if(action==='record-payment'){
  if(!['approved','paid'].includes(payroll.status)||!payroll.manual_review)throw new Error('Payroll needs independent review before recording payment');
  const paidOn=String(req.body.paidOn||''),reference=String(req.body.reference||'').trim();
  if(req.body.confirmed!==true||!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)||!Number.isFinite(Date.parse(paidOn))||new Date(paidOn).toISOString().slice(0,10)!==paidOn||paidOn>new Date().toISOString().slice(0,10)||reference.length<4||reference.length>200)throw new Error('Confirm payment completed in your bank, with a valid date and reference');
  const item=await client.query('SELECT calculation_snapshot FROM payroll_items WHERE id=$1 AND payroll_id=$2',[req.body.itemId,req.params.id]);const snap=item.rows[0]?.calculation_snapshot;if(!snap)throw new Error('Reviewed calculation not found');
  if(paidOn!==snap.payDate)throw new Error('Payment date must match the reviewed calculation date. A changed date requires a new reviewed payroll.');
  if(String(req.body.amount)!==snap.net)throw new Error('Confirmed amount must exactly match the reviewed net pay');
  const old=await client.query('SELECT * FROM manual_payroll_payments WHERE payroll_item_id=$1',[req.body.itemId]);
  if(old.rowCount){const o=old.rows[0];if(o.reference!==reference||(o.paid_on instanceof Date?o.paid_on.toISOString().slice(0,10):String(o.paid_on).slice(0,10))!==paidOn)throw new Error('A different payment has already been recorded');}
  else await client.query('INSERT INTO manual_payroll_payments(company_id,payroll_id,payroll_item_id,amount,currency,paid_on,reference,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[res.locals.actor.company_id,req.params.id,req.body.itemId,snap.net,snap.currency,paidOn,reference,res.locals.actor.id]);
  const missing=await client.query('SELECT count(*)::integer n FROM payroll_items pi WHERE pi.payroll_id=$1 AND NOT EXISTS(SELECT 1 FROM manual_payroll_payments m WHERE m.payroll_item_id=pi.id)',[req.params.id]);
  if(missing.rows[0].n===0)await client.query("UPDATE payrolls SET status='paid',updated_at=now() WHERE id=$1",[req.params.id]);
  await client.query('COMMIT');return res.json({success:true,moneyMovement:false,message:'External payment recorded from your confirmation; bank settlement was not verified by this app.'});
 }
 throw new Error('Unknown manual payroll action');
 }catch(e:any){await client.query('ROLLBACK').catch(()=>{});res.status(422).json({success:false,message:e.message});}finally{client.release();}
});
export default router;
