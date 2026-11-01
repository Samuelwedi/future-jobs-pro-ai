ALTER TABLE estimates ADD COLUMN IF NOT EXISTS creation_request_key text;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS creation_request_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS estimate_creation_request_unique ON estimates(company_id,creation_request_key) WHERE creation_request_key IS NOT NULL;
