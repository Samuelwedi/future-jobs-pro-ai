# Room history pagination checkpoint

## Scope and history

Isolated branch `feat/chat-history-pagination-20261111`, based on the verified combined candidate `5ddaf28faebf4fec164afab3cf53fb3af66c7e9b`. No company-history, inbox, chat creation, socket runtime, message mutation, UI or schema change is included.

Reachable history was inspected before implementation. `1d1efa6` introduced both room-history aliases; `3769726` added the existing room/support authorization; `6b7975b` changed the reads to the latest 200 rows in descending timestamp/ID order, reversed for display. No prior cursor or pagination implementation was found. The unchanged 450-row fixture returns only rows 251–450, leaving older history and larger reconnect gaps inaccessible.

## API contract

Both `GET /api/chat/room/:roomId` and `GET /api/chat/messages/:roomId` use one implementation.

- No query parameters: preserve `{ success: true, messages }`, with the latest 200 authorized rows and the existing message fields/order.
- Opt in with `?limit=1..200`; use optional `before=<opaque cursor>` for strictly older messages. `before` alone defaults to 200. Only these two query keys are supported.
- Opted-in responses add top-level `hasMore: boolean` and `nextCursor: string | null`. A limit-plus-one sentinel determines whether more rows exist. It is never returned as a message. Messages in each page remain chronological under the legacy order.
- `nextCursor` is the oldest returned row's opaque versioned UUID anchor when `hasMore` is true, and null at exhaustion. It belongs to this response page, not an accumulated client message list.
- On reconnect, clients fetch a new latest page and retain its continuation separately from the older-history continuation. Follow that new continuation until overlap with previously retained message IDs or true exhaustion. Do not infer continuity from a newly arrived socket message or from the oldest merged message.
- Invalid, malformed, deleted, missing or out-of-scope anchors produce identical `400` responses: `{ success: false, code: 'CHAT_CURSOR_INVALID', message: 'History cursor is invalid. Refresh the conversation.', refreshRequired: true }`. Clients must offer an explicit refresh. This response is not lost access and does not silently restart at the newest page.
- Unknown keys and invalid limits produce `400 CHAT_QUERY_INVALID`; arrays, repeated keys and nested query forms are rejected. Cursors are capped at 128 characters; the complete raw query is capped at 1,024 characters.

The cursor is not a credential or signed authorization grant. It contains only a version and message UUID and is resolved again inside the authorized room/company. No JavaScript timestamp is used in cursor comparisons. PostgreSQL compares the exact original `(created_at, id)` tuple, including microseconds and equal timestamps. Legacy null timestamps retain `DESC NULLS FIRST, id DESC`; a null anchor includes lower-ID nulls followed by dated messages, while a dated anchor never re-enters the null segment.

## Permission and privacy boundaries

The history statement rechecks the active database actor and company, the gate's request-start company, any token company claim, required password changes, current paid/trial entitlement, and current complimentary sponsor eligibility. A transfer during an in-flight request cannot switch that request to another company. Entitlement comparison preserves the existing JavaScript Date ceiling, non-finite-date rejection, millisecond expiration semantics and current-period-end precedence over legacy expiry.

Ordinary rooms require current same-company membership. Support rooms preserve the exact HTTP rule: ticket owner, case-sensitive global `admin`/`support_agent`, or case-sensitive `boss`/`manager` in the ticket's company. The normal HTTP subscription/password gate still applies to these chat aliases; socket support exceptions are not imported into HTTP history.

Authorization, anchor resolution and message selection share one SQL snapshot. Anchor and messages must match the authorized room and company. Attachment name/type/size are joined only for the same room with the corresponding company, not merely by attachment ID. Sender joins and membership deduplication remain intact. Revoked access cannot be mistaken for a valid empty page.

Company aggregate privacy, support endpoints, socket recipient policy, creation transactions and attachment downloads are unchanged.

## Local verification

Tests run current TypeScript in memory with real loopback Express/JWT and synthetic PGlite records. No emitted build, application startup, live database, external provider, upload, payment, deployment or release action is part of this checkpoint.

- New pagination/security suite: **36/36 passed**, covering both aliases, sizes 0/1/199/200/201/450, limit boundaries, exhaustion, alias cursor interchange, tied timestamps, microseconds, nulls, newer insertions, 450-row reconnect gaps, malformed queries, missing/deleted/wrong-room/company anchors, active/member/tenant/role/owner/entitlement/password/sponsor races, support matrix and metadata privacy.
- Negative control against unchanged `5ddaf28`: all 10 selected 450-row/cursor/query-validation/permission/entitlement checks fail, including stale `200` responses after revocation. The changed implementation passes those cases.
- Combined pagination, company-history, inbox, atomic creation, chat media/profile, support media, complimentary/company-billing and socket-current-authorization source regressions: **111/111 passed**, without failures or skips. The older media fixture now includes the production subscription/support schema needed by the shared history read; three explicit import allowlists include the new helper.
- Backend TypeScript `--noEmit` and `git diff --check` pass.
- Independent review approved the exact frozen eight-file candidate. The reviewer separately passed all **111 regressions**, five supplemental adversarial/parity tests, noEmit, whitespace checks and frozen-file hash verification. Only this QA approval wording changed afterward; reviewed runtime and test bytes are preserved.

Direct commands from the repository root:

```sh
node --test --test-concurrency=1 backend/tests/chat-history-pagination.test.cjs backend/tests/chat-company-scope.test.cjs backend/tests/chat-inbox.test.cjs backend/tests/chat-creation-integrity.test.cjs backend/tests/socket-current-authorization.test.cjs
./backend/node_modules/.bin/tsc --noEmit -p backend/tsconfig.json
git diff --check
```

Existing dist-oriented tests use a temporary in-memory dist-to-src require shim with external HTTP/fetch blocked, rather than building or trusting stale compiled files. The negative control sets `CHAT_HISTORY_SOURCE_ROOT` to an unchanged backend checkout. The release script's explicit test list does not automatically include this new suite.

## Limits and follow-up

PGlite fixtures inject changes before the final SELECT and between page requests. They prove the permission snapshot and keyset semantics, not real multi-session PostgreSQL load, physical-device acceptance or deployment behavior. A change committed after the SELECT's snapshot can race that already in-flight read, as with normal PostgreSQL statement snapshots. Concurrent newly backdated messages can fall into already-traversed ranges; these reads are not a durable multi-request snapshot.

The existing index is `(room_id, created_at)`. No migration is included. Before large-room rollout, measure real query plans and latency. A separately reviewed index including room/company, descending timestamp and ID may help pagination and ties; exact ordering and need require evidence and separate approval. Native/web clients and their recovery state are separate checkpoints. Production/store/release acceptance remains open.
