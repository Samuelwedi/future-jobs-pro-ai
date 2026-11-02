import express from "express";
import bcrypt from "bcryptjs";
import { pool } from "../config/database";
import { companyActor, manages } from "../middleware/companyActor";
import {
  decimal,
  documentDate,
  documentId,
  note,
  requireValue,
  transaction,
} from "../services/commercialDocuments";
import {
  adminEmployee,
  adminUserQuery,
  canManageCompanyMember,
  checkAdminVersion,
  privilegedCompanyRole,
} from "../services/companyAdministration";
const router = express.Router(),
  route = (fn: any) => (req: any, res: any, next: any) =>
    Promise.resolve(fn(req, res)).catch(next);
router.use(companyActor, (_req, res, next) =>
  manages(res.locals.actor)
    ? next()
    : res.status(403).json({
        success: false,
        message: "Company administrator access is required",
      }),
);
async function calendar(client: any, companyId: string) {
  const r = await client.query(
    "SELECT COALESCE(NULLIF(to_jsonb(c)->>'timezone',''),'UTC') timezone,(CURRENT_TIMESTAMP AT TIME ZONE COALESCE(NULLIF(to_jsonb(c)->>'timezone',''),'UTC'))::date::text today FROM companies c WHERE id=$1",
    [companyId],
  );
  requireValue(r.rows[0], "Company not found.", 404);
  return r.rows[0];
}
async function employee(
  client: any,
  a: any,
  id: string,
  tz: string,
  lock = false,
) {
  const r = await client.query(
    adminUserQuery +
      ` WHERE u.id=$1 AND u.company_id=$2${lock ? " FOR UPDATE OF u" : ""}`,
    [id, a.company_id, tz],
  );
  requireValue(r.rows[0], "Employee not found in your company", 404);
  return r.rows[0];
}
async function mutate(
  req: any,
  res: any,
  action: string,
  work: (c: any, a: any, row: any, cal: any) => Promise<any>,
  auditDetails: any = {},
) {
  const initial = res.locals.actor,
    id = documentId(req.params.id);
  const result = await transaction(async (c) => {
    const actorResult = await c.query(
        "SELECT id,company_id,LOWER(role) role FROM users WHERE id=$1 AND company_id=$2 AND COALESCE(is_active,true) FOR SHARE",
        [initial.id, initial.company_id],
      ),
      a = actorResult.rows[0];
    requireValue(
      a && manages(a),
      "Company administrator access is required",
      403,
    );
    const cal = await calendar(c, a.company_id),
      before = await employee(c, a, id, cal.timezone);
    requireValue(
      canManageCompanyMember(a, before),
      "This employee account cannot be managed by your role. Use the dedicated ownership-transfer flow for owners.",
      403,
    );
    const row = await employee(c, a, id, cal.timezone, true);
    requireValue(
      canManageCompanyMember(a, row),
      "This employee account cannot be managed by your role.",
      403,
    );
    checkAdminVersion(row, req.body?.expectedVersion);
    await work(c, a, row, cal);
    await c.query(
      "UPDATE users SET updated_at=NOW() WHERE id=$1 AND company_id=$2",
      [id, a.company_id],
    );
    await c.query(
      "INSERT INTO company_admin_audit_logs(company_id,actor_id,employee_id,action,details) VALUES($1,$2,$3,$4,$5)",
      [a.company_id, a.id, id, action, JSON.stringify(auditDetails)],
    );
    return {
      actorId: a.id,
      companyId: a.company_id,
      employee: adminEmployee(a, await employee(c, a, id, cal.timezone)),
    };
  });
  res.json({ success: true, ...result, sessionRefreshRequired: true });
}
router.get(
  "/overview",
  route(async (_req: any, res: any) => {
    const a = res.locals.actor,
      cal = await calendar(pool, a.company_id);
    const users = await pool.query(
      adminUserQuery +
        " WHERE u.company_id=$1 AND LOWER(COALESCE(u.role,'employee')) NOT IN ('boss','owner','admin') ORDER BY u.first_name,u.last_name,u.id LIMIT $2",
      [a.company_id, 501, cal.timezone],
    );
    requireValue(
      users.rows.length <= 500,
      "Too many employee records. Use the team and payroll workspaces.",
      413,
    );
    const metric = async (sql: string) => {
      try {
        const r = await pool.query(sql, [a.company_id, cal.timezone]);
        const n = Number(r.rows[0]?.value);
        return Number.isFinite(n) ? n : null;
      } catch {
        return null;
      }
    };
    const [
      totalEmployees,
      activeJobs,
      totalProjects,
      payrollMonth,
      labourToday,
    ] = await Promise.all([
      metric(
        "SELECT COUNT(*) value FROM users WHERE company_id=$1 AND COALESCE(is_active,true) AND LOWER(COALESCE(role,'employee')) NOT IN ('boss','owner','admin') AND $2::text IS NOT NULL",
      ),
      metric(
        "SELECT COUNT(*) value FROM projects WHERE company_id=$1 AND LOWER(COALESCE(status,'active')) IN ('active','in_progress','in progress') AND $2::text IS NOT NULL",
      ),
      metric(
        "SELECT COUNT(*) value FROM projects WHERE company_id=$1 AND $2::text IS NOT NULL",
      ),
      metric(
        "SELECT COALESCE(SUM(pi.final_pay),0) value FROM payroll_items pi JOIN payrolls p ON p.id=pi.payroll_id WHERE p.company_id=$1 AND p.created_at>=(date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE $2) AT TIME ZONE $2)",
      ),
      metric(
        "SELECT COALESCE(SUM(te.total_wage),0) value FROM time_entries te JOIN users u ON u.id=te.user_id WHERE u.company_id=$1 AND (te.clock_in AT TIME ZONE $2)::date=(CURRENT_TIMESTAMP AT TIME ZONE $2)::date",
      ),
    ]);
    let revenueByCurrency: any[] | null = null;
    try {
      revenueByCurrency = (
        await pool.query(
          "SELECT i.currency,COALESCE(SUM(pay.amount),0)::text month_amount,COALESCE(SUM(pay.amount) FILTER(WHERE pay.payment_date=$2::date),0)::text today_amount FROM payments pay JOIN invoices i ON i.id=pay.invoice_id WHERE i.company_id=$1 AND pay.payment_date>=date_trunc('month',$2::date)::date AND pay.payment_date<=$2::date GROUP BY i.currency ORDER BY i.currency",
          [a.company_id, cal.today],
        )
      ).rows;
    } catch {}
    const single =
      revenueByCurrency?.length === 1 &&
      ["CAD", "USD"].includes(revenueByCurrency[0].currency)
        ? revenueByCurrency[0]
        : null;
    res.json({
      success: true,
      actorId: a.id,
      companyId: a.company_id,
      timezone: cal.timezone,
      asOfDate: cal.today,
      permissions: { canAssignManager: privilegedCompanyRole(a.role) },
      stats: {
        totalEmployees,
        activeJobs,
        totalProjects,
        totalPayrollThisMonth: payrollMonth,
        revenueThisMonth: single ? Number(single.month_amount) : null,
        revenueToday: single ? Number(single.today_amount) : null,
        marginToday: null,
        labourCostToday: labourToday,
        revenueCurrency: single?.currency || null,
      },
      revenueByCurrency,
      wageCurrency: null,
      employees: users.rows.map((row) => adminEmployee(a, row)),
    });
  }),
);
router.get(
  "/employees/:id",
  route(async (req: any, res: any) => {
    const a = res.locals.actor,
      cal = await calendar(pool, a.company_id),
      row = await employee(pool, a, documentId(req.params.id), cal.timezone);
    requireValue(
      canManageCompanyMember(a, row),
      "Use a permitted administrator or the dedicated account workflow.",
      403,
    );
    res.json({
      success: true,
      actorId: a.id,
      companyId: a.company_id,
      employee: adminEmployee(a, row),
    });
  }),
);
router.get(
  "/audit",
  route(async (req: any, res: any) => {
    const a = res.locals.actor,
      limit = Number(req.query.limit ?? 25),
      offset = Number(req.query.offset ?? 0);
    requireValue(
      Number.isInteger(limit) &&
        limit > 0 &&
        limit <= 100 &&
        Number.isInteger(offset) &&
        offset >= 0 &&
        offset <= 100000,
      "Choose a valid audit page.",
    );
    const r = await pool.query(
      "SELECT id,actor_id,employee_id,action,details,created_at FROM company_admin_audit_logs WHERE company_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3",
      [a.company_id, limit, offset],
    );
    res.json({
      success: true,
      actorId: a.id,
      companyId: a.company_id,
      events: r.rows,
      limit,
      offset,
    });
  }),
);
router.patch(
  "/employees/:id/profile",
  route(async (req: any, res: any) => {
    const first = note(req.body?.firstName, 100),
      last = note(req.body?.lastName, 100),
      email = note(req.body?.email, 254).toLowerCase(),
      role = String(req.body?.role || "").toLowerCase();
    requireValue(
      first && last && /^\S+@\S+\.\S+$/.test(email),
      "A valid name and email are required",
    );
    requireValue(
      ["employee", "manager"].includes(role),
      "Role must be employee or manager",
    );
    requireValue(
      typeof req.body.isActive === "boolean",
      "Choose whether the account is active.",
    );
    await mutate(
      req,
      res,
      "employee.profile_updated",
      async (c, a) => {
        requireValue(
          role !== "manager" || privilegedCompanyRole(a.role),
          "Only a company owner or administrator can assign manager access.",
          403,
        );
        await c.query(
          "UPDATE users SET first_name=$1,last_name=$2,full_name=$3,email=$4,role=$5,is_active=$6 WHERE id=$7 AND company_id=$8",
          [
            first,
            last,
            first + " " + last,
            email,
            role,
            req.body.isActive,
            req.params.id,
            a.company_id,
          ],
        );
      },
      { role, isActive: req.body.isActive },
    );
  }),
);
router.post(
  "/employees/:id/compensation",
  route(async (req: any, res: any) => {
    const rate = decimal(req.body?.hourlyRate, 10000, true),
      date = documentDate(req.body?.effectiveDate);
    await mutate(
      req,
      res,
      "employee.compensation_updated",
      async (c, a) => {
        await c.query(
          "INSERT INTO compensation_history(user_id,hourly_rate,effective_date,created_by) VALUES($1,$2,$3,$4)",
          [req.params.id, rate, date, a.id],
        );
      },
      { hourlyRate: rate, effectiveDate: date },
    );
  }),
);
router.patch(
  "/employees/:id/tax",
  route(async (req: any, res: any) => {
    requireValue(
      req.body?.sin == null || typeof req.body.sin === "string",
      "Enter a valid tax identifier.",
    );
    const sin = String(req.body?.sin || "").replace(/[ -]/g, ""),
      dob = req.body?.dateOfBirth ? documentDate(req.body.dateOfBirth) : "";
    requireValue(
      !sin || /^\d{9}$/.test(sin),
      "SIN must contain exactly 9 digits",
    );
    await mutate(
      req,
      res,
      "employee.tax_updated",
      async (c, a, _row, cal) => {
        requireValue(
          !dob || dob <= cal.today,
          "Date of birth cannot be in the future.",
        );
        await c.query(
          "UPDATE users SET sin=COALESCE(NULLIF($1,''),sin),date_of_birth=COALESCE(NULLIF($2,'')::date,date_of_birth) WHERE id=$3 AND company_id=$4",
          [sin, dob, req.params.id, a.company_id],
        );
      },
      { sinReplaced: !!sin, dateOfBirthUpdated: !!dob },
    );
  }),
);
router.patch(
  "/employees/:id/direct-deposit",
  route(async (_req: any, res: any) =>
    res.status(410).json({
      success: false,
      message:
        "Legacy bank-detail entry has been retired. Employee payouts remain disabled.",
    }),
  ),
);
router.post(
  "/employees/:id/reset-password",
  route(async (req: any, res: any) => {
    const password = req.body?.temporaryPassword;
    requireValue(
      typeof password === "string" &&
        password.length >= 12 &&
        Buffer.byteLength(password, "utf8") <= 72,
      "Use a temporary password of at least 12 characters and at most 72 UTF-8 bytes.",
    );
    await mutate(req, res, "employee.password_reset", async (c, a) => {
      await c.query(
        "UPDATE users SET password_hash=$1,must_change_password=true WHERE id=$2 AND company_id=$3",
        [await bcrypt.hash(password, 12), req.params.id, a.company_id],
      );
    });
  }),
);
router.use((e: any, _req: any, res: any, _next: any) =>
  res.status(e.code === "23505" ? 409 : e.status || 503).json({
    success: false,
    message:
      e.code === "23505"
        ? "That account or record conflicts with an existing entry."
        : e.status
          ? e.message
          : "Company administration is unavailable. Refresh or contact support.",
  }),
);
export default router;
