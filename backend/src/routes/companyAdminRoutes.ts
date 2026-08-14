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
  if (!row || !['boss','manager','admin'].includes(String(row.role).toLowerCase())) throw new Error('Company administrator access is required');
  return { id: row.id, companyId: row.company_id };
}

async function employee(a: Actor, id: string) {
  const found = await pool.query('SELECT id,role FROM users WHERE id=$1 AND company_id=$2', [id, a.companyId]);
  if (!found.rowCount) throw new Error('Employee not found in your company');
  if (String(found.rows[0].role).toLowerCase() === 'boss' && found.rows[0].id !== a.id) throw new Error('The owner account cannot be changed here');
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
    const employeesResult = await pool.query(`SELECT u.id,u.first_name,u.last_name,u.full_name,u.email,u.role,COALESCE(u.is_active,TRUE) is_active,u.date_of_birth,u.sin,u.bank_account_holder,u.bank_account_type,u.bank_routing_number,u.bank_account_number,
      (SELECT hourly_rate FROM compensation_history c WHERE c.user_id=u.id AND c.effective_date<=CURRENT_DATE ORDER BY effective_date DESC,created_at DESC LIMIT 1) hourly_rate,
      (SELECT effective_date FROM compensation_history c WHERE c.user_id=u.id AND c.effective_date<=CURRENT_DATE ORDER BY effective_date DESC,created_at DESC LIMIT 1) rate_effective_date
      FROM users u WHERE u.company_id=$1 AND LOWER(COALESCE(u.role,'employee'))<>'boss' ORDER BY COALESCE(u.first_name,u.full_name),u.last_name`, [a.companyId]);
    const [totalEmployees,activeJobs,totalProjects,payrollMonth,revenueMonth,labourToday,revenueToday] = await Promise.all([
      metric("SELECT COUNT(*) value FROM users WHERE company_id=$1 AND LOWER(COALESCE(role,'employee'))<>'boss' AND COALESCE(is_active,TRUE)=TRUE",a.companyId),
      metric("SELECT COUNT(*) value FROM projects WHERE company_id=$1 AND LOWER(COALESCE(status,'active')) IN ('active','in_progress','in progress')",a.companyId),
      metric('SELECT COUNT(*) value FROM projects WHERE company_id=$1',a.companyId),
      metric("SELECT COALESCE(SUM(pi.final_pay),0) value FROM payroll_items pi JOIN payrolls p ON p.id=pi.payroll_id WHERE p.company_id=$1 AND p.created_at>=date_trunc('month',CURRENT_DATE)",a.companyId),
      metric("SELECT COALESCE(SUM(pay.amount),0) value FROM payments pay JOIN invoices i ON i.id=pay.invoice_id WHERE i.company_id=$1 AND pay.payment_date>=date_trunc('month',CURRENT_DATE)",a.companyId),
      metric('SELECT COALESCE(SUM(te.total_wage),0) value FROM time_entries te JOIN users u ON u.id=te.user_id WHERE u.company_id=$1 AND te.clock_in::date=CURRENT_DATE',a.companyId),
      metric('SELECT COALESCE(SUM(pay.amount),0) value FROM payments pay JOIN invoices i ON i.id=pay.invoice_id WHERE i.company_id=$1 AND pay.payment_date=CURRENT_DATE',a.companyId),
    ]);
    const employees = employeesResult.rows.map((r:any)=>({ id:r.id,firstName:r.first_name||'',lastName:r.last_name||'',fullName:r.full_name||`${r.first_name||''} ${r.last_name||''}`.trim(),email:r.email,role:r.role||'employee',isActive:r.is_active,dateOfBirth:r.date_of_birth,hourlyRate:Number(r.hourly_rate||0),rateEffectiveDate:r.rate_effective_date,tax:{configured:Boolean(r.sin),maskedSin:masked(r.sin,3)},directDeposit:{configured:Boolean(r.bank_routing_number&&r.bank_account_number),accountHolder:r.bank_account_holder||'',accountType:r.bank_account_type||'checking',maskedRouting:masked(r.bank_routing_number),maskedAccount:masked(r.bank_account_number)}}));
    res.set('Cache-Control','no-store').json({success:true,stats:{totalEmployees,activeJobs,totalProjects,totalPayrollThisMonth:payrollMonth,revenueThisMonth:revenueMonth,marginToday:revenueToday>0?((revenueToday-labourToday)/revenueToday)*100:0,labourCostToday:labourToday,revenueToday},employees});
  } catch(error:any) { res.status(/access|required|token/i.test(error.message)?403:400).json({success:false,message:error.message}); }
});

router.patch('/employees/:id/profile', async(req,res)=>{ try { const a=await actor(req),id=String(req.params.id); await employee(a,id); const first=String(req.body.firstName||'').trim(),last=String(req.body.lastName||'').trim(),email=String(req.body.email||'').trim().toLowerCase(),role=String(req.body.role||'employee').toLowerCase(); if(!first||!last||!/^\S+@\S+\.\S+$/.test(email)) throw new Error('A valid name and email are required'); if(!['employee','manager'].includes(role)) throw new Error('Role must be employee or manager'); await pool.query('UPDATE users SET first_name=$1,last_name=$2,full_name=$3,email=$4,role=$5,is_active=$6,updated_at=NOW() WHERE id=$7 AND company_id=$8',[first,last,`${first} ${last}`,email,role,req.body.isActive!==false,id,a.companyId]); await audit(a,id,'employee.profile_updated',{role,isActive:req.body.isActive!==false}); res.json({success:true}); } catch(error:any){res.status(400).json({success:false,message:error.message});} });

router.post('/employees/:id/compensation', async(req,res)=>{ try { const a=await actor(req),id=String(req.params.id); await employee(a,id); const rate=Number(req.body.hourlyRate),date=String(req.body.effectiveDate||''); if(!Number.isFinite(rate)||rate<=0||rate>10000) throw new Error('Enter a valid hourly wage'); if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Enter a valid effective date'); await pool.query('INSERT INTO compensation_history(user_id,hourly_rate,effective_date,created_by) VALUES($1,$2,$3,$4)',[id,rate,date,a.id]); await audit(a,id,'employee.compensation_updated',{hourlyRate:rate,effectiveDate:date}); res.status(201).json({success:true}); } catch(error:any){res.status(400).json({success:false,message:error.message});} });

router.patch('/employees/:id/tax', async(req,res)=>{ try { const a=await actor(req),id=String(req.params.id); await employee(a,id); const sin=String(req.body.sin||'').replace(/\D/g,''),dob=String(req.body.dateOfBirth||''); if(sin&&sin.length!==9) throw new Error('SIN must contain exactly 9 digits'); if(dob&&!/^\d{4}-\d{2}-\d{2}$/.test(dob)) throw new Error('Enter a valid date of birth'); await pool.query("UPDATE users SET sin=COALESCE(NULLIF($1,''),sin),date_of_birth=COALESCE(NULLIF($2,'')::date,date_of_birth),updated_at=NOW() WHERE id=$3 AND company_id=$4",[sin,dob,id,a.companyId]); await audit(a,id,'employee.tax_updated',{sinReplaced:Boolean(sin),dateOfBirthUpdated:Boolean(dob)}); res.json({success:true}); } catch(error:any){res.status(400).json({success:false,message:error.message});} });

router.patch('/employees/:id/direct-deposit', async(req,res)=>{ try { const a=await actor(req),id=String(req.params.id); await employee(a,id); const routing=String(req.body.routingNumber||'').replace(/\D/g,''),account=String(req.body.accountNumber||'').replace(/\D/g,''),holder=String(req.body.accountHolder||'').trim(),type=String(req.body.accountType||'checking').toLowerCase(); if(routing.length!==9) throw new Error('Routing number must contain exactly 9 digits'); if(account.length<4||account.length>17) throw new Error('Account number must contain 4 to 17 digits'); if(!holder||!['checking','savings'].includes(type)) throw new Error('Valid banking details are required'); await pool.query('UPDATE users SET bank_account_holder=$1,bank_routing_number=$2,bank_account_number=$3,bank_account_type=$4,updated_at=NOW() WHERE id=$5 AND company_id=$6',[holder,routing,account,type,id,a.companyId]); await audit(a,id,'employee.direct_deposit_updated',{accountType:type,accountLast4:account.slice(-4)}); res.json({success:true}); } catch(error:any){res.status(400).json({success:false,message:error.message});} });

router.post('/employees/:id/reset-password', async(req,res)=>{ try { const a=await actor(req),id=String(req.params.id); await employee(a,id); const password=String(req.body.temporaryPassword||''); if(password.length<12) throw new Error('Temporary password must contain at least 12 characters'); await pool.query('UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2 AND company_id=$3',[await bcrypt.hash(password,12),id,a.companyId]); await audit(a,id,'employee.password_reset'); res.json({success:true,message:'Temporary password set successfully'}); } catch(error:any){res.status(400).json({success:false,message:error.message});} });

export default router;
