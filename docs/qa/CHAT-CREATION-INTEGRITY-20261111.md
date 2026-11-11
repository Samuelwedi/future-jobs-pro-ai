# Backend chat creation integrity

## Scope and compatibility

This checkpoint changes only the two HTTP chat-creation routes and their local transaction/validation helpers. There is no schema migration, membership repair, history rewrite, provider call, deployment, or native-client change.

- Direct creation keeps the existing sorted-pair room ID and `{ success: true, roomId }` response. IDs are canonical lowercase UUID strings, so casing aliases cannot create a second room or bypass the self-chat check. Noncanonical UUID text forms, objects, numbers, and whitespace-padded IDs now receive 400 rather than coercion or database errors. Canonical existing room IDs remain unchanged; historical IDs made from noncanonical spellings are not discovered, renamed, or migrated.
- A new room and all its memberships commit in one transaction. If a membership write fails before commit, the room is rolled back too. The authenticated actor remains authoritative; `userId1` and `creatorId` supplied by a caller cannot impersonate another user.
- Both routes lock the complete participant set in UUID order, then check the **current database** actor and recipients for activity and a common company. Legacy `is_active = NULL` remains eligible, consistent with existing authorization. Current role does not add restrictions or grant additional members. A role claim in a token grants nothing extra.
- The existing application subscription gate already rejects inactive actors/companies and stale company claims. The route checks are additional protection and also close changes between the gate/read and transaction. The locked actor's company must still match the gate's checked company (or a company claim when testing the route alone). This is not a claim that inactive actors previously bypassed the application gate.
- Direct-ID conflicts are read under a room lock and accepted only for a non-group room in the actor's current company with **exactly** those two current memberships. Missing/removed/extra members, orphaned rooms, wrong-company rooms, and ambiguous null group flags receive 409 without a room ID. No old membership is restored, no new grant is added, and no legacy room is overwritten. Two users moving together to another company does not repurpose their former room/history.
- Group creation keeps its name trimming, ID format, creator membership, deduplication, and response shape. A name must be a string, at most 100 characters and without NUL. The request accepts 1–100 submitted member IDs before deduplication, with the creator added once. This new bound prevents unbounded participant locking. Only requested participants plus the creator are added.
- Groups still have **no durable idempotency key**. Two successful requests create two groups. A lost response or lost COMMIT acknowledgment is not proof of rollback, and blindly retrying may duplicate a group. The server does not retry creation internally. An unacknowledged COMMIT returns a generic failure and discards the connection even when a later ROLLBACK returns successfully.

## Locking and failure boundaries

Every creation uses one checked-out client, `BEGIN`, local five-second lock and ten-second statement timeouts, ordered user row locks, room/member work, and `COMMIT`. The bounded participant set and bulk member insert keep query count constant. Ordinary validation and SQL errors attempt rollback; a failed rollback or any unacknowledged commit discards the client. Definite pre-commit lock/statement/deadlock failures return 503 with a reminder to check existing chats, without an automatic retry. Pool acquisition itself retains the existing pool configuration.

Overlapping participant sets use the same user-lock order. Direct creation uses the existing room primary key with `ON CONFLICT DO NOTHING`, and validates the conflict winner rather than overwriting it. The existing room's `FOR UPDATE` lock blocks new FK-backed memberships; existing membership rows are also locked against removal/replacement. Reading at most three memberships is sufficient to reject any non-pair room. This relies on the room/member primary keys and immediate foreign keys already defined in `backend/scripts/add-chat-rooms-tables.js`; it does not create new constraints. Other administrative operations may use different lock orders; timeout/deadlock handling fails closed rather than claiming system-wide deadlock freedom.

A failed COMMIT attempt is conservatively treated as unknown even if its injected error resembles a retryable SQL code. The test that commits successfully and then throws proves that persisted rows remain and there is no second attempt. A subsequent rollback acknowledgment cannot undo that successful commit.

## History reviewed before editing

- All local refs touching `backend/src/routes/chatRoutes.ts` and the chat service were inspected. Work started from privacy checkpoint `2bad18c1f3631d7687f6458837478f09c666428b` in a separate `fix/backend-chat-creation-integrity-20261111` worktree, not the frozen release worktree.
- `1d1efa6` introduced deterministic direct IDs, separate room/member autocommit writes, and unconditional reuse of an existing matching ID.
- `a4a7506` made the authenticated actor authoritative, added group recipient eligibility checks, and wrapped group writes in a transaction, but the checks remained before that transaction.
- `dfb8324` restored messaging emissions/exported access helpers without repairing creation atomicity. `6b7975b` added media support. The current privacy checkpoint changed history authorization, not creation.
- The older `chatService.createDirectRoom/createGroupRoom` exports have no callers in current tracked sources. They are not used by these routes and are outside this bounded repair.

## Verification

`backend/tests/chat-creation-integrity.test.cjs` loads TypeScript in memory, verifies real JWTs, mounts both the real application subscription gate and an isolated router, and executes real SQL in synthetic PGlite with loopback HTTP. The real database configuration and application entry point are never imported. External providers are forbidden stubs. No production data or credentials are used.

Before source edits, the original 17-case regression file produced 6 passes and 11 failures. After expanding failure-boundary and race coverage, the final 23 cases produced **5 passes and 18 failures** against unchanged `2bad18c` sources. The expanded old-route race test forces two autocommit reads to see an absent room before either inserts, reproducing the duplicate-key failure deterministically.

The final candidate passes:

- 23 creation regressions: auth/gate checks, inactive/missing/foreign/moved recipients and actors, stale claims, role-neutral membership, atomic direct/group rollback, legitimate reuse, exact membership and tenant/type mismatch, malformed input, UUID casing, eligibility changes before checkout, reversed/overlapping requests, exact ordered lock parameters, a simulated conflicting insert winner, lock failures, acquisition/BEGIN failures, pre-COMMIT failure, persisted-but-unacknowledged COMMIT, rollback failure/discard, and the explicit lack of group retry identity.
- 12 existing company-history privacy regressions.
- 13 existing chat-media/profile, support-media, complimentary-access and included company-billing tests against current source through a temporary `dist`-to-`src` require shim, with external HTTP/fetch blocked.
- Backend TypeScript `--noEmit` and `git diff --check`.

Commands from the worktree root:

```sh
node --test --test-concurrency=1 backend/tests/chat-creation-integrity.test.cjs backend/tests/chat-company-scope.test.cjs
./backend/node_modules/.bin/tsc --noEmit -p backend/tsconfig.json
git diff --check
```

Negative control uses the same test file with `CHAT_CREATION_SOURCE_ROOT=/absolute/path/to/unchanged/backend`. The existing suites were run with `node -r /tmp/chat-creation-integrity-source-only.cjs --test --test-concurrency=1 backend/tests/chat-media-profile.test.cjs backend/tests/support-media.test.cjs backend/tests/complimentary-access.test.cjs`; that local review shim changes only source resolution and forbids external transport.

PGlite has a single session. Overlapping checked-out clients are serialized in the test pool, with separate explicit autocommit race/conflict injections and SQL lock-order assertions. These checks do **not** prove real multi-connection PostgreSQL lock timing, live service behavior, or an end-to-end device flow. No emitted builds were run, and the full release script (which invokes a build and does not automatically list this new test) was not run. The focused source-only commands must be included explicitly in subsequent integration checks.

Independent review approved the exact frozen route, regression suite, and QA note before checkpointing. The reviewer independently reran all 48 focused source tests, four additional adversarial probes (null-company actor, the 100-entry boundary, group-ID collision without mutation, and lost COMMIT acknowledgment classification), backend noEmit, and diff-check; all passed. The approved route and test hashes were preserved during checkpointing. No release/current worktree was edited.
