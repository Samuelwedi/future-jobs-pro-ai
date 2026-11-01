ALTER TABLE payments ADD COLUMN IF NOT EXISTS record_request_key text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS record_request_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS invoice_payment_record_request_unique ON payments(invoice_id,record_request_key) WHERE record_request_key IS NOT NULL;
