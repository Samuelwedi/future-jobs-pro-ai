import {validDate} from '../services/payPeriodCalendar';
import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';

const router = express.Router();
type Actor = { id: string; companyId: string };

async function actor(req: Request): Promise<Actor> {
  const token = verifyToken(req);
  if (!token.companyId) throw new Error('Your account is not assigned to a company');
  const found = await pool.query('SELECT id,company_id,role FROM users WHERE id=$1 AND company_id=$2 AND COALESCE(is_active,TRUE)=TRUE', [token.id, token.companyId]);
  const row = found.rows[0];
  if (!row || !['boss','owner','manager','admin'].includes(String(row.role).toLowerCase())) throw new Error('Company administrator access is required');
  return { id: row.id, companyId: row.company_id };
}

async function employee(a: Actor, id: string,client:any=pool) {
  const found = await client.query('SELECT id,role FROM users WHERE id=$1 AND company_id=$2', [id, a.companyId]);
  if (!found.rowCount) throw new Error('Employee not found in your company');
  if (['boss','owner'].includes(String(found.rows[0].role).toLowerCase())) throw new Error('The owner account cannot be changed here');
}

async function audit(a: Actor, id: string, action: string, details: object = {}) {
  await pool.query('INSERT INTO company_admin_audit_logs(company_id,actor_id,employee_id,action,details) VALUES($1,$2,$3,$4,$5)', [a.companyId,a.id,id,action,JSON.stringify(details)]);
}

function masked(value: unknown, visible = 4) {
  const clean = String(value || '').replace(/\s/g, '');
  return clean ? `${'•'.repeat(Math.max(4, clean.length-visible))}${clean.slice(-visible)}` : null;
}

async function metric(sql: string, companyId: string) {
  try { return Number((await pool.query(sql,[companyId])).rows[0]?.value || 0); }
  catch (error) { console.warn('Admin metric unavailable:', (error as Error).message); return 0; }
}

router.get('/overview', async (req, res) => {
  try {
    const a = await actor(req);
    const employeesResult = await pool.query(`SELECT u.id,u.first_name,u.last_name,u.full_name,u.email,u.role,COALESCE(u.is_active,TRUE) is_active,u.date_of_birth,u.sin,
      (SELECT hourly_rate FROM compensation_history c WHERE c.user_id=u.id AND c.effective_date<=CURRENT_DATE ORDER BY effective_date DESC,created_at DESC LIMIT 1) hourly_rate,
      (SELECT effective_date FROM compensation_history c WHERE c.user_id=u.id AND c.effective_date<=CURRENT_DATE ORDER BY effective_date DESC,created_at DESC LIMIT 1) rate_effective_date
      FROM users u WHERE u.company_id=$1 AND LOWER(COALESCE(u.role,'employee')) NOT IN ('boss','owner') ORDER BY COALESCE(u.first_name,u.full_name),u.last_name`, [a.companyId]);
    const [totalEmployees,activeJobs,totalProjects,payrollMonth,revenueMonth,labourToday,revenueToday] = await Promise.all([
      metric("SELECT COUNT(*) value FROM users WHERE company_id=$1 AND LOWER(COALESCE(role,'employee')) NOT IN ('boss','owner') AND COALESCE(is_active,TRUE)=TRUE",a.companyId),
      metric("SELECT COUNT(*) value FROM projects WHERE company_id=$1 AND LOWER(COALESCE(status,'active')) IN ('active','in_progress','in progress')",a.companyId),
      metric('SELECT COUNT(*) value FROM projects WHERE company_id=$1',a.companyId),
      metric("SELECT COALESCE(SUM(pi.final_pay),0) value FROM payroll_items pi JOIN payrolls p ON p.id=pi.payroll_id WHERE p.company_id=$1 AND p.created_at>=date_trunc('month',CURRENT_DATE)",a.companyId),
      metric("SELECT COALESCE(SUM(pay.amount),0) value FROM payments pay JOIN invoices i ON i.id=pay.invoice_id WHERE i.company_id=$1 AND pay.payment_date>=date_trunc('month',CURRENT_DATE)",a.companyId),
      metric('SELECT COALESCE(SUM(te.total_wage),0) value FROM time_entries te JOIN users u ON u.id=te.user_id WHERE u.company_id=$1 AND te.clock_in::date=CURRENT_DATE',a.companyId),
      metric('SELECT COALESCE(SUM(pay.amount),0) value FROM payments pay JOIN invoices i ON i.id=pay.invoice_id WHERE i.company_id=$1 AND pay.payment_date=CURRENT_DATE',a.companyId),
    ]);
    const employees = employeesResult.rows.map((r:any)=>({ id:r.id,firstName:r.first_name||'',lastName:r.last_name||'',fullName:r.full_name||`${r.first_name||''} ${r.last_name||''}`.trim(),email:r.email,role:r.role||'employee',isActive:r.is_active,dateOfBirth:r.date_of_birth,hourlyRate:Number(r.hourly_rate||0),rateEffectiveDate:r.rate_effective_date,tax:{configured:Boolean(r.sin),maskedSin:masked(r.sin,3)},directDeposit:{configured:false,accountHolder:'',accountType:'',maskedRouting:null,maskedAccount:null}}));
    res.set('Cache-Control','no-store').json({success:true,stats:{totalEmployees,activeJobs,totalProjects,totalPayrollThisMonth:payrollMonth,revenueThisMonth:revenueMonth,marginToday:revenueToday>0?((revenueToday-labourToday)/revenueToday)*100:0,labourCostToday:labourToday,revenueToday},employees});
  } catch(error:any) { res.status(/access|required|token/i.test(error.message)?403:400).json({success:false,message:error.message}); }
});

async function write(a:Actor,id:string,action:string,work:(client:any)=>Promise<{details?:object;user?:any}>) {
 const c=await pool.connect();
 try{await c.query('BEGIN');await c.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[a.companyId]);await employee(a,id,c);const result=await work(c);
  await c.query('INSERT INTO company_admin_audit_logs(company_id,actor_id,employee_id,action,details) VALUES($1,$2,$3,$4,$5)',[a.companyId,a.id,id,action,JSON.stringify(result.details||{})]);await c.query('COMMIT');return result;
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}
const failed=(res:any,error:any)=>res.status(/access|token/i.test(error.message)?403:400).json({success:false,message:error.message});
router.patch('/employees/:id/profile',async(req,res)=>{try{
 const a=await actor(req),id=String(req.params.id),first=String(req.body.firstName||'').trim(),last=String(req.body.lastName||'').trim(),email=String(req.body.email||'').trim().toLowerCase(),role=String(req.body.role||'employee').toLowerCase();
 if(!first||!last||!/^\S+@\S+\.\S+$/.test(email))throw Error('A valid name and email are required');if(!['employee','manager'].includes(role))throw Error('Role must be employee or manager');
 const result=await write(a,id,'employee.profile_updated',async c=>{const r=await c.query('UPDATE users SET first_name=$1,last_name=$2,full_name=$3,email=$4,role=$5,is_active=$6,updated_at=NOW() WHERE id=$7 AND company_id=$8 RETURNING id,email,first_name,last_name,full_name,role,company_id,is_active',[first,last,`${first} ${last}`,email,role,req.body.isActive!==false,id,a.companyId]);return{user:r.rows[0],details:{role,isActive:req.body.isActive!==false}};});res.json({success:true,user:result.user,sessionRefreshRequired:true});
}catch(error){failed(res,error);}});
router.post('/employees/:id/compensation',async(req,res)=>{try{
 const a=await actor(req),id=String(req.params.id),rate=String(req.body.hourlyRate),date=String(req.body.effectiveDate||'');
 if(!/^\d+(\.\d{1,2})?$/.test(rate)||Number(rate)<=0||Number(rate)>10000||!validDate(date))throw Error('Enter a positive wage up to 10000 with at most two decimals and a valid effective date.');
 await write(a,id,'employee.compensation_updated',async c=>{await c.query('INSERT INTO compensation_history(user_id,hourly_rate,effective_date,created_by) VALUES($1,$2,$3,$4)',[id,rate,date,a.id]);return{details:{hourlyRate:Number(rate),effectiveDate:date}};});res.status(201).json({success:true});
}catch(error){failed(res,error);}});
router.patch('/employees/:id/tax',async(req,res)=>{try{
 const a=await actor(req),id=String(req.params.id),sin=String(req.body.sin||'').replace(/\D/g,''),dob=String(req.body.dateOfBirth||'');if((sin&&sin.length!==9)||(dob&&!validDate(dob)))throw Error('Use a nine-digit SIN and valid date of birth.');
 await write(a,id,'employee.tax_updated',async c=>{await c.query("UPDATE users SET sin=COALESCE(NULLIF($1,''),sin),date_of_birth=COALESCE(NULLIF($2,'')::date,date_of_birth),updated_at=NOW() WHERE id=$3 AND company_id=$4",[sin,dob,id,a.companyId]);return{details:{sinReplaced:Boolean(sin),dateOfBirthUpdated:Boolean(dob)}};});res.json({success:true});
}catch(error){failed(res,error);}});
router.patch('/employees/:id/direct-deposit',async(req,res)=>{try{const a=await actor(req);await employee(a,String(req.params.id));res.status(410).json({success:false,message:'Legacy bank-detail entry is retired. Use the reviewed payroll workflow.'});}catch(error){failed(res,error);}});
router.post('/employees/:id/reset-password',async(req,res)=>{try{
 const a=await actor(req),id=String(req.params.id),password=String(req.body.temporaryPassword||'');if(password.length<12||password.length>128)throw Error('Use a temporary password of 12 to 128 characters.');const hash=await bcrypt.hash(password,12);
 const result=await write(a,id,'employee.password_reset',async c=>{const r=await c.query('UPDATE users SET password_hash=$1,must_change_password=TRUE,updated_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING id,email',[hash,id,a.companyId]);return{user:r.rows[0]};});res.json({success:true,message:'Temporary password set. The employee must change it after signing in.',user:result.user});
}catch(error){failed(res,error);}});
export default router;
