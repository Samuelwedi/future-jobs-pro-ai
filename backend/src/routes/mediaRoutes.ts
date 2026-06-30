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

router.get('/projects', async (req, res) => {
  // ... unchanged
});

router.get('/project/:projectId/months', async (req, res) => {
  // ... unchanged
});

router.get('/project/:projectId/month/:yearMonth', async (req, res) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const { projectId, yearMonth } = req.params;

    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return res.status(400).json({ success: false, message: 'Invalid month format. Use YYYY-MM' });
    }

    const projectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND company_id = $2',
      [projectId, companyId]
    );
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const startDate = `${yearMonth}-01`;

    const result = await pool.query(`
      SELECT 
        'photo' as type,
        id,
        s3_key as url,
        taken_at,
        metadata,
        verification_hash,
        NULL::text as transcript,
        NULL::text as duration
      FROM photos
      WHERE project_id = $1 
        AND taken_at >= $2::date 
        AND taken_at < ($2::date + INTERVAL '1 month')
        AND file_type = 'image'

      UNION ALL

      SELECT 
        'video' as type,
        id,
        s3_key as url,
        taken_at,
        metadata,
        verification_hash,
        NULL::text as transcript,
        NULL::text as duration
      FROM photos
      WHERE project_id = $1 
        AND taken_at >= $2::date 
        AND taken_at < ($2::date + INTERVAL '1 month')
        AND file_type = 'video'

      UNION ALL

      SELECT 
        'voice_note' as type,
        id,
        audio_url as url,
        COALESCE(taken_at, created_at) as taken_at,
        NULL::jsonb as metadata,
        NULL::text as verification_hash,
        transcript,
        duration_seconds::text as duration
      FROM voice_notes
      WHERE project_id = $1 
        AND COALESCE(taken_at, created_at) >= $2::date 
        AND COALESCE(taken_at, created_at) < ($2::date + INTERVAL '1 month')

      ORDER BY taken_at DESC
    `, [projectId, startDate]);

    res.json({ success: true, media: result.rows });
  } catch (error) {
    console.error('Error fetching media:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;