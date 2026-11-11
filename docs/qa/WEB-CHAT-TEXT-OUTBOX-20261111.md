# Web ordinary-text durable outbox

## Provenance and required backend

Isolated worktree `web-chat-queue-20261111`, branch `feat/web-durable-chat-20261111`,
base `6b80edadd6c121aa7d72bda0a2ef2693ff3c3c76`. This checkpoint edits web code/tests
and this report only, not integration, backend, native, schema, release or deployment.
The backend receipt baseline is `046a144`; the **required actor-constraint follow-up**
is `709c2ee16335f4e11e66a2d6c5b1f56367bcc190`, integrated separately by the coordinator.
The web always sends both immutable `expectedActorId` and `expectedCompanyId`.
Old receipt backends reject the added field; older servers lack the dedicated route.
Both cases stop automatic attempts for review. Constraints are never stripped and
ordinary queued text never falls back to the old unkeyed transport.

## Storage and identity decisions

A dedicated IndexedDB database `future-jobs-chat-text-v1`, schema version 1, has one
`texts` object store with auto-increment sequence and unique request-key plus scoped
owner/room indexes. There is no generic URL replay, token persistence, attachment
serialization, service worker, background-sync promise or legacy queue conversion.
Each Send intent reserves one cryptographically generated key synchronously and
persists actor, company, room, canonical text, key, version and creation order before
any network write. Retry after an ambiguous storage result retains that exact intent,
including when the user has typed a newer draft. A failed confirmation is not permission
to generate a replacement key.

All storage methods resolve on transaction completion, never individual request success.
Read/write transactions arbitrate concurrent tabs, immutable collisions fail closed,
and an existing record is never recreated by a later status/lease update. Saved records
are retained as local tombstones (including validated receipts and original text), rather
than deleting them and risking stale-tab resurrection. A local saved-state update failure
after a valid server receipt is shown as **saved with local confirmation pending**, not
as a failed message; later same-key reconciliation is safe. This version has no automatic
purge or retention/expiry policy. The current listOwner/list operations load all retained matching records each foreground
tick; large-history latency and quota are unmeasured acceptance limits. Storage can
grow with use and remains readable by
same-origin application code. Browser eviction, clearing site data/private browsing,
device loss, origin changes and user profile deletion can remove it. It is not a backup,
end-to-end encryption, an independent source of server history, or protection from XSS.

Invalid records in a scope are left untouched and block that room rather than silently
discarding it or the valid records beside it. Records without valid owner/index fields
are also not deleted or replayed; this implementation has no repair/export workflow
for arbitrary database corruption. No historical web generic/unkeyed queue was found
in the audited source. No native/other-storage legacy record is imported.

The record's nonsecret approved `auth-generation` and role are separate from immutable
message identity. The existing authSession helpers advance generation synchronously
for credential/identity writers, including A→B→A and cross-tab changes, and preserve
profile-only name/avatar updates. Same-generation ordinary reload may resume; changed
login/token-writer/role generation requires explicit same-owner/company review. Check
status or Retry same request approves the current generation/role without rewriting
actor/company/room/key/text. Native adoption uses the same policy with its own native
persistent generation mechanism. A valid account is not logged out merely because an
old queued request receives owner-mismatch403 or company-mismatch401.

## Foreground and multiple-tab behavior

An app-shell owner-scoped runner, independent of the open route, recovers accepted
room A text while the user is in room B or the inbox. It runs only while the page is
visible **and focused**, with a sticky pagehide fence until pageshow. The Chat view has
its own sticky pagehide admission fence too. Logout/auth changes fence immediately
through the synchronous shared auth revision; stale responses cannot mutate another
account's state, change drafts, navigate to billing, or display another room's receipt.

Each foreground pass performs at most three serialized network attempts across room
heads. A persisted auto-increment sequence preserves per-room order. A needs-review
head blocks later messages in that room, while rotating room selection avoids starving
other rooms. Five automatic attempts are allowed per request, including reloads, with
exponential backoff from 2 to 16 seconds (capped at 60 seconds) between uncertain results.
Network calls have a 30-second timeout; transactional claims have a 90-second lease.
Offline ticks do not claim or consume attempts. The shell checks every three seconds
and on focus/online/auth/enqueue events. There is no dispatch while closed/backgrounded.

Tabs can expire another tab's claim and overlap the **same key** if the first request
outlives its lease or the process is suspended. The backend remains the idempotency
boundary. An older result cannot downgrade a saved record or recreate another payload.
Claims are not a claim that only one HTTP request can ever be in flight. Current writes
are fenced at async boundaries; hiding/logout cannot recall a request already accepted
by the network/server. Such outcomes retain the original key for recovery.

## HTTP and UI

Ordinary writes use only `POST /api/chat/message-requests`; status uses the owner/room
GET with both expected identity query fields. The entire private key/actor/company/room/
saved/replayed tuple and public saved id/sender/company/room/text/timestamp/null-attachment
kind are validated before saved state. Once a canonical saved UUID is known locally,
a contradictory later receipt is rejected through a typed transaction failure; it cannot
replace that tombstone or emit/render a second saved UUID. This is defensive client
consistency, not evidence of duplicate inserts by the conforming backend. Genuine local
storage failure remains distinct from a contradictory receipt. Receipt evidence means
server save, not delivery
or reading. Typed authorized missing404 permits only exact-key retry, not replacement.
410 permanently disallows recreating the request and offers status only. Malformed
success,409,old-server404/400,authorization and payment errors pause for explicit review.
No queue failure redirects to login or payment pages. Same-key transport uncertainty
uses the bounded retry policy; completed saves merge into the current room only after
its session guard passes.

The composer clears only the accepted intent's draft revision, preserves newer drafts,
blocks duplicate same-turn Send actions, and offers retry of the same storage intent
when enqueue completion is ambiguous. Per-room panels show queued/sending-or-awaiting-
confirmation/uncertain/needs-review states and explicit status/retry actions. An app-shell
summary links pending conversations. Support text uses the explicitly support-only
legacy handler. Support text, media and group-photo uncertainty keep their existing
nonqueued treatment. History pagination, reconnect reads, scroll preservation and picker
focus behavior are otherwise unchanged.

## Validation and limitations

Implementation validation on the frozen source/tests passed:

- Full serial web suite: **224 passed, 0 failed**, with the 22 optional browser harness
  cases explicitly skipped in this invocation because no driver was selected.
- Separate synthetic IndexedDB/VM harness: **21 passed, 0 failed**. The one browser
  process-restart case is explicitly skipped; it cannot run in the synthetic fallback.
- Full web TypeScript `tsc --noEmit` and `git diff --check`: passed.
- Independent review: **approved for this local source checkpoint**. The reviewer
  reproduced the contradictory-UUID bug before the correction, then independently
  passed the full 224-test suite, all 21 runnable synthetic cases, six additional
  adversarial cases, full web noEmit, diff-check and all 12 frozen-file hashes.
  Eleven parser-only normalization/strict actor/field contract checks also passed
  against the coordinator's backend `8de91f4` integration. These parser checks are
  not live HTTP/database or deployed end-to-end acceptance.

The independent extra cases cover corrupt-room isolation, stale-lease failures versus
late valid saves, stale enqueue/missing-record non-resurrection, skipped local saved
confirmation, logout/relogin during a pending save, and contradictory saved UUID
suppression. Only these verification statements changed after the final review; runtime
and test bytes remained unchanged.

No emitted build, native build, app deployment, live user data, real provider/backend
call, upload, payment or publication is part of this checkpoint.

A 22-case Playwright/Chromium harness is included. Its actual browser run is **blocked
before any test**: the executor prohibits Chromium's process-singleton `socket()`;
ordinary execution and the approved escalated execution both failed at startup. There
is no actual browser reload/restart/cross-tab/IndexedDB acceptance result from this
executor. No bypass was attempted. Real-browser UI rendering, actual BFCache, storage
quota/eviction, multiprocess scheduling and retained-profile restart need a compatible
browser environment before those behaviors can be considered accepted.

A separate explicit Node fallback uses `fake-indexeddb` with isolated VM contexts and
mocked fetch to exercise production store/transport/controller and extracted actual UI
handlers. It simulates transaction abort/quota, uncertain enqueue completion, separate
contexts, module reload, auth changes and lifecycle events. It is not a browser emulator,
not proof of actual cross-tab or disk persistence, and skips the browser-process restart
case. The helper creates no local HTTP server and makes no external requests.

Commands (test-only dependencies may be supplied from existing installations):

```
NODE_PATH=web/node_modules node --test web/tests/*.test.cjs
WEB_CHAT_INDEXEDDB_MODULE=/path/to/fake-indexeddb NODE_PATH=web/node_modules node --test web/tests/chat-text-browser.test.cjs
WEB_CHAT_PLAYWRIGHT_MODULE=/path/to/playwright NODE_PATH=web/node_modules node --test web/tests/chat-text-browser.test.cjs
web/node_modules/.bin/tsc --noEmit -p web/tsconfig.json
git diff --check
```

The optional harness reports skipped cases when no browser or synthetic-IDB dependency
is configured; a green general web suite alone does not mean this harness ran.
