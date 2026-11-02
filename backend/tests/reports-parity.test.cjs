const { test, before, after } = require("node:test"),
  assert = require("node:assert/strict");
process.env.JWT_SECRET = "isolated-report-fixture-secret";
const { PGlite } = require("@electric-sql/pglite"),
  express = require("express"),
  jwt = require("jsonwebtoken"),
  { pool } = require("../dist/config/database");
const db = new PGlite(),
  uid = (n) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const query = async (sql, args) => {
  const r = await db.query(sql, args);
  return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
};
let server, base;
async function request(route, body, user = 12) {
  const r = await fetch(base + route, {
    method: body ? "POST" : "GET",
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
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const type = r.headers.get("content-type") || "";
  return {
    status: r.status,
    headers: r.headers,
    data: type.includes("application/pdf")
      ? Buffer.from(await r.arrayBuffer())
      : type.includes("application/json")
        ? await r.json()
        : await r.text(),
  };
}
const params = {
    projectId: uid(21),
    startDate: "2026-11-01",
    endDate: "2026-11-01",
  },
  summary = "/reports/summary?" + new URLSearchParams(params);
before(async () => {
  await db.exec(
    `CREATE TABLE companies(id uuid PRIMARY KEY,name text,legal_name text,address text,city text,province text,postal_code text,phone text,email text,timezone text);CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,is_active boolean,first_name text,last_name text);CREATE TABLE projects(id uuid PRIMARY KEY,company_id uuid,name text,address text,client_name text,status text);CREATE TABLE time_entries(id uuid PRIMARY KEY,user_id uuid,project_id uuid,clock_in timestamptz,clock_out timestamptz,break_minutes numeric,regular_hours numeric,overtime_hours numeric,total_wage numeric,approval_status text);CREATE TABLE photos(id uuid,user_id uuid,project_id uuid,company_id uuid,taken_at timestamptz,file_type text,verification_hash text,compliance_score numeric);CREATE TABLE voice_notes(id uuid,user_id uuid,project_id uuid,taken_at timestamptz,duration_seconds numeric,transcript text);CREATE TABLE gps_tracking(time_entry_id uuid,latitude numeric,longitude numeric,timestamp timestamptz,accuracy numeric);CREATE TABLE attachments(id uuid,project_id uuid,company_id uuid,file_name text,file_type text,file_size int,category text,created_at timestamptz);`,
  );
  for (const n of [1, 2])
    await query(
      "INSERT INTO companies(id,name,timezone) VALUES($1,$2,'America/Edmonton')",
      [uid(n), "Fixture " + n],
    );
  for (const [n, c, role, active] of [
    [11, 1, "employee", true],
    [12, 1, "owner", true],
    [13, 1, "manager", true],
    [14, 2, "owner", true],
    [15, 1, "owner", false],
    [16, 1, "employee", true],
  ])
    await query("INSERT INTO users VALUES($1,$2,$3,$4,$5,'Same')", [
      uid(n),
      uid(c),
      role,
      active,
      n === 14 ? "Foreign secret" : "=Fixture",
    ]);
  for (const [n, c] of [
    [21, 1],
    [22, 2],
  ])
    await query(
      "INSERT INTO projects VALUES($1,$2,'Fixture Project','Site','Client','active')",
      [uid(n), uid(c)],
    );
  for (const [n, u, start, end, approval] of [
    [31, 11, "2026-11-01T05:59:59Z", "2026-11-01T06:30:00Z", "approved"],
    [32, 11, "2026-11-01T06:00:00Z", "2026-11-01T08:00:00Z", "approved"],
    [33, 16, "2026-11-02T06:59:59Z", "2026-11-02T07:59:59Z", "pending"],
    [34, 11, "2026-11-02T07:00:00Z", "2026-11-02T08:00:00Z", "approved"],
    [35, 11, "2026-11-01T09:00:00Z", null, "approved"],
    [36, 14, "2026-11-01T10:00:00Z", "2026-11-01T11:00:00Z", "approved"],
  ])
    await query("INSERT INTO time_entries VALUES($1,$2,$3,$4,$5,0,1,0,10,$6)", [
      uid(n),
      uid(u),
      uid(21),
      start,
      end,
      approval,
    ]);
  await query(
    "INSERT INTO photos VALUES($1,$2,$3,$4,'2026-11-01T09:00:00Z','photo','hash',80)",
    [uid(51), uid(14), uid(21), uid(1)],
  );
  pool.query = query;
  pool.connect = async () => ({ query, release() {} });
  const app = express();
  app.use(express.json());
  app.use("/reports", require("../dist/routes/reportRoutes").default);
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await db.close();
  await pool.end();
});
test("active current company managers only; stale JWT company claims never choose the company", async () => {
  for (const [user, status] of [
    [11, 403],
    [15, 401],
    [null, 401],
    [12, 200],
    [13, 200],
  ])
    assert.equal(
      (await request("/reports/workspace", null, user)).status,
      status,
    );
  const r = await request("/reports/workspace");
  assert.equal(r.data.companyId, uid(1));
  assert.equal(r.data.projects.length, 1);
  assert.equal((await request(summary, null, 14)).status, 404);
});
test("strict calendar ranges and UUIDs fail before report queries", async () => {
  for (const extra of [
    { startDate: "2026-02-30" },
    { endDate: "2026-10-31" },
    { startDate: "2024-01-01" },
    { projectId: "not-an-id" },
  ])
    assert.equal(
      (
        await request(
          "/reports/summary?" + new URLSearchParams({ ...params, ...extra }),
        )
      ).status,
      400,
    );
});
test("company day includes both DST-hour occurrences, counts employee IDs, and approves only completed records", async () => {
  const r = await request(summary);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.actorId, uid(12));
  assert.equal(r.data.timezone, "America/Edmonton");
  assert.equal(r.data.wageCurrency, null);
  assert.deepEqual(
    r.data.workforce.map((e) => e.id).sort(),
    [32, 33, 35].map(uid),
  );
  assert.equal(r.data.summary.employees, 2);
  assert.equal(r.data.summary.completedEntries, 2);
  assert.equal(r.data.summary.approvedEntries, 1);
  assert.equal(r.data.summary.approvalRate, 50);
  assert.equal(r.data.summary.totalHours, 3);
  assert.equal(r.data.summary.grossWages, 30);
  assert.ok(r.data.workforce.every((e) => e.work_date === "2026-11-01"));
  assert.ok(!JSON.stringify(r.data).includes("Foreign secret"));
});
test("CSV uses company-local work date, UTC instants and escapes spreadsheet formulas", async () => {
  const r = await request(
    "/reports/timesheet.csv?" + new URLSearchParams(params),
  );
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /text\/csv/);
  assert.ok(r.data.includes('"\'=Fixture Same"'));
  assert.ok(r.data.includes('"2026-11-01","2026-11-02T06:59:59.000Z"'));
  assert.ok(!r.data.includes("Foreign secret"));
});
test("GET and existing POST comprehensive exports generate real authenticated PDF bytes", async () => {
  for (const r of [
    await request("/reports/comprehensive.pdf?" + new URLSearchParams(params)),
    await request("/reports/comprehensive", params),
  ]) {
    assert.equal(r.status, 200);
    assert.equal(r.data.subarray(0, 5).toString(), "%PDF-");
    assert.match(r.headers.get("content-disposition"), /\.pdf/);
  }
  assert.equal(
    (
      await request(
        "/reports/comprehensive.pdf?" + new URLSearchParams(params),
        null,
        11,
      )
    ).status,
    403,
  );
});
test("data-store errors have bounded messages and no SQL diagnostics", async () => {
  const original = pool.query;
  pool.query = async () => {
    throw Error("secret postgres connection diagnostics");
  };
  const r = await request(summary);
  assert.equal(r.status, 401);
  assert.ok(!JSON.stringify(r.data).includes("secret"));
  pool.query = original;
  await query("UPDATE companies SET timezone='Invalid/Timezone' WHERE id=$1", [
    uid(1),
  ]);
  const bad = await request(summary);
  assert.equal(bad.status, 503);
  assert.equal(
    bad.data.message,
    "Reports are unavailable. Try again or contact support.",
  );
  await query("UPDATE companies SET timezone='America/Edmonton' WHERE id=$1", [
    uid(1),
  ]);
});
test("oversized reports fail explicitly instead of silently truncating exports", async () => {
  await query(
    "INSERT INTO time_entries(id,user_id,project_id,clock_in,clock_out,regular_hours,overtime_hours,total_wage,approval_status) SELECT gen_random_uuid(),$1,$2,'2026-11-01T12:00:00Z','2026-11-01T13:00:00Z',1,0,10,'approved' FROM generate_series(1,5001)",
    [uid(11), uid(21)],
  );
  const r = await request(summary);
  assert.equal(r.status, 422);
  assert.match(r.data.message, /Narrow/);
});
