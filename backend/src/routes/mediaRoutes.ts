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
  try {
    console.log('📂 [media] Fetching projects with media...');
    const companyId = await getCompanyId(req);
    if (!companyId) {
      console.warn('⚠️ No companyId');
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const result = await pool.query(`
      SELECT DISTINCT p.id as project_id, p.name as project_name
      FROM projects p
      WHERE p.company_id = $1
      AND EXISTS (
        SELECT 1 FROM photos WHERE photos.project_id = p.id
        UNION
        SELECT 1 FROM voice_notes WHERE voice_notes.project_id = p.id
      )
      ORDER BY project_name
    `, [companyId]);

    console.log(`✅ Found ${result.rows.length} projects with media`);
    res.json({ success: true, projects: result.rows });
  } catch (error) {
    console.error('❌ Error fetching media projects:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/project/:projectId/months', async (req, res) => {
  try {
    console.log('📅 [media] Fetching months for project:', req.params.projectId);
    const companyId = await getCompanyId(req);
    if (!companyId) {
      console.warn('⚠️ No companyId');
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const { projectId } = req.params;

    const projectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND company_id = $2',
      [projectId, companyId]
    );
    if (projectCheck.rows.length === 0) {
      console.warn('⚠️ Project not found or not owned by company');
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const result = await pool.query(`
      SELECT DISTINCT TO_CHAR(DATE_TRUNC('month', taken_at), 'YYYY-MM') as month
      FROM photos
      WHERE project_id = $1
      UNION
      SELECT DISTINCT TO_CHAR(DATE_TRUNC('month', COALESCE(taken_at, created_at)), 'YYYY-MM') as month
      FROM voice_notes
      WHERE project_id = $1
      ORDER BY month DESC
    `, [projectId]);

    console.log(`✅ Found ${result.rows.length} months:`, result.rows.map(r => r.month));
    res.json({ success: true, months: result.rows.map(r => r.month) });
  } catch (error) {
    console.error('❌ Error fetching months:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/project/:projectId/month/:yearMonth', async (req, res) => {
  try {
    console.log('📸 [media] Fetching media for project:', req.params.projectId, 'month:', req.params.yearMonth);
    const companyId = await getCompanyId(req);
    if (!companyId) {
      console.warn('⚠️ No companyId');
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const { projectId, yearMonth } = req.params;

    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      console.warn('⚠️ Invalid month format:', yearMonth);
      return res.status(400).json({ success: false, message: 'Invalid month format. Use YYYY-MM' });
    }

    const projectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND company_id = $2',
      [projectId, companyId]
    );
    if (projectCheck.rows.length === 0) {
      console.warn('⚠️ Project not found or not owned by company');
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const startDate = `${yearMonth}-01`;

    const query = `
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
    `;

    const result = await pool.query(query, [projectId, startDate]);
    console.log(`✅ Found ${result.rows.length} media items for ${yearMonth}`);

    // Log a sample if any
    if (result.rows.length > 0) {
      console.log('📝 Sample:', { type: result.rows[0].type, id: result.rows[0].id, url: result.rows[0].url?.substring(0, 50) });
    }

    res.json({ success: true, media: result.rows });
  } catch (error) {
    console.error('❌ Error fetching media:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;