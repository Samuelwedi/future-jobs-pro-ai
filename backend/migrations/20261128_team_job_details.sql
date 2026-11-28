-- These are team directory descriptions, never authorization.
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title varchar(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_description varchar(500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS department varchar(100);
-- Keep a legacy department and its values intact, but reject a non-text or
-- incompatible definition rather than silently converting or truncating it.
DO $$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema=current_schema() AND table_name='users' AND is_nullable='YES'
         AND ((column_name IN ('department','job_title') AND
               (data_type='text' OR (data_type='character varying' AND
                    (character_maximum_length IS NULL OR character_maximum_length >= 100))))
           OR (column_name='job_description' AND
               (data_type='text' OR (data_type='character varying' AND
                    (character_maximum_length IS NULL OR character_maximum_length >= 500)))))) <> 3 THEN
    RAISE EXCEPTION 'Team job details schema has incompatible columns';
  END IF;
END $$;
