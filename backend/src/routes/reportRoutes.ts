import express, { Request, Response } from 'express';
import { verifyToken } from '../utils/auth';
import { pool } from '../config/database';
import { generateComprehensiveReport, ProjectReportData } from '../services/comprehensiveReportService';

const router = express.Router();

type Actor = { id: string; companyId: string };

async function actor(req: Request): Promise<Actor> {
  const decoded = verifyToken(req);
  const result = await pool.query(
    'SELECT id, company_id FROM users WHERE id = $1',
    [decoded.id],
  );
  if (!result.rowCount || !result.rows[0].company_id) throw new Error('Not authenticated');
  return { id: String(result.rows[0].id), companyId: String(result.rows[0].company_id) };
}

function dateRange(source: any) {
  const startDate = String(source.startDate || '').trim();
  const endDate = String(source.endDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error('Choose a valid start and end date');
  }
  if (startDate > endDate) throw new Error('Start date must be before or equal to end date');
  return { startDate, endDate };
}

async function projectForCompany(companyId: string, projectId: string) {
  const result = await pool.query(
    `SELECT id, name, address, client_name, status
     FROM projects WHERE id = $1 AND company_id = $2`,
    [projectId, companyId],
  );
  if (!result.rowCount) throw new Error('Project not found in your company');
  return result.rows[0];
}

async function reportData(companyId: string, projectId: string, startDate: string, endDate: string): Promise<ProjectReportData> {
  const project = await projectForCompany(companyId, projectId);
  const range = [projectId, companyId, startDate, endDate];
  const [companyResult, workforceResult, photoResult, voiceResult, gpsResult, attachmentResult] = await Promise.all([
    pool.query(
      `SELECT name, legal_name, address, city, province, postal_code, phone, email
       FROM companies WHERE id = $1`,
      [companyId],
    ),
    pool.query(
      `SELECT te.id, te.clock_in, te.clock_out, COALESCE(te.break_minutes, 0) break_minutes,
              COALESCE(te.regular_hours, 0) regular_hours,
              COALESCE(te.overtime_hours, 0) overtime_hours,
              COALESCE(te.total_wage, 0) total_wage,
              COALESCE(te.approval_status, 'draft') approval_status,
              concat_ws(' ', u.first_name, u.last_name) employee_name
       FROM time_entries te
       JOIN users u ON u.id = te.user_id
       WHERE te.project_id = $1 AND u.company_id = $2
         AND te.clock_in >= $3::date AND te.clock_in < ($4::date + INTERVAL '1 day')
       ORDER BY te.clock_in`,
      range,
    ),
    pool.query(
      `SELECT p.id, p.taken_at, p.file_type, p.verification_hash, p.compliance_score,
              concat_ws(' ', u.first_name, u.last_name) taken_by_name
       FROM photos p
       LEFT JOIN users u ON u.id = p.user_id
       WHERE p.project_id = $1 AND p.company_id = $2
         AND p.taken_at >= $3::date AND p.taken_at < ($4::date + INTERVAL '1 day')
       ORDER BY p.taken_at`,
      range,
    ),
    pool.query(
      `SELECT vn.id, vn.taken_at, vn.duration_seconds, vn.transcript,
              concat_ws(' ', u.first_name, u.last_name) taken_by_name
       FROM voice_notes vn
       JOIN users u ON u.id = vn.user_id
       WHERE vn.project_id = $1 AND u.company_id = $2
         AND vn.taken_at >= $3::date AND vn.taken_at < ($4::date + INTERVAL '1 day')
       ORDER BY vn.taken_at`,
      range,
    ),
    pool.query(
      `SELECT g.time_entry_id, g.latitude, g.longitude, g.timestamp, g.accuracy,
              concat_ws(' ', u.first_name, u.last_name) employee_name
       FROM gps_tracking g
       JOIN time_entries te ON te.id = g.time_entry_id
       JOIN users u ON u.id = te.user_id
       WHERE te.project_id = $1 AND u.company_id = $2
         AND g.timestamp >= $3::date AND g.timestamp < ($4::date + INTERVAL '1 day')
       ORDER BY g.timestamp`,
      range,
    ),
    pool.query(
      `SELECT id, file_name, file_type, file_size, category, created_at
       FROM attachments
       WHERE project_id = $1 AND company_id = $2
         AND created_at >= $3::date AND created_at < ($4::date + INTERVAL '1 day')
       ORDER BY created_at`,
      range,
    ),
  ]);

  return {
    company: companyResult.rows[0] || { name: 'Future Jobs Pro AI' },
    project,
    dateRange: { start: startDate, end: endDate },
    workforce: workforceResult.rows,
    media: photoResult.rows,
    voiceNotes: voiceResult.rows,
    gpsPoints: gpsResult.rows,
    attachments: attachmentResult.rows,
    generatedAt: new Date().toISOString(),
  };
}

function summary(data: ProjectReportData) {
  const completed = data.workforce.filter((entry) => entry.clock_out);
  const totalHours = completed.reduce((total, entry) => {
    const hours = (new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / 3600000;
    return total + Math.max(0, hours - Number(entry.break_minutes || 0) / 60);
  }, 0);
  const grossWages = data.workforce.reduce((total, entry) => total + Number(entry.total_wage || 0), 0);
  const regularHours = data.workforce.reduce((total, entry) => total + Number(entry.regular_hours || 0), 0);
  const overtimeHours = data.workforce.reduce((total, entry) => total + Number(entry.overtime_hours || 0), 0);
  const employees = new Set(data.workforce.map((entry) => entry.employee_name).filter(Boolean)).size;
  const approved = data.workforce.filter((entry) => entry.approval_status === 'approved').length;
  const verifiedMedia = data.media.filter((item) => item.verification_hash).length;
  const complianceScores = data.media
    .map((item) => item.compliance_score)
    .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
    .map(Number);
  const analyzedPhotos = complianceScores.length;
  const averageComplianceScore = analyzedPhotos
    ? Math.round(complianceScores.reduce((total, value) => total + value, 0) / analyzedPhotos)
    : null;
  const compliantPhotos = complianceScores.filter((value) => value >= 70).length;
  const anomalousEntries = data.workforce.filter((entry) => {
    if (!entry.clock_out) return false;
    const elapsed = (new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / 3600000;
    return elapsed > 24 || Number(entry.overtime_hours || 0) > 16 || elapsed < 0;
  }).length;
  const payrollHours = regularHours + overtimeHours;
  const hoursVariance = totalHours - payrollHours;
  const completionRate = data.workforce.length ? Math.round((completed.length / data.workforce.length) * 100) : 0;
  const approvalRate = completed.length ? Math.round((approved / completed.length) * 100) : 0;
  const readinessScore = Math.round(
    (completionRate * 0.4) + (approvalRate * 0.3) + (data.project.address ? 10 : 0) +
    (data.attachments.length ? 10 : 0) + (anomalousEntries ? 0 : 10),
  );
  return {
    totalHours, grossWages, regularHours, overtimeHours, employees,
    timeEntries: data.workforce.length, completedEntries: completed.length, approvedEntries: approved,
    mediaFiles: data.media.length, verifiedMedia, analyzedPhotos, averageComplianceScore,
    compliantPhotos, voiceNotes: data.voiceNotes.length,
    gpsPoints: data.gpsPoints.length, attachments: data.attachments.length,
    anomalousEntries, payrollHours, hoursVariance,
    completionRate, approvalRate, readinessScore: Math.min(100, readinessScore),
  };
}

router.get('/summary', async (req: Request, res: Response) => {
  try {
    const current = await actor(req);
    const projectId = String(req.query.projectId || '');
    if (!projectId) throw new Error('Choose a project');
    const range = dateRange(req.query);
    const data = await reportData(current.companyId, projectId, range.startDate, range.endDate);
    res.set('Cache-Control', 'no-store').json({
      success: true,
      project: data.project,
      dateRange: data.dateRange,
      summary: summary(data),
      workforce: data.workforce,
    });
  } catch (error: any) {
    const status = /authenticated/i.test(error.message) ? 401 : /not found/i.test(error.message) ? 404 : 400;
    res.status(status).json({ success: false, message: error.message });
  }
});

router.post('/comprehensive', async (req: Request, res: Response) => {
  try {
    const current = await actor(req);
    const projectId = String(req.body.projectId || '');
    if (!projectId) throw new Error('Choose a project');
    const range = dateRange(req.body);
    const data = await reportData(current.companyId, projectId, range.startDate, range.endDate);
    const pdfBuffer = await generateComprehensiveReport({ ...data, summary: summary(data) });
    const safeProjectName = String(data.project.name || 'project').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeProjectName || 'project'}-${range.startDate}-${range.endDate}.pdf"`);
    res.setHeader('Content-Length', String(pdfBuffer.length));
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Comprehensive report error:', error);
    const status = /authenticated/i.test(error.message) ? 401 : /not found/i.test(error.message) ? 404 : 400;
    res.status(status).json({ success: false, message: error.message });
  }
});

router.get('/timesheet.csv', async (req: Request, res: Response) => {
  try {
    const current = await actor(req);
    const projectId = String(req.query.projectId || '');
    if (!projectId) throw new Error('Choose a project');
    const range = dateRange(req.query);
    const data = await reportData(current.companyId, projectId, range.startDate, range.endDate);
    const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Employee', 'Date', 'Clock In', 'Clock Out', 'Regular Hours', 'Overtime Hours', 'Gross Wages', 'Approval Status'],
      ...data.workforce.map((entry) => [
        entry.employee_name,
        new Date(entry.clock_in).toISOString().slice(0, 10),
        new Date(entry.clock_in).toISOString(),
        entry.clock_out ? new Date(entry.clock_out).toISOString() : '',
        Number(entry.regular_hours || 0).toFixed(2),
        Number(entry.overtime_hours || 0).toFixed(2),
        Number(entry.total_wage || 0).toFixed(2),
        entry.approval_status,
      ]),
    ];
    const csv = rows.map((row) => row.map(quote).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="timesheet-${range.startDate}-${range.endDate}.csv"`);
    res.send(`\uFEFF${csv}`);
  } catch (error: any) {
    const status = /authenticated/i.test(error.message) ? 401 : /not found/i.test(error.message) ? 404 : 400;
    res.status(status).json({ success: false, message: error.message });
  }
});

export default router;
