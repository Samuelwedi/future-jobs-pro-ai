-- Existing legacy slips have no reliable employer provenance. Do not infer it from current employee membership.
CREATE TABLE IF NOT EXISTS reviewed_year_end_slips (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id UUID NOT NULL REFERENCES companies(id),
 employee_id UUID NOT NULL REFERENCES users(id),
 tax_year INTEGER NOT NULL CHECK(tax_year BETWEEN 2000 AND 9999),
 form_type TEXT NOT NULL CHECK(form_type IN ('T4','T4A','RL1')),
 snapshot JSONB NOT NULL,
 preview_hash TEXT NOT NULL CHECK(preview_hash ~ '^[a-f0-9]{64}$'),
 reviewed_by UUID NOT NULL REFERENCES users(id),
 review_reference TEXT NOT NULL CHECK(length(review_reference) BETWEEN 8 AND 500),
 generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(company_id,employee_id,tax_year,form_type)
);
CREATE INDEX IF NOT EXISTS reviewed_year_end_company_year ON reviewed_year_end_slips(company_id,tax_year);
