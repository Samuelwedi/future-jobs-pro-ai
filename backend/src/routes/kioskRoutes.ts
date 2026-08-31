import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { recordUserEvent } from '../services/adaptiveAIService';

const router = express.Router();

async function kioskManager(req: Request) {
  const token = verifyToken(req);
  const result = await pool.query(
    `SELECT id, company_id, LOWER(COALESCE(role,'employee')) role
     FROM users WHERE id=$1 AND COALESCE(is_active,TRUE)=TRUE`,
    [token.id]
  );
  const actor = result.rows[0];
  if (!actor || !['boss','manager','admin'].includes(actor.role)) {
    const error: any = new Error('Boss or manager access is required'); error.status = 403; throw error;
  }
  return actor;
}

// GET /api/kiosk/users – company-scoped PIN readiness list for managers
router.get('/users', async (req: Request, res: Response) => {
  try {
    const actor = await kioskManager(req);
    const result = await pool.query(
      `SELECT id, first_name, last_name, role, (pin IS NOT NULL AND pin <> '') has_pin
       FROM users WHERE company_id=$1 AND COALESCE(is_active,TRUE)=TRUE
         AND LOWER(COALESCE(role,'employee')) <> 'boss'
       ORDER BY first_name,last_name`,
      [actor.company_id]
    );
    res.json({ success: true, users: result.rows });
  } catch (error: any) { res.status(error.status || 401).json({ success: false, message: error.message }); }
});

// GET /api/kiosk/status/:companyId – check if kiosk is enabled
router.get('/status/:companyId', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT COALESCE(NULLIF(to_jsonb(companies)->>'kiosk_enabled','')::boolean,FALSE) kiosk_enabled
       FROM companies WHERE id = $1`,
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
      `SELECT COALESCE(NULLIF(to_jsonb(companies)->>'kiosk_enabled','')::boolean,FALSE) kiosk_enabled
       FROM companies WHERE id = $1`,
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
      `SELECT COALESCE(NULLIF(to_jsonb(companies)->>'kiosk_enabled','')::boolean,FALSE) kiosk_enabled
       FROM companies WHERE id = $1`,
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
    const actor = verifyToken(req);
    const actorResult = await pool.query(
      'SELECT company_id, LOWER(COALESCE(role, $2)) AS role FROM users WHERE id = $1',
      [actor.id, 'employee']
    );
    const manager = actorResult.rows[0];
    if (!manager || !['boss', 'manager'].includes(manager.role)) {
      return res.status(403).json({ success: false, message: 'Only a boss or manager can create kiosk PINs' });
    }
    const { userId, pin } = req.body;
    if (!userId || !/^\d{4,6}$/.test(String(pin || ''))) {
      return res.status(400).json({ success: false, message: 'userId and pin are required' });
    }

    const employee = await pool.query(
      'SELECT id, first_name, last_name FROM users WHERE id = $1 AND company_id = $2 AND is_active = true',
      [userId, manager.company_id]
    );
    if (!employee.rowCount) {
      return res.status(404).json({ success: false, message: 'Employee was not found in your company' });
    }

    const existing = await pool.query(
      'SELECT id FROM users WHERE company_id = $1 AND pin = $2 AND id != $3',
      [manager.company_id, String(pin), userId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'PIN already in use' });
    }

    await pool.query('UPDATE users SET pin = $1 WHERE id = $2 AND company_id = $3', [String(pin), userId, manager.company_id]);
    const person = employee.rows[0];
    res.json({ success: true, message: `Kiosk PIN saved for ${person.first_name} ${person.last_name}` });
  } catch (error: any) {
    console.error('Set PIN error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/kiosk/toggle – Admin enables/disables Kiosk for a company
router.post('/toggle', async (req: Request, res: Response) => {
  try {
    const actor = await kioskManager(req);
    const { enabled } = req.body;
    await pool.query('UPDATE companies SET kiosk_enabled = $1 WHERE id = $2', [!!enabled, actor.company_id]);
    res.json({ success: true, message: `Kiosk ${enabled ? 'enabled' : 'disabled'}` });
  } catch (error: any) {
    console.error('Toggle kiosk error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
