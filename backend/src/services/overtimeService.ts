import { pool } from '../config/database';
import { companyDate, validateRange } from './payPeriodCalendar';
import { addDays, calculateOvertime, readOvertimePolicy, weekOf } from './overtimePolicy';

// Every caller that writes hours/settings takes this same lock inside its transaction.
export async function lockCompanyTime(client: any, companyId: string) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`payroll:${companyId}`]);
}
export async function companyOvertimeSettings(client: any, companyId: string) {
  const result = await client.query('SELECT to_jsonb(c) AS settings FROM companies c WHERE id=$1', [companyId]);
  if (!result.rows.length) throw new Error('Company not found');
  return readOvertimePolicy(result.rows[0].settings);
}

// Include complete workweeks even when the requested pay period starts in midweek.
// Expand through overnight shifts at either boundary, so no shift is counted twice.
export async function employeeOvertime(client: any, companyId: string, userId: string, start: string, end: string) {
  validateRange(start,end);
  const policy = await companyOvertimeSettings(client,companyId);
  let from = weekOf(start,policy.overtime_week_start), until = addDays(weekOf(end,policy.overtime_week_start),7);
  for (let attempt=0; attempt<32; attempt++) {
    const result = await client.query(`SELECT te.*, (SELECT hourly_rate FROM compensation_history
      WHERE user_id=te.user_id AND effective_date <= (te.clock_in AT TIME ZONE $5)::date
      ORDER BY effective_date DESC,created_at DESC LIMIT 1) AS overtime_hourly_rate
      FROM time_entries te JOIN users u ON u.id=te.user_id
      WHERE te.user_id=$1 AND u.company_id=$2 AND te.clock_out IS NOT NULL
        AND te.clock_in < ($4::date::timestamp AT TIME ZONE $5)
        AND te.clock_out > ($3::date::timestamp AT TIME ZONE $5)
      ORDER BY te.clock_in,te.id`, [userId,companyId,from,until,policy.timezone]);
    let expandedFrom=from, expandedUntil=until;
    for (const row of result.rows) {
      const first=weekOf(companyDate(policy.timezone,new Date(row.clock_in)),policy.overtime_week_start);
      const last=addDays(weekOf(companyDate(policy.timezone,new Date(+new Date(row.clock_out)-1)),policy.overtime_week_start),7);
      if(first<expandedFrom)expandedFrom=first;
      if(last>expandedUntil)expandedUntil=last;
    }
    if(expandedFrom===from && expandedUntil===until) return {rows:result.rows,policy,hours:calculateOvertime(result.rows,policy)};
    from=expandedFrom;until=expandedUntil;
  }
  throw new Error('Review shifts crossing workweek boundaries before calculating overtime');
}

export async function refreshEmployeeOvertime(client: any, companyId: string, userId: string, start: string, end: string, verifyLocked = true, requireApproved = false, policyChanged = false) {
  const computed = await employeeOvertime(client,companyId,userId,start,end);
  if(requireApproved && computed.rows.some((row:any)=>!row.payroll_locked_at && row.approval_status!=='approved'))
    throw new Error('Approve all completed time entries in the affected workweeks before preparing payroll');
  if(verifyLocked)for(const row of computed.rows.filter((entry:any)=>entry.payroll_locked_at)) {
    const hours=computed.hours.get(row.id)!;
    if(Math.abs(Number(row.regular_hours)-hours.regular)>0.011 || Math.abs(Number(row.overtime_hours)-hours.overtime)>0.011)
      throw new Error('The overtime policy conflicts with payroll-locked hours in this workweek. Review the existing payroll and policy before preparing another run.');
  }
  for(const row of computed.rows) {
    const hours = computed.hours.get(row.id)!;
    if (row.payroll_locked_at) continue;
    const rate = Number(row.overtime_hourly_rate);
    const wage = Number.isFinite(rate) && rate>0 ? (hours.regular+hours.overtime*computed.policy.overtime_multiplier)*rate : null;
    const roundedWage=wage===null?null:Math.round((wage+Number.EPSILON)*100)/100;
    const changed=Math.abs(Number(row.regular_hours||0)-hours.regular)>0.011 ||
      Math.abs(Number(row.overtime_hours||0)-hours.overtime)>0.011 ||
      (row.total_wage===null ? roundedWage!==null : roundedWage===null || Math.abs(Number(row.total_wage)-roundedWage)>0.011);
    const approval=policyChanged && changed && row.approval_status==='approved'?'needs_review':row.approval_status;
    await client.query(`UPDATE time_entries SET regular_hours=$1,overtime_hours=$2,total_wage=$3,approval_status=$4
      WHERE id=$5 AND payroll_locked_at IS NULL`,[hours.regular,hours.overtime,roundedWage,approval,row.id]);
  }
  return computed;
}

export async function refreshCompanyOvertime(client:any, companyId:string) {
  const policy=await companyOvertimeSettings(client,companyId);
  const pending=await client.query(`SELECT te.user_id,te.clock_in FROM time_entries te JOIN users u ON u.id=te.user_id
    WHERE u.company_id=$1 AND te.clock_out IS NOT NULL AND te.payroll_locked_at IS NULL ORDER BY te.clock_in`,[companyId]);
  const seen=new Set<string>();
  for(const row of pending.rows) {
    const date=weekOf(companyDate(policy.timezone,new Date(row.clock_in)),policy.overtime_week_start);
    const key=row.user_id+':'+date;
    if(seen.has(key))continue;
    seen.add(key);
    await refreshEmployeeOvertime(client,companyId,row.user_id,date,addDays(date,6),false,false,true);
  }
}

// Record the actual clock-out even if historical paid hours use an older policy.
// Payroll preparation separately checks locked workweek conflicts before paying.
export async function completeTimeEntry(companyId: string, userId: string, entryId: string | null, latitude: any, longitude: any, kiosk = false) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');await lockCompanyTime(client,companyId);
    const columns=kiosk?'clock_out_latitude=$1,clock_out_longitude=$2':'latitude_out=$1,longitude_out=$2';
    const result=await client.query(`UPDATE time_entries te SET clock_out=NOW(),${columns},status='completed'
      FROM users u WHERE te.user_id=u.id AND u.company_id=$3 AND u.id=$4 AND COALESCE(u.is_active,TRUE)=TRUE
      AND ($5::uuid IS NULL OR te.id=$5::uuid) AND te.clock_out IS NULL AND te.payroll_locked_at IS NULL RETURNING te.*`,
      [latitude??null,longitude??null,companyId,userId,entryId]);
    if(!result.rows.length)throw new Error('Active time entry not found');
    const policy=await companyOvertimeSettings(client,companyId);
    for(const row of result.rows)await refreshEmployeeOvertime(client,companyId,userId,companyDate(policy.timezone,new Date(row.clock_in)),companyDate(policy.timezone,new Date(row.clock_out)),false);
    const entry=(await client.query('SELECT * FROM time_entries WHERE id=$1',[result.rows[0].id])).rows[0];
    await client.query('COMMIT');return entry;
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}
