// Upgrade an existing schema only. Never run historical seed/reset scripts automatically.
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const ssl = process.env.DB_SSL === 'false'
  ? false
  : process.env.DATABASE_URL
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' }
    : false;

const pool = new Pool(process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

const BASE_FIELDS = {
  shifts: ['id', 'created_by', 'date', 'start_time', 'end_time'],
  shift_assignments: ['shift_id', 'user_id'],
  invoices: ['id', 'company_id', 'project_id', 'invoice_number', 'issue_date', 'due_date', 'subtotal', 'tax_rate', 'notes', 'created_by', 'status'],
  invoice_items: ['invoice_id', 'description', 'quantity', 'unit_price', 'time_entry_ids'],
  payments: ['id', 'invoice_id'],
  companies: ['id', 'name', 'payroll_schedule'],
  users: ['id', 'company_id', 'role', 'is_active', 'full_name', 'first_name', 'last_name', 'email', 'password_hash', 'must_change_password'],
  time_entries: ['id', 'user_id', 'regular_hours', 'overtime_hours', 'total_wage', 'status', 'approval_status', 'payroll_locked_at'],
  payrolls: ['id', 'period_start', 'period_end', 'status', 'total_hours', 'total_pay'],
  payroll_items: ['payroll_id', 'timesheet_ids', 'vacation_pay', 'final_pay'],
  compensation_history: ['hourly_rate', 'effective_date'],
  tasks: ['company_id', 'assigned_to', 'description', 'status'],
  pto_requests: ['company_id', 'user_id', 'status'],
  attachments: ['company_id', 'uploaded_by', 'file_url'],
  approvals: ['user_id', 'action_payload', 'resolved_at'],
  lucy_conversations: ['user_id', 'content', 'created_at'],
};

const RELEASE_FIELDS = {
  shift_assignments: ['id', 'status'],
  companies: [
    'timezone', 'pay_period_anchor', 'payroll_week_start',
    'subscription_tier', 'subscription_status', 'subscription_expires_at',
    'subscription_provider', 'subscription_current_period_end',
    'subscription_cancel_at_period_end', 'subscription_updated_at',
    'stripe_trial_used_at',
  ],
  users: ['trial_ends_at'],
  payrolls: [
    'payout_country', 'payout_currency', 'payout_calculation_engine',
    'payout_calculation_version', 'payout_certified_at',
  ],
  lucy_conversations: ['company_id'],
  payout_company_settings: ['company_id', 'country', 'currency', 'adapter_id', 'updated_by'],
  payout_accounts: [
    'id', 'company_id', 'employee_id', 'provider', 'country', 'currency',
    'provider_recipient_ref', 'destination_last4', 'destination_label', 'status',
    'provider_verified_at',
  ],
  payout_batches: [
    'id', 'company_id', 'payroll_id', 'country', 'currency', 'adapter_id',
    'adapter_configuration_version', 'calculation_engine', 'calculation_version',
    'calculation_certified_at',
    'status', 'employee_count', 'total_minor', 'created_by', 'approved_by',
    'approved_at', 'provider_reference', 'execution_key_hash', 'failure_code',
  ],
  payout_batch_items: [
    'company_id', 'batch_id', 'employee_id', 'amount_minor', 'currency',
    'destination_fingerprint',
  ],
  payout_events: ['id', 'company_id', 'batch_id', 'event_type', 'actor_id', 'details'],
  payout_idempotency: [
    'company_id', 'scope', 'idempotency_key', 'request_hash', 'batch_id',
  ],
};

const RELEASE_TABLES = [
  'command_events', 'expense_claims', 'ops_profiles', 'ops_unavailability',
  'ops_budgets', 'ops_documents', 'ops_actions', 'ops_time_studies',
  'ops_report_schedules', 'ops_reports', 'ops_limits', 'ops_usage',
  'ops_sites', 'ops_invites', 'ops_swaps', 'ops_shift_requirements',
  'payout_company_settings', 'payout_accounts', 'payout_batches',
  'payout_batch_items', 'payout_events', 'payout_idempotency',
];

const MIGRATIONS = [
  '20260922_shift_assignment_identity.sql',
  '20260923_command_center.sql',
  '20260924_operations.sql',
  '20260925_subscription_enforcement.sql',
  '20260926_native_payroll_payouts.sql',
];

function missingFields(rows, required) {
  const available = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
  return Object.entries(required).flatMap(([table, columns]) => columns
    .filter((column) => !available.has(`${table}.${column}`))
    .map((column) => `${table}.${column}`));
}

(async () => {
  let client;
  let inTransaction = false;
  try {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error('Configure JWT_SECRET with at least 32 characters. Preserve the existing secret when upgrading.');
    }

    client = await pool.connect();
    const version = await client.query('SHOW server_version_num');
    if (Number(version.rows[0].server_version_num) < 150000) {
      throw new Error('PostgreSQL 15 or newer is required. PostgreSQL 18 is recommended for this release.');
    }

    const before = await client.query(
      "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'",
    );
    const missingBase = missingFields(before.rows, BASE_FIELDS);
    if (missingBase.length) {
      throw new Error(`The base database is not compatible. Missing: ${missingBase.join(', ')}. Restore the existing app database and apply the applicable earlier migrations first.`);
    }

    if (process.argv.includes('--apply')) {
      await client.query('BEGIN');
      inTransaction = true;
      for (const migration of MIGRATIONS) {
        const sql = fs.readFileSync(path.join(__dirname, '../migrations', migration), 'utf8');
        await client.query(sql);
      }
      await client.query('COMMIT');
      inTransaction = false;
      console.log('RC3 database migrations applied in one transaction.');
    }

    const after = await client.query(
      "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'",
    );
    const missingReleaseFields = missingFields(after.rows, RELEASE_FIELDS);
    const tableResult = await client.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const availableTables = new Set(tableResult.rows.map((row) => row.table_name));
    const missingTables = RELEASE_TABLES.filter((table) => !availableTables.has(table));

    if (missingReleaseFields.length || missingTables.length) {
      const details = [
        missingReleaseFields.length ? `fields: ${missingReleaseFields.join(', ')}` : '',
        missingTables.length ? `tables: ${missingTables.join(', ')}` : '',
      ].filter(Boolean).join('; ');
      throw new Error(`RC3 release migrations are incomplete (${details}). Back up the database, then rerun the installer with -ApplyMigration.`);
    }

    console.log(`Database compatibility check passed (${RELEASE_TABLES.length}/${RELEASE_TABLES.length} release tables).`);
  } catch (error) {
    if (client && inTransaction) await client.query('ROLLBACK').catch(() => undefined);
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    client?.release();
    await pool.end();
  }
})();
