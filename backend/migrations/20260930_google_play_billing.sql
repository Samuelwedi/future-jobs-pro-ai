-- Token values are encrypted; only their SHA-256 identifiers are indexed.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS google_purchase_hash TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS apple_original_transaction_id TEXT;
CREATE TABLE IF NOT EXISTS google_play_purchases (
 token_hash TEXT PRIMARY KEY CHECK(length(token_hash)=64),
 token_encrypted TEXT NOT NULL CHECK(token_encrypted LIKE 'v2:%'),
 company_id UUID NOT NULL REFERENCES companies(id),
 user_id UUID NOT NULL REFERENCES users(id),
 product_id TEXT NOT NULL,
 status TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 verified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS google_play_company_idx ON google_play_purchases(company_id);
