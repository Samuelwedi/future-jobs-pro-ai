# Durable chat expected-owner constraint

Base: `046a144c40131d7915153bf2c3021195e1b5f3f1`.
Isolated branch: `fix/chat-text-owner-constraint-20261111`.

## Scope and contract

Dedicated HTTP `/api/chat/message-requests` and Socket.IO `chat-text-request` now
require `expectedActorId` as well as `expectedCompanyId`. Status GET
`/api/chat/room/:roomId/requests/:requestKey` requires both expected identity fields
in its query. Both are canonical lowercase UUID constraints, not authority.

The authenticated identity still determines actor authorization and the receipt key.
A different expected actor returns 403 `CHAT_REQUEST_OWNER_MISMATCH`, without
receipt metadata, before any receipt admission or lookup. This prevents a persisted
Alice record from being sent or recovered as Bob after a same-company account switch,
even if a client selected the wrong current token or socket. Missing/invalid actor
constraints return 400 `CHAT_REQUEST_INVALID` with no writes. The owner-mismatch
message is only "This request does not match the signed-in account." Genuine
authentication failures remain 401; changed-payload key conflicts remain 409. The
separate 403/code avoids triggering a valid current account's 401 logout interceptor.

Receipt schema, `(company, actor, key)` namespace, fingerprint version and exact
room/text encoding are unchanged. Previously committed rows remain replayable with
the matching authenticated/expected owner. Existing unkeyed behavior is unchanged.
Clients must retain the original owner/company in their immutable durable record.

The original 046a144 durable parsers reject unknown body and query fields. Therefore
new clients supplying `expectedActorId` fail closed on those older replicas instead
of silently ignoring the actor fence. The dedicated route/event still fail closed on
older pre-receipt replicas. Never fall back to legacy sending or strip the actor
constraint to accommodate a server version. No enabled durable clients predate this
required-field correction.

## Validation

Source edits and review were prepared during the integration quiet window. No test
suite, PGlite run or noEmit check was started during that window. After clearance,
independent final validation passed **152/152 source tests** (42 receipt/transport,
9 migration, 98 legacy and 3 predeploy) and **15/15 supplemental probes**. Backend
`tsc --noEmit` and `git diff --check` passed. All 388 backend inputs and both changed
runtime/test file hashes remained unchanged through review.

The reviewer also executed the exact 046a144 parser as a negative control: a send
with the new fifth field and a status query with both identity fields fail 400 on
that older implementation, while its original valid input still parses. The new
owner constraint therefore cannot be silently ignored by that preceding server.

Verified source-backed cases cover wrong-owner same-company HTTP/socket/status for
missing, saved and unavailable keys; no write or receipt disclosure; independent
correct-owner replay; missing/non-string/noncanonical/NUL/oversized input; repeated
status queries; replay of unchanged pre-constraint receipt rows; and distinct
owner-mismatch 403, genuine authentication 401 and payload-conflict 409 outcomes.

No builds, live schema work, provider calls, uploads, publication or deployment.
PGlite's serialized fixture does not establish multi-connection PostgreSQL behavior.
