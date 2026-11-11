# Assigned-task receipts and notes

## Scope

Native Work Board and web Tasks now have a separate Receipts & notes panel. Employees can attach PDF/JPEG/PNG/WebP receipts up to 10 MB and add notes up to 4,000 characters to tasks assigned to them. Current company managers (including owner/admin roles) can view and add entries. This is evidence collection, not a reimbursement submission, expense approval, payment, or accounting sync. Existing web generic Task files remain separate and unchanged.

New receipt files use authenticated private Cloudinary raw storage through the existing private storage adapter. Provider IDs and signed URLs remain server-side. Download routes return authenticated bytes with no-store and nosniff headers. The API checks the active account's current company and role and current task assignment before multipart parsing, before provider work inside a locked transaction, and again after opening a download stream.

## Deployment

Apply `20261111_task_evidence.sql` before exposing these routes. `run-release-predeploy.cjs` now includes the transactional, fail-closed `run-task-evidence-migration.cjs`; it checks required fields and does not install extensions. No production migration, provider call, upload, publication, deployment, or paid native build was performed for this checkpoint.

The additive table stores task/account/company scope, note, filename/type/size, a private provider identifier, a request fingerprint and a durable processing/completed/uncertain state. No legacy attachment or receipt URLs are migrated by this change.

## Save/recovery behavior

Each submission has a stable request key. The server durably claims it before provider work and refuses different content under that key. Duplicate submissions cannot repeat the provider upload. A successful commit with a lost response can be reconciled from the task's authenticated evidence list. Clients persist only the pending request identity, scoped to account/company/task, and use read-only recovery after dispatch, including across restart. Client account/role changes and modal dismissal fence late responses and uploads; native account/company/role changes remount the board without stale task descriptions.

Conservative limitation: a provider failure, lost claim acknowledgement, or interruption after marking dispatch can leave a pending record indefinitely. The UI explicitly asks the user not to reupload and to ask their manager to investigate. There is deliberately no automatic reset/retry or operator recovery/delete tool in this increment. Provider success followed by database rollback may leave an unreachable private orphan; lifecycle cleanup requires a separate audited operational process. Original receipt source files remain with the user. This is not an offline receipt queue.

## Verification

Local PostgreSQL-compatible PGlite HTTP tests cover current assignee/manager access, coworker and foreign-tenant denial, inactive users, reassignment, private downloads, signature/size/notes validation, same-key replay, mismatched content, provider uncertainty, lost COMMIT acknowledgement, and post-provider download authorization. Migration tests cover rerun, required integration and incompatible-schema failure.

Native tests execute the actual TSX component and API methods with controlled hooks/transports: duplicate taps, pending recovery after remount, picker cancellation, close/account changes, late success, definite rejection vs uncertainty, and keyed task-board scope clearing. Web service tests cover duplicate saves, durable pending recovery, account/modal fencing, downloads, validation, and separate legacy-file/new-receipt UI wiring.

Backend and native TypeScript checks and a local web production build passed. These are local fixture tests, not native-device acceptance, browser visual QA, live Cloudinary verification, or real concurrent PostgreSQL lock testing. Verify device picker, authenticated PDF/photo viewing, download/share behavior, and migration application during authorized acceptance/release work.

Local visual QA attempt: Chromium could not start in this executor (`socket() failed: Operation not permitted`). The temporary fixture and Vite server were removed/stopped; no browser acceptance result is claimed.
