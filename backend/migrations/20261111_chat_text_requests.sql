-- Durable, sender-private text receipts. Intentionally NO foreign keys: deleting
-- a message, room, user or company must not cascade away the key/tombstone.
-- Do not expire, truncate or recycle receipts while a request can be retried.
CREATE TABLE IF NOT EXISTS chat_text_requests (
  company_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  request_key text NOT NULL,
  room_id text NOT NULL,
  fingerprint_version integer NOT NULL,
  payload_hash text NOT NULL,
  original_message_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_text_requests_pkey PRIMARY KEY (company_id, actor_id, request_key),
  CONSTRAINT chat_text_requests_key_valid CHECK (request_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  CONSTRAINT chat_text_requests_room_valid CHECK (char_length(room_id) BETWEEN 1 AND 255 AND room_id NOT LIKE 'support-ticket-%'),
  CONSTRAINT chat_text_requests_version_valid CHECK (fingerprint_version = 1),
  CONSTRAINT chat_text_requests_hash_valid CHECK (payload_hash ~ '^[0-9a-f]{64}$')
);
