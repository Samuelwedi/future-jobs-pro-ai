# Attachment schema deployment prerequisite

Before API deployment, `node scripts/run-release-predeploy.cjs` must complete
against the target database. It now runs `run-attachment-schema-migration.cjs`
before receipt migrations. Do not bypass this gate: time-entry listings query
`attachments` directly. Missing schema remains an error, not an empty list.

The migration is transactional, with a 10-second lock timeout and 60-second
statement timeout. A read-only `SELECT gen_random_uuid()` first checks the UUID
function. The migration never installs extensions. If the function is absent,
the database owner must provide it before deployment. Modern PostgreSQL has it
built in. Existing UUID primary-key tables `companies`, `users`, `shifts`,
`time_entries`, `projects`, and `tasks` must already exist. The migration role
needs privileges for the additive table, column, and index operations.

`20261111_attachment_schema.sql` contains only the attachment portion of the
existing August migration: create `attachments` with the existing foreign keys
and indexes if absent, and add missing `task_id`, `subject_user_id`, and
`category` columns. Existing rows receive the existing `general` default if
category is first added. The original August script remains unchanged and is
not wired into predeploy. No notifications or extensions are touched.

There are no deletes, permission changes, attachment URL/content rewrites, or
external side effects. Existing rows and tenant/access fields remain intact.
Existing ON DELETE CASCADE rules are preserved. Repeated runs use IF NOT EXISTS.
After applying SQL, the runner selects all API attachment fields with LIMIT 0
before committing. An incompatible existing table missing other required columns
fails verification and rolls back rather than being repaired speculatively.

Tests execute the exact attachment SQL in PGlite, including the UUID check,
and cover reruns preserving rows/access fields, the time-entry query,
incompatible schema, missing prerequisites, and predeploy failure propagation.
This verifies local behavior, not the live production database state.
