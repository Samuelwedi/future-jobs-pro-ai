const { test, before, after } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
process.env.JWT_SECRET = "isolated-integrations-fixture";
process.env.QUICKBOOKS_CLIENT_ID = "fixture-client";
process.env.QUICKBOOKS_CLIENT_SECRET = "synthetic-provider-secret";
process.env.QUICKBOOKS_REDIRECT_URI =
  "https://fixture.example.test/api/integrations/quickbooks/callback";
process.env.STRIPE_CONNECT_CLIENT_ID = "fixture-connect-client";
process.env.STRIPE_REDIRECT_URI =
  "https://fixture.example.test/api/integrations/stripe/callback";
process.env.ENCRYPTION_KEY =
  "synthetic-fixture-encryption-key-not-a-live-secret";
const { PGlite } = require("@electric-sql/pglite"),
  express = require("express"),
  jwt = require("jsonwebtoken"),
  { pool } = require("../dist/config/database"),
  service = require("../dist/services/integrationService"),
  oauth = require("../dist/services/quickbooksOAuth");
const db = new PGlite(),
  uid = (n) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`,
  query = async (sql, args) => {
    const r = await db.query(sql, args);
    return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
  };
let server,
  base,
  exchanges = 0;
async function request(url, user = 12, method = "GET") {
  const r = await fetch(base + url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(user
        ? {
            Authorization:
              "Bearer " +
              jwt.sign(
                { id: uid(user), companyId: uid(2) },
                process.env.JWT_SECRET,
              ),
          }
        : {}),
    },
    ...(method === "POST" ? { body: "{}" } : {}),
    redirect: "manual",
  });
  return {
    status: r.status,
    data: (r.headers.get("content-type") || "").includes("json")
      ? await r.json()
      : null,
    headers: r.headers,
  };
}
before(async () => {
  await db.exec(
    "CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,is_active boolean);",
  );
  await db.exec(
    fs.readFileSync(
      path.join(__dirname, "../migrations/20260810_secure_integrations.sql"),
      "utf8",
    ),
  );
  await db.exec(
    fs.readFileSync(
      path.join(
        __dirname,
        "../migrations/20260816_integration_environments.sql",
      ),
      "utf8",
    ),
  );
  for (const [n, c, role, active] of [
    [11, 1, "employee", true],
    [12, 1, "owner", true],
    [13, 1, "manager", true],
    [14, 2, "owner", true],
    [15, 1, "owner", false],
  ])
    await query("INSERT INTO users VALUES($1,$2,$3,$4)", [
      uid(n),
      uid(c),
      role,
      active,
    ]);
  pool.query = query;
  pool.connect = async () => ({ query, release() {} });
  oauth.exchangeQuickBooksAuthorizationCode = async () => {
    exchanges++;
    return {
      access_token: "synthetic-access-value",
      refresh_token: "synthetic-refresh-value",
      expires_in: 3600,
    };
  };
  const app = express();
  app.use(express.json());
  app.use("/integrations", require("../dist/routes/integrationRoutes").default);
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await db.close();
  await pool.end();
});
test("manager checks cover reads, OAuth initiation, disconnect and sync without provider calls", async () => {
  for (const [url, method] of [
    ["/status", "GET"],
    ["/quickbooks/auth", "GET"],
    ["/stripe/auth", "GET"],
    ["/quickbooks/company-info", "GET"],
    ["/quickbooks/items", "GET"],
    ["/quickbooks/disconnect", "POST"],
    ["/sync/stripe-to-quickbooks", "POST"],
  ])
    for (const [user, status] of [
      [11, 403],
      [15, 401],
      [null, 401],
    ])
      assert.equal(
        (await request("/integrations" + url, user, method)).status,
        status,
      );
  assert.equal(exchanges, 0);
});
test("status uses current database company and never exposes access/refresh credentials", async () => {
  await query(
    "INSERT INTO integrations(company_id,provider,access_token,refresh_token,realm_id,environment,is_active) VALUES($1,'quickbooks','PRIVATE_ACCESS','PRIVATE_REFRESH','101','sandbox',true)",
    [uid(1)],
  );
  let r = await request("/integrations/status");
  assert.equal(r.status, 200);
  assert.equal(r.data.actorId, uid(12));
  assert.equal(r.data.companyId, uid(1));
  assert.equal(r.data.quickbooks.connected, true);
  assert.ok(!JSON.stringify(r.data).includes("PRIVATE"));
  assert.match(r.headers.get("cache-control"), /no-store/);
  r = await request("/integrations/status", 14);
  assert.equal(r.data.quickbooks.connected, false);
});
test("OAuth state is hashed, company-bound, single-use and credentials stay encrypted", async () => {
  const r = await request("/integrations/quickbooks/auth"),
    u = new URL(r.data.url),
    state = u.searchParams.get("state");
  assert.equal(u.hostname, "appcenter.intuit.com");
  assert.equal(state.length, 43);
  const saved = (await query("SELECT * FROM integration_oauth_states")).rows[0];
  assert.equal(saved.company_id, uid(1));
  assert.ok(!JSON.stringify(saved).includes(state));
  await service.handleQuickBooksCallback("synthetic-code", state, "202");
  assert.equal(exchanges, 1);
  await assert.rejects(
    service.handleQuickBooksCallback("synthetic-code", state, "202"),
    /invalid|used/,
  );
  const row = (
    await query(
      "SELECT * FROM integrations WHERE company_id=$1 AND provider='quickbooks'",
      [uid(1)],
    )
  ).rows[0];
  assert.match(row.access_token, /^v2:/);
  assert.ok(!row.access_token.includes("synthetic-access"));
});
test("revoked role, disabled identity or changed company cancels callback before exchange", async () => {
  for (const update of [
    "role='employee'",
    "is_active=false",
    "company_id='" + uid(2) + "'",
  ]) {
    const state = new URL(
      (await request("/integrations/quickbooks/auth", 13)).data.url,
    ).searchParams.get("state");
    await query("UPDATE users SET " + update + " WHERE id=$1", [uid(13)]);
    const before = exchanges;
    await assert.rejects(
      service.handleQuickBooksCallback("synthetic-code", state, "realm"),
      /no longer has access/,
    );
    assert.equal(exchanges, before);
    await query(
      "UPDATE users SET role='manager',is_active=true,company_id=$1 WHERE id=$2",
      [uid(1), uid(13)],
    );
  }
});
test("expired/wrong-provider states do not exchange and callbacks use a bounded error redirect", async () => {
  let r = await request("/integrations/quickbooks/auth");
  const state = new URL(r.data.url).searchParams.get("state");
  await assert.rejects(
    service.handleStripeConnectCallback("code", state),
    /invalid|expired/,
  );
  await query(
    "UPDATE integration_oauth_states SET expires_at=NOW()-INTERVAL '1 second'",
  );
  await assert.rejects(
    service.handleQuickBooksCallback("code", state, "realm"),
    /invalid|expired/,
  );
  r = await request(
    "/integrations/quickbooks/callback?error=denied&error_description=PRIVATE_DIAGNOSTICS&state=bad",
  );
  assert.equal(r.status, 302);
  assert.ok(!r.headers.get("location").includes("PRIVATE"));
});
test("provider failure does not echo diagnostics or credentials through client APIs", async () => {
  const original = service.getIntegrationStatus;
  service.getIntegrationStatus = async () => {
    throw Error("private SQL and token diagnostics");
  };
  const r = await request("/integrations/status");
  assert.ok(!JSON.stringify(r.data).includes("private"));
  assert.equal(
    r.data.message,
    "Integration is unavailable. Try again or reconnect.",
  );
  service.getIntegrationStatus = original;
});
test("role revocation during provider exchange prevents credential persistence", async () => {
  const state = new URL(
      (await request("/integrations/quickbooks/auth", 13)).data.url,
    ).searchParams.get("state"),
    original = oauth.exchangeQuickBooksAuthorizationCode;
  oauth.exchangeQuickBooksAuthorizationCode = async () => {
    await query("UPDATE users SET is_active=false WHERE id=$1", [uid(13)]);
    return {
      access_token: "SHOULD_NOT_BE_STORED",
      refresh_token: "SHOULD_NOT_BE_STORED",
    };
  };
  await assert.rejects(
    service.handleQuickBooksCallback("fixture", state, "303"),
    /no longer has access/,
  );
  const row = (
    await query(
      "SELECT realm_id FROM integrations WHERE company_id=$1 AND provider='quickbooks'",
      [uid(1)],
    )
  ).rows[0];
  assert.equal(row.realm_id, "202");
  oauth.exchangeQuickBooksAuthorizationCode = original;
  await query("UPDATE users SET is_active=true WHERE id=$1", [uid(13)]);
});
