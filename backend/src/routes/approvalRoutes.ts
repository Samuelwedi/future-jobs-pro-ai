import { verifyToken } from '../utils/auth';
import express, { Request } from 'express';
import { pool } from '../config/database';
import { generatePayroll } from '../services/payrollGenerator';

const router = express.Router();
const managerRoles = new Set(['boss', 'manager', 'admin']);

router.get('/pending', async (req, res) => {
  try { const actor = verifyToken(req); const result = await pool.query('SELECT * FROM approvals WHERE user_id=$1 AND status=$2 ORDER BY created_at ASC', [actor.id, 'pending']); res.json({ success: true, approvals: result.rows }); }
  catch (error: any) { res.status(500).json({ success: false, message: error.message }); }
});

async function actorFor(req: Request) {
  const token = verifyToken(req);
  const result = await pool.query('SELECT id,company_id,role FROM users WHERE id=$1 AND COALESCE(is_active,TRUE)=TRUE', [token.id]);
  if (!result.rowCount) throw new Error('Authenticated user was not found');
  return { id: String(result.rows[0].id), companyId: String(result.rows[0].company_id || ''), role: String(result.rows[0].role || '').toLowerCase() };
}

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
function payrollRange(value: string) {
  const text = value.toLowerCase().trim(); const today = new Date(); today.setHours(0, 0, 0, 0);
  const explicit = text.match(/(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/);
  if (explicit) return { start: explicit[1], end: explicit[2], label: `${explicit[1]} through ${explicit[2]}` };
  if (text.includes('last month')) { const end = new Date(today.getFullYear(), today.getMonth(), 0); const start = new Date(end.getFullYear(), end.getMonth(), 1); return { start: dateOnly(start), end: dateOnly(end), label: 'last month' }; }
  if (text.includes('this month')) { const start = new Date(today.getFullYear(), today.getMonth(), 1); return { start: dateOnly(start), end: dateOnly(today), label: 'this month' }; }
  const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  if (text.includes('last week')) { const start = new Date(monday); start.setDate(start.getDate() - 7); const end = new Date(monday); end.setDate(end.getDate() - 1); return { start: dateOnly(start), end: dateOnly(end), label: 'last week' }; }
  if (text.includes('this week')) return { start: dateOnly(monday), end: dateOnly(today), label: 'this week' };
  throw new Error('Payroll needs an exact period, such as last week, last month, or two YYYY-MM-DD dates');
}

async function executeApprovedAction(approval: any, actor: { id: string; companyId: string; role: string }) {
  const payload = typeof approval.action_payload === 'string' ? JSON.parse(approval.action_payload) : approval.action_payload || {};
  if (!managerRoles.has(actor.role)) throw new Error('Manager access is required');
  if (payload.companyId && String(payload.companyId) !== actor.companyId) throw new Error('Approval belongs to another company');
  if (approval.action_type !== 'run_payroll') throw new Error(`Approved action ${approval.action_type} does not yet have a safe executor`);
  const range = payrollRange(String(payload.period || ''));
  const result = await generatePayroll(actor.companyId, range.start, range.end, actor.id);
  return { type: 'run_payroll', title: 'Payroll generated', status: 'completed', summary: `Payroll for ${range.label} was generated for ${result.employeeCount} employees.`, details: [
    { label: 'Payroll ID', value: result.payrollId }, { label: 'Period start', value: range.start }, { label: 'Period end', value: range.end },
    { label: 'Employees', value: result.employeeCount }, { label: 'Total hours', value: result.totalHours.toFixed(2) }, { label: 'Gross pay', value: result.totalPay.toFixed(2) }, { label: 'Authorized by', value: actor.id },
  ] };
}

router.post('/:id/approve', async (req, res) => {
  const client = await pool.connect();
  try {
    const actor = await actorFor(req); await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [String(req.params.id)]);
    const selected = await client.query('SELECT * FROM approvals WHERE id=$1 AND user_id=$2 AND status=$3 FOR UPDATE', [req.params.id, actor.id, 'pending']);
    if (!selected.rowCount) throw new Error('Approval was not found or is already resolved');
    const action = await executeApprovedAction(selected.rows[0], actor);
    await client.query("UPDATE approvals SET status='approved',resolved_at=NOW() WHERE id=$1", [req.params.id]);
    await client.query('COMMIT'); res.json({ success: true, message: 'Approved and executed', action, result: action });
  } catch (error: any) { await client.query('ROLLBACK'); res.status(/access|another company/i.test(error.message) ? 403 : 400).json({ success: false, message: error.message }); }
  finally { client.release(); }
});

router.post('/:id/reject', async (req, res) => {
  try { const actor = await actorFor(req); const result = await pool.query("UPDATE approvals SET status='rejected',resolved_at=NOW() WHERE id=$1 AND user_id=$2 AND status='pending' RETURNING id", [req.params.id, actor.id]); if (!result.rowCount) return res.status(404).json({ success: false, message: 'Approval was not found or is already resolved' }); res.json({ success: true, message: 'Rejected', action: { type: 'approval', title: 'Action rejected', status: 'information', summary: 'No protected action was performed.', details: [] } }); }
  catch (error: any) { res.status(500).json({ success: false, message: error.message }); }
});

export default router;
