ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_email text;
