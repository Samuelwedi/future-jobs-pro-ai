import express, { Request, Response } from "express";
import { companyActor, manages } from "../middleware/companyActor";
import {
  documentDate,
  documentId,
  requireValue,
} from "../services/commercialDocuments";
import { pool } from "../config/database";
import {
  generateComprehensiveReport,
  ProjectReportData,
} from "../services/comprehensiveReportService";

const router = express.Router();

router.use(companyActor, (_req, res, next) =>
  manages(res.locals.actor)
    ? next()
    : res
        .status(403)
        .json({ success: false, message: "Manager access required" }),
);
const actor = (res: Response) => ({
  id: res.locals.actor.id,
  companyId: res.locals.actor.company_id,
});
function dateRange(source: any) {
  const startDate = String(source.startDate || "").trim();
  const endDate = String(source.endDate || "").trim();
  documentDate(startDate);
  documentDate(endDate);
  requireValue(
    startDate <= endDate,
    "Start date must be before or equal to end date",
  );
  requireValue(
    (Date.parse(endDate) - Date.parse(startDate)) / 86400000 <= 366,
    "Choose a reporting range of at most 367 calendar days.",
  );
  return { startDate, endDate };
}

async function projectForCompany(companyId: string, projectId: string) {
  documentId(projectId);
  const result = await pool.query(
    `SELECT id, name, address, client_name, status
     FROM projects WHERE id = $1 AND company_id = $2`,
    [projectId, companyId],
  );
  requireValue(result.rowCount, "Project not found in your company", 404);
  return result.rows[0];
}

async function reportData(
  companyId: string,
  projectId: string,
  startDate: string,
  endDate: string,
): Promise<ProjectReportData> {
  const project = await projectForCompany(companyId, projectId);
  const settings = await pool.query(
    "SELECT COALESCE(NULLIF(to_jsonb(c)->>'timezone',''),'UTC') timezone FROM companies c WHERE id=$1",
    [companyId],
  );
  const timezone = settings.rows[0]?.timezone || "UTC";
  const range = [projectId, companyId, startDate, endDate, timezone];
  const [
    companyResult,
    workforceResult,
    photoResult,
    voiceResult,
    gpsResult,
    attachmentResult,
  ] = await Promise.all([
    pool.query(
      `SELECT name, legal_name, address, city, province, postal_code, phone, email
       FROM companies WHERE id = $1`,
      [companyId],
    ),
    pool.query(
      `SELECT te.id,te.user_id employee_id,to_char(te.clock_in AT TIME ZONE $5,'YYYY-MM-DD') work_date, te.clock_in, te.clock_out, COALESCE(te.break_minutes, 0) break_minutes,
              COALESCE(te.regular_hours, 0) regular_hours,
              COALESCE(te.overtime_hours, 0) overtime_hours,
              COALESCE(te.total_wage, 0) total_wage,
              COALESCE(te.approval_status, 'draft') approval_status,
              concat_ws(' ', u.first_name, u.last_name) employee_name
       FROM time_entries te
       JOIN users u ON u.id = te.user_id
       WHERE te.project_id = $1 AND u.company_id = $2
         AND te.clock_in >= ($3::date::timestamp AT TIME ZONE $5) AND te.clock_in < (($4::date + INTERVAL '1 day') AT TIME ZONE $5)
       ORDER BY te.clock_in LIMIT 5001`,
      range,
    ),
    pool.query(
      `SELECT p.id, p.taken_at, p.file_type, p.verification_hash, p.compliance_score,
              concat_ws(' ', u.first_name, u.last_name) taken_by_name
       FROM photos p
       LEFT JOIN users u ON u.id = p.user_id AND u.company_id=p.company_id
       WHERE p.project_id = $1 AND p.company_id = $2
         AND p.taken_at >= ($3::date::timestamp AT TIME ZONE $5) AND p.taken_at < (($4::date + INTERVAL '1 day') AT TIME ZONE $5)
       ORDER BY p.taken_at LIMIT 5001`,
      range,
    ),
    pool.query(
      `SELECT vn.id, vn.taken_at, vn.duration_seconds, vn.transcript,
              concat_ws(' ', u.first_name, u.last_name) taken_by_name
       FROM voice_notes vn
       JOIN users u ON u.id = vn.user_id
       WHERE vn.project_id = $1 AND u.company_id = $2
         AND vn.taken_at >= ($3::date::timestamp AT TIME ZONE $5) AND vn.taken_at < (($4::date + INTERVAL '1 day') AT TIME ZONE $5)
       ORDER BY vn.taken_at LIMIT 5001`,
      range,
    ),
    pool.query(
      `SELECT g.time_entry_id, g.latitude, g.longitude, g.timestamp, g.accuracy,
              concat_ws(' ', u.first_name, u.last_name) employee_name
       FROM gps_tracking g
       JOIN time_entries te ON te.id = g.time_entry_id
       JOIN users u ON u.id = te.user_id
       WHERE te.project_id = $1 AND u.company_id = $2
         AND g.timestamp >= ($3::date::timestamp AT TIME ZONE $5) AND g.timestamp < (($4::date + INTERVAL '1 day') AT TIME ZONE $5)
       ORDER BY g.timestamp LIMIT 5001`,
      range,
    ),
    pool.query(
      `SELECT id, file_name, file_type, file_size, category, created_at
       FROM attachments
       WHERE project_id = $1 AND company_id = $2
         AND created_at >= ($3::date::timestamp AT TIME ZONE $5) AND created_at < (($4::date + INTERVAL '1 day') AT TIME ZONE $5)
       ORDER BY created_at LIMIT 5001`,
      range,
    ),
  ]);

  requireValue(
    [
      workforceResult,
      photoResult,
      voiceResult,
      gpsResult,
      attachmentResult,
    ].every((r) => r.rows.length <= 5000),
    "Too many records. Narrow the reporting range.",
    422,
  );
  return {
    timezone,
    company: companyResult.rows[0] || { name: "Future Jobs Pro AI" },
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
    const hours =
      (new Date(entry.clock_out).getTime() -
        new Date(entry.clock_in).getTime()) /
      3600000;
    return total + Math.max(0, hours - Number(entry.break_minutes || 0) / 60);
  }, 0);
  const grossWages = data.workforce.reduce(
    (total, entry) => total + Number(entry.total_wage || 0),
    0,
  );
  const regularHours = data.workforce.reduce(
    (total, entry) => total + Number(entry.regular_hours || 0),
    0,
  );
  const overtimeHours = data.workforce.reduce(
    (total, entry) => total + Number(entry.overtime_hours || 0),
    0,
  );
  const employees = new Set(
    data.workforce.map((entry) => entry.employee_id).filter(Boolean),
  ).size;
  const approved = completed.filter(
    (entry) => entry.approval_status === "approved",
  ).length;
  const verifiedMedia = data.media.filter(
    (item) => item.verification_hash,
  ).length;
  const complianceScores = data.media
    .map((item) => item.compliance_score)
    .filter(
      (value) =>
        value !== null && value !== undefined && Number.isFinite(Number(value)),
    )
    .map(Number);
  const analyzedPhotos = complianceScores.length;
  const averageComplianceScore = analyzedPhotos
    ? Math.round(
        complianceScores.reduce((total, value) => total + value, 0) /
          analyzedPhotos,
      )
    : null;
  const compliantPhotos = complianceScores.filter(
    (value) => value >= 70,
  ).length;
  const anomalousEntries = data.workforce.filter((entry) => {
    if (!entry.clock_out) return false;
    const elapsed =
      (new Date(entry.clock_out).getTime() -
        new Date(entry.clock_in).getTime()) /
      3600000;
    return (
      elapsed > 24 || Number(entry.overtime_hours || 0) > 16 || elapsed < 0
    );
  }).length;
  const payrollHours = regularHours + overtimeHours;
  const hoursVariance = totalHours - payrollHours;
  const completionRate = data.workforce.length
    ? Math.round((completed.length / data.workforce.length) * 100)
    : 0;
  const approvalRate = completed.length
    ? Math.round((approved / completed.length) * 100)
    : 0;
  const readinessScore = Math.round(
    completionRate * 0.4 +
      approvalRate * 0.3 +
      (data.project.address ? 10 : 0) +
      (data.attachments.length ? 10 : 0) +
      (anomalousEntries ? 0 : 10),
  );
  return {
    totalHours,
    grossWages,
    regularHours,
    overtimeHours,
    employees,
    timeEntries: data.workforce.length,
    completedEntries: completed.length,
    approvedEntries: approved,
    mediaFiles: data.media.length,
    verifiedMedia,
    analyzedPhotos,
    averageComplianceScore,
    compliantPhotos,
    voiceNotes: data.voiceNotes.length,
    gpsPoints: data.gpsPoints.length,
    attachments: data.attachments.length,
    anomalousEntries,
    payrollHours,
    hoursVariance,
    completionRate,
    approvalRate,
    readinessScore: Math.min(100, readinessScore),
  };
}

router.get("/workspace", async (_req, res) => {
  try {
    const a = actor(res),
      r = await pool.query(
        "SELECT id,name FROM projects WHERE company_id=$1 ORDER BY name,id LIMIT 201",
        [a.companyId],
      );
    res.json({
      success: true,
      actorId: a.id,
      companyId: a.companyId,
      projects: r.rows.slice(0, 200),
      moreProjects: r.rows.length > 200,
    });
  } catch {
    res
      .status(503)
      .json({ success: false, message: "Reports are unavailable." });
  }
});

router.get("/summary", async (req: Request, res: Response) => {
  try {
    const current = actor(res);
    const projectId = String(req.query.projectId || "");
    requireValue(projectId, "Choose a project");
    const range = dateRange(req.query);
    const data = await reportData(
      current.companyId,
      projectId,
      range.startDate,
      range.endDate,
    );
    res.set("Cache-Control", "no-store").json({
      success: true,
      actorId: current.id,
      companyId: current.companyId,
      timezone: data.timezone,
      wageCurrency: null,
      wageBasis:
        "Recorded time-entry amounts; currency not recorded. Not a reviewed payroll or payment report.",
      project: data.project,
      dateRange: data.dateRange,
      summary: summary(data),
      workforce: data.workforce,
    });
  } catch (error: any) {
    res
      .status(error.status || 503)
      .json({
        success: false,
        message: error.status
          ? error.message
          : "Reports are unavailable. Try again or contact support.",
      });
  }
});

const comprehensive = async (req: Request, res: Response) => {
  try {
    const current = actor(res);
    const source = req.method === "GET" ? req.query : req.body;
    const projectId = String(source.projectId || "");
    requireValue(projectId, "Choose a project");
    const range = dateRange(source);
    const data = await reportData(
      current.companyId,
      projectId,
      range.startDate,
      range.endDate,
    );
    const pdfBuffer = await generateComprehensiveReport({
      ...data,
      summary: summary(data),
    });
    const safeProjectName = String(data.project.name || "project")
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-|-$/g, "");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeProjectName || "project"}-${range.startDate}-${range.endDate}.pdf"`,
    );
    res.setHeader("Content-Length", String(pdfBuffer.length));
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error("Comprehensive report error:", error);
    res
      .status(error.status || 503)
      .json({
        success: false,
        message: error.status
          ? error.message
          : "Reports are unavailable. Try again or contact support.",
      });
  }
};
router.post("/comprehensive", comprehensive);
router.get("/comprehensive.pdf", comprehensive);

router.get("/timesheet.csv", async (req: Request, res: Response) => {
  try {
    const current = actor(res);
    const projectId = String(req.query.projectId || "");
    requireValue(projectId, "Choose a project");
    const range = dateRange(req.query);
    const data = await reportData(
      current.companyId,
      projectId,
      range.startDate,
      range.endDate,
    );
    const quote = (value: unknown) => {
      let text = String(value ?? "");
      if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const rows = [
      [
        "Employee",
        "Date",
        "Clock In",
        "Clock Out",
        "Regular Hours",
        "Overtime Hours",
        "Gross Wages",
        "Approval Status",
      ],
      ...data.workforce.map((entry) => [
        entry.employee_name,
        entry.work_date,
        new Date(entry.clock_in).toISOString(),
        entry.clock_out ? new Date(entry.clock_out).toISOString() : "",
        Number(entry.regular_hours || 0).toFixed(2),
        Number(entry.overtime_hours || 0).toFixed(2),
        Number(entry.total_wage || 0).toFixed(2),
        entry.approval_status,
      ]),
    ];
    const csv = rows.map((row) => row.map(quote).join(",")).join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="timesheet-${range.startDate}-${range.endDate}.csv"`,
    );
    res.send(`\uFEFF${csv}`);
  } catch (error: any) {
    res
      .status(error.status || 503)
      .json({
        success: false,
        message: error.status
          ? error.message
          : "Reports are unavailable. Try again or contact support.",
      });
  }
});

export default router;
