import express, { Request, Response } from 'express';
import { verifyToken } from '../utils/auth';
import { pool } from '../config/database';
import { generateComprehensiveReport } from '../services/comprehensiveReportService';

const router = express.Router();

// ─── POST /api/reports/comprehensive ──────────────────────────────
router.post('/comprehensive', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });

    const decoded = verifyToken(req);
    const { projectId, startDate, endDate } = req.body;
    if (!projectId || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'projectId, startDate, endDate required' });
    }

    // ─── Fetch project details ──────────────────────────────
    const projectRes = await pool.query(
      `SELECT id, name, address, client_name FROM projects WHERE id = $1 AND company_id = $2`,
      [projectId, decoded.companyId]
    );
    if (projectRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    const project = projectRes.rows[0];

    // ─── Photos ──────────────────────────────────────────────
    const photos = await pool.query(
      `SELECT p.id, p.s3_key, p.taken_at, p.taken_by, p.compliance_score, p.verification_hash,
              u.first_name || ' ' || u.last_name AS taken_by_name
       FROM photos p
       LEFT JOIN users u ON p.taken_by = u.id
       WHERE p.project_id = $1 AND p.taken_at BETWEEN $2 AND $3`,
      [projectId, startDate, endDate]
    );

    // ─── Videos ──────────────────────────────────────────────
    const videos = await pool.query(
      `SELECT m.id, m.url, m.taken_at, m.type, m.duration, m.taken_by,
              u.first_name || ' ' || u.last_name AS taken_by_name
       FROM media m
       LEFT JOIN users u ON m.taken_by = u.id
       WHERE m.project_id = $1 AND m.type = 'video' AND m.taken_at BETWEEN $2 AND $3`,
      [projectId, startDate, endDate]
    );

    // ─── Voice Notes ──────────────────────────────────────────
    const voiceNotes = await pool.query(
      `SELECT m.id, m.url, m.taken_at, m.type, m.duration, m.transcript, m.taken_by,
              u.first_name || ' ' || u.last_name AS taken_by_name
       FROM media m
       LEFT JOIN users u ON m.taken_by = u.id
       WHERE m.project_id = $1 AND m.type = 'voice_note' AND m.taken_at BETWEEN $2 AND $3`,
      [projectId, startDate, endDate]
    );

    // ─── GPS Trails ──────────────────────────────────────────
    const gpsTrails = await pool.query(
      `SELECT g.*, te.id as time_entry_id,
              u.first_name || ' ' || u.last_name AS user_name
       FROM gps_points g
       JOIN time_entries te ON g.time_entry_id = te.id
       JOIN users u ON te.user_id = u.id
       WHERE te.project_id = $1 AND g.timestamp BETWEEN $2 AND $3
       ORDER BY g.timestamp ASC`,
      [projectId, startDate, endDate]
    );

    // ─── Timesheet ────────────────────────────────────────────
    const timesheet = await pool.query(
      `SELECT te.*,
              u.first_name || ' ' || u.last_name AS employee_name
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       WHERE te.project_id = $1 AND te.clock_in BETWEEN $2 AND $3
       ORDER BY te.clock_in ASC`,
      [projectId, startDate, endDate]
    );

    // ─── Notes ────────────────────────────────────────────────
    // If you have a notes table, use it; otherwise, we can extract notes from time_entries.
    // For now, we'll use a placeholder.
    let notes = { rows: [] };
    try {
      const notesRes = await pool.query(
        `SELECT n.*,
                u.first_name || ' ' || u.last_name AS created_by
         FROM notes n
         LEFT JOIN users u ON n.created_by = u.id
         WHERE n.project_id = $1 AND n.created_at BETWEEN $2 AND $3
         ORDER BY n.created_at ASC`,
        [projectId, startDate, endDate]
      );
      notes = notesRes;
    } catch (e) {
      // If notes table doesn't exist, we ignore.
      console.warn('Notes table not available');
    }

    // ─── Company Name ──────────────────────────────────────────
    const companyRes = await pool.query('SELECT name FROM companies WHERE id = $1', [decoded.companyId]);
    const companyName = companyRes.rows[0]?.name || 'Future Jobs Pro AI';

    const reportData = {
      project,
      dateRange: { start: startDate, end: endDate },
      photos: photos.rows,
      videos: videos.rows,
      voiceNotes: voiceNotes.rows,
      gpsTrails: gpsTrails.rows,
      timesheet: timesheet.rows,
      notes: notes.rows || [],
      companyName,
    };

    const pdfBuffer = await generateComprehensiveReport(reportData);
    const base64 = pdfBuffer.toString('base64');
    const dataUrl = `data:application/pdf;base64,${base64}`;

    res.json({ success: true, reportUrl: dataUrl });
  } catch (error) {
    console.error('Comprehensive report error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;