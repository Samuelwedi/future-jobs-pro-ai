# Native chat history paging and reconnect gap recovery: 2026-11-11

## Scope and baseline

Isolated branch: `feat/native-chat-history-20261111` in the `native-chat-history` worktree. Base: `5ddaf28faebf4fec164afab3cf53fb3af66c7e9b`. The release integration, backend and web worktrees were not edited.

Read the current native reconnect/send-safety implementation and QA, authenticated chat transport, lifecycle tests, `mobile/AGENTS.md`, and its required Expo 55 reference at https://docs.expo.dev/versions/v55.0.0/ before implementation. The search connector returned 503; a normal HTTPS read of the same required documentation succeeded. No relevant checkout-local skills were present. No dependencies, native modules, permissions or Expo configuration changed.

The implementation is limited to native history reads, display controls, scroll policy, supporting translations and tests. Text/media send dispatch, uncertainty locks, draft revisions, upload logic and authorization guards remain unchanged. The shared message validator now accepts an explicit null timestamp and rejects invalid timestamp strings; unknown times display honestly. No delivered/read receipts, automatic writes, outbox/idempotency behavior, new grants, live-user-data checks, provider operations, build, upload, deployment or payment actions were performed.

## Frozen backend contract

The optional `readMessages({ limit, before })` uses the existing fenced transport. No argument retains the legacy no-query URL. Native paging requests `limit=200`; `before` is URI-encoded and opaque. `hasMore` is a boolean and `nextCursor` is a nonempty string only for a nonterminal page, otherwise null. The response remains chronological. Backend authorization and database privacy tests belong to the backend history candidate; native tests validate response room/company/message identity without adding permissions.

A 400 response with `code: CHAT_CURSOR_INVALID` and `refreshRequired: true` is shown as an expired history position. Automatic reconnect reads may display new authorized rows but cannot silently clear the warning or rebase that cursor. The explicit Refresh control reloads the latest page, preserves visible rows and original unresolved-gap anchors, and resumes from valid response cursors. Invalid older-page cursors restart older traversal from the refreshed response only after this explicit action.

## Behavior and limits

- A single history request is active at a time. Reconnect bursts retain only the newest pending eligible refresh. Each older-history tap requests at most one 200-message page; same-turn duplicate taps cannot overlap requests.
- The initial HTTP fallback is session-scoped and survives socket connection errors and denied joins. Post-join reads retain connection-generation fences. Account/company/role/room/focus/unmount/session fences remain in place at lifecycle and transport dispatch/response boundaries.
- Older-history continuation is independent of reconnect gap continuations. Each gap keeps a response-derived cursor and pre-refresh trusted dated-message ID anchors. Cursors are never synthesized from timestamps or the oldest merged row. Multiple unresolved gaps survive subsequent refreshes and reconnects.
- Each authorized refresh permits at most three additional gap pages (up to 600 messages, in addition to its latest 200). Remaining recovery is visible through Continue recovering missed messages. A manual continuation also permits at most three pages. No timer or retry loop was added.
- Newer refreshes supersede pending older/gap results before their rows or cursor can publish. Failed or malformed pages preserve existing messages. Missing, inconsistent, unchanged-cursor, or empty nonterminal metadata cannot claim history completeness or advance trusted overlap anchors.
- When an initially empty room later has a nonempty latest page, that response establishes older paging if no trusted prior HTTP message anchors exist. Socket-only arrivals cannot conceal the missing older history. An already-complete nonempty history retains its older boundary across overlapping refreshes.
- The beginning-of-conversation label requires exhausted older history, no unresolved gaps, and no warning. Socket and HTTP rows are deduplicated by ID; already-present live/HTTP copies win over pending snapshots.
- Null IDs never prove dated-message continuity. A nonterminal null-containing head with no prior dated anchors starts a bounded discovery scan toward exhaustion; a dated gap similarly walks below an all-null latest page. Unfinished scans retain their own response cursor across refreshes, alongside any independently advanced older-history cursor. Completing a null-head scan does not prove later dated messages are absent: a later authorized refresh may repeat the bounded probe. Native does not cache a null-prefix bypass; repeated probes can reread null rows, but each remains capped at three automatic pages before explicit continuation.
- Null timestamps sort last with ID tie-breaking and display Time unavailable. Non-null timestamps compare instants, including offset and fractional-precision variants.
- FlatList uses `maintainVisibleContentPosition` for prepends. Socket append scrolling is deferred until content layout and permitted only when the reader was already near the end. Scrolling away cancels pending auto-scroll; keyboard callbacks also respect reading position. History prepends alone never request scroll-to-end.

## Baseline failure reproductions

The new test fixture can execute the unchanged base through `CHAT_SOURCE_ROOT`. The baseline input was materialized with `git show` from the exact base SHA into a temporary source root; production files were not changed.

1. `CHAT_SOURCE_ROOT=/tmp/native-history-baseline node --test --test-name-pattern='reconnect recovers actual outage' mobile/tests/chat-history-pagination.test.cjs` failed behaviorally with `2 !== 3`: after old messages 1–200 and new latest 251–450, no third read fetched missing 201–250.
2. `CHAT_SOURCE_ROOT=/tmp/native-history-baseline node --test --test-name-pattern='paged history encodes' mobile/tests/chat-transport.test.cjs` failed behaviorally: all read URLs remained the legacy no-query URL instead of including the opted-in limit and encoded cursor.

Both regressions pass against this candidate. Neither baseline reproduction fails due to an absent helper, import or fixture setup.

## Verification

- `node --test mobile/tests/*.test.cjs`: **524 passed, 0 failed**.
- `mobile/node_modules/.bin/tsc --noEmit -p mobile`: **passed**.
- `git diff --check`: **passed**.
- Twenty-six new real-lifecycle/controller history tests cover initial older pages, the actual 250-message outage, catch-up beyond the automatic budget, explicit continuation, repeated reconnects with multiple gaps, refresh during older/gap requests, duplicate taps, errors/retries, invalid cursors, malformed metadata, scope/auth/session/unmount fences, wrong-room/company data, socket/HTTP merging, timestamp ordering and scroll callbacks.
- Three new transport tests cover legacy compatibility, bounded paging query/opaque cursor encoding, unchanged dispatch/response fences and unchanged invalid-cursor errors without retries.
- Existing reconnect, send-safety, keyboard, attachment-session and complete mobile regression suites remain included. The reconnect fixture was extracted for shared use; the prior stale-generation test now permits only idle-state release after a discarded read.
- The first complete test run found missing translations for new history UI copy. Added Spanish and French entries to the existing shared dictionary; the final complete suite passes, including localization checks.

## Independent review correction and remaining validation

An initial independent review reproduced a busy-state lock after a numeric-generation read was invalidated by disconnect: its rows were correctly discarded, but the UI's loading flag could stay true and disable manual HTTP recovery. The controller now publishes only its final idle view under the still-current session guard. It still discards stale rows/errors/cursors. Exact success/failure interleavings verify that only the history idle event is published and manual older-history reads remain usable while disconnected.

A subsequent independent review found that an initially empty terminal snapshot could incorrectly keep its exhausted older boundary after the room grew beyond one page. The first nonempty trustworthy latest response now establishes its own older cursor when no prior trusted message anchors exist. Real-lifecycle regressions cover both socket arrival and no socket arrival before that response, load all omitted older rows, and separately verify that nonempty completed history does not restart. The reviewer recorded the original frozen candidate failure in `/tmp/native-history-review-20261111/frozen-empty-history-failure.log`.

A further shared review found that a sticky null-timestamp row could falsely satisfy ordinary ID overlap while dated messages remained missing below it. Continuity now uses dated-only anchors and bounded discovery probes below null-only heads. Added five lifecycle regressions for a single sticky null, an unchanged 200-null head with later dated arrivals after a completed scan, a prefix beyond 600 automatic rows, coexistence with an unresolved dated gap, and preservation of both an advanced older cursor and unfinished null scan through refresh. The independent reviewer also exercised a 1,000-null prefix followed by 450 dated messages.

The reviewer also requested normalized timestamp comparison and additional multi-gap/metadata tests; these are included. Independent review approved the exact frozen v3 for source integration after verifying all 12 file hashes before and after its checks. It independently passed all 524 mobile tests, TypeScript noEmit, diff-check, and 16 additional adversarial probes. Only this approval wording was updated after that review; production and test source bytes remain unchanged. A final scratch-only scenario also confirmed that a discovery scan which has crossed into dated rows does not suppress a fresh probe for later dated arrivals behind an all-null head.

Native iOS/Android device scrolling and visual accessibility/layout have **not** been exercised. Source-level behavior tests verify the configured native viewport-preservation property and real list callback policy, not platform rendering. No application build was requested or run. Physical-device QA should check prepend anchoring with variable-height text/media, keyboard open/close while reading old messages, live arrivals during history reads, and recovery controls with large histories.
