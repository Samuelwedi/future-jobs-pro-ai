const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const ids = {
  company: '00000000-0000-4000-8000-000000000101',
  otherCompany: '00000000-0000-4000-8000-000000000102',
  maker: '00000000-0000-4000-8000-000000000111',
  checker: '00000000-0000-4000-8000-000000000112',
  worker: '00000000-0000-4000-8000-000000000113',
  outsider: '00000000-0000-4000-8000-000000000114',
  payroll: '00000000-0000-4000-8000-000000000121',
  otherPayroll: '00000000-0000-4000-8000-000000000122',
  batch: '00000000-0000-4000-8000-000000000131',
  otherBatch: '00000000-0000-4000-8000-000000000132',
};

const migrationPath = path.join(
  __dirname,
  '../migrations/20260926_native_payroll_payouts.sql',
);

test('native payout migration is idempotent and enforces the funds-movement boundary', async (t) => {
  const db = new PGlite();
  const query = (sql, params = []) => db.query(sql, params);

  try {
    await db.exec(`
      CREATE TABLE companies (
        id UUID PRIMARY KEY
      );
      CREATE TABLE users (
        id UUID PRIMARY KEY,
        company_id UUID REFERENCES companies(id),
        role TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE
      );
      CREATE TABLE payrolls (
        id UUID PRIMARY KEY,
        company_id UUID NOT NULL REFERENCES companies(id)
      );
    `);

    await query(
      'INSERT INTO companies(id) VALUES($1),($2)',
      [ids.company, ids.otherCompany],
    );
    await query(
      `INSERT INTO users(id,company_id,role) VALUES
       ($1,$5,'boss'),($2,$5,'manager'),($3,$5,'employee'),($4,$6,'manager')`,
      [ids.maker, ids.checker, ids.worker, ids.outsider, ids.company, ids.otherCompany],
    );
    await query(
      'INSERT INTO payrolls(id,company_id) VALUES($1,$3),($2,$4)',
      [ids.payroll, ids.otherPayroll, ids.company, ids.otherCompany],
    );

    const migration = fs.readFileSync(migrationPath, 'utf8');
    await db.exec(migration);
    await db.exec(migration);

    await t.test('creates the exact repository tables and provenance columns twice', async () => {
      const tables = await query(`
        SELECT table_name
          FROM information_schema.tables
         WHERE table_schema='public' AND table_name LIKE 'payout_%'
         ORDER BY table_name
      `);
      assert.deepEqual(
        tables.rows.map((row) => row.table_name),
        [
          'payout_accounts',
          'payout_batch_items',
          'payout_batches',
          'payout_company_settings',
          'payout_events',
          'payout_idempotency',
        ],
      );

      const expectedColumns = {
        payout_company_settings: [
          'company_id', 'country', 'currency', 'adapter_id', 'updated_by',
          'created_at', 'updated_at',
        ],
        payout_accounts: [
          'id', 'company_id', 'employee_id', 'provider', 'country', 'currency',
          'provider_recipient_ref', 'destination_last4', 'destination_label',
          'status', 'provider_verified_at', 'created_at', 'updated_at',
        ],
        payout_batches: [
          'id', 'company_id', 'payroll_id', 'country', 'currency', 'adapter_id',
          'adapter_configuration_version', 'calculation_engine', 'calculation_version',
          'calculation_certified_at',
          'status', 'employee_count', 'total_minor', 'created_by', 'approved_by',
          'approved_at', 'provider_reference', 'execution_key_hash', 'failure_code',
          'created_at', 'updated_at',
        ],
        payout_batch_items: [
          'company_id', 'batch_id', 'employee_id', 'amount_minor', 'currency',
          'destination_fingerprint', 'created_at',
        ],
        payout_events: [
          'id', 'company_id', 'batch_id', 'event_type', 'actor_id', 'details', 'created_at',
        ],
        payout_idempotency: [
          'company_id', 'scope', 'idempotency_key', 'request_hash', 'batch_id', 'created_at',
        ],
      };
      for (const [table, expected] of Object.entries(expectedColumns)) {
        const columns = await query(`
          SELECT column_name
            FROM information_schema.columns
           WHERE table_schema='public' AND table_name=$1
           ORDER BY ordinal_position
        `, [table]);
        assert.deepEqual(columns.rows.map((row) => row.column_name), expected, table);
      }

      const provenance = await query(`
        SELECT column_name
          FROM information_schema.columns
         WHERE table_schema='public' AND table_name='payrolls'
           AND column_name LIKE 'payout_%'
         ORDER BY column_name
      `);
      assert.deepEqual(provenance.rows.map((row) => row.column_name), [
        'payout_calculation_engine',
        'payout_calculation_version',
        'payout_certified_at',
        'payout_country',
        'payout_currency',
      ]);
    });

    await t.test('installs the tenant, approval, and provenance constraints', async () => {
      const constraints = await query(`
        SELECT conname FROM pg_constraint
         WHERE conname LIKE 'payout_%' OR conname='payrolls_payout_provenance_ck'
      `);
      const names = new Set(constraints.rows.map((row) => row.conname));
      for (const name of [
        'payrolls_payout_provenance_ck',
        'payout_company_settings_actor_fk',
        'payout_accounts_employee_fk',
        'payout_accounts_provider_verification_ck',
        'payout_batches_payroll_fk',
        'payout_batches_creator_fk',
        'payout_batches_approver_fk',
        'payout_batches_approval_state_ck',
        'payout_batch_items_batch_fk',
        'payout_batch_items_employee_fk',
        'payout_events_batch_fk',
        'payout_events_actor_fk',
        'payout_idempotency_batch_fk',
      ]) assert.ok(names.has(name), `missing ${name}`);

      const triggers = await query(`
        SELECT tgname FROM pg_trigger
         WHERE NOT tgisinternal
           AND (tgname LIKE 'payout_%' OR tgname='payrolls_payout_provenance_immutable')
      `);
      const triggerNames = new Set(triggers.rows.map((row) => row.tgname));
      for (const name of [
        'payrolls_payout_provenance_immutable',
        'payout_batches_validate_provenance',
        'payout_batch_snapshot_immutable',
        'payout_batch_items_immutable',
        'payout_batch_items_validate_insert',
        'payout_events_immutable',
      ]) assert.ok(triggerNames.has(name), `missing ${name}`);
    });

    await t.test('requires complete certified payroll provenance without backfilling', async () => {
      const original = await query(
        `SELECT payout_country,payout_currency,payout_calculation_engine,
                payout_calculation_version,payout_certified_at
           FROM payrolls WHERE id=$1`,
        [ids.payroll],
      );
      assert.deepEqual(Object.values(original.rows[0]), [null, null, null, null, null]);

      await assert.rejects(
        query("UPDATE payrolls SET payout_country='CA' WHERE id=$1", [ids.payroll]),
        /payrolls_payout_provenance_ck/i,
      );
      await assert.rejects(
        query(
          `UPDATE payrolls SET
             payout_country='ca', payout_currency='CAD',
             payout_calculation_engine='certified_ca_payroll',
             payout_calculation_version='2026.09',
             payout_certified_at=TIMESTAMPTZ '2026-09-24 12:00:00.123456+00'
           WHERE id=$1`,
          [ids.otherPayroll],
        ),
        /payrolls_payout_provenance_ck/i,
      );
      await query(
        `UPDATE payrolls SET
           payout_country='CA', payout_currency='CAD',
           payout_calculation_engine='certified_ca_payroll',
           payout_calculation_version='2026.09',
           payout_certified_at=TIMESTAMPTZ '2026-09-24 12:00:00.123456+00'
         WHERE id=$1`,
        [ids.payroll],
      );
      await query(
        `UPDATE payrolls SET
           payout_country='CA', payout_currency='CAD',
           payout_calculation_engine='certified_ca_payroll',
           payout_calculation_version='2026.09',
           payout_certified_at=TIMESTAMPTZ '2026-09-24 12:00:00.123456+00'
         WHERE id=$1`,
        [ids.otherPayroll],
      );
      await assert.rejects(
        query(
          "UPDATE payrolls SET payout_calculation_version='2026.10' WHERE id=$1",
          [ids.payroll],
        ),
        /provenance is immutable/i,
      );
    });

    await t.test('rejects plaintext recipient references and cross-tenant links', async () => {
      await assert.rejects(
        query(
          `INSERT INTO payout_accounts
             (company_id,employee_id,provider,country,currency,provider_recipient_ref)
           VALUES($1,$2,'test_ca','CA','CAD','plaintext_recipient_token')`,
          [ids.company, ids.worker],
        ),
        /provider_recipient_ref/i,
      );
      await assert.rejects(
        query(
          `INSERT INTO payout_accounts
             (company_id,employee_id,provider,country,currency,provider_recipient_ref)
           VALUES($1,$2,'test_ca','CA','CAD','v2:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBB:CCCCCCCC')`,
          [ids.company, ids.outsider],
        ),
        /payout_accounts_employee_fk/i,
      );
      await assert.rejects(
        query(
          `INSERT INTO payout_accounts
             (company_id,employee_id,provider,country,currency,
              provider_recipient_ref,status)
           VALUES($1,$2,'unverified_ca','CA','CAD',
                  'v2:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBB:CCCCCCCC','active')`,
          [ids.company, ids.worker],
        ),
        /payout_accounts_provider_verification_ck/i,
      );
      await assert.rejects(
        query(
          `INSERT INTO payout_batches
             (id,company_id,payroll_id,country,currency,adapter_id,
              adapter_configuration_version,calculation_engine,calculation_version,
              calculation_certified_at,status,employee_count,total_minor,created_by)
           VALUES($1,$2,$3,'CA','CAD','test_ca','cfg_test_v1',
                  'certified_ca_payroll','2026.09',
                  TIMESTAMPTZ '2026-09-24 12:00:00.123+00',
                  'awaiting_approval',1,100,$4)`,
          [ids.batch, ids.company, ids.otherPayroll, ids.maker],
        ),
        /provenance does not match|payout_batches_payroll_fk/i,
      );

      await query(
          `INSERT INTO payout_accounts
             (company_id,employee_id,provider,country,currency,provider_recipient_ref,
              destination_last4,status,provider_verified_at)
         VALUES($1,$2,'test_ca','CA','CAD',
                'v2:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBB:CCCCCCCC','1234','active',NOW())`,
        [ids.company, ids.worker],
      );
    });

    await t.test('seals items, approvals, status transitions, and provider references', async () => {
      await query(
        `INSERT INTO payout_batches
           (id,company_id,payroll_id,country,currency,adapter_id,
            adapter_configuration_version,calculation_engine,calculation_version,
            calculation_certified_at,status,employee_count,total_minor,created_by)
         VALUES($1,$2,$3,'CA','CAD','test_ca','cfg_test_v1',
                'certified_ca_payroll','2026.09',
                TIMESTAMPTZ '2026-09-24 12:00:00.123+00',
                'awaiting_approval',1,100,$4)`,
        [ids.batch, ids.company, ids.payroll, ids.maker],
      );
      await assert.rejects(
        query(
          `INSERT INTO payout_batch_items
             (company_id,batch_id,employee_id,amount_minor,currency,destination_fingerprint)
           VALUES($1,$2,$3,100,'CAD',$4)`,
          [ids.company, ids.batch, ids.outsider, 'a'.repeat(64)],
        ),
        /payout_batch_items_employee_fk/i,
      );
      await query(
        `INSERT INTO payout_batch_items
           (company_id,batch_id,employee_id,amount_minor,currency,destination_fingerprint)
         VALUES($1,$2,$3,100,'CAD',$4)`,
        [ids.company, ids.batch, ids.worker, 'a'.repeat(64)],
      );

      await assert.rejects(
        query(
          `UPDATE payout_batches
              SET status='processing',approved_by=$1,approved_at=NOW()
            WHERE id=$2`,
          [ids.checker, ids.batch],
        ),
        /invalid payout batch status transition/i,
      );
      await assert.rejects(
        query(
          `UPDATE payout_batches
              SET status='approved',approved_by=$1,approved_at=NOW()
            WHERE id=$2`,
          [ids.maker, ids.batch],
        ),
        /preparer cannot approve/i,
      );
      await query(
        `UPDATE payout_batches
            SET status='approved',approved_by=$1,approved_at=NOW()
          WHERE id=$2`,
        [ids.checker, ids.batch],
      );

      await assert.rejects(
        query(
          "UPDATE payout_batches SET adapter_configuration_version='cfg_test_v2' WHERE id=$1",
          [ids.batch],
        ),
        /snapshot fields are immutable/i,
      );

      await assert.rejects(
        query('UPDATE payout_batch_items SET amount_minor=101 WHERE batch_id=$1', [ids.batch]),
        /item snapshots are immutable/i,
      );
      await assert.rejects(
        query(
          `INSERT INTO payout_batch_items
             (company_id,batch_id,employee_id,amount_minor,currency,destination_fingerprint)
           VALUES($1,$2,$3,1,'CAD',$4)`,
          [ids.company, ids.batch, ids.maker, 'b'.repeat(64)],
        ),
        /only be added before approval/i,
      );

      await query(
        `UPDATE payout_batches
            SET status='submitting',execution_key_hash=$1
          WHERE id=$2`,
        ['b'.repeat(64), ids.batch],
      );
      await query(
        `UPDATE payout_batches
            SET status='submitted',provider_reference='provider_batch_1'
          WHERE id=$1`,
        [ids.batch],
      );
      await assert.rejects(
        query(
          'UPDATE payout_batches SET execution_key_hash=$1 WHERE id=$2',
          ['c'.repeat(64), ids.batch],
        ),
        /execution key is immutable/i,
      );
      await assert.rejects(
        query(
          "UPDATE payout_batches SET provider_reference='provider_batch_2' WHERE id=$1",
          [ids.batch],
        ),
        /provider reference is immutable/i,
      );
      await query("UPDATE payout_batches SET status='settled' WHERE id=$1", [ids.batch]);
      await assert.rejects(
        query("UPDATE payout_batches SET status='processing' WHERE id=$1", [ids.batch]),
        /invalid payout batch status transition/i,
      );

      await assert.rejects(
        query(
          `INSERT INTO payout_batches
             (id,company_id,payroll_id,country,currency,adapter_id,
              adapter_configuration_version,calculation_engine,calculation_version,
              calculation_certified_at,status,employee_count,total_minor,created_by,
              provider_reference)
           VALUES($1,$2,$3,'CA','CAD','test_ca','cfg_test_v1',
                  'certified_ca_payroll','2026.09',
                  TIMESTAMPTZ '2026-09-24 12:00:00.123+00',
                  'cancelled',1,1,$4,'provider_batch_1')`,
          [ids.otherBatch, ids.otherCompany, ids.otherPayroll, ids.outsider],
        ),
        /payout_batches_provider_reference_uidx|duplicate key/i,
      );
    });

    await t.test('keeps event history immutable and idempotency tenant-bound', async () => {
      const event = await query(
        `INSERT INTO payout_events(company_id,batch_id,event_type,actor_id,details)
         VALUES($1,$2,'batch_settled',$3,'{}') RETURNING id`,
        [ids.company, ids.batch, ids.checker],
      );
      await assert.rejects(
        query("UPDATE payout_events SET event_type='changed' WHERE id=$1", [event.rows[0].id]),
        /events are append-only/i,
      );
      await assert.rejects(
        query('DELETE FROM payout_events WHERE id=$1', [event.rows[0].id]),
        /events are append-only/i,
      );

      const key = 'prepare-payout-batch-0001';
      await query(
        `INSERT INTO payout_idempotency
           (company_id,scope,idempotency_key,request_hash,batch_id)
         VALUES($1,'prepare_batch',$2,$3,$4)`,
        [ids.company, key, 'd'.repeat(64), ids.batch],
      );
      await assert.rejects(
        query(
          `INSERT INTO payout_idempotency
             (company_id,scope,idempotency_key,request_hash,batch_id)
           VALUES($1,'prepare_batch',$2,$3,$4)`,
          [ids.company, key, 'd'.repeat(64), ids.batch],
        ),
        /payout_idempotency_pkey|duplicate key/i,
      );
      await assert.rejects(
        query(
          `INSERT INTO payout_idempotency
             (company_id,scope,idempotency_key,request_hash,batch_id)
           VALUES($1,'prepare_batch','other-tenant-key-0001',$2,$3)`,
          [ids.otherCompany, 'e'.repeat(64), ids.batch],
        ),
        /payout_idempotency_batch_fk/i,
      );
    });
  } finally {
    await db.close();
  }
});
