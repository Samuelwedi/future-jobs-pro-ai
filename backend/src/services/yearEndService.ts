import { pool } from "../config/database";
import Big from "big.js";
import { createHash } from "crypto";
import { classification } from "./payrollRules/engine";
type Database = {
  query: (
    sql: string,
    args?: any[],
  ) => Promise<{ rows: any[]; rowCount?: number }>;
};
export const yearEndError = (message: string, status = 409) =>
  Object.assign(new Error(message), { status });
export function yearEndRequest(
  employeeId: unknown,
  taxYear: unknown,
  formType: unknown,
) {
  const id = String(employeeId || ""),
    year = Number(taxYear),
    form = String(formType || "");
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      id,
    ) ||
    !Number.isInteger(year) ||
    year < 2000 ||
    year > new Date().getFullYear() + 1 ||
    !["T4", "T4A", "RL1"].includes(form)
  )
    throw yearEndError("Choose a valid employee, tax year and form.", 400);
  return { employeeId: id, taxYear: year, formType: form };
}
export const yearEndPreviewHash = (
  employeeId: string,
  taxYear: number,
  formType: string,
  preview: unknown,
) =>
  createHash("sha256")
    .update(JSON.stringify({ employeeId, taxYear, formType, preview }))
    .digest("hex");
export function aggregateRegularT4(rows: any[], taxYear: number) {
  if (taxYear !== 2026 || !rows.length)
    throw yearEndError(
      "Year-end preview requires recorded, reviewed regular Alberta/CAD payments in 2026.",
    );
  let gross = new Big(0),
    cpp = new Big(0),
    cpp2 = new Big(0),
    ei = new Big(0),
    tax = new Big(0),
    employerEi = new Big(0);
  for (const row of rows) {
    const s = row.calculation_snapshot;
    if (
      !row.manual_review ||
      !["approved", "paid"].includes(row.status) ||
      !s ||
      s.engine !== "ca-ab-regular-2026-v1" ||
      s.rules?.country !== "CA" ||
      s.rules?.subdivision !== "AB" ||
      s.currency !== "CAD" ||
      classification(s.rules) !== "reference_rules_review_required" ||
      s.input?.standardCaseConfirmed !== true ||
      String(row.paid_on).slice(0, 10) !== s.payDate ||
      String(s.payDate).slice(0, 4) !== String(taxYear) ||
      row.currency !== s.currency ||
      !new Big(row.amount).eq(s.net)
    )
      throw yearEndError(
        "A payment has unsupported or inconsistent payroll provenance. Review it using your local filing process.",
      );
    for (const field of [
      "gross",
      "cpp",
      "cpp2",
      "ei",
      "incomeTax",
      "net",
      "employerEi",
    ])
      if (!/^\d+\.\d{2}$/.test(String(s[field])))
        throw yearEndError("A saved payroll amount is incomplete.");
    gross = gross.plus(s.gross);
    cpp = cpp.plus(s.cpp);
    cpp2 = cpp2.plus(s.cpp2);
    ei = ei.plus(s.ei);
    tax = tax.plus(s.incomeTax);
    employerEi = employerEi.plus(s.employerEi);
  }
  const out = (v: Big) => v.toFixed(2),
    cap = (v: Big, max: number) => out(v.gt(max) ? new Big(max) : v);
  return {
    t4Manifest: {
      box14_employment_income: out(gross),
      box16_cpp_withheld: out(cpp),
      box16a_cpp2_withheld: out(cpp2),
      box18_ei_withheld: out(ei),
      box22_income_tax_withheld: out(tax),
      box24_insurable_earnings: cap(gross, 68900),
      box26_pensionable_earnings: cap(gross, 85000),
    },
    employerMetrics: {
      employer_cpp_matching: out(cpp.plus(cpp2)),
      employer_ei_matching: out(employerEi),
    },
  };
}
export async function compileT4Slip(
  employeeId: string | number,
  taxYear: number,
  companyId?: string,
  db: Database = pool,
) {
  if (!companyId)
    throw yearEndError("Authenticated company context is required", 401);
  yearEndRequest(employeeId, taxYear, "T4");
  const identity = await db.query(
    `SELECT u.first_name,u.last_name,u.email,u.sin,u.employment_type,u.province employee_province,c.name company_name,c.legal_name,c.business_number,c.payroll_account_number,c.address company_address,c.city company_city,c.province company_province,c.postal_code,c.phone,c.email company_email FROM users u JOIN companies c ON c.id=u.company_id WHERE u.id=$1 AND c.id=$2`,
    [employeeId, companyId],
  );
  const i = identity.rows[0];
  if (!i) throw yearEndError("Employee was not found in your company", 404);
  if (i.employment_type !== "EMPLOYEE" || i.employee_province !== "AB")
    throw yearEndError(
      "Automatic year-end mapping supports only regular Alberta employees. Use the local filing process for other cases.",
    );
  const legacy = await db.query(
    `SELECT pi.id FROM payroll_items pi JOIN payrolls p ON p.id=pi.payroll_id WHERE pi.employee_id=$1 AND p.company_id=$2 AND EXTRACT(YEAR FROM p.period_end)=$3 AND p.status IN ('paid','processed') AND NOT EXISTS(SELECT 1 FROM manual_payroll_payments m WHERE m.payroll_item_id=pi.id AND m.company_id=p.company_id) LIMIT 1`,
    [employeeId, companyId, taxYear],
  );
  if (legacy.rows.length)
    throw yearEndError(
      "Legacy payments lack reviewed payment-date provenance. Reconcile them before using the local year-end filing process.",
    );
  const payments = await db.query(
    `SELECT pi.id,pi.calculation_snapshot,p.status,p.manual_review,m.paid_on::text,m.amount::text,m.currency FROM payroll_items pi JOIN payrolls p ON p.id=pi.payroll_id JOIN manual_payroll_payments m ON m.payroll_item_id=pi.id AND m.company_id=p.company_id WHERE pi.employee_id=$1 AND p.company_id=$2 AND EXTRACT(YEAR FROM m.paid_on)=$3 ORDER BY m.paid_on,pi.id`,
    [employeeId, companyId, taxYear],
  );
  return {
    employer: {
      name: i.legal_name || i.company_name,
      businessNumber: i.business_number,
      payrollAccountNumber: i.payroll_account_number,
      address: i.company_address,
      city: i.company_city,
      province: i.company_province,
      postalCode: i.postal_code,
      phone: i.phone,
      email: i.company_email,
    },
    employee: {
      firstName: i.first_name,
      lastName: i.last_name,
      email: i.email,
      maskedSin: i.sin
        ? `*** *** ${String(i.sin).replace(/\D/g, "").slice(-3)}`
        : null,
      province: i.employee_province,
    },
    ...aggregateRegularT4(payments.rows, taxYear),
    source:
      "company-recorded external payments with reviewed 2026 Alberta regular-wage snapshots",
    paymentIds: payments.rows.map((row) => row.id),
    reviewRequired: true,
    governmentFiled: false,
    bankSettlementVerified: false,
  };
}
export async function compileT4ASlip(
  _id: string | number,
  _year: number,
  _company?: string,
): Promise<any> {
  throw yearEndError(
    "Contractor T4A mapping is not implemented for the regular-wage payroll engine. Use your local filing process.",
  );
}
export async function compileRL1Slip(
  _id: string | number,
  _year: number,
  _company?: string,
): Promise<any> {
  throw yearEndError(
    "Quebec QPP/QPIP and RL-1 mapping are not implemented. Use your local filing process.",
  );
}
