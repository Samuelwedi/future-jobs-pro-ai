-- Additive compatibility upgrade for legacy installations whose assignment
-- identity is the (shift_id, user_id) primary key. Keep that key in place and
-- add the stable row identity/status required by Operations workflows.
ALTER TABLE shift_assignments
  ADD COLUMN IF NOT EXISTS id UUID;

ALTER TABLE shift_assignments
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

UPDATE shift_assignments
   SET id = gen_random_uuid()
 WHERE id IS NULL;

ALTER TABLE shift_assignments
  ALTER COLUMN id SET NOT NULL;

ALTER TABLE shift_assignments
  ADD COLUMN IF NOT EXISTS status VARCHAR(20);

ALTER TABLE shift_assignments
  ALTER COLUMN status SET DEFAULT 'assigned';

UPDATE shift_assignments
   SET status = 'assigned'
 WHERE status IS NULL OR BTRIM(status) = '';

ALTER TABLE shift_assignments
  ALTER COLUMN status SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_shift_assignments_id
  ON shift_assignments(id);
