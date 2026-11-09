-- Additive only. No grant is inserted and no inference is enabled by this migration.
BEGIN;
CREATE TABLE IF NOT EXISTS lucy_inference_grants (
 id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 100),
 fingerprint TEXT NOT NULL CHECK(fingerprint ~ '^[0-9a-f]{64}$'),
 model TEXT NOT NULL CHECK(model IN ('gpt-6.1-sol','gpt-6-astra')),
 maximum_nanos BIGINT NOT NULL CHECK(maximum_nanos>0 AND maximum_nanos<=1000000000000),
 reserved_nanos BIGINT NOT NULL DEFAULT 0 CHECK(reserved_nanos>=0 AND reserved_nanos<=maximum_nanos),
 approved_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
 rate_card TEXT NOT NULL, blocked BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(expires_at>approved_at AND expires_at<=approved_at+interval '604800 seconds')
);
CREATE TABLE IF NOT EXISTS lucy_inference_reservations (
 id UUID PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES lucy_inference_grants(id),
 reserved_nanos BIGINT NOT NULL CHECK(reserved_nanos>0),
 input_tokens INTEGER NOT NULL CHECK(input_tokens BETWEEN 0 AND 20000),
 output_limit INTEGER NOT NULL CHECK(output_limit=4096),
 outcome TEXT NOT NULL DEFAULT 'reserved' CHECK(outcome IN ('reserved','completed','incomplete','uncertain','not_dispatched')),
 observed_input_tokens INTEGER CHECK(observed_input_tokens>=0), observed_output_tokens INTEGER CHECK(observed_output_tokens>=0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lucy_inference_reservation_grant ON lucy_inference_reservations(grant_id,created_at);
COMMIT;
