# Read-only Lucy background work

Lucy has two distinct durable read-only work modes. Apply the additive migrations through the release process, including `backend/migrations/20261108_lucy_work_modes.sql` for an existing three-table Lucy workspace. The release predeploy runner applies and verifies these migrations atomically. No migration or provider calls happen on import.

- `ai_research`: Existing open-ended AI research. **Disabled by default.** It requires `LUCY_BACKGROUND_WORK_ENABLED=true` and the registered restricted AI processor. Activation can incur inference spend.
- `record_search`: Model-free company-record investigation. Enabled by default after the source/schema upgrade. `LUCY_RECORD_SEARCH_ENABLED=false` is a separate kill switch for the read load. It never calls a model, classifier, provider, general tool dispatcher, browser, shell, messaging tool, or business-write tool, even on failure.

## API and compatibility

The router is mounted at `/api/lucy-v2/work`. Create with `POST /` and the strict object `{prompt,requestKey,mode?}`. Unknown fields, wrong types and invalid modes are rejected. Omitted `mode` means `ai_research`, preserving legacy client behavior. For `record_search`, `prompt` is a literal search query of 1–200 characters; AI prompts retain the 1–4,000-character limit. Both are trimmed after validation. Use a short phrase, person, status or date rather than an open-ended research instruction for record search.

Preserve the same request key and mode on transport retries. New requests return HTTP 202, identical retries 200, and conflicting keys 409. Request keys are unique across both modes for the same company/user; changing the prompt, mode or authorization role cannot replay another task. Disabled modes return 503 for new submissions, including retries, rather than starting work.

`GET /` returns `{enabled,modes:{ai_research,record_search},jobs}`. `enabled` remains **only the AI flag**, so old clients continue to show AI work as disabled. New clients must use the separate `modes` booleans. `GET /:id` and `POST /:id/cancel` return `{job}`. Every job includes `mode`, `prompt`, `status`, `result`, `error`, `attempts`, `createdAt`, `updatedAt` and `completedAt`. Results remain readable when a mode is disabled, subject to current authorization. Responses never contain request keys or lease tokens.

Jobs and retained results are scoped to the current company, user and stored role. Live active-user/company status, role, password-change requirement, and subscription or complimentary entitlement are revalidated on service access and throughout execution. The application also retains its normal authentication and subscription middleware.

## Deterministic record reports

Record search performs exactly two allowlisted reads: existing tenant/role-scoped work-record search and existing company-document retrieval. Work records use literal phrase matching, with at most seven returned records. Managers see company work; employees see assigned tasks, assigned shifts and related projects. Document search is bounded lexical title/body retrieval with English stemming and Unicode/Latin-accent normalization, not semantic or translated search. Employees can read company-audience documents; managers can additionally read manager-audience documents. Documents may match only some query terms.

Reports list stored titles, IDs, permitted field values and exact document excerpts; they do not infer conclusions or execute retrieved instructions. Evidence uses the existing `{sources,incomplete}` structure, with at most 12 sources, 200-character titles and 1,200-character excerpts. Source truncation and omitted matches produce an explicitly partial result. If one read fails, successful evidence is retained with `source_unavailable`; both reads failing yields a sanitized failure. There is no model fallback.

Local results use `{text,evidence,run:{status,modelCalls:0,steps,stopReason?}}`. `run.status` is `completed` or `partial`; local stop reasons are `retrieval_limits` or `source_unavailable`. Clients must render all source text as inert text, never HTML or instructions. Sources are retrieved records, not verification that their contents are accurate. A no-match result means no match within accessible scope/limits, not proof that no such record exists.

## Worker and safety

For a rolling upgrade, keep the AI flag disabled on all older workers and drain/replace them before accepting local-mode jobs or enabling AI. Older binaries do not filter claims by mode; the new migration alone cannot make an already-running older binary mode-aware.

`configureLucyWorkProcessor(async ({actor,prompt,shouldContinue}) => ({text,run}))` registers **only the AI processor**. Record search is hardwired to the model-free processor and works without AI registration. `startLucyWorkWorker()` starts the queue after the HTTP server listens. Disabled modes are excluded from both expired-lease recovery and claim SQL; disabling AI never claims or rewrites existing AI jobs. The local kill switch works independently. Mid-execution switch-off suppresses publication.

Call and await `stopLucyWorkWorker()` before closing the database during shutdown. Stop disables new claims and continuation checks immediately, drains both queue operations and outstanding processors (even after the queue deadline), and requires an explicit start to resume. Start during a drain is ignored. The AI processor must allowlist read tools, use actor-scoped access, and call `shouldContinue()` before every model call and tool. Its provider transport must have finite timeouts; the queue cannot abort a transport it does not own.

Statuses are queued, running, completed, partial, failed and cancelled. Only completed/partial results are exposed. Errors store a fixed sanitized message, never raw provider or database details. Cancellation suppresses publication but cannot undo a previously submitted AI call. Record mode does not submit AI calls.

Shared limits across both modes: 100 request-key characters, 10 active jobs and 50 requests per rolling 24 hours per user/company; 50 most recent jobs listed; 128,000-byte serialized results; 90-second execution deadline; 120-second fenced lease; three claims maximum. Only expired/lost leases are retried; processor errors are terminal. Request keys remain reserved in retained rows. One local processor runs at a time, including after timeout until the operation settles. SQL `FOR UPDATE SKIP LOCKED` prevents duplicate live claims across processes, and expired/stale workers cannot publish or overwrite newer claims. Database reads retain the configured finite pool query/statement timeouts; document search further limits its statement to five seconds.

## Verification

Run `cd backend && npm run build && node --test --test-concurrency=1 tests/lucy-work.test.cjs tests/lucy-record-work.test.cjs tests/lucy-workspace-migration.test.cjs`. Isolated tests use real PGlite SQL and Express authentication without production connections or paid providers. They cover strict validation, legacy compatibility, tenant/role isolation, poison guards against provider/dispatcher imports, both partial-source failure directions, hostile source text, quotas, cancellation/fencing/recovery, entitlement/password changes, independent kill switches, deployed-schema upgrades, idempotence, and rollback. PGlite is not a substitute for a multi-process PostgreSQL load test.

Comprehensive application SIGTERM/SIGINT draining is not wired here; abrupt process termination recovers through persisted leases. Verify shutdown/restart behavior before enabling AI processing. Retained job records currently have no automatic cleanup policy.
