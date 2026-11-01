ALTER TABLE invoices ADD COLUMN IF NOT EXISTS creation_request_key text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS creation_request_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS invoice_creation_request_unique ON invoices(company_id,creation_request_key) WHERE creation_request_key IS NOT NULL;
