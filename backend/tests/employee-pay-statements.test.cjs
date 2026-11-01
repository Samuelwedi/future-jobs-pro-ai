const { test, before, after } = require("node:test"),
  assert = require("node:assert/strict");
process.env.JWT_SECRET = "isolated-employee-statement-test-secret";
const { PGlite } = require("@electric-sql/pglite"),
  express = require("express"),
  jwt = require("jsonwebtoken"),
  { pool } = require("../dist/config/database");
const {
  employeeStatementPdfData,
} = require("../dist/services/employeePayStatements");
const db = new PGlite();
let server, base;
const uid = (n) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const query = async (sql, args) => {
  const r = await db.query(sql, args);
  return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
};
const snapshot = {
  gross: "200.125",
  net: "180.125",
  incomeTax: "20.000",
  currency: "KWD",
  decimals: 3,
  payDate: "2026-10-16",
  revision: 1,
  lines: [{ id: "tax", label: "Local tax", category: "tax", amount: "20.000" }],
};
async function request(path, user = 11, claims = {}) {
  return fetch(base + path, {
    headers: user
      ? {
          Authorization:
            "Bearer " +
            jwt.sign(
              { id: uid(user), companyId: uid(1), ...claims },
              process.env.JWT_SECRET,
            ),
        }
      : {},
  });
}
before(async () => {
  await db.exec(
    `CREATE TABLE companies(id uuid PRIMARY KEY,name text);CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,is_active boolean DEFAULT true,first_name text,last_name text,email text);CREATE TABLE payrolls(id uuid PRIMARY KEY,company_id uuid,period_start date,period_end date,status text,manual_review jsonb);CREATE TABLE payroll_items(id uuid PRIMARY KEY,payroll_id uuid,employee_id uuid,hours numeric,hourly_rate numeric,calculation_snapshot jsonb);CREATE TABLE manual_payroll_payments(payroll_item_id uuid,company_id uuid);`,
  );
  for (const [n, name] of [
    [1, "Current Company"],
    [2, "Other Company"],
  ])
    await query("INSERT INTO companies VALUES($1,$2)", [uid(n), name]);
  for (const [n, c, role, active] of [
    [11, 1, "employee", true],
    [12, 1, "employee", true],
    [13, 1, "boss", true],
    [14, 1, "employee", false],
    [15, 2, "employee", true],
  ])
    await query("INSERT INTO users VALUES($1,$2,$3,$4,$5,$6,$7)", [
      uid(n),
      uid(c),
      role,
      active,
      "Pat",
      "Worker",
      "fixture@example.test",
    ]);
  for (const [n, c, status, review] of [
    [21, 1, "approved", {}],
    [22, 1, "draft", {}],
    [23, 1, "approved", null],
    [24, 2, "approved", {}],
    [25, 1, "paid", {}],
  ])
    await query(
      "INSERT INTO payrolls VALUES($1,$2,'2026-10-01','2026-10-15',$3,$4)",
      [uid(n), uid(c), status, review],
    );
  for (const [n, p, u, snap] of [
    [31, 21, 11, snapshot],
    [32, 21, 12, snapshot],
    [33, 22, 11, snapshot],
    [34, 23, 11, snapshot],
    [35, 21, 11, null],
    [36, 24, 11, snapshot],
    [37, 25, 11, snapshot],
    [38, 24, 15, snapshot],
  ])
    await query("INSERT INTO payroll_items VALUES($1,$2,$3,10,20,$4)", [
      uid(n),
      uid(p),
      uid(u),
      snap,
    ]);
  await query("INSERT INTO manual_payroll_payments VALUES($1,$2),($3,$4)", [
    uid(37),
    uid(1),
    uid(31),
    uid(2),
  ]);
  pool.query = query;
  const app = express();
  app.use("/pay-stubs", require("../dist/routes/payStubRouter").default);
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await db.close();
  await pool.end();
});
test("index returns only own reviewed current-company snapshots, exact decimals and scoped payment markers", async () => {
  const r = await request("/pay-stubs/reviewed");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const body = await r.json();
  assert.equal(body.actorId, uid(11));
  assert.equal(body.companyId, uid(1));
  assert.deepEqual(body.statements.map((s) => s.id).sort(), [uid(31), uid(37)]);
  const first = body.statements.find((s) => s.id === uid(31));
  assert.equal(first.net, "180.125");
  assert.equal(first.gross, "200.125");
  assert.equal(first.currency, "KWD");
  assert.equal(first.payment_recorded, false);
  assert.equal(
    body.statements.find((s) => s.id === uid(37)).payment_recorded,
    true,
  );
  assert.equal(body.bankSettlementVerified, false);
  assert.equal(body.moneyMovement, false);
});
test("anonymous, disabled and verification-only tokens cannot read or download employee statements", async () => {
  for (const [user, claims] of [
    [null, {}],
    [14, {}],
    [11, { purpose: "verify_email" }],
  ])
    for (const path of [
      "/pay-stubs/reviewed",
      "/pay-stubs/reviewed/" + uid(31) + "/download",
    ])
      assert.equal((await request(path, user, claims)).status, 401);
});
test("downloads reject other employees, drafts, missing review/calculation, foreign companies and invalid IDs", async () => {
  for (const id of [32, 33, 34, 35, 36, 38, 99])
    assert.equal(
      (await request("/pay-stubs/reviewed/" + uid(id) + "/download")).status,
      404,
      String(id),
    );
  assert.equal(
    (await request("/pay-stubs/reviewed/not-a-uuid/download")).status,
    400,
  );
  assert.equal(
    (await request("/pay-stubs/reviewed/" + uid(31) + "/download", 13)).status,
    404,
  );
  const other = await (await request("/pay-stubs/reviewed", 12)).json();
  assert.deepEqual(
    other.statements.map((s) => s.id),
    [uid(32)],
  );
});
test("own download renders a PDF from the saved snapshot without changing payroll or payment records", async () => {
  const r = await request("/pay-stubs/reviewed/" + uid(31) + "/download");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /^application\/pdf/);
  assert.match(
    r.headers.get("content-disposition"),
    /paystub_00000000-0000-4000-a000-000000000031.pdf/,
  );
  const buffer = Buffer.from(await r.arrayBuffer());
  assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
  assert.ok(buffer.length > 1000);
  assert.equal(
    (await query("SELECT status FROM payrolls WHERE id=$1", [uid(22)])).rows[0]
      .status,
    "draft",
  );
  assert.equal(
    (await query("SELECT count(*)::int n FROM manual_payroll_payments", []))
      .rows[0].n,
    2,
  );
  const data = employeeStatementPdfData({
    calculation_snapshot: snapshot,
    first_name: "Pat",
    last_name: "Worker",
    hours: "10",
    hourly_rate: "20",
    period_start: "2026-10-01",
    period_end: "2026-10-15",
    company_name: "Current Company",
  });
  assert.deepEqual(data.calculation, snapshot);
  assert.equal(data.finalPay, 180.125);
});
test("stale token company claims cannot retain access after database membership changes", async () => {
  await query("UPDATE users SET company_id=$1 WHERE id=$2", [uid(2), uid(11)]);
  const r = await request("/pay-stubs/reviewed");
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.companyId, uid(2));
  assert.equal(
    body.statements.some((s) => s.id === uid(31)),
    false,
  );
  assert.equal(
    (await request("/pay-stubs/reviewed/" + uid(31) + "/download")).status,
    404,
  );
});
