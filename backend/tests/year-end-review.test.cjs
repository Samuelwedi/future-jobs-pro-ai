const { test, before, after } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
process.env.JWT_SECRET = "isolated-year-end-fixture-secret";
const { PGlite } = require("@electric-sql/pglite"),
  express = require("express"),
  jwt = require("jsonwebtoken"),
  { pool } = require("../dist/config/database");
const {
    ALBERTA_2026,
    previewPayroll,
  } = require("../dist/services/payrollRules/engine"),
  { aggregateRegularT4 } = require("../dist/services/yearEndService");
const db = new PGlite(),
  uid = (n) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
let server, base;
const query = async (sql, args) => {
  const r = await db.query(sql, args);
  return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
};
const input = {
  payDate: "2026-01-05",
  gross: 2000,
  cppYtd: 0,
  cpp2Ytd: 0,
  eiYtd: 0,
  pensionableYtd: 0,
  additionalTax: 0,
  standardCaseConfirmed: true,
};
const snapshot = (gross = 2000) => ({
  ...previewPayroll(ALBERTA_2026, { ...input, gross }),
  rules: ALBERTA_2026,
  input: { ...input, gross },
  revision: 1,
});
async function request(url, body, user = 12, method = body ? "POST" : "GET") {
  const r = await fetch(base + url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(user
        ? {
            Authorization:
              "Bearer " +
              jwt.sign(
                { id: uid(user), companyId: uid(1) },
                process.env.JWT_SECRET,
              ),
          }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json(), headers: r.headers };
}
const selection = { employeeId: uid(11), taxYear: 2026, formType: "T4" },
  url = "/year-end/preview?" + new URLSearchParams(selection);
let archivedId;
before(async () => {
  await db.exec(
    `CREATE TABLE companies(id uuid PRIMARY KEY,name text,legal_name text,business_number text,payroll_account_number text,address text,city text,province text,postal_code text,phone text,email text);CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,is_active boolean DEFAULT true,first_name text,last_name text,full_name text,email text,sin text,employment_type text,province text);CREATE TABLE payrolls(id uuid PRIMARY KEY,company_id uuid,period_end date,status text,manual_review jsonb);CREATE TABLE payroll_items(id uuid PRIMARY KEY,payroll_id uuid,employee_id uuid,calculation_snapshot jsonb);CREATE TABLE manual_payroll_payments(payroll_item_id uuid,company_id uuid,paid_on date,amount numeric,currency text);CREATE TABLE company_payroll_rule_versions(company_id uuid,revision int,rules jsonb);CREATE TABLE generated_t4_slips(id uuid PRIMARY KEY,employee_id uuid,tax_year int);`,
  );
  for (const n of [1, 2])
    await query(
      "INSERT INTO companies(id,name,legal_name,business_number,payroll_account_number,province) VALUES($1,$2,$2,'123456789','123456789RP0001','AB')",
      [uid(n), "Company " + n],
    );
  for (const [n, c, role, active] of [
    [11, 1, "employee", true],
    [12, 1, "owner", true],
    [13, 1, "manager", true],
    [14, 2, "boss", true],
    [15, 1, "boss", false],
    [16, 1, "employee", false],
  ])
    await query(
      "INSERT INTO users VALUES($1,$2,$3,$4,'Pat','Worker','Pat Worker','fixture@example.test','123456789','EMPLOYEE','AB')",
      [uid(n), uid(c), role, active],
    );
  await query("INSERT INTO payrolls VALUES($1,$2,'2025-12-31','paid',$3)", [
    uid(21),
    uid(1),
    {},
  ]);
  const snap = snapshot();
  await query("INSERT INTO payroll_items VALUES($1,$2,$3,$4)", [
    uid(31),
    uid(21),
    uid(11),
    snap,
  ]);
  await query(
    "INSERT INTO manual_payroll_payments VALUES($1,$2,'2026-01-05',$3,'CAD')",
    [uid(31), uid(1), snap.net],
  );
  await query("INSERT INTO generated_t4_slips VALUES($1,$2,2026)", [
    uid(41),
    uid(11),
  ]);
  const migration = fs.readFileSync(
    path.join(
      __dirname,
      "../migrations/20261101_reviewed_year_end_archive.sql",
    ),
    "utf8",
  );
  await db.exec(migration);
  await db.exec(migration);
  pool.query = query;
  pool.connect = async () => ({ query, release() {} });
  const app = express();
  app.use(express.json());
  app.use("/year-end", require("../dist/routes/yearEndRouter").default);
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await db.close();
  await pool.end();
});
test("current active owner/manager access works; employee, inactive and anonymous access does not", async () => {
  for (const user of [11, 15, null])
    assert.equal(
      (await request("/year-end/finalized?taxYear=2026", null, user)).status,
      user === 11 ? 403 : 401,
    );
  for (const user of [12, 13])
    assert.equal(
      (await request("/year-end/finalized?taxYear=2026", null, user)).status,
      200,
    );
  const people = await request("/year-end/employees");
  assert.ok(people.data.people.some((p) => p.id === uid(16)));
  assert.equal(
    (await request("/year-end/employee/" + uid(11) + "/forms", null, 14))
      .status,
    404,
  );
});
test("preview uses reviewed paid-date snapshot gross, not a period-end year or reconstructed hours", async () => {
  const r = await request(url);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.preview.t4Manifest.box14_employment_income, "2000.00");
  assert.equal(r.data.preview.t4Manifest.box16a_cpp2_withheld, "0.00");
  assert.equal(r.data.preview.employee.maskedSin, "*** *** 789");
  assert.equal(r.data.preview.employee.sin, undefined);
  assert.match(r.data.previewHash, /^[a-f0-9]{64}$/);
  assert.equal(r.data.preview.governmentFiled, false);
  assert.equal(r.headers.get("cache-control"), "no-store");
});
test("CPP2 remains distinct and regular-wage annual earnings use published 2026 caps", () => {
  const s = snapshot(90000),
    r = aggregateRegularT4(
      [
        {
          calculation_snapshot: s,
          paid_on: s.payDate,
          amount: s.net,
          currency: "CAD",
          status: "paid",
          manual_review: {},
        },
      ],
      2026,
    );
  assert.equal(r.t4Manifest.box16_cpp_withheld, "4230.45");
  assert.equal(r.t4Manifest.box16a_cpp2_withheld, "416.00");
  assert.equal(r.t4Manifest.box24_insurable_earnings, "68900.00");
  assert.equal(r.t4Manifest.box26_pensionable_earnings, "85000.00");
  assert.equal(r.t4Manifest.box14_employment_income, "90000.00");
  for (const patch of [
    { currency: "USD" },
    { paid_on: "2026-01-06" },
    { manual_review: null },
    { status: "draft" },
    { amount: "1.00" },
  ])
    assert.throws(() =>
      aggregateRegularT4(
        [
          {
            calculation_snapshot: s,
            paid_on: s.payDate,
            amount: s.net,
            currency: "CAD",
            status: "paid",
            manual_review: {},
            ...patch,
          },
        ],
        2026,
      ),
    );
});
test("invalid selection, contractor, Quebec and worldwide mappings fail explicitly instead of relabeling deductions", async () => {
  assert.equal(
    (await request("/year-end/preview?employeeId=bad&taxYear=2026&formType=T4"))
      .status,
    400,
  );
  for (const formType of ["T4A", "RL1"])
    assert.equal(
      (
        await request(
          "/year-end/preview?" +
            new URLSearchParams({ ...selection, formType }),
        )
      ).status,
      409,
    );
  await query("UPDATE users SET province='QC' WHERE id=$1", [uid(11)]);
  assert.equal((await request(url)).status, 409);
  await query("UPDATE users SET province='AB' WHERE id=$1", [uid(11)]);
});
test("finalize requires independent review and rejects any preview changed by employer edits", async () => {
  const preview = (await request(url)).data;
  assert.equal(
    (
      await request("/year-end/finalize", {
        ...selection,
        previewHash: preview.previewHash,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/year-end/company",
        { legalName: "Updated Employer" },
        12,
        "PATCH",
      )
    ).status,
    200,
  );
  const body = {
    ...selection,
    previewHash: preview.previewHash,
    confirmed: true,
    reviewReference: "Independent fixture review",
  };
  assert.equal((await request("/year-end/finalize", body)).status, 409);
  assert.equal(
    (await query("SELECT * FROM reviewed_year_end_slips")).rows.length,
    0,
  );
  const refreshed = (await request(url)).data;
  const saved = await request("/year-end/finalize", {
    ...body,
    previewHash: refreshed.previewHash,
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  archivedId = saved.data.id;
  const retry = await request("/year-end/finalize", {
    ...body,
    previewHash: refreshed.previewHash,
  });
  assert.equal(retry.data.id, archivedId);
  assert.equal(
    (await query("SELECT * FROM reviewed_year_end_slips")).rows.length,
    1,
  );
});
test("archive snapshots remain company-owned and frozen when employee membership or employer identity changes", async () => {
  await query("UPDATE users SET company_id=$1,last_name=$2 WHERE id=$3", [
    uid(2),
    "Changed",
    uid(11),
  ]);
  await query("UPDATE companies SET legal_name=$1 WHERE id=$2", [
    "Later Name",
    uid(1),
  ]);
  const old = await request("/year-end/finalized/T4/" + archivedId);
  assert.equal(old.status, 200);
  assert.equal(old.data.slip.snapshot.employer.name, "Updated Employer");
  assert.equal(old.data.slip.last_name, "Worker");
  assert.equal(
    (await request("/year-end/finalized/T4/" + archivedId, null, 14)).status,
    404,
  );
  assert.equal(
    (await request("/year-end/finalized?taxYear=2026", null, 14)).data.slips
      .length,
    0,
  );
  assert.equal(
    (await query("SELECT * FROM generated_t4_slips")).rows.length,
    1,
  );
  assert.equal(
    (await query("SELECT * FROM manual_payroll_payments")).rows.length,
    1,
  );
});

test("employer identity rejects null, unknown fields, invalid column widths and empty operating names without writing", async () => {
  const before = (await request("/year-end/company")).data.company;
  for (const body of [
    { legalName: null },
    { unknown: "value" },
    { province: "Alberta" },
    { businessNumber: "x".repeat(16) },
    { payrollAccountNumber: "x".repeat(21) },
    { name: "" },
    { constructor: "not a column" },
  ])
    assert.equal(
      (await request("/year-end/company", body, 12, "PATCH")).status,
      400,
    );
  assert.deepEqual((await request("/year-end/company")).data.company, before);
});

test("a failed finalization database connection returns a bounded error without exposing connection details", async () => {
  const old = pool.connect;
  pool.connect = async () => {
    throw Error("private-db-connection-detail");
  };
  try {
    const r = await request("/year-end/finalize", {
      ...selection,
      previewHash: "a".repeat(64),
      confirmed: true,
      reviewReference: "Independent fixture",
    });
    assert.equal(r.status, 503);
    assert.equal(JSON.stringify(r.data).includes("private-db"), false);
  } finally {
    pool.connect = old;
  }
});
