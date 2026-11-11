# Native ordinary-text outbox checkpoint

Base: `6b80edadd6c121aa7d72bda0a2ef2693ff3c3c76`. Branch: `native-chat-queue-20261111`.
Runtime dependency: separately reviewed backend actor-constraint commit
`709c2ee16335f4e11e66a2d6c5b1f56367bcc190`. The native client always sends
`expectedActorId` and `expectedCompanyId`; it never removes constraints to work
around an older server. This checkpoint changes no backend/web source.

## Behavior and boundaries

Ordinary direct/group text uses a dedicated AsyncStorage outbox and only the
keyed HTTP `POST /api/chat/message-requests` plus the scoped receipt GET. It is not
a generic URL queue. Existing media, group creation, support, paging, socket
history/reconnect, null-time-gap handling, and scroll behavior retain their paths.
The explicit `support-ticket-` path remains online-only and unkeyed. An ordinary
keyed rejection never falls back to support or any legacy send. Old generic queued
chat actions remain review-only and are never assigned keys or automatically sent.

Each Send intent allocates one key and freezes original actor, company, room,
canonical text and original role before asynchronous work. Raw UTF-16 validation,
trim-once canonicalization and key/scope constraints agree with the backend.
Each record is separately stored with scoped identity in its storage key. A
monotonic persisted sequence preserves room ordering, including equal timestamps.
Malformed/unreadable entries are retained and reported; known affected rooms are
blocked while other rooms can progress. More than 500 scoped entries stops
automatic processing rather than sending through an incomplete ordered snapshot.
No automatic deletion, migration or replacement-key generation occurs.

Persistence is required before dispatch, and a `sending` state is persisted
before HTTP. A rejected write might have committed. The original intent stays
recoverable in memory and, if written, on restart. New same-room admissions are
blocked while a local write is ambiguous; other rooms can progress. A stale view
cannot start admission. Once the persistence write is acknowledged, leaving that
room does not cancel the durable intent. The composer clears only the unchanged
original draft revision. Newer edits, including the same words retyped, survive.
The Send button does not silently retry different original text; a separate
labeled recovery control displays and retries that original intent.

The app shell runs owner-scoped work across navigation, only while AppState is
active and the user is authenticated without a pending password change. It
listens for network recovery and app resume. Pending work alone schedules a
one-shot backoff timer: no recurring poll when empty, terminally blocked, offline,
or backgrounded. Each serialized batch attempts at most eight records; each
request has a 20-second timeout. Transient failures use persisted exponential
backoff (2 seconds to 60 seconds) and stop after five attempts. Explicit recovery
can make another bounded attempt. A blocked earlier record holds its room; other
rooms proceed. A resume/rebind/new admission while work is in flight records a
coalesced next wake, so an old response cannot strand the new active queue.

Logout closes a synchronous AuthProvider gate and suspends the current runner
before awaited cleanup. The gate remains closed through token/userData cleanup;
old foreground callbacks and replacement effects cannot reset it. Provider epochs
and session guards fence bootstrap/refresh successes and failures, including the
actual API401 interceptor path. Credential and userData writes are ordered before
logout deletion, so pending login/register persistence cannot restore the old
credential after logout. Live token authority is invalidated immediately. A later
intentional login works normally. Runner generations also reject stale listeners
and late cleanup. These changes are bounded to AuthContext.tsx, api.ts, App.tsx
and the outbox runner; auth endpoints and subscription policies are unchanged.
Every request retains API token/auth-revision fences, stored user actor/company/
role checks, foreground/current-context checks, a pre-dispatch stored-user check,
and both server actor/company constraints. Dedicated receipt requests suppress
subscription navigation and unauthorized side effects, reporting access review
instead of surprising navigation from automatic work.

A nonsecret SecureStore login-generation label survives ordinary app restart and
changes on every explicit setToken/login, even if token text is identical. Records
carry approval generation/role separately from their immutable original intent.
Login-generation or role changes stop automatic work and require explicit Check
saved status or Retry same request by the same original actor/company. Profile
name/avatar refresh does not change approval. Owner/company switches never rewrite
or dispatch another owner's record. No token, password or credential is copied to
the text outbox.

A prior possible send first reads status. A typed missing response must match the
full original actor/company/room/key. It is not proof that an overlapping request
cannot commit; retry posts only the exact same immutable key/payload. Unknown old
server404, invalid success, and non-transient4xx stop automatic attempts. Any409
or410 locks the record to status-only recovery, including after later missing
responses. Receipt unavailable never recreates a deleted/mutated original.

Once a canonical saved message UUID is known, validation and storage cannot
rebind that key to another UUID. A contradictory volatile acknowledgement never
replaces the original saved message in a snapshot. Any retained canonical ACK
forces status-only recovery, even when a later status reports missing. Conflicts remain visible for
review and cannot be silently dismissed.

Saved display requires a matching private receipt and public message UUID,
actor/company/room, exact canonical text, valid timestamp, and null attachment
identity/type/name/size. Saved proves persistence, never delivery or reading. A
valid save ACK followed by failed local persistence remains visibly saved and
recoverable, rather than becoming a claimed send failure. Saved receipt dismissal
is explicit, identity-checked and scoped; cleanup failure leaves recovery intact.

## Verification

The exact reviewed tree passed **598/598 full mobile tests**, TypeScript
`tsc --noEmit`, and `git diff --check`. Independent review separately passed
**64/64 focused/auth/new-backend-contract/adversarial checks** and **98/98 old-server
negative-control plus history/reconnect/media/group-cap/localization checks**.
All eight production-file hashes were unchanged before and after the gates.

Source tests execute production TypeScript in memory with synthetic storage,
secure storage, API adapter, app lifecycle and network fixtures. No production
account/provider/network or native app is used. Full tests ran serially with
`CHAT_TEXT_BACKEND_ROOT` pointed read-only at reviewed backend `8de91f4`. The
initial full pass exposed two test-await assumptions and missing translations;
these were corrected without weakening assertions before the final passing gate.

Focused tests: `chat-text-outbox.test.cjs` covers storage ambiguity, restart,
validation, receipts, status recovery, stale responses, account/company/role/token
fences, backoff, ordering, corruption isolation and cleanup.
`chat-text-outbox-lifecycle.test.cjs` executes actual runner/logout/composer
handlers and covers foreground/logout races, newer bindings, wake coalescing,
ambiguous earlier admissions, duplicate taps/new drafts and explicit support routing.
`chat-text-auth-lifecycle.test.cjs` exercises the actual provider, App admission
effect and API interceptor, including deferred refresh401, bootstrap reads,
userData writes, credential writes, logout/replacement effects and intentional
subsequent login. Independent probes also confirm ordinary current401 sign-out
and current402 subscription handling, same-token ABA protection, and latest-only
credential persistence.
`chat-text-outbox-contract.test.cjs` consumes the real backend parser and compares
a verified baseline API at `6b80eda` against current durable offline admission.
During this client-only worktree, set `CHAT_TEXT_BACKEND_ROOT` to the actor-constraint
backend checkout for the new-contract acceptance proof. The default old backend
is separately a safe-rejection negative control. Both must pass; this does not
replace real backend database/HTTP integration testing.

## Limitations and release gates

AsyncStorage is local, unencrypted application storage, not end-to-end encryption
or a backup. Device loss, app deletion, storage loss, or a write that never commits
can lose an unsent local draft. No code promises OS-background execution or
recipient delivery/read status. The receipt protocol is the persistence authority.
The client assumes a single native JavaScript app runtime; it is not a multi-device
or multi-process atomic queue. User-driven deletion of app data is outside its
retention guarantees. Saved receipts remain until explicitly dismissed.

Native-device UI, airplane-mode/resume under a real OS, actual SecureStore/
AsyncStorage durability, app termination during writes, and deployed multi-replica
behavior remain unverified. No native/backend build, live migration, live data,
provider call, upload, publication, deployment or payment was performed. Independent
review and full mobile/noEmit/diff gates passed before committing.

Expo SDK55 versioned docs inspected before code: SDK reference, Expo Network, and
AsyncStorage at `https://docs.expo.dev/versions/v55.0.0/` and its corresponding
`/sdk/network/` and `/sdk/async-storage/` pages. Existing installed dependencies
are reused; no package/version/release number was changed.
