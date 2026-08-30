import express, { Request, Response } from 'express';
import { pool } from '../config/database';

const router = express.Router();

const validCompanyId = (value: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

// Public kiosk bootstrap. It exposes only the company display name,
// kiosk availability, and active project names/IDs. No employee or PIN data.
router.get('/setup/:companyId', async (req: Request, res: Response) => {
  try {
    const companyId = String(req.params.companyId || '');
    if (!validCompanyId(companyId)) {
      return res.status(400).json({ success: false, message: 'Invalid kiosk link' });
    }
    const company = await pool.query(
      `SELECT id, name,
              COALESCE(NULLIF(to_jsonb(companies)->>'kiosk_enabled', '')::boolean, false) AS kiosk_enabled
       FROM companies WHERE id = $1`,
      [companyId]
    );
    if (!company.rowCount) return res.status(404).json({ success: false, message: 'Company not found' });
    const projects = await pool.query(
      `SELECT id, name FROM projects
       WHERE company_id = $1
         AND COALESCE(NULLIF(to_jsonb(projects)->>'status', ''), 'active') = 'active'
       ORDER BY name`,
      [companyId]
    );
    res.json({ success: true, company: company.rows[0], projects: projects.rows });
  } catch (error: any) {
    console.error('Public kiosk setup error:', error);
    res.status(500).json({ success: false, message: 'Could not load kiosk setup' });
  }
});

router.post('/clock-in', async (req: Request, res: Response) => {
  try {
    const { companyId, pin, projectId, latitude, longitude } = req.body;
    if (!validCompanyId(companyId) || !/^\d{4,6}$/.test(String(pin || '')) || !projectId) {
      return res.status(400).json({ success: false, message: 'Company, project, and a valid PIN are required' });
    }
    const userResult = await pool.query(
      `SELECT id, first_name FROM users
       WHERE company_id = $1 AND pin = $2 AND is_active = true`,
      [companyId, String(pin)]
    );
    if (!userResult.rowCount) return res.status(404).json({ success: false, message: 'Invalid PIN' });
    const project = await pool.query(
      `SELECT id FROM projects WHERE id = $1 AND company_id = $2
       AND COALESCE(NULLIF(to_jsonb(projects)->>'status', ''), 'active') = 'active'`,
      [projectId, companyId]
    );
    if (!project.rowCount) return res.status(400).json({ success: false, message: 'Invalid project' });
    const company = await pool.query(
      `SELECT COALESCE(NULLIF(to_jsonb(companies)->>'kiosk_enabled', '')::boolean, false) AS kiosk_enabled
       FROM companies WHERE id = $1`,
      [companyId]
    );
    if (!company.rows[0]?.kiosk_enabled) return res.status(403).json({ success: false, message: 'Kiosk is disabled' });
    const active = await pool.query(
      'SELECT id FROM time_entries WHERE user_id = $1 AND clock_out IS NULL LIMIT 1',
      [userResult.rows[0].id]
    );
    if (active.rowCount) return res.status(409).json({ success: false, message: 'You are already clocked in' });
    await pool.query(
      `INSERT INTO time_entries
       (user_id, project_id, clock_in, clock_in_latitude, clock_in_longitude, status)
       VALUES ($1, $2, NOW(), $3, $4, 'active')`,
      [userResult.rows[0].id, projectId, latitude || null, longitude || null]
    );
    res.json({ success: true, message: `${userResult.rows[0].first_name} clocked in successfully` });
  } catch (error: any) {
    console.error('Public kiosk clock-in error:', error);
    res.status(500).json({ success: false, message: 'Clock-in failed' });
  }
});

router.post('/clock-out', async (req: Request, res: Response) => {
  try {
    const { companyId, pin, latitude, longitude } = req.body;
    if (!validCompanyId(companyId) || !/^\d{4,6}$/.test(String(pin || ''))) {
      return res.status(400).json({ success: false, message: 'Company and a valid PIN are required' });
    }
    const userResult = await pool.query(
      `SELECT id, first_name FROM users
       WHERE company_id = $1 AND pin = $2 AND is_active = true`,
      [companyId, String(pin)]
    );
    if (!userResult.rowCount) return res.status(404).json({ success: false, message: 'Invalid PIN' });
    const result = await pool.query(
      `UPDATE time_entries
       SET clock_out = NOW(), clock_out_latitude = $1, clock_out_longitude = $2, status = 'completed'
       WHERE id = (
         SELECT id FROM time_entries
         WHERE user_id = $3 AND clock_out IS NULL
         ORDER BY clock_in DESC LIMIT 1
       ) RETURNING id`,
      [latitude || null, longitude || null, userResult.rows[0].id]
    );
    if (!result.rowCount) return res.status(409).json({ success: false, message: 'No active clock-in was found' });
    res.json({ success: true, message: `${userResult.rows[0].first_name} clocked out successfully` });
  } catch (error: any) {
    console.error('Public kiosk clock-out error:', error);
    res.status(500).json({ success: false, message: 'Clock-out failed' });
  }
});

export default router;
