import express from "express";
import { pool } from "../config/database";
import { companyActor, manages } from "../middleware/companyActor";
import {
  compileT4Slip,
  compileT4ASlip,
  compileRL1Slip,
  yearEndError,
  yearEndRequest,
  yearEndPreviewHash,
} from "../services/yearEndService";
const router = express.Router();
router.use(companyActor, (_req, res, next) =>
  manages(res.locals.actor)
    ? next()
    : res.status(403).json({
        success: false,
        message: "Payroll manager access is required",
      }),
);
router.use(["/preview", "/finalize"], async (_req, res, next) => {
  try {
    const company = res.locals.actor.company_id;
    const rules = await pool.query(
      "SELECT rules FROM company_payroll_rule_versions WHERE company_id=$1 ORDER BY revision DESC LIMIT 1",
      [company],
    );
    const records = await pool.query(
      "SELECT pi.id FROM payroll_items pi JOIN payrolls p ON p.id=pi.payroll_id WHERE p.company_id=$1 AND pi.calculation_snapshot->>'engine'='company_rules_v1' LIMIT 1",
      [company],
    );
    if (
      rules.rows[0]?.rules?.engine === "company_rules_v1" ||
      records.rows.length
    )
      return res.status(409).json({
        success: false,
        message:
          "Statutory year-end form generation is not implemented for company-configured worldwide payroll. Use your local filing process.",
      });
    next();
  } catch {
    return res.status(503).json({
      success: false,
      message:
        "Could not verify payroll jurisdiction before generating tax forms",
    });
  }
});
const fail = (res: any, e: any) =>
  res.status(e.status || 503).json({
    success: false,
    message: e.status
      ? e.message
      : "Year-end service is unavailable. Try again or contact support.",
  });
const form = (value: unknown) => {
  const v = String(value || "").toUpperCase();
  if (!["T4", "T4A", "RL1"].includes(v))
    throw yearEndError("Invalid form type", 400);
  return v;
};
function archiveView(row: any) {
  const snapshot = row.snapshot,
    manifest =
      snapshot.t4Manifest || snapshot.t4aManifest || snapshot.rl1Manifest || {};
  return {
    id: row.id,
    employee_id: row.employee_id,
    tax_year: row.tax_year,
    form_type: row.form_type,
    generated_at: row.generated_at,
    first_name: snapshot.employee?.firstName,
    last_name: snapshot.employee?.lastName,
    legal_name: snapshot.employer?.name,
    company_name: snapshot.employer?.name,
    snapshot,
    ...Object.fromEntries(
      Object.entries(manifest).map(([k, v]) => [
        k.replace(/^box(?=\d)/, "box_"),
        v,
      ]),
    ),
    ...snapshot.employerMetrics,
  };
}
const companyFields: Record<string, string> = {
  name: "name",
  legalName: "legal_name",
  businessNumber: "business_number",
  payrollAccountNumber: "payroll_account_number",
  address: "address",
  city: "city",
  province: "province",
  postalCode: "postal_code",
  phone: "phone",
  email: "email",
};
router.get("/employees", async (_req, res) => {
  try {
    const a = res.locals.actor,
      people = await pool.query(
        "SELECT id,COALESCE(full_name,first_name||' '||last_name,email) name FROM users WHERE company_id=$1 ORDER BY last_name,first_name,id",
        [a.company_id],
      );
    res.json({
      success: true,
      actorId: a.id,
      companyId: a.company_id,
      manager: true,
      people: people.rows,
    });
  } catch (e) {
    fail(res, e);
  }
});
router.get("/company", async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT id,name,legal_name,business_number,payroll_account_number,address,city,province,postal_code,phone,email FROM companies WHERE id=$1",
      [res.locals.actor.company_id],
    );
    res.json({ success: true, company: result.rows[0] });
  } catch (e) {
    fail(res, e);
  }
});
router.patch("/company", async (req, res) => {
  try {
    const keys = Object.keys(req.body || {});
    if (!keys.length || keys.some((k) => !Object.hasOwn(companyFields, k)))
      throw yearEndError("Choose valid employer identity fields.", 400);
    const values = keys.map((k) => {
      if (
        typeof req.body[k] !== "string" ||
        req.body[k].length >
          (
            {
              name: 255,
              legalName: 255,
              address: 255,
              businessNumber: 15,
              payrollAccountNumber: 20,
              city: 120,
              province: 2,
              postalCode: 10,
              phone: 50,
              email: 255,
            } as Record<string, number>
          )[k]
      )
        throw yearEndError(
          "Employer identity values must be bounded text.",
          400,
        );
      return req.body[k].trim();
    });
    if (keys.includes("name") && !values[keys.indexOf("name")])
      throw yearEndError("Operating name is required.", 400);
    await pool.query(
      "UPDATE companies SET " +
        keys.map((k, i) => companyFields[k] + "=$" + (i + 1)).join(",") +
        " WHERE id=$" +
        (keys.length + 1),
      [...values, res.locals.actor.company_id],
    );
    res.json({ success: true, message: "Employer identity saved." });
  } catch (e) {
    fail(res, e);
  }
});
router.get("/finalized", async (req, res) => {
  try {
    const a = res.locals.actor,
      year = req.query.taxYear === undefined ? null : Number(req.query.taxYear),
      employee =
        req.query.employeeId === undefined
          ? null
          : String(req.query.employeeId),
      type = req.query.formType ? form(req.query.formType) : null;
    if (
      year !== null &&
      (!Number.isInteger(year) ||
        year < 2000 ||
        year > new Date().getFullYear() + 1)
    )
      throw yearEndError("Invalid tax year", 400);
    if (
      employee &&
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        employee,
      )
    )
      throw yearEndError("Invalid employee identifier", 400);
    const result = await pool.query(
      `SELECT id,employee_id,tax_year,form_type,generated_at,snapshot->'employee'->>'firstName' first_name,snapshot->'employee'->>'lastName' last_name FROM reviewed_year_end_slips WHERE company_id=$1 AND ($2::integer IS NULL OR tax_year=$2) AND ($3::uuid IS NULL OR employee_id=$3) AND ($4::text IS NULL OR form_type=$4) ORDER BY generated_at DESC LIMIT 500`,
      [a.company_id, year, employee, type],
    );
    res.json({
      success: true,
      actorId: a.id,
      companyId: a.company_id,
      slips: result.rows.map((r) => ({
        ...r,
        employee_name: `${r.first_name || ""} ${r.last_name || ""}`.trim(),
      })),
      legacyArchiveRequiresProvenanceReview: true,
    });
  } catch (e) {
    fail(res, e);
  }
});
router.get("/finalized/:formType/:id", async (req, res) => {
  try {
    const type = form(req.params.formType),
      a = res.locals.actor;
    const result = await pool.query(
      "SELECT * FROM reviewed_year_end_slips WHERE id::text=$1 AND company_id=$2 AND form_type=$3",
      [String(req.params.id), a.company_id, type],
    );
    if (!result.rows[0]) throw yearEndError("Finalized slip not found", 404);
    res.json({
      success: true,
      formType: type,
      slip: archiveView(result.rows[0]),
    });
  } catch (e) {
    fail(res, e);
  }
});
router.get("/employee/:employeeId/forms", async (req, res) => {
  try {
    const request = yearEndRequest(
      req.params.employeeId,
      new Date().getFullYear(),
      "T4",
    );
    const result = await pool.query(
      "SELECT id,first_name,last_name,employment_type,province FROM users WHERE id=$1 AND company_id=$2",
      [request.employeeId, res.locals.actor.company_id],
    );
    const employee = result.rows[0];
    if (!employee) throw yearEndError("Employee not found", 404);
    res.json({
      success: true,
      employee,
      availableForms:
        employee.employment_type === "CONTRACTOR"
          ? ["T4A"]
          : employee.province === "QC"
            ? ["T4", "RL1"]
            : ["T4"],
    });
  } catch (e) {
    fail(res, e);
  }
});
const compile = async (r: any, company: string, db?: any) =>
  r.formType === "T4"
    ? compileT4Slip(r.employeeId, r.taxYear, company, db)
    : r.formType === "T4A"
      ? compileT4ASlip(r.employeeId, r.taxYear, company)
      : compileRL1Slip(r.employeeId, r.taxYear, company);
router.get("/preview", async (req, res) => {
  try {
    const r = yearEndRequest(
        req.query.employeeId,
        req.query.taxYear,
        req.query.formType,
      ),
      a = res.locals.actor,
      preview = await compile(r, a.company_id);
    res.json({
      success: true,
      preview,
      previewHash: yearEndPreviewHash(
        r.employeeId,
        r.taxYear,
        r.formType,
        preview,
      ),
    });
  } catch (e) {
    fail(res, e);
  }
});
router.post("/finalize", async (req, res) => {
  let client: any;
  try {
    const r = yearEndRequest(
        req.body?.employeeId,
        req.body?.taxYear,
        req.body?.formType,
      ),
      a = res.locals.actor,
      reference = String(req.body?.reviewReference || "").trim();
    if (
      typeof req.body.reviewReference !== "string" ||
      req.body.confirmed !== true ||
      reference.length < 8 ||
      reference.length > 500 ||
      !/^[a-f0-9]{64}$/.test(String(req.body.previewHash || ""))
    )
      throw yearEndError(
        "Refresh the preview, confirm independent year-end review and provide its reference.",
        400,
      );
    client = await pool.connect();
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const preview = await compile(r, a.company_id, client),
      hash = yearEndPreviewHash(r.employeeId, r.taxYear, r.formType, preview);
    if (hash !== req.body.previewHash)
      throw yearEndError(
        "Payroll or employer details changed. Refresh and review the preview again.",
      );
    const saved = await client.query(
      `INSERT INTO reviewed_year_end_slips(company_id,employee_id,tax_year,form_type,snapshot,preview_hash,reviewed_by,review_reference) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(company_id,employee_id,tax_year,form_type) DO UPDATE SET snapshot=excluded.snapshot,preview_hash=excluded.preview_hash,reviewed_by=excluded.reviewed_by,review_reference=excluded.review_reference,generated_at=NOW() RETURNING id`,
      [
        a.company_id,
        r.employeeId,
        r.taxYear,
        r.formType,
        JSON.stringify(preview),
        hash,
        a.id,
        reference,
      ],
    );
    await client.query("COMMIT");
    res.json({
      success: true,
      id: saved.rows[0].id,
      result: preview,
      message:
        "Independently reviewed snapshot stored. No government filing was submitted.",
    });
  } catch (e) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    fail(res, e);
  } finally {
    client?.release();
  }
});
export default router;
