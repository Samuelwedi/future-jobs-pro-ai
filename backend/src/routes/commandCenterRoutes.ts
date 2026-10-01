import express from 'express';
import { pool } from '../config/database';
import { companyActor, manages } from '../middleware/companyActor';
import { resolveCompanyPayPeriod,getPayPeriodTimesheetSummary } from '../services/lucyPayrollService';
import { companyDate, validDate } from '../services/payPeriodCalendar';
const router=express.Router();
router.use(companyActor);
router.get('/overview',async(req,res)=>{
 const a=res.locals.actor,manager=manages(a);
 try{
 const company=(await pool.query(`SELECT id,name,COALESCE(to_jsonb(c)->>'timezone','UTC') timezone,
 COALESCE(to_jsonb(c)->>'payroll_schedule','weekly') schedule,to_jsonb(c)->>'pay_period_anchor' anchor,
 COALESCE((to_jsonb(c)->>'payroll_week_start')::int,1) week_start FROM companies c WHERE id=$1`,[a.company_id])).rows[0];
 // Each section carries its own failure state: an unavailable query never becomes a fake zero.
 const definitions:Record<string,{sql:string;params:any[]}>= {
 workforce:{sql:`SELECT u.id,TRIM(COALESCE(u.first_name,'')||' '||COALESCE(u.last_name,'')) name,te.clock_in,p.name project
 FROM users u LEFT JOIN LATERAL (SELECT clock_in,project_id FROM time_entries WHERE user_id=u.id AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1) te ON TRUE
 LEFT JOIN projects p ON p.id=te.project_id WHERE u.company_id=$1 AND COALESCE(u.is_active,TRUE) AND ($2 OR u.id=$3) ORDER BY name LIMIT 200`,params:[a.company_id,manager,a.id]},
 tasks:{sql:`SELECT id,description,status,created_at FROM tasks WHERE company_id=$1 AND ($2 OR assigned_to=$3) AND status NOT IN ('completed','done') ORDER BY created_at DESC LIMIT 50`,params:[a.company_id,manager,a.id]},
 approvals:{sql:`SELECT te.id,TRIM(COALESCE(u.first_name,'')||' '||COALESCE(u.last_name,'')) employee,te.clock_in,te.clock_out,te.approval_status
 FROM time_entries te JOIN users u ON u.id=te.user_id WHERE u.company_id=$1 AND ($2 OR u.id=$3) AND COALESCE(te.approval_status,'draft')<>'approved' AND te.payroll_locked_at IS NULL ORDER BY te.clock_in DESC LIMIT 100`,params:[a.company_id,manager,a.id]},
 leave:{sql:`SELECT pr.id,pr.start_date,pr.end_date,pr.status,TRIM(COALESCE(u.first_name,'')||' '||COALESCE(u.last_name,'')) employee FROM pto_requests pr JOIN users u ON u.id=pr.user_id WHERE u.company_id=$1 AND ($2 OR u.id=$3) AND pr.status='pending' ORDER BY pr.start_date LIMIT 50`,params:[a.company_id,manager,a.id]},
 activity:{sql:`SELECT id,kind,title,created_at FROM command_events WHERE company_id=$1 AND ($2 OR actor_id=$3) ORDER BY created_at DESC LIMIT 20`,params:[a.company_id,manager,a.id]},
 expenses:{sql:`SELECT id,vendor,amount,currency,status,spent_on FROM expense_claims WHERE company_id=$1 AND ($2 OR user_id=$3) AND status='pending' ORDER BY created_at DESC LIMIT 50`,params:[a.company_id,manager,a.id]}
 };
 const sections:Record<string,any>={};
 await Promise.all(Object.entries(definitions).map(async([key,{sql,params}])=>{try{sections[key]={status:'ready',rows:(await pool.query(sql,params)).rows};}catch{sections[key]={status:'unavailable',rows:[],message:'This section could not load. Check migrations or retry.'};}}));
 let payPeriod:any=null,periodError:string|null=null;
 if(manager)try{const period=await resolveCompanyPayPeriod(a.company_id);const summary=await getPayPeriodTimesheetSummary(a.company_id,period);payPeriod={...period,totals:summary.totals};}catch(e:any){periodError=e.message;}
 res.json({company,manager,sections,payPeriod,periodError,generatedAt:new Date().toISOString(),localDate:companyDate(company.timezone),limits:{workforce:200,tasks:50,approvals:100,leave:50,activity:20,expenses:50}});
 }catch{res.status(503).json({message:'Command Center is unavailable. Please retry.'});}
});
router.put('/calendar',async(req,res)=>{
 const a=res.locals.actor;if(!manages(a))return res.status(403).json({message:'Manager access required'});
 const {schedule,timezone,anchor,weekStart}=req.body;
 try{
 if(!['weekly','biweekly','semimonthly','monthly'].includes(schedule))throw new Error('Choose a payroll schedule');
 companyDate(String(timezone));
 if(anchor&&!validDate(anchor))throw new Error('Enter a valid anchor date');
 if(schedule==='biweekly'&&!anchor)throw new Error('Biweekly payroll needs a period start date');
 if(!Number.isInteger(weekStart)||weekStart<0||weekStart>6)throw new Error('Invalid week start');
 await pool.query('UPDATE companies SET payroll_schedule=$1,timezone=$2,pay_period_anchor=$3,payroll_week_start=$4 WHERE id=$5',[schedule,timezone,anchor||null,weekStart,a.company_id]);
 res.json({success:true});
 }catch(e:any){res.status(400).json({message:e.message});}
});
router.get('/search',async(req,res)=>{
 const a=res.locals.actor;const q=String(req.query.q||'').trim().slice(0,100);if(q.length<2)return res.json({results:[]});
 try{
 const projects=await pool.query(`SELECT id,name title,'project' kind,'/projects' path FROM projects WHERE company_id=$1 AND name ILIKE $2 LIMIT 10`,[a.company_id,`%${q}%`]);
 const tasks=await pool.query(`SELECT id,description title,'task' kind,'/tasks' path FROM tasks WHERE company_id=$1 AND ($3 OR assigned_to=$4) AND description ILIKE $2 LIMIT 10`,[a.company_id,`%${q}%`,manages(a),a.id]);
 res.json({results:[...projects.rows,...tasks.rows]});
 }catch{res.status(503).json({message:'Search could not load'});}
});
export default router;
