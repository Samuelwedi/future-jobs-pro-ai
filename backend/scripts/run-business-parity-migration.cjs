const fs = require('node:fs');
const path = require('node:path');
const files = ['20261031_invoice_request_keys.sql', '20261101_estimate_request_keys.sql', '20261101_invoice_payment_keys.sql', '20261102_commercial_billing.sql', '20261102_commercial_delivery.sql', '20260813_company_admin_operations.sql', '20261102_bulk_compensation.sql'];
async function migrate(client) {
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='10s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('futurejobs-business-parity-schema'))");
    for (const file of files) await client.query(fs.readFileSync(path.join(__dirname, '../migrations', file), 'utf8'));
    await client.query('SELECT creation_request_key,creation_request_hash FROM invoices LIMIT 0');
    await client.query('SELECT creation_request_key,creation_request_hash FROM estimates LIMIT 0');
    await client.query('SELECT record_request_key,record_request_hash FROM payments LIMIT 0');
    await client.query('SELECT recurring_enabled,recurring_next_date,parent_invoice_id FROM invoices LIMIT 0');
    await client.query('SELECT id,status,fingerprint,pdf FROM commercial_delivery_jobs LIMIT 0');
    await client.query('SELECT id,action FROM company_admin_audit_logs LIMIT 0');
    await client.query('SELECT company_id,request_key,result FROM compensation_bulk_requests LIMIT 0');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}
async function main() {
  const {pool} = require('../dist/config/database');
  let client;
  try {client = await pool.connect(); await migrate(client); console.log('Business workflow request-key schema is ready and verified.');}
  finally {if (client) client.release(); await pool.end();}
}
if (require.main === module) main().catch(() => {console.error('Business workflow migration failed; deployment stopped. Verify database connectivity and prerequisites.'); process.exitCode = 1;});
module.exports = {migrate, files};
