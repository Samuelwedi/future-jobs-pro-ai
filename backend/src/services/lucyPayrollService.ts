import { pool } from '../config/database';
import { PayPeriod, resolveCalendar, validateRange } from './payPeriodCalendar';
export { PayPeriod } from './payPeriodCalendar';
export async function resolveCompanyPayPeriod(companyId: string, requested = 'this pay period'): Promise<PayPeriod> {
 const result=await pool.query(`SELECT COALESCE(NULLIF(to_jsonb(c)->>'payroll_schedule',''),'weekly') schedule,
 COALESCE(NULLIF(to_jsonb(c)->>'timezone',''),'UTC') timezone, to_jsonb(c)->>'pay_period_anchor' anchor,
 COALESCE((to_jsonb(c)->>'payroll_week_start')::int,1) AS "weekStart" FROM companies c WHERE id=$1`,[companyId]);
 if(!result.rowCount)throw new Error('Company was not found');
 return resolveCalendar(result.rows[0],requested);
}

export async function getPayPeriodTimesheetSummary(companyId: string, period: PayPeriod) {
  validateRange(period.start, period.end);
  const entries = await pool.query(`SELECT te.id,te.user_id,
      COALESCE(NULLIF(u.full_name,''),TRIM(COALESCE(u.first_name,'')||' '||COALESCE(u.last_name,'')),u.email) employee,
      COALESCE(p.name,'Unassigned') project,te.clock_in,te.clock_out,COALESCE(te.break_minutes,0) break_minutes,
      COALESCE(te.regular_hours,0)::numeric regular_hours,COALESCE(te.overtime_hours,0)::numeric overtime_hours,
      COALESCE(te.total_wage,0)::numeric total_wage,COALESCE(te.approval_status,'draft') approval_status,
      (te.payroll_locked_at IS NOT NULL) payroll_locked
    FROM time_entries te JOIN users u ON u.id=te.user_id LEFT JOIN projects p ON p.id=te.project_id
    WHERE u.company_id=$1 AND te.clock_in >= ($2::date::timestamp AT TIME ZONE $4) AND te.clock_in < (($3::date + 1)::timestamp AT TIME ZONE $4)
    ORDER BY employee,te.clock_in`, [companyId, period.start, period.end, period.timezone]);
  const rows = entries.rows;
  const total = (key: string) => rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
  const employeeCount = new Set(rows.map(row => row.user_id)).size;
  const approved = rows.filter(row => row.approval_status === 'approved').length;
  return {
    period,
    totals: { employees: employeeCount, entries: rows.length, regularHours: total('regular_hours'), overtimeHours: total('overtime_hours'), totalHours: total('regular_hours') + total('overtime_hours'), grossRecordedWages: total('total_wage'), approved, needsReview: rows.length - approved, payrollLocked: rows.filter(row => row.payroll_locked).length },
    entries: rows,
  };
}

const xml = (value: unknown) => String(value ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildTimesheetExcelXml(summary: Awaited<ReturnType<typeof getPayPeriodTimesheetSummary>>) {
  const headers = ['Employee','Project','Clock in','Clock out','Break minutes','Regular hours','Overtime hours','Total hours','Recorded wage','Approval','Payroll locked'];
  const rows = summary.entries.map(row => [row.employee,row.project,row.clock_in,row.clock_out || '',row.break_minutes,Number(row.regular_hours),Number(row.overtime_hours),Number(row.regular_hours)+Number(row.overtime_hours),Number(row.total_wage),row.approval_status,row.payroll_locked ? 'Yes' : 'No']);
  const line = (cells: unknown[]) => `<Row>${cells.map(value => `<Cell><Data ss:Type="${typeof value === 'number' ? 'Number' : 'String'}">${xml(value)}</Data></Cell>`).join('')}</Row>`;
  const totals = summary.totals;
  return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Timesheet"><Table>${line(['Pay period',summary.period.start,summary.period.end])}${line(headers)}${rows.map(line).join('')}</Table></Worksheet><Worksheet ss:Name="Summary"><Table>${line(['Metric','Value'])}${line(['Employees',totals.employees])}${line(['Entries',totals.entries])}${line(['Regular hours',totals.regularHours])}${line(['Overtime hours',totals.overtimeHours])}${line(['Total hours',totals.totalHours])}${line(['Gross recorded wages',totals.grossRecordedWages])}${line(['Approved entries',totals.approved])}${line(['Needs review',totals.needsReview])}</Table></Worksheet></Workbook>`;
}
