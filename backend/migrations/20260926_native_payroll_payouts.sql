-- Secure, additive foundation for the native payroll payout API.
--
-- The application may store opaque provider recipient tokens and masked
-- display metadata here. It must never store routing numbers, account numbers,
-- IBANs, BIC/SWIFT values, sort codes, or raw provider webhook bodies.
-- Country availability remains fail-closed: an application adapter must also
-- be registered, configured, and explicitly support the country/currency pair.

-- These redundant unique indexes allow tenant ownership to be enforced by
-- composite foreign keys throughout the payout schema.
CREATE UNIQUE INDEX IF NOT EXISTS payout_users_company_id_uidx
  ON users(company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS payout_payrolls_company_id_uidx
  ON payrolls(company_id, id);

-- Payouts may only consume payrolls carrying an explicit calculation and
-- certification provenance tuple. Existing payrolls remain NULL/fail-closed;
-- this migration never infers, certifies, or backfills financial calculations.
ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS payout_country CHAR(2);
ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS payout_currency CHAR(3);
ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS payout_calculation_engine VARCHAR(80);
ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS payout_calculation_version VARCHAR(80);
ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS payout_certified_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'payrolls_payout_provenance_ck'
       AND conrelid = 'payrolls'::regclass
  ) THEN
    ALTER TABLE payrolls ADD CONSTRAINT payrolls_payout_provenance_ck CHECK (
      (
        payout_country IS NULL
        AND payout_currency IS NULL
        AND payout_calculation_engine IS NULL
        AND payout_calculation_version IS NULL
        AND payout_certified_at IS NULL
      )
      OR (
        payout_country IS NOT NULL
        AND payout_country ~ '^[A-Z]{2}$'
        AND payout_currency IS NOT NULL
        AND payout_currency ~ '^[A-Z]{3}$'
        AND payout_calculation_engine IS NOT NULL
        AND char_length(BTRIM(payout_calculation_engine)) > 0
        AND payout_calculation_version IS NOT NULL
        AND char_length(BTRIM(payout_calculation_version)) > 0
        AND payout_certified_at IS NOT NULL
      )
    );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS payout_company_settings (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE RESTRICT,
  country CHAR(2) NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  adapter_id VARCHAR(64) CHECK (
    adapter_id IS NULL OR adapter_id ~ '^[a-z][a-z0-9_-]{2,63}$'
  ),
  updated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payout_company_settings_actor_fk
    FOREIGN KEY (company_id, updated_by)
    REFERENCES users(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS payout_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL,
  provider VARCHAR(64) NOT NULL
    CHECK (provider ~ '^[a-z][a-z0-9_-]{2,63}$'),
  country CHAR(2) NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  provider_recipient_ref TEXT NOT NULL CHECK (
    char_length(provider_recipient_ref) BETWEEN 16 AND 4096
    AND provider_recipient_ref ~ '^v2:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'
  ),
  destination_last4 VARCHAR(8) CHECK (
    destination_last4 IS NULL OR destination_last4 ~ '^[A-Za-z0-9*]{4,8}$'
  ),
  destination_label VARCHAR(80),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'inactive', 'restricted')),
  provider_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payout_accounts_provider_verification_ck
    CHECK (status <> 'active' OR provider_verified_at IS NOT NULL),
  CONSTRAINT payout_accounts_employee_fk
    FOREIGN KEY (company_id, employee_id)
    REFERENCES users(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT payout_accounts_company_id_uk UNIQUE (company_id, id),
  CONSTRAINT payout_accounts_destination_uk
    UNIQUE (company_id, employee_id, provider, country, currency)
);

CREATE INDEX IF NOT EXISTS payout_accounts_company_employee_idx
  ON payout_accounts(company_id, employee_id);

CREATE TABLE IF NOT EXISTS payout_batches (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  payroll_id UUID NOT NULL,
  country CHAR(2) NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  adapter_id VARCHAR(64) NOT NULL
    CHECK (adapter_id ~ '^[a-z][a-z0-9_-]{2,63}$'),
  adapter_configuration_version VARCHAR(128) NOT NULL
    CHECK (char_length(BTRIM(adapter_configuration_version)) > 0),
  calculation_engine VARCHAR(80) NOT NULL
    CHECK (char_length(BTRIM(calculation_engine)) > 0),
  calculation_version VARCHAR(80) NOT NULL
    CHECK (char_length(BTRIM(calculation_version)) > 0),
  calculation_certified_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(24) NOT NULL CHECK (status IN (
    'awaiting_approval', 'approved', 'submitting', 'submitted',
    'processing', 'settled', 'failed', 'cancelled'
  )),
  employee_count INTEGER NOT NULL CHECK (employee_count > 0),
  total_minor BIGINT NOT NULL CHECK (total_minor > 0),
  created_by UUID NOT NULL,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  provider_reference VARCHAR(200),
  execution_key_hash CHAR(64) CHECK (
    execution_key_hash IS NULL OR execution_key_hash ~ '^[0-9a-f]{64}$'
  ),
  failure_code VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payout_batches_approval_shape_ck CHECK (
    (approved_by IS NULL AND approved_at IS NULL)
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  ),
  CONSTRAINT payout_batches_approval_state_ck CHECK (
    (status <> 'awaiting_approval' OR approved_by IS NULL)
    AND (
      status NOT IN ('approved', 'submitting', 'submitted', 'processing', 'settled', 'failed')
      OR approved_by IS NOT NULL
    )
  ),
  CONSTRAINT payout_batches_payroll_fk
    FOREIGN KEY (company_id, payroll_id)
    REFERENCES payrolls(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT payout_batches_creator_fk
    FOREIGN KEY (company_id, created_by)
    REFERENCES users(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT payout_batches_approver_fk
    FOREIGN KEY (company_id, approved_by)
    REFERENCES users(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT payout_batches_company_id_uk UNIQUE (company_id, id),
  CONSTRAINT payout_batches_payroll_uk UNIQUE (company_id, payroll_id)
);

CREATE INDEX IF NOT EXISTS payout_batches_company_created_idx
  ON payout_batches(company_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS payout_batches_provider_reference_uidx
  ON payout_batches(adapter_id, provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS payout_batch_items (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  batch_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  destination_fingerprint CHAR(64) NOT NULL
    CHECK (destination_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (batch_id, employee_id),
  CONSTRAINT payout_batch_items_batch_fk
    FOREIGN KEY (company_id, batch_id)
    REFERENCES payout_batches(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT payout_batch_items_employee_fk
    FOREIGN KEY (company_id, employee_id)
    REFERENCES users(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS payout_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  batch_id UUID NOT NULL,
  event_type VARCHAR(64) NOT NULL
    CHECK (event_type ~ '^[a-z][a-z0-9_.-]{1,63}$'),
  actor_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(details) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payout_events_batch_fk
    FOREIGN KEY (company_id, batch_id)
    REFERENCES payout_batches(company_id, id) ON DELETE RESTRICT,
  CONSTRAINT payout_events_actor_fk
    FOREIGN KEY (company_id, actor_id)
    REFERENCES users(company_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS payout_events_batch_created_idx
  ON payout_events(company_id, batch_id, created_at ASC);

CREATE TABLE IF NOT EXISTS payout_idempotency (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  scope VARCHAR(120) NOT NULL CHECK (char_length(scope) BETWEEN 1 AND 120),
  idempotency_key VARCHAR(128) NOT NULL CHECK (
    char_length(idempotency_key) BETWEEN 16 AND 128
    AND idempotency_key ~ '^[A-Za-z0-9._:-]+$'
  ),
  request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  batch_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, scope, idempotency_key),
  CONSTRAINT payout_idempotency_batch_fk
    FOREIGN KEY (company_id, batch_id)
    REFERENCES payout_batches(company_id, id) ON DELETE RESTRICT
);

COMMENT ON TABLE payout_accounts IS
  'Opaque provider recipient tokens and masked display metadata only; raw banking coordinates are prohibited.';
COMMENT ON COLUMN payout_accounts.provider_recipient_ref IS
  'AES-256-GCM v2 ciphertext containing an opaque hosted-enrollment provider token; never raw banking coordinates.';
COMMENT ON TABLE payout_events IS
  'Append-only payout audit events. Details must be sanitized and must never contain raw provider payloads or banking coordinates.';

CREATE OR REPLACE FUNCTION protect_payroll_payout_provenance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.payout_certified_at IS NOT NULL
     AND ROW(
       NEW.payout_country, NEW.payout_currency, NEW.payout_calculation_engine,
       NEW.payout_calculation_version, NEW.payout_certified_at
     ) IS DISTINCT FROM ROW(
       OLD.payout_country, OLD.payout_currency, OLD.payout_calculation_engine,
       OLD.payout_calculation_version, OLD.payout_certified_at
     ) THEN
    RAISE EXCEPTION 'certified payroll payout provenance is immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payrolls_payout_provenance_immutable ON payrolls;
CREATE TRIGGER payrolls_payout_provenance_immutable
  BEFORE UPDATE ON payrolls
  FOR EACH ROW EXECUTE FUNCTION protect_payroll_payout_provenance();

CREATE OR REPLACE FUNCTION validate_payout_batch_provenance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM payrolls p
     WHERE p.company_id = NEW.company_id
       AND p.id = NEW.payroll_id
       AND p.payout_country = NEW.country
       AND p.payout_currency = NEW.currency
       AND p.payout_calculation_engine = NEW.calculation_engine
       AND p.payout_calculation_version = NEW.calculation_version
       AND DATE_TRUNC('milliseconds', p.payout_certified_at)
           = DATE_TRUNC('milliseconds', NEW.calculation_certified_at)
  ) THEN
    RAISE EXCEPTION 'payout batch provenance does not match a certified payroll'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payout_batches_validate_provenance ON payout_batches;
CREATE TRIGGER payout_batches_validate_provenance
  BEFORE INSERT ON payout_batches
  FOR EACH ROW EXECUTE FUNCTION validate_payout_batch_provenance();

CREATE OR REPLACE FUNCTION protect_payout_batch_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  approver_role TEXT;
  approver_active BOOLEAN;
  actual_employee_count INTEGER;
  actual_total_minor BIGINT;
  wrong_currency_count INTEGER;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'awaiting_approval' AND NEW.status IN ('approved', 'cancelled'))
    OR (OLD.status = 'approved' AND NEW.status IN ('submitting', 'cancelled'))
    OR (OLD.status = 'submitting' AND NEW.status IN ('submitted', 'processing', 'settled', 'failed'))
    OR (OLD.status = 'submitted' AND NEW.status IN ('processing', 'settled', 'failed'))
    OR (OLD.status = 'processing' AND NEW.status IN ('settled', 'failed'))
  ) THEN
    RAISE EXCEPTION 'invalid payout batch status transition: % to %', OLD.status, NEW.status
      USING ERRCODE = '55000';
  END IF;

  IF ROW(
    NEW.company_id, NEW.payroll_id, NEW.country, NEW.currency,
    NEW.adapter_id, NEW.adapter_configuration_version,
    NEW.calculation_engine, NEW.calculation_version, NEW.calculation_certified_at,
    NEW.employee_count, NEW.total_minor, NEW.created_by
  ) IS DISTINCT FROM ROW(
    OLD.company_id, OLD.payroll_id, OLD.country, OLD.currency,
    OLD.adapter_id, OLD.adapter_configuration_version,
    OLD.calculation_engine, OLD.calculation_version, OLD.calculation_certified_at,
    OLD.employee_count, OLD.total_minor, OLD.created_by
  ) THEN
    RAISE EXCEPTION 'payout batch snapshot fields are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.approved_by IS NOT NULL
     AND ROW(NEW.approved_by, NEW.approved_at)
         IS DISTINCT FROM ROW(OLD.approved_by, OLD.approved_at) THEN
    RAISE EXCEPTION 'payout approval is immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.execution_key_hash IS NOT NULL
     AND NEW.execution_key_hash IS DISTINCT FROM OLD.execution_key_hash THEN
    RAISE EXCEPTION 'payout execution key is immutable once assigned'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.provider_reference IS NOT NULL
     AND NEW.provider_reference IS DISTINCT FROM OLD.provider_reference THEN
    RAISE EXCEPTION 'payout provider reference is immutable once assigned'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.approved_by IS NULL
     AND NEW.approved_by IS NOT NULL
     AND NEW.status <> 'approved' THEN
    RAISE EXCEPTION 'payout approval must occur with the approved status transition'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.status = 'awaiting_approval' AND NEW.status = 'approved' THEN
    SELECT COUNT(*)::INTEGER,
           COALESCE(SUM(amount_minor), 0),
           COUNT(*) FILTER (WHERE currency <> NEW.currency)::INTEGER
      INTO actual_employee_count, actual_total_minor, wrong_currency_count
      FROM payout_batch_items
     WHERE company_id = NEW.company_id
       AND batch_id = NEW.id;

    IF actual_employee_count <> NEW.employee_count
       OR actual_total_minor <> NEW.total_minor
       OR wrong_currency_count <> 0 THEN
      RAISE EXCEPTION 'payout batch item snapshot does not match its approved totals'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status IN ('approved', 'submitting', 'submitted', 'processing', 'settled') THEN
    IF NEW.approved_by IS NULL OR NEW.approved_at IS NULL THEN
      RAISE EXCEPTION 'payout approval is required before execution'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.approved_by = NEW.created_by THEN
      RAISE EXCEPTION 'the payout preparer cannot approve their own batch'
        USING ERRCODE = '42501';
    END IF;

    SELECT LOWER(role), COALESCE(is_active, TRUE)
      INTO approver_role, approver_active
      FROM users
     WHERE company_id = NEW.company_id AND id = NEW.approved_by;
    IF NOT FOUND
       OR approver_active IS DISTINCT FROM TRUE
       OR approver_role IS NULL
       OR approver_role NOT IN ('boss', 'owner', 'manager', 'admin') THEN
      RAISE EXCEPTION 'an active company manager is required to approve payouts'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payout_batch_snapshot_immutable ON payout_batches;
CREATE TRIGGER payout_batch_snapshot_immutable
  BEFORE UPDATE ON payout_batches
  FOR EACH ROW EXECUTE FUNCTION protect_payout_batch_snapshot();

CREATE OR REPLACE FUNCTION protect_payout_batch_item_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'payout batch item snapshots are immutable'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS payout_batch_items_immutable ON payout_batch_items;
CREATE TRIGGER payout_batch_items_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON payout_batch_items
  FOR EACH STATEMENT EXECUTE FUNCTION protect_payout_batch_item_snapshot();

CREATE OR REPLACE FUNCTION validate_payout_batch_item_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  batch_status TEXT;
  batch_currency CHAR(3);
BEGIN
  SELECT status, currency
    INTO batch_status, batch_currency
    FROM payout_batches
   WHERE company_id = NEW.company_id
     AND id = NEW.batch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout batch does not belong to this company'
      USING ERRCODE = '23503';
  END IF;
  IF batch_status <> 'awaiting_approval' THEN
    RAISE EXCEPTION 'payout items may only be added before approval'
      USING ERRCODE = '55000';
  END IF;
  IF NEW.currency <> batch_currency THEN
    RAISE EXCEPTION 'payout item currency does not match the batch'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payout_batch_items_validate_insert ON payout_batch_items;
CREATE TRIGGER payout_batch_items_validate_insert
  BEFORE INSERT ON payout_batch_items
  FOR EACH ROW EXECUTE FUNCTION validate_payout_batch_item_insert();

CREATE OR REPLACE FUNCTION reject_payout_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'payout events are append-only' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS payout_events_immutable ON payout_events;
CREATE TRIGGER payout_events_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON payout_events
  FOR EACH STATEMENT EXECUTE FUNCTION reject_payout_event_mutation();
