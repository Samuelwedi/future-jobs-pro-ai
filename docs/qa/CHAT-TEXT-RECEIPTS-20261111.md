# Durable ordinary text message receipts, backend checkpoint

Base: `b004025db9658e21a9d0c8903fe9de56a4922103`. Isolated branch: `feat/chat-text-receipts-20261111`.
The later native group-limit and web creation checkpoints have no backend overlap.

## Scope and compatibility

This adds an opt-in, durable save receipt for ordinary direct/group **text** messages.
It does not add a client outbox, change client retry behavior, or restore old queued chats.
Existing native/web uncertain sends remain memory-only; old unkeyed offline chat entries
remain review-only. Native/web consumers must be separate reviewed checkpoints.

Dedicated `POST /api/chat/message-requests` and Socket.IO `chat-text-request` are the
sole durable transports. Both require `requestKey`, `expectedCompanyId` and
`expectedActorId`. Existing
legacy `/api/chat/message` and `chat-message` handlers reject an own `requestKey`
property on upgraded replicas, even when its value is invalid. There is no fallback
to an unkeyed insert. Existing no-key HTTP/socket sends retain
legacy validation, authorization and response behavior and do not query the receipt table.
Their existing authorization-read/save race is not retrofitted in this bounded checkpoint.
HTTP support policy and socket support policy intentionally remain different: HTTP has
subscription/password gating plus existing role checks; customer sockets allow ticket
owners' support access despite unpaid/temporary-password state, but no customer role
confers platform-agent rights. Keyed support-room requests are explicitly unsupported.

## Stable client contract (version 1)

POST `/api/chat/message-requests`, or Socket.IO `chat-text-request` with a sender acknowledgement:

```json
{"roomId":"direct-or-group-room","message":"Hello","requestKey":"stable-key-0001","expectedCompanyId":"00000000-0000-4000-a000-000000000001","expectedActorId":"00000000-0000-4000-a000-000000000002"}
```

Only these five fields are accepted for keyed sends. `requestKey` is 8–128 ASCII
characters, first alphanumeric, then alphanumerics or `. _ : -`, with no whitespace.
`expectedCompanyId` and `expectedActorId` are canonical lowercase UUIDs and are
constraints, never authority. The expected actor must equal the authenticated actor;
a mismatch returns 403 `CHAT_REQUEST_OWNER_MISMATCH` without IDs or receipt metadata, before receipt admission or
lookup. Durable records retain their original actor/company across account changes.
`roomId` is an exact nonempty string of at most 255 UTF-16 code units, without outer
whitespace. Raw `message` is 1–5000 UTF-16 code units; `.trim()` is applied once and
must leave nonempty text. Room/text cannot contain NUL or unpaired UTF-16 surrogates.
No Unicode normalization, case conversion, internal whitespace changes or key trimming
is applied. Different intentional messages require different keys, including identical text.

HTTP success is 200. Socket acknowledgement has the same JSON body, only to its sender:

```json
{"success":true,"message":{"id":"saved-message-uuid","sender_id":"actor-uuid","company_id":"company-uuid","room_id":"direct-or-group-room","message":"Hello","attachment_id":null,"created_at":"...","sender_name":"Current name","sender_avatar":null,"attachment_name":null,"attachment_type":null,"attachment_size":null},"request":{"key":"stable-key-0001","actorId":"actor-uuid","companyId":"company-uuid","roomId":"direct-or-group-room","state":"saved","replayed":false}}
```

The message has the existing public saved-message shape and current sender metadata.
A same-key/same-payload replay returns the same message ID with `replayed:true`.
Only the first newly committed save invokes authorized room delivery. All peer events
and history contain the public message alone, never keys, hashes or receipt wrappers.

GET `/api/chat/room/:roomId/requests/:requestKey?expectedCompanyId=...&expectedActorId=...` returns the same
success wrapper with `replayed:true`. This read is sender/company/room/key scoped and
reauthorizes the target even when the key is missing. It is `Cache-Control: no-store`.
Both expected identity query fields are required; no other query fields are accepted.

Errors have `{success:false,code,message}`. Authorized missing/unavailable results also
include `request:{key,actorId,companyId,roomId,state:"missing"|"unavailable"}`.
Authorization errors do not expose receipt existence or metadata.

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | CHAT_REQUEST_INVALID | Malformed keyed body or status query. |
| 400 | CHAT_REQUEST_ENDPOINT_REQUIRED | A key was supplied to an upgraded legacy transport; use the dedicated durable transport. |
| 400 | CHAT_REQUEST_SUPPORT_UNSUPPORTED | Keyed support rooms are out of scope. |
| 401/402/403 | AUTHENTICATION_REQUIRED / SUBSCRIPTION_REQUIRED / PASSWORD_CHANGE_REQUIRED / CHAT_ACCESS_DENIED | Current account, company, token, entitlement, password or target authorization failed. |
| 404 | CHAT_REQUEST_NOT_FOUND | No receipt seen by this authorized read. |
| 403 | CHAT_REQUEST_OWNER_MISMATCH | Authenticated account differs from the immutable expected owner; no IDs or receipt metadata disclosed. |
| 409 | CHAT_REQUEST_CONFLICT | This owner/company key already belongs to a different room or canonical text. |
| 410 | CHAT_REQUEST_UNAVAILABLE | Original saved row is absent or no longer matches its immutable receipt. |
| 503 | CHAT_REQUEST_SCHEMA_UNAVAILABLE | Required receipt schema/uniqueness is absent; no legacy fallback. |
| 503 | CHAT_REQUEST_UNCERTAIN | COMMIT acknowledgement was lost; actual save may have succeeded. |
| 503 | CHAT_REQUEST_RETRY | Another save/status failure; retry only the same immutable request/key. |

Rolling-deploy safety: untouched older replicas ignore `requestKey` on the legacy
path/event and could save an untracked row. The dedicated route instead returns 404
on older HTTP servers; the dedicated socket event has no old listener and no ACK.
Neither performs a write. Clients must preserve the same immutable pending request
and retry the dedicated transport later, **never fall back to a legacy route/event**.
An unknown old-server 404 body is not a typed receipt status. The negative-control
fixture contains untouched source excerpts from the exact baseline commit and proves
both no-write behavior and the old legacy-key-ignorance defect it prevents.

A receipt proves server persistence only, **not recipient delivery or reading**.
A 404 is not proof that another in-flight transaction cannot later commit. Never use it,
a timeout, an uncertain COMMIT, or a 410 to generate a replacement key automatically.
Later clients must persist and validate the entire immutable actor/company/room/key/text
record before dispatch and validate response identity before removing local records.
Current sender names/avatars may change between replays and are not fingerprinted.

## Transaction, authorization and deletion decisions

The versioned SHA-256 input is UTF-8 JSON of `["chat-text",1,roomId,canonicalText]`.
A separate `chat_text_requests` table has primary key `(company_id,actor_id,request_key)`.
It stores exact room, version/hash, original message ID and creation time, never an
in-progress state. The claim, text insert, room timestamp touch and completed receipt
are all inside one checked-out transaction. A conflicting insert waits on PostgreSQL
uniqueness and then reads the winner; no text provider side effects are involved.

User/company rows and applicable complimentary sponsor are share-locked. The room is
update-locked up front to avoid shared-to-update lock upgrades on `updated_at`; the
actor membership is share-locked. Database transfer/revocation/deletion cannot pass
these checks unnoticed while the locks are held. Deadlock/timeout failures roll back
and permit the same-key retry. JWT/request-start/connection company and the supplied
expected company are independent constraints. The supplied expected actor must match
authenticated identity and never replaces the actor used for database authorization
or receipt keys. Socket metadata is frozen server-side.
Token validity and finite JS-Date/millisecond entitlement deadlines are checked again
after awaited reads and immediately before COMMIT, because wall-clock expiry is not
frozen by row locks. Complimentary access uses the configured active owner/boss sponsor.

Replays/status share-lock and validate the saved message's original company, room,
actor, exact text hash and null attachment kind. Receipts have deliberately **no foreign
keys and no expiry/deletion task**. Message/room/account deletion cannot cascade away
a key. Missing or mutated saved rows return unavailable, never a replacement insert.
Operators must preserve these tombstones; no maintenance tool may recycle a key.

The database client is released before `emitAuthorizedRoom`. Existing recipient-by-
recipient current authorization and delivery failure suppression are retained.
Only a newly acknowledged commit emits; a lost COMMIT response followed by recovery
may have no realtime notification, so ordinary history/reconnect stays authoritative.
An uncertain COMMIT discards the connection without compensation or deleting a claim.

## Migration and release gate

New additive `20261111_chat_text_requests.sql` and testable
`migrate-chat-text-requests.cjs`. The old checksum-tracked chat-media SQL is unchanged.
The required predeploy step runs immediately after chat-media. The runner uses the
release advisory lock, bounded lock/statement timeouts, a checksum ledger, and verifies
required non-null typed columns, nondeferrable exact scoped uniqueness, validation
checks and absence of foreign keys. It verifies structure even on repeat applies.
Failures stop later predeploy steps. No live migration has been run.

## Verification

The results below describe the original 046a144 checkpoint. The required
`expectedActorId` follow-up is tracked separately in
[CHAT-TEXT-OWNER-CONSTRAINT-20261111.md](CHAT-TEXT-OWNER-CONSTRAINT-20261111.md).

Independent final review approved the revised dedicated-transport candidate:
**144/144 source tests passed** (37 transport/receipt, 9 migration, 98 existing chat
regressions), plus **12/12 reviewer-only probes** and a separate **3/3 predeploy
suite**. Backend `tsc --noEmit` and `git diff --check` passed. The reviewer verified
all 14 changed/new non-document file hashes and all 388 backend input hashes stayed
unchanged during final validation, and independently matched the old-source fixture
excerpts and full-file SHA metadata to the exact baseline commit.

Coverage includes HTTP/socket cross-transport and overlapping same-key sends, full
private identity and public metadata, different payload/room conflicts, actor/company
isolation, strict Unicode/key validation, current authorization and deadline changes,
rollback/deadlock/timeouts, actual COMMIT followed by lost acknowledgement, permanent
key tombstones, recipient revocation, adapter failure, single-slot pool behavior,
legacy support policy compatibility, additive migration failures, and mixed-version
old-server no-write negative controls.
Tests run production TypeScript transpiled in memory, real local HTTP/Socket.IO and
synthetic PGlite SQL. No emitted build, app boot, provider call, live data, upload,
publication, deployment, payment or native build is part of this checkpoint.

PGlite has one database session. The fixture serializes checked-out clients and
pool queries, exercises overlapping HTTP/socket requests, SQL rollback and lost-COMMIT
recovery, but does not establish multi-connection PostgreSQL scheduling/locking behavior.
A separate single-slot fixture assertion fails any nested pool lookup while the transaction
holds the only client and checks that notification fan-out starts after release.
Real PostgreSQL contention and deployed multi-replica acceptance remain unrun. Local
PostgreSQL server/client executables were unavailable; no external database was used.
