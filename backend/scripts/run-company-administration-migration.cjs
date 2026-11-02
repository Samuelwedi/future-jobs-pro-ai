const fs = require("node:fs"),
  path = require("node:path");
async function run(client) {
  try {
    await client.query("BEGIN");
    await client.query(
      fs.readFileSync(
        path.join(
          __dirname,
          "../migrations/20260813_company_admin_operations.sql",
        ),
        "utf8",
      ),
    );
    await client.query(
      "SELECT company_id,actor_id,employee_id,action,details,created_at FROM company_admin_audit_logs LIMIT 0",
    );
    await client.query(
      "SELECT id,company_id,role,is_active,full_name,date_of_birth,sin,password_hash,must_change_password,created_at,updated_at FROM users LIMIT 0",
    );
    await client.query(
      "SELECT id,user_id,hourly_rate,effective_date,created_by,created_at FROM compensation_history LIMIT 0",
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  }
}
async function main() {
  const { pool } = require("../dist/config/database");
  let c;
  try {
    c = await pool.connect();
    await run(c);
    console.log(
      "Company administration audit schema and prerequisites verified.",
    );
  } finally {
    c?.release();
    await pool.end();
  }
}
if (require.main === module)
  main().catch(() => {
    console.error(
      "Company administration migration failed. Verify user and compensation schema prerequisites.",
    );
    process.exitCode = 1;
  });
module.exports = { run };
