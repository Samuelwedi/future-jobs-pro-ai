import { completeTimeEntry, employeeOvertime, refreshEmployeeOvertime, companyOvertimeSettings, lockCompanyTime } from './overtimeService';
import { companyDate } from './payPeriodCalendar';
// ============================================
// TIME ENTRY SERVICE
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import { pool } from '../config/database';
import { recordUserEvent } from './adaptiveAIService';

export async function clockIn(userId: string, projectId: string, latitude: number, longitude: number) {
  const result = await pool.query(
    `INSERT INTO time_entries (user_id, project_id, clock_in, clock_in_latitude, clock_in_longitude, company_id)
     VALUES ($1, $2, NOW(), $3, $4, (SELECT company_id FROM users WHERE id = $1))
     RETURNING *`,
    [userId, projectId, latitude, longitude]
  );
  const entry = result.rows[0];
  await recordUserEvent({ userId, eventType: 'clock_in', eventData: { projectId, timeEntryId: entry.id }, latitude, longitude });
  return entry;
}

export async function clockOut(userId: string, timeEntryId: string, latitude: number, longitude: number) {
  const company=(await pool.query('SELECT company_id FROM users WHERE id=$1',[userId])).rows[0];
  if(!company)throw new Error('Employee not found');
  const entry=await completeTimeEntry(company.company_id,userId,timeEntryId,latitude,longitude,true);
  if (entry) {
    await recordUserEvent({ userId, eventType: 'clock_out', eventData: { projectId: entry.project_id, timeEntryId: entry.id }, latitude, longitude });
  }
  return entry;
}

export async function getTimeEntries(userId: string, startDate: string, endDate: string) {
  const company=(await pool.query('SELECT company_id FROM users WHERE id=$1',[userId])).rows[0];
  if(!company)throw new Error('Employee not found');
  const computed=await employeeOvertime(pool,company.company_id,userId,startDate,endDate);
  const result = await pool.query(
    `SELECT te.*, pr.name as project_name, pr.address as project_address
     FROM time_entries te
     JOIN projects pr ON te.project_id = pr.id
     WHERE te.user_id = $1
       AND te.clock_in >= ($2::date::timestamp AT TIME ZONE $4)
       AND te.clock_in < (($3::date+1)::timestamp AT TIME ZONE $4)
     ORDER BY te.clock_in DESC`,
    [userId, startDate, endDate, computed.policy.timezone]
  );

  const entries = result.rows.map(entry => {
    const calculated=entry.payroll_locked_at ? undefined : computed.hours.get(entry.id);
    const regularHours=calculated?.regular??Number(entry.regular_hours??0);
    const overtimeHours=calculated?.overtime??Number(entry.overtime_hours??0);
    const hours=regularHours+overtimeHours;
    const alerts = buildAlerts(entry);
    return { ...entry, hours: hours.toFixed(2), regularHours: regularHours.toFixed(2), overtimeHours: overtimeHours.toFixed(2), alerts };
  });

  return entries;
}

function buildAlerts(entry: any): string[] {
  const alerts: string[] = [];
  if (!entry.clock_out) alerts.push('Still clocked in');
  return alerts;
}

export async function manualTimeEntry(
  userId: string, projectId: string, clockIn: string, clockOut: string,
  breakMinutes: number = 0, notes: string = '', createdBy: string
) {
  return mutateEntry(userId, async client => {
    const result=await client.query(`INSERT INTO time_entries(user_id,project_id,clock_in,clock_out,break_minutes,notes,is_manual,created_by,company_id,status,approval_status)
      VALUES($1,$2,$3,$4,$5,$6,true,$7,(SELECT company_id FROM users WHERE id=$1),'completed','needs_review') RETURNING *`,[userId,projectId,clockIn,clockOut,breakMinutes,notes,createdBy]);
    return {entry:result.rows[0],dates:[clockIn,clockOut]};
  });
}
export async function updateTimeEntry(entryId: string, updates: { clock_in?: string; clock_out?: string; break_minutes?: number; notes?: string }) {
  const existing=(await pool.query('SELECT user_id FROM time_entries WHERE id=$1',[entryId])).rows[0];
  if(!existing)throw new Error('Time entry not found');
  return mutateEntry(existing.user_id, async client => {
    const old=(await client.query('SELECT * FROM time_entries WHERE id=$1 FOR UPDATE',[entryId])).rows[0];
    if(old.payroll_locked_at)throw new Error('Time entry is payroll locked');
    const fields:string[]=[],values:any[]=[];
    for(const [key,value] of Object.entries(updates)){
      if(!['clock_in','clock_out','break_minutes','notes'].includes(key))throw new Error('Unsupported time entry field');
      if(value!==undefined){values.push(value);fields.push(`${key}=$${values.length}`);}
    }
    if(!fields.length)throw new Error('No fields to update');
    values.push(entryId);
    const updated=(await client.query(`UPDATE time_entries SET ${fields.join(',')},approval_status='needs_review' WHERE id=$${values.length} RETURNING *`,values)).rows[0];
    return {entry:updated,dates:[old.clock_in,old.clock_out,updated.clock_in,updated.clock_out].filter(Boolean)};
  });
}
async function mutateEntry(userId:string, mutate:(client:any)=>Promise<{entry:any;dates:any[]}>) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const company=(await client.query('SELECT company_id FROM users WHERE id=$1',[userId])).rows[0];
    if(!company)throw new Error('Employee not found');
    await lockCompanyTime(client,company.company_id);
    const policy=await companyOvertimeSettings(client,company.company_id);
    const changed=await mutate(client);
    const dates=changed.dates.map(t=>companyDate(policy.timezone,new Date(t))).sort();
    await refreshEmployeeOvertime(client,company.company_id,userId,dates[0],dates[dates.length-1]);
    const entry=(await client.query('SELECT * FROM time_entries WHERE id=$1',[changed.entry.id])).rows[0];
    await client.query('COMMIT');return entry;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

console.log('⏰ Time Entry Service loaded – Future Jobs Pro AI by Samuel B.');