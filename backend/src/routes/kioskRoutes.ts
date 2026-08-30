import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { recordUserEvent } from '../services/adaptiveAIService';

const router = express.Router();

const managerRoles = new Set(['boss', 'manager', 'admin']);

async function requireManager(req: Request, res: Response) {
  const decoded = verifyToken(req);
  const result = await pool.query(
    'SELECT id, company_id, role FROM users WHERE id = $1 AND is_active = true',
    [decoded.id]
  );
  const actor = result.rows[0];
  if (!actor?.company_id) {
    res.status(401).json({ success: false, message: 'Not authenticated' });
    return null;
  }
  if (!managerRoles.has(String(actor.role || '').toLowerCase())) {
    res.status(403).json({ success: false, message: 'Boss or manager access is required' });
    return null;
  }
  return actor;
}

// GET /api/kiosk/users – manager-safe employee list. PIN values are never returned.
router.get('/users', async (req: Request, res: Response) => {
  try {
    const actor = await requireManager(req, res);
    if (!actor) return;
    const result = await pool.query(
      `SELECT id, first_name, last_name, role, is_active,
              CASE WHEN pin IS NULL OR pin = '' THEN false ELSE true END AS has_pin
       FROM users
       WHERE company_id = $1 AND is_active = true
       ORDER BY first_name, last_name`,
      [actor.company_id]
    );
    res.json({ success: true, users: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/kiosk/status/:companyId – check if kiosk is enabled
router.get('/status/:companyId', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT kiosk_enabled FROM companies WHERE id = $1',
      [req.params.companyId as string]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }
    res.json({ success: true, kiosk_enabled: result.rows[0].kiosk_enabled });
  } catch (error: any) {
    console.error('Kiosk status error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/kiosk/clock-in
router.post('/clock-in', async (req: Request, res: Response) => {
  try {
    const { pin, projectId, latitude, longitude } = req.body;
    if (!pin || !projectId) {
      return res.status(400).json({ success: false, message: 'PIN and projectId are required' });
    }

    const userResult = await pool.query(
      'SELECT u.id, u.first_name, u.last_name, u.company_id FROM users u WHERE u.pin = $1 AND u.is_active = true',
      [pin]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invalid PIN' });
    }

    const user = userResult.rows[0];

    const companyResult = await pool.query(
      'SELECT kiosk_enabled FROM companies WHERE id = $1',
      [user.company_id]
    );
    if (!companyResult.rows[0]?.kiosk_enabled) {
      return res.status(403).json({ success: false, message: 'Kiosk is not enabled for your company' });
    }

    const entryResult = await pool.query(
      `INSERT INTO time_entries (user_id, project_id, clock_in, clock_in_latitude, clock_in_longitude, status)
       VALUES ($1, $2, NOW(), $3, $4, 'active') RETURNING *`,
      [user.id, projectId, latitude || null, longitude || null]
    );

    await recordUserEvent({
      userId: user.id,
      eventType: 'clock_in',
      eventData: { projectId, kiosk: true },
      latitude, longitude,
    });

    res.json({ success: true, message: `${user.first_name} clocked in`, timeEntry: entryResult.rows[0] });
  } catch (error: any) {
    console.error('Kiosk clock-in error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/kiosk/clock-out
router.post('/clock-out', async (req: Request, res: Response) => {
  try {
    const { pin, latitude, longitude } = req.body;
    if (!pin) {
      return res.status(400).json({ success: false, message: 'PIN is required' });
    }

    const userResult = await pool.query(
      'SELECT u.id, u.first_name, u.last_name, u.company_id FROM users u WHERE u.pin = $1 AND u.is_active = true',
      [pin]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invalid PIN' });
    }

    const user = userResult.rows[0];

    const companyResult = await pool.query(
      'SELECT kiosk_enabled FROM companies WHERE id = $1',
      [user.company_id]
    );
    if (!companyResult.rows[0]?.kiosk_enabled) {
      return res.status(403).json({ success: false, message: 'Kiosk is not enabled for your company' });
    }

    const entryResult = await pool.query(
      `UPDATE time_entries SET clock_out = NOW(), clock_out_latitude = $1, clock_out_longitude = $2, status = 'completed'
       WHERE user_id = $3 AND clock_out IS NULL RETURNING *`,
      [latitude || null, longitude || null, user.id]
    );

    if (entryResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No active clock-in found' });
    }

    await recordUserEvent({
      userId: user.id,
      eventType: 'clock_out',
      eventData: { kiosk: true },
      latitude, longitude,
    });

    res.json({ success: true, message: `${user.first_name} clocked out`, timeEntry: entryResult.rows[0] });
  } catch (error: any) {
    console.error('Kiosk clock-out error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/kiosk/set-pin – Admin sets a PIN for a user
router.post('/set-pin', async (req: Request, res: Response) => {
  try {
    const actor = await requireManager(req, res);
    if (!actor) return;
    const { userId, pin } = req.body;
    if (!userId || !pin) {
      return res.status(400).json({ success: false, message: 'userId and pin are required' });
    }

    if (!/^\d{4,6}$/.test(String(pin))) {
      return res.status(400).json({ success: false, message: 'PIN must contain 4 to 6 digits' });
    }
    const target = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND company_id = $2 AND is_active = true',
      [userId, actor.company_id]
    );
    if (!target.rowCount) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    const existing = await pool.query('SELECT id FROM users WHERE pin = $1 AND id != $2', [pin, userId]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'PIN already in use' });
    }

    await pool.query('UPDATE users SET pin = $1 WHERE id = $2', [pin, userId]);
    res.json({ success: true, message: 'PIN set successfully' });
  } catch (error: any) {
    console.error('Set PIN error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/kiosk/toggle – Admin enables/disables Kiosk for a company
router.post('/toggle', async (req: Request, res: Response) => {
  try {
    const actor = await requireManager(req, res);
    if (!actor) return;
    const { enabled } = req.body;
    await pool.query('UPDATE companies SET kiosk_enabled = $1 WHERE id = $2', [!!enabled, actor.company_id]);
    res.json({ success: true, message: `Kiosk ${enabled ? 'enabled' : 'disabled'}` });
  } catch (error: any) {
    console.error('Toggle kiosk error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
