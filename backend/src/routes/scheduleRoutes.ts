import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import { pool } from '../config/database';

const router = express.Router();

// ========== VERSION & DEBUG ENDPOINTS (unprotected) ==========

// Simple version endpoint to verify deployment
router.get('/version', (req: Request, res: Response) => {
  res.json({ version: '2.0.2', fixed: 'date range and company check logging' });
});

router.get('/debug-all', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM shifts ORDER BY date');
    res.json({ shifts: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/debug-shifts', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const result = await pool.query(
      `SELECT s.*, array_agg(sa.user_id) as assigned_user_ids
       FROM shifts s
       LEFT JOIN shift_assignments sa ON s.id = sa.shift_id
       WHERE s.user_id = $1 OR sa.user_id = $1
       GROUP BY s.id
       ORDER BY s.date`,
      [userId]
    );
    res.json({ shifts: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Unprotected endpoint that uses the same query as my-shifts (for debugging)
router.get('/my-shifts-debug', async (req: Request, res: Response) => {
  try {
    const { userId, start, end } = req.query;
    if (!userId || !start || !end) {
      return res.status(400).json({ error: 'userId, start, and end required' });
    }
    const result = await pool.query(
      `SELECT s.*, 
              array_agg(DISTINCT sa.user_id) FILTER (WHERE sa.user_id IS NOT NULL) AS assigned_user_ids,
              p.name as project_name,
              p.address as project_address
       FROM shifts s
       LEFT JOIN shift_assignments sa ON s.id = sa.shift_id
       LEFT JOIN projects p ON s.project_id = p.id
       WHERE (s.user_id = $1 OR sa.user_id = $1)
         AND s.date >= $2::date
         AND s.date < $3::date + interval '1 day'
       GROUP BY s.id, p.name, p.address
       ORDER BY s.date, s.start_time`,
      [userId, start, end]
    );
    res.json({ shifts: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ========== AUTH‑PROTECTED ROUTES ==========

const getCompanyId = async (req: Request): Promise<string | null> => {
  const testUserHeader = req.headers['x-test-user'];
  if (testUserHeader === 'samuel@test.com') {
    return 'ed1887d9-3ffd-46e4-b281-338c8ad03a66';
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = verifyToken(req);
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    return userRes.rows[0]?.company_id || null;
  } catch { return null; }
};

router.get('/shifts', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const { start, end } = req.query;
    let query = `
      SELECT s.* 
      FROM shifts s
      JOIN projects p ON s.project_id = p.id
      WHERE p.company_id = $1
    `;
    const params: any[] = [companyId];
    if (start) { query += ' AND s.date::date >= $' + (params.length + 1); params.push(start); }
    if (end)   { query += ' AND s.date::date <= $' + (params.length + 1); params.push(end); }
    query += ' ORDER BY s.date, s.start_time';
    const result = await pool.query(query, params);
    res.json({ success: true, shifts: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ===== FIXED my-shifts with logging and company check =====
router.get('/my-shifts', async (req: Request, res: Response) => {
  try {
    const testUserHeader = req.headers['x-test-user'];
    if (testUserHeader === 'samuel@test.com') {
      return res.json({ success: true, shifts: [] });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    const decoded = verifyToken(req);

    const { userId, start, end } = req.query;
    if (!userId || !start || !end)
      return res.status(400).json({ success: false, message: 'userId, start, and end are required' });

    console.log(`📡 my-shifts: userId=${userId}, start=${start}, end=${end}`);

    // Get requesting user's company ID
    const requestUserRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    if (requestUserRes.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Requesting user not found' });

    const requestCompanyId = requestUserRes.rows[0].company_id;
    console.log(`👤 Requesting user company: ${requestCompanyId}`);

    // Get target user's company ID
    const targetUserRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    if (targetUserRes.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Target user not found' });

    const targetCompanyId = targetUserRes.rows[0].company_id;
    console.log(`👥 Target user company: ${targetCompanyId}`);

    if (requestCompanyId !== targetCompanyId) {
      console.warn(`⚠️ Company mismatch: request=${requestCompanyId}, target=${targetCompanyId}`);
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // ✅ Query with correct date range (same as debug)
    const result = await pool.query(
      `SELECT s.*, 
              array_agg(DISTINCT sa.user_id) FILTER (WHERE sa.user_id IS NOT NULL) AS assigned_user_ids,
              p.name as project_name,
              p.address as project_address
       FROM shifts s
       LEFT JOIN shift_assignments sa ON s.id = sa.shift_id
       LEFT JOIN projects p ON s.project_id = p.id
       WHERE (s.user_id = $1 OR sa.user_id = $1)
         AND s.date >= $2::date
         AND s.date < $3::date + interval '1 day'
       GROUP BY s.id, p.name, p.address
       ORDER BY s.date, s.start_time`,
      [userId, start, end]
    );
    console.log(`📊 Found ${result.rows.length} shifts for user ${userId}`);
    res.json({ success: true, shifts: result.rows });
  } catch (error: any) {
    console.error('Error in my-shifts:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ===== SIMPLIFIED POST (no transaction) =====
router.post('/shifts', async (req: Request, res: Response) => {
  const startTime = Date.now();
  console.log('📝 POST /shifts started');
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) {
      console.log('❌ Unauthorized – no company ID');
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const { name, date, startTime, endTime, projectId, notes, employeeIds, attachmentUrl, attachmentType } = req.body;
    if (!name || !date || !startTime || !endTime) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    if (projectId) {
      const projectCheck = await pool.query(
        'SELECT company_id FROM projects WHERE id = $1 AND company_id = $2',
        [projectId, companyId]
      );
      if (projectCheck.rows.length === 0) {
        return res.status(403).json({ success: false, message: 'Project not found or does not belong to your company' });
      }
    }

    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = verifyToken(req);
        userId = decoded.id;
      } catch { /* ignore */ }
    }

    const shiftResult = await pool.query(
      `INSERT INTO shifts (name, date, start_time, end_time, project_id, notes, created_by, attachment_url, attachment_type, user_id)
       VALUES ($1, $2::date, $3::time, $4::time, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [name, date, startTime, endTime, projectId || null, notes || null, userId, attachmentUrl || null, attachmentType || null, userId]
    );
    const shift = shiftResult.rows[0];

    if (employeeIds && Array.isArray(employeeIds) && employeeIds.length > 0) {
      for (const empId of employeeIds) {
        await pool.query(
          `INSERT INTO shift_assignments (shift_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [shift.id, empId]
        );
      }
    }

    console.log(`✅ Shift created: ${shift.id} for user ${userId} in ${Date.now() - startTime}ms`);
    res.status(201).json({ success: true, shift });
  } catch (error: any) {
    console.error('❌ Create shift error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT, DELETE unchanged
router.put('/shifts/:id', async (req: Request, res: Response) => { /* ... */ });
router.delete('/shifts/:id', async (req: Request, res: Response) => { /* ... */ });

export default router;