import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';

const router = express.Router();

async function manager(req: Request) {
  const token = verifyToken(req);
  const result = await pool.query(
    `SELECT id,company_id,LOWER(COALESCE(role,'employee')) role FROM users
     WHERE id=$1 AND COALESCE(is_active,TRUE)=TRUE`, [token.id],
  );
  const actor = result.rows[0];
  if (!actor || !['boss','manager','admin'].includes(actor.role)) throw new Error('Manager access is required');
  return actor;
}

router.patch('/time-entries/:id', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const actor = await manager(req);
    const id = String(req.params.id);
    const reason = String(req.body.reason || '').trim();
    if (reason.length < 5) return res.status(400).json({ success:false, message:'Enter a correction reason (at least 5 characters)' });
    const clockIn = new Date(req.body.clockIn);
    const clockOut = req.body.clockOut ? new Date(req.body.clockOut) : null;
    const breakMinutes = Number(req.body.breakMinutes || 0);
    if (!Number.isFinite(clockIn.getTime()) || (clockOut && !Number.isFinite(clockOut.getTime()))) return res.status(400).json({ success:false, message:'Valid clock-in and clock-out times are required' });
    if (clockOut && clockOut <= clockIn) return res.status(400).json({ success:false, message:'Clock-out must be after clock-in' });
    if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 720) return res.status(400).json({ success:false, message:'Break minutes must be between 0 and 720' });

    await client.query('BEGIN');
    const found = await client.query(
      `SELECT te.*,u.company_id FROM time_entries te JOIN users u ON u.id=te.user_id
       WHERE te.id=$1 AND u.company_id=$2 FOR UPDATE`, [id, actor.company_id],
    );
    const old = found.rows[0];
    if (!old) throw new Error('Time entry was not found in your company');
    if (old.payroll_locked_at) throw new Error('This entry is locked by finalized payroll');
    const totalHours = clockOut ? Math.max(0, (clockOut.getTime()-clockIn.getTime())/3600000-breakMinutes/60) : 0;
    const regular = Math.min(totalHours, 8);
    const overtime = Math.max(totalHours-8, 0);
    const updated = await client.query(
      `UPDATE time_entries SET clock_in=$1,clock_out=$2,break_minutes=$3,
         regular_hours=$4,overtime_hours=$5,status=CASE WHEN $2::timestamptz IS NULL THEN 'active' ELSE 'completed' END,
         is_manual=TRUE,approval_status='needs_review',correction_reason=$6,updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [clockIn.toISOString(),clockOut?.toISOString() || null,breakMinutes,regular,overtime,reason,id],
    );
    await client.query(
      `INSERT INTO time_entry_audit_logs(time_entry_id,company_id,actor_id,action,before_values,after_values,reason)
       VALUES($1,$2,$3,'corrected',$4,$5,$6)`,
      [id,actor.company_id,actor.id,JSON.stringify(old),JSON.stringify(updated.rows[0]),reason],
    );
    await client.query('COMMIT');
    res.json({ success:true, entry:updated.rows[0], message:'Time entry corrected and returned for review' });
  } catch (error:any) {
    try { await client.query('ROLLBACK'); } catch {}
    res.status(/access/i.test(error.message)?403:400).json({ success:false, message:error.message });
  } finally { client.release(); }
});

router.post('/time-entries/:id/approve', async (req: Request, res: Response) => {
  try {
    const actor = await manager(req);
    const result = await pool.query(
      `UPDATE time_entries te SET approval_status='approved',approved_by=$1,approved_at=NOW(),updated_at=NOW()
       FROM users u WHERE te.id=$2 AND u.id=te.user_id AND u.company_id=$3
         AND te.clock_out IS NOT NULL AND te.payroll_locked_at IS NULL RETURNING te.*`,
      [actor.id,String(req.params.id),actor.company_id],
    );
    if (!result.rowCount) return res.status(400).json({ success:false, message:'Entry cannot be approved or is payroll locked' });
    res.json({ success:true, entry:result.rows[0] });
  } catch (error:any) { res.status(/access/i.test(error.message)?403:400).json({ success:false, message:error.message }); }
});

export default router;
