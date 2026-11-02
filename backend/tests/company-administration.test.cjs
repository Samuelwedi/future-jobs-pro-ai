const { test, before, after } = require("node:test"),
  assert = require("node:assert/strict"),
  bcrypt = require("bcryptjs");
process.env.JWT_SECRET = "isolated-company-administration-fixture";
const { PGlite } = require("@electric-sql/pglite"),
  express = require("express"),
  jwt = require("jsonwebtoken"),
  { pool } = require("../dist/config/database");
const db = new PGlite(),
  uid = (n) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`,
  query = async (sql, args) => {
    const r = await db.query(sql, args);
    return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
  };
let server, base;
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
  return { status: r.status, data: await r.json() };
}
async function employee(id = 11, user = 12) {
  const r = await request("/company-admin/overview", null, user);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.employees.find((e) => e.id === uid(id));
}
const url = (id, section) =>
  "/company-admin/employees/" + uid(id) + "/" + section;
before(async () => {
  await db.exec(
    `CREATE TABLE companies(id uuid PRIMARY KEY,name text,timezone text);CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,role text,is_active boolean DEFAULT true,first_name text,last_name text,full_name text,email text UNIQUE,date_of_birth date,sin text,password_hash text,must_change_password boolean DEFAULT false,updated_at timestamptz DEFAULT NOW(),created_at timestamptz DEFAULT NOW(),profile_pic text);CREATE TABLE compensation_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,hourly_rate numeric(10,2),effective_date date,created_by uuid,created_at timestamptz DEFAULT NOW());CREATE TABLE projects(id uuid PRIMARY KEY,company_id uuid,status text);CREATE TABLE payrolls(id uuid PRIMARY KEY,company_id uuid,created_at timestamptz);CREATE TABLE payroll_items(payroll_id uuid,final_pay numeric);CREATE TABLE invoices(id uuid PRIMARY KEY,company_id uuid,currency text);CREATE TABLE payments(invoice_id uuid,amount numeric,payment_date date);CREATE TABLE time_entries(id uuid PRIMARY KEY,user_id uuid,clock_in timestamptz,total_wage numeric);CREATE TABLE company_admin_audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid REFERENCES companies(id),actor_id uuid REFERENCES users(id),employee_id uuid REFERENCES users(id),action text,details jsonb,created_at timestamptz DEFAULT NOW());`,
  );
  for (const n of [1, 2])
    await query("INSERT INTO companies VALUES($1,$2,'America/Edmonton')", [
      uid(n),
      "Fixture " + n,
    ]);
  for (const [n, c, role, active] of [
    [11, 1, "employee", true],
    [12, 1, "owner", true],
    [13, 1, "manager", true],
    [14, 2, "owner", true],
    [15, 1, "owner", false],
    [16, 1, "manager", true],
    [18, 1, "admin", true],
  ])
    await query(
      "INSERT INTO users(id,company_id,role,is_active,first_name,last_name,full_name,email,date_of_birth,sin,password_hash) VALUES($1,$2,$3,$4,'Pat','Fixture','Pat Fixture',$5,'1990-01-02','123456789','NEVER_EXPOSE_PASSWORD_HASH')",
      [uid(n), uid(c), role, active, "fixture" + n + "@example.test"],
    );
  await query(
    "INSERT INTO compensation_history(user_id,hourly_rate,effective_date,created_by) VALUES($1,20,'2026-01-01',$2)",
    [uid(11), uid(12)],
  );
  for (const [n, currency, amount] of [
    [31, "CAD", 100],
    [32, "USD", 200],
  ]) {
    await query("INSERT INTO invoices VALUES($1,$2,$3)", [
      uid(n),
      uid(1),
      currency,
    ]);
    await query(
      "INSERT INTO payments VALUES($1,$2,(CURRENT_TIMESTAMP AT TIME ZONE 'America/Edmonton')::date)",
      [uid(n), amount],
    );
  }
  await require("../scripts/run-company-administration-migration.cjs").run({
    query: async (sql, args) =>
      args === undefined && sql.includes(";") ? db.exec(sql) : query(sql, args),
  });
  await require("../scripts/run-company-administration-migration.cjs").run({
    query: async (sql, args) =>
      args === undefined && sql.includes(";") ? db.exec(sql) : query(sql, args),
  });
  pool.query = query;
  pool.connect = async () => ({ query, release() {} });
  const app = express();
  app.use(express.json());
  app.use(
    "/company-admin",
    require("../dist/routes/companyAdminRoutes").default,
  );
  app.use("/users", require("../dist/routes/userRoutes").default);
  app.use("/team", require("../dist/routes/teamRoutes").default);
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await db.close();
  await pool.end();
});
test("overview uses active database roles/company, protects private values and separates payment currencies", async () => {
  for (const [user, status] of [
    [null, 401],
    [11, 403],
    [15, 401],
    [12, 200],
    [13, 200],
  ])
    assert.equal(
      (await request("/company-admin/overview", null, user)).status,
      status,
    );
  const r = await request("/company-admin/overview");
  assert.equal(r.data.actorId, uid(12));
  assert.equal(r.data.companyId, uid(1));
  assert.equal(r.data.stats.revenueThisMonth, null);
  assert.equal(r.data.stats.marginToday, null);
  assert.equal(r.data.revenueByCurrency.length, 2);
  assert.ok(!JSON.stringify(r.data).includes("123456789"));
  assert.ok(!JSON.stringify(r.data).includes("NEVER_EXPOSE"));
  assert.equal(
    r.data.employees.some((e) => e.id === uid(12) || e.id === uid(18)),
    false,
  );
  assert.equal((await employee()).tax.maskedSin, "••••••789");
  assert.equal((await employee(16, 13)).canManage, false);
});
test("self, owner/admin, peer and foreign-company mutations are rejected; manager cannot promote an employee", async () => {
  for (const [id, user, status] of [
    [12, 12, 403],
    [18, 12, 403],
    [16, 13, 403],
    [11, 14, 404],
  ])
    assert.equal(
      (
        await request(
          url(id, "compensation"),
          {
            hourlyRate: 30,
            effectiveDate: "2026-11-02",
            expectedVersion: "a".repeat(64),
          },
          user,
        )
      ).status,
      status,
    );
  const e = await employee(11, 13);
  assert.equal(
    (
      await request(
        url(11, "profile"),
        {
          firstName: "Pat",
          lastName: "Fixture",
          email: e.email,
          role: "manager",
          isActive: true,
          expectedVersion: e.recordVersion,
        },
        13,
        "PATCH",
      )
    ).status,
    403,
  );
});
test("profile saves are versioned and audit atomically; repeat/stale saves cannot overwrite a newer record", async () => {
  const e = await employee(),
    body = {
      firstName: "Updated",
      lastName: "Fixture",
      email: e.email,
      role: "employee",
      isActive: true,
      expectedVersion: e.recordVersion,
    };
  let r = await request(url(11, "profile"), body, 12, "PATCH");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.employee.firstName, "Updated");
  assert.notEqual(r.data.employee.recordVersion, e.recordVersion);
  r = await request(url(11, "profile"), body, 12, "PATCH");
  assert.equal(r.status, 409);
  assert.equal(
    (
      await query(
        "SELECT COUNT(*)::int n FROM company_admin_audit_logs WHERE action='employee.profile_updated'",
      )
    ).rows[0].n,
    1,
  );
});
test("failed audit rolls back an effective-rate insert and user version update", async () => {
  const e = await employee();
  await db.exec(
    "ALTER TABLE company_admin_audit_logs ADD CONSTRAINT reject_rate_audit CHECK(action<>'employee.compensation_updated');",
  );
  let r = await request(url(11, "compensation"), {
    hourlyRate: "31.25",
    effectiveDate: "2026-12-01",
    expectedVersion: e.recordVersion,
  });
  assert.equal(r.status, 503);
  assert.equal(
    (await query("SELECT COUNT(*)::int n FROM compensation_history")).rows[0].n,
    1,
  );
  assert.equal((await employee()).recordVersion, e.recordVersion);
  await db.exec(
    "ALTER TABLE company_admin_audit_logs DROP CONSTRAINT reject_rate_audit;",
  );
  r = await request(url(11, "compensation"), {
    hourlyRate: "31.25",
    effectiveDate: "2026-12-01",
    expectedVersion: e.recordVersion,
  });
  assert.equal(r.status, 200);
  assert.notEqual(r.data.employee.recordVersion, e.recordVersion);
  assert.equal(r.data.employee.hourlyRate, "20.00");
});
test("tax and password writes validate input, never return secrets and force password change", async () => {
  let e = await employee();
  for (const extra of [
    { sin: "abc123456789" },
    { dateOfBirth: "2026-02-30" },
    { dateOfBirth: "2099-01-01" },
  ])
    assert.equal(
      (
        await request(
          url(11, "tax"),
          { ...extra, expectedVersion: e.recordVersion },
          12,
          "PATCH",
        )
      ).status,
      400,
    );
  let r = await request(
    url(11, "tax"),
    {
      sin: "987 654 321",
      dateOfBirth: "1991-02-03",
      expectedVersion: e.recordVersion,
    },
    12,
    "PATCH",
  );
  assert.equal(r.status, 200);
  assert.equal(r.data.employee.tax.maskedSin, "••••••321");
  assert.ok(!JSON.stringify(r.data).includes("987654321"));
  e = r.data.employee;
  assert.equal(
    (
      await request(url(11, "reset-password"), {
        temporaryPassword: "too-short",
        expectedVersion: e.recordVersion,
      })
    ).status,
    400,
  );
  const password = "Synthetic-test-password-123";
  r = await request(url(11, "reset-password"), {
    temporaryPassword: password,
    expectedVersion: e.recordVersion,
  });
  assert.equal(r.status, 200);
  assert.ok(!JSON.stringify(r.data).includes(password));
  const row = (
    await query(
      "SELECT password_hash,must_change_password FROM users WHERE id=$1",
      [uid(11)],
    )
  ).rows[0];
  assert.equal(row.must_change_password, true);
  assert.ok(await bcrypt.compare(password, row.password_hash));
  assert.ok(
    !(await request("/company-admin/audit")).data.events.some(
      (event) =>
        JSON.stringify(event.details).includes(password) ||
        JSON.stringify(event.details).includes("987654321"),
    ),
  );
});
test("legacy team role/password/delete paths use the same protected-account policy and preserve history", async () => {
  assert.equal(
    (
      await request(
        "/team/" + uid(12) + "/role",
        { role: "employee" },
        12,
        "PUT",
      )
    ).status,
    403,
  );
  assert.equal(
    (await request("/team/" + uid(16), null, 13, "DELETE")).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/team/set-password",
        { userId: uid(18), newPassword: "Synthetic-test-password-123" },
        12,
      )
    ).status,
    403,
  );
  let r = await request("/team/" + uid(11), null, 13, "DELETE");
  assert.equal(r.status, 200);
  assert.equal(
    (await query("SELECT is_active FROM users WHERE id=$1", [uid(11)])).rows[0]
      .is_active,
    false,
  );
  assert.equal(
    (
      await query(
        "SELECT COUNT(*)::int n FROM compensation_history WHERE user_id=$1",
        [uid(11)],
      )
    ).rows[0].n,
    2,
  );
  assert.equal(
    (
      await request(
        "/team/" + uid(11) + "/role",
        { role: "manager" },
        13,
        "PUT",
      )
    ).status,
    403,
  );
});
test("audit failure rolls back a legacy team deactivation", async () => {
  await query("UPDATE users SET is_active=true WHERE id=$1", [uid(11)]);
  await db.exec(
    "ALTER TABLE company_admin_audit_logs ADD CONSTRAINT reject_deactivation CHECK(action<>'employee.deactivated') NOT VALID;",
  );
  const r = await request("/team/" + uid(11), null, 12, "DELETE");
  assert.equal(r.status, 503);
  assert.equal(
    (await query("SELECT is_active FROM users WHERE id=$1", [uid(11)])).rows[0]
      .is_active,
    true,
  );
  await db.exec(
    "ALTER TABLE company_admin_audit_logs DROP CONSTRAINT reject_deactivation;",
  );
});
test("owner alias can use dedicated confirmed ownership transfer; both roles and audit change together", async () => {
  assert.equal(
    (await request("/team/" + uid(16) + "/transfer-ownership", {})).status,
    400,
  );
  const r = await request("/team/" + uid(16) + "/transfer-ownership", {
    confirmation: "TRANSFER OWNERSHIP",
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(
    (await query("SELECT role FROM users WHERE id=$1", [uid(12)])).rows[0].role,
    "manager",
  );
  assert.equal(
    (await query("SELECT role FROM users WHERE id=$1", [uid(16)])).rows[0].role,
    "boss",
  );
  assert.equal(
    (
      await query(
        "SELECT COUNT(*)::int n FROM company_admin_audit_logs WHERE action='company.ownership_transferred'",
      )
    ).rows[0].n,
    1,
  );
});
test("invitation audit failure rolls back identity creation before any email; successful delivery failure is explicit", async () => {
  const emailService = require("../dist/services/emailService"),
    original = emailService.sendInviteEmail;
  let sent = 0;
  emailService.sendInviteEmail = async () => {
    sent++;
    throw Error("synthetic delivery failure");
  };
  const body = {
    companyId: uid(1),
    invitedBy: uid(13),
    email: "new-fixture@example.test",
    firstName: "New",
    lastName: "Fixture",
    role: "employee",
  };
  await db.exec(
    "ALTER TABLE company_admin_audit_logs ADD CONSTRAINT reject_invite CHECK(action<>'employee.invited') NOT VALID;",
  );
  let r = await request("/team/invite", body, 13);
  assert.equal(r.status, 503);
  assert.equal(sent, 0);
  assert.equal(
    (
      await query("SELECT COUNT(*)::int n FROM users WHERE email=$1", [
        body.email,
      ])
    ).rows[0].n,
    0,
  );
  await db.exec(
    "ALTER TABLE company_admin_audit_logs DROP CONSTRAINT reject_invite;",
  );
  r = await request("/team/invite", body, 13);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.emailSent, false);
  assert.equal(sent, 1);
  assert.ok(r.data.tempPassword.length >= 12);
  const row = (
    await query(
      "SELECT password_hash,must_change_password FROM users WHERE email=$1",
      [body.email],
    )
  ).rows[0];
  assert.ok(await bcrypt.compare(r.data.tempPassword, row.password_hash));
  assert.equal(row.must_change_password, true);
  assert.ok(
    !JSON.stringify(
      (await request("/company-admin/audit", null, 13)).data,
    ).includes(r.data.tempPassword),
  );
  r = await request("/team/invite", body, 13);
  assert.equal(r.status, 400);
  assert.equal(sent, 1);
  emailService.sendInviteEmail = original;
});
test("invitation HTML escapes names/company and SMTP acceptance is not silently fabricated", async () => {
  const fs = require("node:fs"),
    path = require("node:path"),
    vm = require("node:vm"),
    ts = require("typescript");
  let captured,
    accepted = true;
  const ctx = {
    exports: {},
    console: { log() {}, warn() {}, error() {} },
    process: {
      env: {
        SMTP_HOST: "fixture.invalid",
        SMTP_USER: "synthetic-fixture",
        SMTP_PASS: "synthetic-fixture-secret",
      },
    },
    require: (name) =>
      name === "nodemailer"
        ? {
            createTransport: () => ({
              sendMail: async (message) => {
                captured = message;
                return { accepted: accepted ? ["fixture@example.test"] : [] };
              },
            }),
          }
        : { Buffer },
  };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        path.join(__dirname, "../src/services/emailService.ts"),
        "utf8",
      ),
      { compilerOptions: { module: 1, target: 9, esModuleInterop: true } },
    ).outputText,
    ctx,
  );
  await ctx.exports.sendInviteEmail(
    "fixture@example.test",
    "<img src=x>",
    "synthetic-password",
    "Company</h2>\r\nBcc: fixture@example.test",
  );
  assert.ok(!captured.html.includes("<img src=x>"));
  assert.ok(captured.html.includes("&lt;img src=x&gt;"));
  assert.ok(captured.html.includes("Company&lt;/h2&gt;"));
  assert.ok(!/[\r\n]/.test(captured.subject));
  accepted = false;
  await assert.rejects(
    ctx.exports.sendInviteEmail(
      "fixture@example.test",
      "Fixture",
      "synthetic-password",
      "Company",
    ),
    /not accepted/,
  );
});
test("legacy tax updates cannot bypass permission/version/audit rules; scoped detail reads enforce the same policy", async () => {
  const old = (await query("SELECT sin FROM users WHERE id=$1", [uid(16)]))
    .rows[0].sin;
  const r = await request(
    "/users/" + uid(16) + "/tax-info",
    { sin: "000000000" },
    11,
    "PUT",
  );
  assert.equal(r.status, 410);
  assert.equal(
    (await query("SELECT sin FROM users WHERE id=$1", [uid(16)])).rows[0].sin,
    old,
  );
  assert.equal(
    (await request("/company-admin/employees/" + uid(11), null, 13)).status,
    200,
  );
  assert.equal(
    (await request("/company-admin/employees/" + uid(16), null, 13)).status,
    403,
  );
  assert.equal(
    (await request("/company-admin/employees/" + uid(11), null, 14)).status,
    404,
  );
});
