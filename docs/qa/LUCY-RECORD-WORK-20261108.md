# Lucy record-search and report acceptance

This follow-on adds useful background work without an AI provider call. It does not establish general-agent or Meta Muse parity. See `docs/lucy-background-work.md` for the exact API, limits and deployment compatibility contract.

## Implemented behavior

- New clients discover separate `record_search` and `ai_research` capabilities. Record search is the default on supporting servers; omitted API mode and older clients preserve AI-only behavior. AI research remains disabled unless explicitly configured. `LUCY_RECORD_SEARCH_ENABLED=false` independently stops local claims and publication.
- Record search performs only the existing scoped work-record and company-document reads. It returns stored values, exact source excerpts and retrieval metadata, with zero model calls. It does not interpret the records, browse the web, execute source instructions, send messages, change business records or make payments.
- Requests, claims, recovery and retained results remain company/user/role scoped. Current membership, entitlement and password-change requirements are revalidated. Shared quotas, cancellation, three-attempt recovery, fenced leases and bounded results remain in effect.
- A partial result preserves evidence from a successful source if the other source fails, or warns when retrieval limits omit matching records. A no-match result is not proof that no record exists.
- Web downloads produce a validated UTF-8 plain-text snapshot from the loaded result. Completed jobs and strict partial local searches are supported; partial AI jobs are not exported. Partial filenames, headers and warnings cannot imply exhaustive completion.
- Native source mirrors modes and reports with English, Spanish and French controls. The explicit Share report button creates a temporary private cache file and opens the OS destination chooser. There is no upload fallback or automatically selected recipient. Scope checks and synchronous locks protect asynchronous steps, including a shared lock across controller instances.
- Report text is capped at 128,000 UTF-8 bytes, filenames cannot contain the query or arbitrary paths, and no citations are invented. Exact source text is data, not instructions or executable markup.
- The public sample uses the real web panel with fixed synthetic data, no account token/storage/API/model access, and clearly labels downloaded files as synthetic. The entered query is included in the file; the answer is a fixed example, not research.

## Automated verification

On the final source candidate:

- Backend TypeScript build and complete serial test suite: 369 passed, no failures or skips.
- Web production build and complete unit suite: 75 passed, no failures or skips.
- Native TypeScript without emit and complete serial unit suite: 126 passed, no failures or skips.
- Actual PostgreSQL 18.6: two sequential fresh disposable clusters each passed the original ten migration/crash checks, nine new legacy-upgrade and separate-process record-mode checks, and 13 reported API/scoping tests (12 nested cases plus their parent). Both servers shut down cleanly. Source/build hashes stayed unchanged; no production database or model was used.
- Total: 570 passing application tests. Native tests mock the OS-facing file/share APIs; they are not device acceptance.
- Dependency audits: zero web and backend production findings. Four moderate backend development-tool entries remain, excluded from the production image. No dependency or lockfile changes were needed for this follow-on.
- Independent backend/web and native source reviews found no concrete blocker in their scoped review. Exact-tree and deployment verification are separate release gates.

New tests include strict mode payloads and legacy fallback, mode-aware idempotency, disabled AI jobs remaining untouched, record-only claim/recovery/kill switches, model/dispatcher import poison guards, hostile source text, tenant and employee scope, both one-source failure directions, source limits, current entitlement/role changes, cancellation/stale leases, upgrade defaults and transactional rollback. Client tests cover account/source/unmount invalidation, request-key handling, UTF-8 and aggregate bounds, malformed evidence, partial-report labeling, repeated taps, share-sheet overlap and temporary-file cleanup.

## Rollout and acceptance gates

1. Use a new review branch; do not mutate the currently pinned production source branch. Verify the remote source tree and all checks for the exact candidate.
2. Run the disposable PostgreSQL 18.6 harness against the old three-table schema and new mode migration, including true separate-process record claims, recovery, cancellation and unchanged disabled-AI jobs. Do not substitute PGlite for this gate.
3. Verify the preview's synthetic panel and actual plain-text download, then confirm current backup/PITR and rollback availability.
4. Apply backend/schema before clients. Keep older workers AI-disabled and drain them first: an older binary does not understand mode-aware claims. Align Railway branch HEAD with the reviewed pin and check the actual deployment SHA, not only configured source.
5. Verify migration logs, health, unauthenticated route gates and production CORS. Deploy customer web from the same reviewed SHA using existing production settings; do not force-update divergent release branches or change the owner dashboard.
6. Keep paid inference activation and Android/iOS builds subject to separate approval. No new credentials, persistent access, services, billing changes or native app builds are part of this change.

## Remaining limits

The search is bounded literal/lexical retrieval, not semantic reasoning, translation or web research. Source citations establish provenance, not factual accuracy. Production-scale load and live model quality/cost evaluation are not covered by these fixtures. The queue uses persisted lease recovery after abrupt server termination; comprehensive application shutdown integration is still a separate improvement. Retained job rows have no automatic deletion schedule.

Native sharing has not been verified on Android/iOS hardware or distributed in a new app build. Normal completion/error cleans the operation's private cache directory even after close or account changes. Abrupt app termination can leave cache until OS/app cleanup; guaranteed crash erasure is not claimed. Actual OS recipient selection and sharing remain under the user's control.
