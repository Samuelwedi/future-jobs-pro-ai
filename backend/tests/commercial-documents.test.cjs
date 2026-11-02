const { test, before, after } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
process.env.JWT_SECRET = "isolated-commercial-fixture";
const { PGlite } = require("@electric-sql/pglite"),
  express = require("express"),
  jwt = require("jsonwebtoken"),
  { pool } = require("../dist/config/database");
const db = new PGlite(),
  uid = (n) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
let server, base, invoiceId, estimateId;
const query = async (sql, args) => {
  let r;
  try {
    r = await db.query(sql, args);
  } catch (e) {
    console.error("Fixture SQL failure", e.message);
    throw e;
  }
  return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
};
const body = (extra = {}) => ({
  currency: "CAD",
  issueDate: "2026-11-01",
  dueDate: "2026-11-30",
  expiryDate: "2026-11-30",
  projectId: uid(21),
  clientId: uid(11),
  taxRate: "5",
  items: [
    { description: "First", quantity: "1.25", unit_price: "10.10" },
    { description: "Second", quantity: "1", unit_price: "10" },
  ],
  requestKey: "fixture-create-key",
  ...extra,
});
async function request(url, b, user = 12, method = b ? "POST" : "GET") {
  const r = await fetch(base + url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(user
        ? {
            Authorization:
              "Bearer " +
              jwt.sign(
                { id: uid(user), companyId: uid(999) },
                process.env.JWT_SECRET,
              ),
          }
        : {}),
    },
    ...(b ? { body: JSON.stringify(b) } : {}),
  });
  return {
    status: r.status,
    data: (r.headers.get("content-type") || "").includes("application/pdf")
      ? Buffer.from(await r.arrayBuffer())
      : await r.json(),
  };
}
before(async () => {
  await db.exec(
    `CREATE TABLE companies(id uuid PRIMARY KEY,name text,address text);CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,is_active boolean DEFAULT true,first_name text,last_name text,full_name text,email text,phone text);CREATE TABLE projects(id uuid PRIMARY KEY,company_id uuid,client_id uuid,name text,status text,created_at timestamp default now());CREATE TABLE time_entries(id uuid PRIMARY KEY,user_id uuid,project_id uuid,status text,approval_status text,clock_in timestamp,clock_out timestamp,regular_hours numeric,overtime_hours numeric,total_wage numeric);`,
  );
  const old = fs
    .readFileSync(
      path.join(__dirname, "../scripts/run-railway-migration.js"),
      "utf8",
    )
    .split("const sql = `")[1]
    .split("`;")[0];
  await db.exec(
    old.slice(
      old.indexOf("CREATE TABLE IF NOT EXISTS invoices"),
      old.indexOf(
        "-- ============================================================\n-- 4. INDEXES",
      ),
    ) +
      old.slice(
        old.indexOf("CREATE OR REPLACE FUNCTION generate_invoice_number"),
      ),
  );
  const estimates = fs
    .readFileSync(
      path.join(__dirname, "../scripts/add-progress-invoicing.js"),
      "utf8",
    )
    .split("const sql = `")[1]
    .split("`;")[0];
  await db.exec(estimates);
  const migration = fs.readFileSync(
    path.join(__dirname, "../migrations/20261101_commercial_documents.sql"),
    "utf8",
  );
  await db.exec(migration);
  await db.exec(migration);
  for (const n of [1, 2])
    await query("INSERT INTO companies VALUES($1,$2,$3)", [
      uid(n),
      "Company " + n,
      "Fixture address",
    ]);
  for (const [n, c, role, active] of [
    [11, 1, "employee", true],
    [12, 1, "owner", true],
    [13, 1, "manager", true],
    [14, 2, "owner", true],
    [15, 1, "owner", false],
  ])
    await query(
      "INSERT INTO users VALUES($1,$2,$3,$4,'Pat','Fixture','Pat Fixture','fixture@example.test','')",
      [uid(n), uid(c), role, active],
    );
  for (const [n, c] of [
    [21, 1],
    [22, 2],
  ])
    await query(
      "INSERT INTO projects(id,company_id,client_id,name,status) VALUES($1,$2,$3,'Project','active')",
      [uid(n), uid(c), uid(c === 1 ? 11 : 14)],
    );
  pool.query = query;
  pool.connect = async () => ({ query, release() {} });
  const app = express();
  app.use(express.json());
  app.use("/invoices", require("../dist/routes/invoiceRouter").default);
  app.use("/estimates", require("../dist/routes/estimateRouter").default);
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await db.close();
  await pool.end();
});
test("current active manager identity governs both document types; token company claims are ignored", async () => {
  for (const route of ["/invoices", "/estimates"]) {
    for (const [user, status] of [
      [11, 403],
      [15, 401],
      [null, 401],
      [12, 200],
      [13, 200],
    ])
      assert.equal((await request(route, null, user)).status, status);
    const r = await request(route + "/workspace");
    assert.equal(r.data.companyId, uid(1));
    assert.equal(r.data.projects.length, 1);
  }
});
test("strict dates, explicit currency, decimal bounds and tenant references fail without writes", async () => {
  for (const extra of [
    { currency: null },
    { currency: "JPY" },
    { issueDate: "2026-02-30" },
    { dueDate: "2026-01-01" },
    { taxRate: "-1" },
    { status: "paid" },
    { items: [{ description: "x", quantity: "1.001", unit_price: "10" }] },
    { items: [] },
    { requestKey: "" },
  ])
    assert.equal((await request("/invoices", body(extra))).status, 400);
  assert.equal(
    (await request("/invoices", body({ projectId: uid(22) }))).status,
    404,
  );
  assert.equal((await query("SELECT COUNT(*) n FROM invoices")).rows[0].n, 0);
});
test("create is atomic, rounded per line and replayable without duplicate documents; conflicting reuse is rejected", async () => {
  const a = await request("/invoices", body());
  assert.equal(a.status, 201, JSON.stringify(a.data));
  invoiceId = a.data.invoice.id;
  assert.equal(a.data.invoice.issue_date, "2026-11-01");
  assert.equal(a.data.invoice.subtotal, "22.63");
  assert.equal(a.data.invoice.total, "23.76");
  assert.deepEqual(
    a.data.items.map((i) => i.description),
    ["First", "Second"],
  );
  const b = await request("/invoices", body());
  assert.equal(b.status, 200);
  assert.equal(b.data.invoice.id, invoiceId);
  assert.equal((await request("/invoices", body({ taxRate: 10 }))).status, 409);
  assert.equal((await request("/invoices/" + invoiceId, null, 14)).status, 404);
});
test("editing recomputes totals, requires current version and rolls back partial line replacement", async () => {
  const old = (await request("/invoices/" + invoiceId)).data.invoice;
  const edited = body({
    requestKey: "edit-current-key",
    expectedUpdatedAt: old.updated_at,
    items: [{ description: "New line", quantity: 2, unit_price: 20 }],
  });
  let r = await request("/invoices/" + invoiceId, edited, 12, "PUT");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.invoice.total, "42.00");
  assert.equal(
    (
      await request(
        "/invoices/" + invoiceId,
        { ...edited, requestKey: "stale-edit-key" },
        12,
        "PUT",
      )
    ).status,
    409,
  );
  const current = r.data.invoice;
  await db.exec(
    "ALTER TABLE invoice_items ADD CONSTRAINT fixture_reject_line CHECK(description<>'Reject insertion');",
  );
  r = await request(
    "/invoices/" + invoiceId,
    {
      ...edited,
      expectedUpdatedAt: current.updated_at,
      requestKey: "rollback-edit-key",
      items: [
        { description: "Reject insertion", quantity: 1, unit_price: 999 },
      ],
    },
    12,
    "PUT",
  );
  assert.equal(r.status, 503);
  r = await request("/invoices/" + invoiceId);
  assert.equal(r.data.invoice.total, "42.00");
  assert.equal(r.data.items[0].description, "New line");
});
test("sharing records an external event; issued records cannot be edited/deleted and no email/link is invented", async () => {
  assert.equal(
    (await request("/invoices/" + invoiceId + "/send", {})).status,
    400,
  );
  let r = await request("/invoices/" + invoiceId + "/send", {
    confirmed: true,
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.emailSent, false);
  assert.equal(r.data.invoice.payment_link, null);
  assert.equal(
    (
      await request(
        "/invoices/" + invoiceId,
        body({
          requestKey: "issued-edit-key",
          expectedUpdatedAt: r.data.invoice.updated_at,
        }),
        12,
        "PUT",
      )
    ).status,
    409,
  );
  assert.equal(
    (await request("/invoices/" + invoiceId, null, 12, "DELETE")).status,
    409,
  );
});
test("receipt deduplication and trigger coexistence prevent duplicate or double-counted payments", async () => {
  const payment = {
    amount: "10",
    paymentDate: "2026-11-01",
    reference: "receipt-1001",
    method: "cash",
    confirmed: true,
  };
  let r = await request("/invoices/" + invoiceId + "/payments", payment);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.invoice.paid_amount, "10.00");
  assert.equal(r.data.invoice.balance, "32.00");
  assert.equal(r.data.moneyMovement, false);
  r = await request("/invoices/" + invoiceId + "/payments", payment, 13);
  assert.equal(r.data.invoice.paid_amount, "10.00");
  assert.equal(r.data.payments.length, 1);
  assert.equal(
    (
      await request("/invoices/" + invoiceId + "/payments", {
        ...payment,
        amount: "11",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/invoices/" + invoiceId + "/payments", {
        ...payment,
        reference: "receipt-over",
        amount: "33",
      })
    ).status,
    409,
  );
  r = await request("/invoices/" + invoiceId + "/payments", {
    ...payment,
    reference: "receipt-final",
    amount: "32",
  });
  assert.equal(r.data.invoice.status, "paid");
  assert.equal(r.data.invoice.paid_amount, "42.00");
});
test("estimate acceptance and one-time conversion preserve currency, ordered lines and totals", async () => {
  let r = await request(
    "/estimates",
    body({ requestKey: "estimate-create-key", currency: "USD" }),
  );
  assert.equal(r.status, 201, JSON.stringify(r.data));
  estimateId = r.data.estimate.id;
  assert.equal(
    (
      await request("/estimates/" + estimateId + "/accept", {
        confirmed: true,
        reference: "customer-email-1",
      })
    ).status,
    409,
  );
  await request("/estimates/" + estimateId + "/send", { confirmed: true });
  r = await request("/estimates/" + estimateId + "/accept", {
    confirmed: true,
    reference: "customer-email-1",
  });
  assert.equal(r.status, 200);
  const dates = { invoiceDate: "2026-11-01", dueDate: "2026-11-30" };
  r = await request("/estimates/" + estimateId + "/convert", dates);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const id = r.data.invoice.id;
  assert.equal(r.data.invoice.currency, "USD");
  assert.equal(r.data.invoice.total, "23.76");
  r = await request("/estimates/" + estimateId + "/convert", dates);
  assert.equal(r.data.invoice.id, id);
  assert.equal(r.data.replayed, true);
  assert.equal((await request("/invoices/" + id)).data.items.length, 2);
  assert.equal(
    (
      await request("/estimates/" + estimateId + "/convert", {
        ...dates,
        dueDate: "2026-12-01",
      })
    ).status,
    409,
  );
});
test("PDF produces real bytes and client hub keeps currencies separate", async () => {
  let r = await request("/invoices/" + invoiceId + "/pdf");
  assert.equal(r.status, 200);
  assert.equal(r.data.subarray(0, 5).toString(), "%PDF-");
  r = await request("/invoices/client/" + uid(11));
  assert.equal(r.data.totals, null);
  assert.deepEqual(r.data.totalsByCurrency.map((t) => t.currency).sort(), [
    "CAD",
    "USD",
  ]);
});
test("counter continues past four digits without truncation and deleted drafts replay safely", async () => {
  await query(
    "INSERT INTO invoices(company_id,invoice_number,issue_date,due_date,subtotal,currency) VALUES($1,'INV-2026-9999','2026-11-01','2026-11-30',1,'CAD')",
    [uid(1)],
  );
  const r = await request(
    "/invoices",
    body({ requestKey: "counter-create-key" }),
  );
  assert.equal(r.data.invoice.invoice_number, "INV-2026-10000");
  assert.equal(
    (await request("/invoices/" + r.data.invoice.id, null, 12, "DELETE"))
      .status,
    200,
  );
  assert.equal(
    (await request("/invoices/" + r.data.invoice.id, null, 12, "DELETE")).data
      .replayed,
    true,
  );
});
test("approved project time entries are billed once and foreign or pending links are rejected", async () => {
  for (const [n, u, p, approval] of [
    [31, 11, 21, "approved"],
    [32, 11, 21, "pending"],
    [33, 14, 22, "approved"],
  ])
    await query(
      "INSERT INTO time_entries(id,user_id,project_id,status,approval_status,regular_hours,overtime_hours,total_wage) VALUES($1,$2,$3,'completed',$4,1,0,10)",
      [uid(n), uid(u), uid(p), approval],
    );
  const linked = (n, key) =>
    body({
      requestKey: key,
      items: [
        {
          description: "Approved work",
          quantity: 1,
          unit_price: 10,
          timeEntryIds: [uid(n)],
        },
      ],
    });
  for (const n of [32, 33])
    assert.equal(
      (await request("/invoices", linked(n, "invalid-link-" + n))).status,
      409,
    );
  const first = await request("/invoices", linked(31, "first-time-link"));
  assert.equal(first.status, 201);
  assert.equal(
    (await request("/invoices", linked(31, "duplicate-time-link"))).status,
    409,
  );
  const available = await request("/invoices/unbilled?projectId=" + uid(21));
  assert.equal(available.data.unbilled.length, 0);
  assert.equal(
    (await request("/invoices/unbilled?projectId=" + uid(22))).status,
    404,
  );
});
test("legacy unspecified currency is never guessed or exported and can be reconciled only on an editable draft", async () => {
  const r = await query(
      "INSERT INTO estimates(company_id,issue_date,subtotal,tax_rate) VALUES($1,'2026-11-01',10,0) RETURNING id",
      [uid(1)],
    ),
    id = r.rows[0].id;
  assert.equal((await request("/estimates/" + id + "/pdf")).status, 409);
  assert.equal(
    (await request("/estimates/" + id + "/send", { confirmed: true })).status,
    409,
  );
  const row = (await request("/estimates/" + id)).data.estimate;
  const edit = await request(
    "/estimates/" + id,
    body({
      requestKey: "legacy-currency-edit",
      expectedUpdatedAt: row.updated_at,
      currency: "USD",
    }),
    12,
    "PUT",
  );
  assert.equal(edit.status, 200);
  assert.equal(edit.data.estimate.currency, "USD");
  await query(
    "UPDATE estimates SET estimate_number='EST-2026-9999' WHERE id=$1",
    [id],
  );
  const next = await request(
    "/estimates",
    body({ requestKey: "estimate-counter-test" }),
  );
  assert.equal(next.data.estimate.estimate_number, "EST-2026-10000");
});
test('equivalent UUID casing cannot bill the same time entry twice or change document identity',async()=>{const {documentPayload,documentId}=require('../dist/services/commercialDocuments');assert.equal(documentId(uid(31).toUpperCase()),uid(31));assert.throws(()=>documentPayload(body({items:[{description:'First case',quantity:1,unit_price:1,timeEntryIds:[uid(31)]},{description:'Same UUID',quantity:1,unit_price:1,timeEntryIds:[uid(31).toUpperCase()]}]}),'invoice'),/multiple lines/);});
