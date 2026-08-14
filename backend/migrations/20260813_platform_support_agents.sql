CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS platform_support_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent'
    CHECK (role IN ('agent', 'supervisor', 'owner')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_by UUID REFERENCES platform_support_agents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_support_agents_email_lower_uidx
  ON platform_support_agents (LOWER(email));

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS assigned_agent_id UUID
    REFERENCES platform_support_agents(id) ON DELETE SET NULL;
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS lucy_summary TEXT;
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';

CREATE TABLE IF NOT EXISTS platform_support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT NOT NULL,
  customer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  support_agent_id UUID REFERENCES platform_support_agents(id) ON DELETE SET NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'agent', 'lucy', 'system')),
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL CHECK (CHAR_LENGTH(message) BETWEEN 1 AND 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS platform_support_messages_ticket_created_idx
  ON platform_support_messages (ticket_id, created_at);

CREATE INDEX IF NOT EXISTS support_tickets_assigned_agent_idx
  ON support_tickets (assigned_agent_id, status, created_at);
