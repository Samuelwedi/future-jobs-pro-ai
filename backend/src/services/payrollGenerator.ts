import { pool } from '../config/database';
import { validateRange } from './payPeriodCalendar';

interface PayrollGenerationResult { payrollId:string; employeeCount:number; totalHours:number; totalPay:number; }
interface EmployeeRateOverride { employeeId:string; hourlyRate:number; }
interface VacationPolicy { rate:number; method:'accrue'|'each_pay'; }

// Drafts contain gross preparation only. Deductions require the explicit calculation and review workflow.

export async function generatePayroll(companyId:string,periodStart:string,periodEnd:string,createdBy:string|null=null,employeeRates:EmployeeRateOverride[]=[],selectedEmployeeIds:string[]=[]):Promise<PayrollGenerationResult>{
 validateRange(periodStart,periodEnd);
 for(const rate of employeeRates)if(!Number.isFinite(Number(rate.hourlyRate))||Number(rate.hourlyRate)<=0)throw new Error('Hourly rates must be positive numbers');
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`payroll:${companyId}`]);
  const duplicate=await client.query('SELECT id FROM payrolls WHERE company_id=$1 AND period_start=$2::date AND period_end=$3::date',[companyId,periodStart,periodEnd]);
  if(duplicate.rowCount)throw new Error('A payroll already exists for these dates; review the existing run');
  const settings=await client.query("SELECT COALESCE(NULLIF(to_jsonb(c)->>'timezone',''),'UTC') timezone, COALESCE((to_jsonb(c)->>'overtime_multiplier')::numeric,1.5) multiplier FROM companies c WHERE id=$1",[companyId]);
  if(!settings.rowCount)throw new Error('Company was not found');
  const ruleRow=await client.query(`SELECT rules FROM company_payroll_rule_versions WHERE company_id=$1 AND (rules->>'effectiveFrom')::date <= $2::date AND (rules->>'effectiveTo')::date >= $2::date ORDER BY revision DESC LIMIT 1`,[companyId,periodEnd]);
  const companyPolicy=ruleRow.rows[0]?.rules?.policy;
  const multiplier=Number(companyPolicy?.overtimeMultiplier??settings.rows[0].multiplier);
  if(!Number.isFinite(multiplier)||multiplier<1)throw new Error('Configure a valid overtime multiplier');
  const timeEntries=await client.query(`SELECT te.user_id,te.regular_hours,te.overtime_hours,te.id FROM time_entries te JOIN users u ON te.user_id=u.id WHERE u.company_id=$1 AND te.clock_in >= ($2::date::timestamp AT TIME ZONE $5) AND te.clock_in < (($3::date+1)::timestamp AT TIME ZONE $5) AND te.status='completed' AND te.approval_status='approved' AND te.payroll_locked_at IS NULL AND (cardinality($4::uuid[])=0 OR te.user_id=ANY($4::uuid[])) FOR UPDATE OF te`,[companyId,periodStart,periodEnd,selectedEmployeeIds,settings.rows[0].timezone]);
  if(!timeEntries.rowCount)throw new Error('No approved, unlocked time entries found in this period');
  const overrides=new Map(employeeRates.map(r=>[r.employeeId,Number(r.hourlyRate)]));
  const employeeIds=[...new Set<string>(timeEntries.rows.map((r:any)=>String(r.user_id)))];
  const rates=new Map<string,number>(),policies=new Map<string,VacationPolicy>();
  for(const employeeId of employeeIds){
   if(overrides.has(employeeId))rates.set(employeeId,overrides.get(employeeId)!);
   else{const rr=await client.query(`SELECT hourly_rate FROM compensation_history WHERE user_id=$1 AND effective_date<=$2::date ORDER BY effective_date DESC,created_at DESC LIMIT 1`,[employeeId,periodEnd]);rates.set(employeeId,Number(rr.rows[0]?.hourly_rate||0));}
   if(!Number.isFinite(rates.get(employeeId)) || rates.get(employeeId)!<=0)throw new Error('Every employee needs a positive hourly rate before payroll');
   const pr=await client.query(`SELECT COALESCE(vacation_pay_rate,4) rate,COALESCE(vacation_pay_method,'accrue') method FROM users WHERE id=$1`,[employeeId]);
   policies.set(employeeId,{rate:Number(pr.rows[0]?.rate||0),method:pr.rows[0]?.method==='each_pay'?'each_pay':'accrue'});
  }
  const grouped=new Map<string,{hours:number;pay:number;rate:number;ids:string[]}>();
  for(const row of timeEntries.rows){const id=String(row.user_id),rate=rates.get(id)||0,regular=Number(row.regular_hours||0),overtime=Number(row.overtime_hours||0);if(!grouped.has(id))grouped.set(id,{hours:0,pay:0,rate,ids:[]});const g=grouped.get(id)!;g.hours+=regular+overtime;g.pay+=regular*rate+overtime*rate*multiplier;g.ids.push(String(row.id));}
  let totalHours=0,totalPay=0;for(const g of grouped.values()){totalHours+=g.hours;totalPay+=g.pay;}
  const payroll=await client.query(`INSERT INTO payrolls(company_id,period_start,period_end,total_hours,total_pay,created_by,status) VALUES($1,$2,$3,$4,$5,$6,'draft') RETURNING id`,[companyId,periodStart,periodEnd,totalHours,totalPay,createdBy]);const payrollId=payroll.rows[0].id;
  for(const [employeeId,g] of grouped){
   const policy=policies.get(employeeId)||{rate:0,method:'accrue' as const};const earnedVacation=Number((g.pay*policy.rate/100).toFixed(2)),vacationPaid=policy.method==='each_pay'?earnedVacation:0,taxable=g.pay+vacationPaid;const cpp=0,ei=0,tax=0,adjustments=(g.pay-g.hours*g.rate)+vacationPaid-cpp-ei-tax;
   await client.query(`INSERT INTO payroll_items(payroll_id,employee_id,hours,hourly_rate,adjustments,cpp_deduction,ei_deduction,tax_deduction,timesheet_ids,vacation_hours,banked_hours,vacation_pay) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[payrollId,employeeId,g.hours,g.rate,adjustments,cpp,ei,tax,g.ids,0,0,vacationPaid]);
   // Draft preparation must not change the employee's accrued vacation balance.
   await client.query(`UPDATE time_entries SET payroll_locked_at=NOW() WHERE id=ANY($1::uuid[])`,[g.ids]);
  }
  await client.query('COMMIT');return{payrollId,employeeCount:grouped.size,totalHours,totalPay};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
