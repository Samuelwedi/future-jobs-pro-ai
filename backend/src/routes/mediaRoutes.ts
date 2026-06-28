import express from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';

const router = express.Router();

const getCompanyId = async (req: any): Promise<string | null> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = verifyToken(req);
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    return userRes.rows[0]?.company_id || null;
  } catch {
    return null;
  }
};

// GET /api/media/projects – list projects that have media
router.get('/projects', async (req, res) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const result = await pool.query(`
      SELECT DISTINCT project_id, p.name as project_name
      FROM (
        SELECT project_id FROM photos WHERE company_id = $1
        UNION
        SELECT project_id FROM voice_notes WHERE company_id = $1
      ) media
      JOIN projects p ON p.id = media.project_id
      ORDER BY project_name
    `, [companyId]);

    res.json({ success: true, projects: result.rows });
  } catch (error) {
    console.error('Error fetching media projects:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/media/project/:projectId/months – months with media
router.get('/project/:projectId/months', async (req, res) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false });
    const { projectId } = req.params;

    const result = await pool.query(`
      SELECT DISTINCT TO_CHAR(taken_at, 'YYYY-MM') as month
      FROM (
        SELECT taken_at FROM photos WHERE project_id = $1 AND company_id = $2
        UNION
        SELECT taken_at FROM voice_notes WHERE project_id = $1 AND company_id = $2
      ) media
      ORDER BY month DESC
    `, [projectId, companyId]);

    res.json({ success: true, months: result.rows.map(r => r.month) });
  } catch (error) {
    console.error('Error fetching months:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/media/project/:projectId/month/:yearMonth – all media for that month
router.get('/project/:projectId/month/:yearMonth', async (req, res) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false });
    const { projectId, yearMonth } = req.params;

    const result = await pool.query(`
      SELECT 
        'photo' as type,
        id,
        s3_key as url,
        taken_at,
        metadata,
        verification_hash,
        NULL as transcript,
        NULL as duration
      FROM photos
      WHERE project_id = $1 AND company_id = $2 AND TO_CHAR(taken_at, 'YYYY-MM') = $3

      UNION ALL

      SELECT 
        'video' as type,
        id,
        s3_key as url,
        taken_at,
        metadata,
        verification_hash,
        NULL as transcript,
        NULL as duration
      FROM photos
      WHERE project_id = $1 AND company_id = $2 AND TO_CHAR(taken_at, 'YYYY-MM') = $3 AND file_type = 'video'

      UNION ALL

      SELECT 
        'voice_note' as type,
        id,
        audio_url as url,
        taken_at,
        metadata,
        NULL as verification_hash,
        transcript,
        duration_seconds as duration
      FROM voice_notes
      WHERE project_id = $1 AND company_id = $2 AND TO_CHAR(taken_at, 'YYYY-MM') = $3

      ORDER BY taken_at DESC
    `, [projectId, companyId, yearMonth]);

    res.json({ success: true, media: result.rows });
  } catch (error) {
    console.error('Error fetching media:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;