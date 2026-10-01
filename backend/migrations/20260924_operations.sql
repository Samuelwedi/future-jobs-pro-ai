-- Apply after the Command Center migration. No seeds, drops, billing or provider calls.
CREATE TABLE IF NOT EXISTS ops_profiles (
 company_id uuid NOT NULL REFERENCES companies(id), user_id uuid NOT NULL REFERENCES users(id),
 skills text[] NOT NULL DEFAULT '{}', weekly_limit numeric NOT NULL DEFAULT 40 CHECK(weekly_limit>0 AND weekly_limit<=168),
 PRIMARY KEY(company_id,user_id)
);
CREATE TABLE IF NOT EXISTS ops_unavailability (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), user_id uuid NOT NULL REFERENCES users(id),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, CHECK(ends_at>starts_at)
);
CREATE TABLE IF NOT EXISTS ops_budgets (
 company_id uuid NOT NULL REFERENCES companies(id), project_id uuid NOT NULL REFERENCES projects(id),
 revenue numeric(14,2) NOT NULL CHECK(revenue>=0), budget numeric(14,2) NOT NULL CHECK(budget>=0),
 progress numeric NOT NULL CHECK(progress>0 AND progress<=100), currency text NOT NULL CHECK(currency IN ('CAD','USD')),
 overhead_percent numeric NOT NULL DEFAULT 0 CHECK(overhead_percent BETWEEN 0 AND 200),
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(company_id,project_id)
);
CREATE TABLE IF NOT EXISTS ops_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
 title text NOT NULL, body text NOT NULL, audience text NOT NULL CHECK(audience IN ('company','managers')),
 digest text NOT NULL, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,digest)
);
CREATE INDEX IF NOT EXISTS ops_documents_search ON ops_documents USING gin(to_tsvector('english',body));
CREATE TABLE IF NOT EXISTS ops_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), actor_id uuid NOT NULL REFERENCES users(id),
 kind text NOT NULL, request_key text NOT NULL, payload jsonb NOT NULL, result jsonb NOT NULL DEFAULT '{}',
 state text NOT NULL DEFAULT 'completed' CHECK(state IN ('completed','undone')), created_at timestamptz NOT NULL DEFAULT now(), undone_at timestamptz,
 UNIQUE(company_id,actor_id,request_key)
);
CREATE TABLE IF NOT EXISTS ops_time_studies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), actor_id uuid NOT NULL REFERENCES users(id),
 action_id uuid NOT NULL REFERENCES ops_actions(id), manual_seconds integer NOT NULL CHECK(manual_seconds BETWEEN 1 AND 86400),
 assisted_seconds integer NOT NULL CHECK(assisted_seconds BETWEEN 1 AND 86400), note text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,actor_id,action_id)
);
CREATE TABLE IF NOT EXISTS ops_report_schedules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), created_by uuid NOT NULL REFERENCES users(id),
 cadence text NOT NULL CHECK(cadence IN ('daily','weekly')), next_at timestamptz NOT NULL, enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ops_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), schedule_id uuid REFERENCES ops_report_schedules(id),
 scheduled_for timestamptz, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(schedule_id,scheduled_for)
);
CREATE TABLE IF NOT EXISTS ops_limits (
 company_id uuid PRIMARY KEY REFERENCES companies(id), employees integer NOT NULL CHECK(employees>0),
 monthly_ai_requests integer NOT NULL CHECK(monthly_ai_requests>=0), document_bytes bigint NOT NULL CHECK(document_bytes>=0)
);
CREATE TABLE IF NOT EXISTS ops_usage (
 company_id uuid NOT NULL REFERENCES companies(id), month date NOT NULL, ai_requests integer NOT NULL DEFAULT 0 CHECK(ai_requests>=0),
 PRIMARY KEY(company_id,month)
);
CREATE TABLE IF NOT EXISTS ops_sites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), project_id uuid NOT NULL REFERENCES projects(id),
 latitude numeric NOT NULL CHECK(latitude BETWEEN -90 AND 90), longitude numeric NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 accuracy_m numeric CHECK(accuracy_m>=0), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(company_id,project_id)
);
CREATE TABLE IF NOT EXISTS ops_invites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), created_by uuid NOT NULL REFERENCES users(id),
 email text NOT NULL, first_name text NOT NULL, last_name text NOT NULL, token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days', accepted_at timestamptz, revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ops_invites_pending ON ops_invites(lower(email)) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS ops_swaps (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), shift_id uuid NOT NULL,
 from_user uuid NOT NULL REFERENCES users(id), to_user uuid NOT NULL REFERENCES users(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','approved','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(from_user<>to_user)
);

CREATE UNIQUE INDEX IF NOT EXISTS ops_swaps_active ON ops_swaps(company_id,shift_id,from_user) WHERE status IN ('pending','accepted');
CREATE TABLE IF NOT EXISTS ops_shift_requirements (
 company_id uuid NOT NULL REFERENCES companies(id), shift_id uuid NOT NULL,
 skills text[] NOT NULL DEFAULT '{}', PRIMARY KEY(company_id,shift_id)
);
