-- Legacy currency intentionally remains unspecified until an owner reconciles it.
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS position INTEGER;
ALTER TABLE estimate_items ADD COLUMN IF NOT EXISTS position INTEGER;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS time_entry_ids UUID[] DEFAULT '{}';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recurring_frequency VARCHAR(20);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recurring_end_date DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency VARCHAR(3);
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS currency VARCHAR(3);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS milestone_name VARCHAR(255);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS milestone_percentage NUMERIC(5,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS parent_invoice_id UUID REFERENCES invoices(id);
CREATE TABLE IF NOT EXISTS commercial_actions (
 company_id UUID NOT NULL REFERENCES companies(id),action_key TEXT NOT NULL,fingerprint TEXT NOT NULL,
 result JSONB NOT NULL,created_by UUID NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(company_id,action_key)
);
-- Serialize numbering at the trigger, including writes from older clients.
CREATE OR REPLACE FUNCTION generate_invoice_number() RETURNS TRIGGER AS $$
DECLARE y TEXT;seq BIGINT;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('commercial-invoice-number'));
 y:=to_char(NEW.issue_date,'YYYY');
 SELECT COALESCE(MAX(substring(invoice_number FROM '[0-9]+$')::bigint),0)+1 INTO seq FROM invoices WHERE invoice_number LIKE 'INV-'||y||'-%';
 NEW.invoice_number:='INV-'||y||'-'||lpad(seq::text,GREATEST(4,length(seq::text)),'0');RETURN NEW;
END;$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_generate_invoice_number ON invoices;
CREATE TRIGGER trg_generate_invoice_number BEFORE INSERT ON invoices FOR EACH ROW WHEN(NEW.invoice_number IS NULL) EXECUTE FUNCTION generate_invoice_number();
CREATE OR REPLACE FUNCTION generate_estimate_number() RETURNS TRIGGER AS $$
DECLARE y TEXT;seq BIGINT;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('commercial-estimate-number'));
 y:=to_char(NEW.issue_date,'YYYY');
 SELECT COALESCE(MAX(substring(estimate_number FROM '[0-9]+$')::bigint),0)+1 INTO seq FROM estimates WHERE estimate_number LIKE 'EST-'||y||'-%';
 NEW.estimate_number:='EST-'||y||'-'||lpad(seq::text,GREATEST(4,length(seq::text)),'0');RETURN NEW;
END;$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_generate_estimate_number ON estimates;
CREATE TRIGGER trg_generate_estimate_number BEFORE INSERT ON estimates FOR EACH ROW WHEN(NEW.estimate_number IS NULL) EXECUTE FUNCTION generate_estimate_number();
