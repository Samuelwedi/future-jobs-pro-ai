import express from 'express';
import PDFDocument from 'pdfkit';
import {pool} from '../config/database';
import {companyActor,manages} from '../middleware/companyActor';
import {validDate,validateRange} from '../services/payPeriodCalendar';
const router=express.Router();
router.use(companyActor,(_req,res,next)=>{if(!manages(res.locals.actor))return res.status(403).json({message:'Manager access required'});next();});
router.get('/',async(req,res)=>{
 try{
  const format=String(req.query.format||'csv');if(!['csv','pdf'].includes(format))return res.status(400).json({message:'Choose PDF or CSV export.'});
  const start=String(req.query.start||'all'),end=String(req.query.end||'all'),employee=String(req.query.employeeId||'');
  if((start==='all')!==(end==='all'))throw Error('Choose both dates or all dates.');
  if(start!=='all'){if(!validDate(start)||!validDate(end))throw Error('Use valid calendar dates.');validateRange(start,end);}
  if(employee&&!/^[a-f0-9-]{36}$/i.test(employee))throw Error('Invalid employee.');
  if(employee&&!(await pool.query('SELECT id FROM users WHERE id=$1 AND company_id=$2',[employee,res.locals.actor.company_id])).rowCount)return res.status(403).json({message:'Employee outside your company.'});
  const rows=await pool.query(`SELECT p.id payroll_id,p.period_start,p.period_end,p.status,pi.id item_id,pi.hours,pi.hourly_rate,pi.adjustments,pi.cpp_deduction,pi.ei_deduction,pi.tax_deduction,pi.calculation_snapshot,u.first_name,u.last_name FROM payrolls p JOIN payroll_items pi ON pi.payroll_id=p.id JOIN users u ON u.id=pi.employee_id AND u.company_id=p.company_id WHERE p.company_id=$1 AND ($2::date IS NULL OR (p.period_start>=$2::date AND p.period_end<=$3::date)) AND ($4::text='' OR pi.employee_id=NULLIF($4,'')::uuid) ORDER BY p.period_start DESC,u.first_name LIMIT 10001`,[res.locals.actor.company_id,start==='all'?null:start,end==='all'?null:end,employee]);
  // NULL ranges are handled explicitly; no unbounded export is silently truncated.
  if(rows.rowCount>10000)return res.status(413).json({message:'Choose a smaller export range.'});
  const headers=['Payroll','Employee','Period start','Period end','Status','Hours','Hourly rate','Gross','Net','Currency'];
  const data=rows.rows.map(r=>{const snap=r.calculation_snapshot;return [r.payroll_id,`${r.first_name||''} ${r.last_name||''}`.trim(),String(r.period_start instanceof Date?r.period_start.toISOString():r.period_start).slice(0,10),String(r.period_end instanceof Date?r.period_end.toISOString():r.period_end).slice(0,10),r.status,r.hours,r.hourly_rate,snap?.gross??'',snap?.net??'',snap?.currency??''];});
  res.set('Cache-Control','no-store');
  if(format==='csv'){const cell=(v:unknown)=>{let text=String(v??'');if(/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};res.type('text/csv').set('Content-Disposition','attachment; filename="payroll.csv"');return res.send('\uFEFF'+[headers,...data].map(row=>row.map(cell).join(',')).join('\r\n'));}
  const document=new PDFDocument({margin:36,size:'A4'});res.type('application/pdf').set('Content-Disposition','attachment; filename="payroll.pdf"');document.pipe(res);document.fontSize(18).text('Payroll records');document.fontSize(10).text('Draft preparation is not a reviewed calculation or a payment. Net pay is shown only for saved calculations.').moveDown();
  if(!data.length)document.text('No payroll records for this range.');
  for(const row of data){if(document.y>700)document.addPage();document.fontSize(11).text(`${row[1]} | ${row[2]} - ${row[3]} | ${row[4]}`);document.fontSize(9).text(`Hours: ${row[5]} | Rate: ${row[6]} | Gross: ${row[7]} | Net: ${row[8]} ${row[9]}`).moveDown();}document.end();
 }catch(error:any){res.status(400).json({message:error.message||'Payroll export failed.'});}
});
export default router;
