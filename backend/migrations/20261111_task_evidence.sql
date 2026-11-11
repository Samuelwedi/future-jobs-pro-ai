-- Apply before enabling task receipt/notes clients. Private provider IDs never leave the API.
CREATE TABLE IF NOT EXISTS task_evidence (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 uploaded_by UUID NOT NULL REFERENCES users(id),
 request_key TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('processing','completed','uncertain')),
 note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=4000),
 file_name TEXT, file_type TEXT, file_size INTEGER, private_id TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(company_id,uploaded_by,task_id,request_key)
);
CREATE INDEX IF NOT EXISTS task_evidence_task_idx ON task_evidence(company_id,task_id,created_at);
