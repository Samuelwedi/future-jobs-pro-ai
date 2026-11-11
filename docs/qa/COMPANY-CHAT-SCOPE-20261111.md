# Company chat history authorization repair

## Scope and compatibility

`GET /api/chat/company/:companyId` retains its `{ success: true, messages: [...] }` response, message/sender/attachment fields, and latest-200 selection (`created_at DESC, id DESC`, then reversed for chronological display). Filtering now happens in SQL before the limit:

- The requester must be an existing active user whose current database company matches the requested company. As in `roomAccess`, legacy `is_active = NULL` is treated as active; `FALSE` is denied. The normal application subscription gate continues to enforce company activity and entitlement.
- Each returned message must belong to a real room with the same company as the message and the requester, and the requester must have a current `chat_room_members` record for that room. An `EXISTS` check avoids duplicate messages from duplicate memberships. The SQL also rechecks the requester's activity and company, so a change after the initial user lookup does not expose messages.
- Support-ticket-prefixed rows are always excluded from this general aggregate, even if a room/membership record exists. Existing room-history endpoints keep their established ticket-owner, company-manager, and support-role checks. No new support grant is introduced.
- Null, empty, orphaned, and historical company-ID room values do not grant company-wide access. A company-ID room becomes readable here only when an actual same-company room and current membership prove access. No data is deleted or backfilled, and no implicit membership is created.
- A legitimate current member keeps access to their direct/group histories and attachment metadata. A same-company nonmember gets an empty successful aggregate; an elevated role alone does not grant access. Existing room-history and attachment-content routes are unchanged.

The endpoint remains available for older clients, but formerly exposed private or unproven legacy content is intentionally removed from its response. There is no claim that all previously distributed clients have been inspected.

## Source history inspected before editing

- `f850814` (2026-06-04) introduced company-only history. The contemporaneous web client used the company ID as its broadcast room ID.
- `4b64c06` (2026-06-04) moved the web caller to room history while retaining the company endpoint.
- `3769726` (2026-08-11) added `roomAccess` to room history and sending, but left company history company-only.
- `6b7975b` (2026-10-11) added the current attachment metadata and latest-200 ordering without adding aggregate membership checks.
- Current tracked web/mobile sources have no company-history endpoint caller. This does not prove no old distributed client uses it.
- The route is identical in recovered `9c134b4` and frozen release base `6125f576b215a8c86ce6ab93476530ebea4564e9`. The fix is isolated on `fix/company-chat-scope-20261111`, not applied to the release worktree during development.

## Verification

The new `backend/tests/chat-company-scope.test.cjs` loads real TypeScript sources in memory, actual JWT verification and the actual subscription gate. It runs real SQL in PGlite and HTTP on loopback. The application entry point and real database configuration are not imported. Provider imports are stubbed, and attachment bytes are synthetic local data.

All 12 new tests pass. Coverage includes authentication, employee and elevated-role nonmembers, authorized direct/group members, attachment/sender fields, duplicate memberships, cross-company and mismatched message/room company records, inactive/missing/moved users, stale JWT claims, membership removal/rejoin, support separation with existing role access, null/unroomed/company-ID history, latest-200 ordering with timestamp ties, and authorization changes between the initial lookup and history SQL. The bounded fixture includes 205 authorized rows plus 240 newer unauthorized rows to prove filtering occurs before limiting.

Negative control: the same 12 tests run against unchanged recovered sources produce 3 passes and 9 expected failures, including direct/group/support message and attachment-metadata disclosure to a nonmember. The baseline and release route sources are identical. This proves the regression tests reject the original implementation; it is not evidence of exploitation or live-service access.

Commands from the repository root:

```sh
node --test --test-concurrency=1 backend/tests/chat-company-scope.test.cjs
./backend/node_modules/.bin/tsc --noEmit -p backend/tsconfig.json
git diff --check
```

Negative control accepts a local backend source root without modifying that checkout:

```sh
CHAT_SCOPE_SOURCE_ROOT=/absolute/path/to/unchanged/backend \
  node --test --test-concurrency=1 backend/tests/chat-company-scope.test.cjs
```

All 13 relevant existing chat-media/profile, support-media, company-billing and complimentary-access tests pass against current TypeScript source through a temporary in-memory `dist`-to-`src` require redirector, with external HTTP/fetch calls blocked. `complimentary-access.test.cjs` includes the company-billing suite, so it need not be passed twice. Backend TypeScript `--noEmit` and diff whitespace checks pass.

Independent review approved the unchanged route and test source: a distinct 30-observation HTTP/PGlite verifier passed, as did an independent rerun of all 12 new regressions. The release test script uses an explicit file list and does not include this new suite automatically; release checks must run the source-test command above explicitly.

This is a focused local verification, not the full backend release suite, an emitted build, or real multi-connection PostgreSQL concurrency testing. No live messages were inspected. No real database migration, provider call, external upload, payment, deployment, or production change was performed. The candidate remained uncommitted and the frozen release worktree remained unchanged through verification and independent review.
