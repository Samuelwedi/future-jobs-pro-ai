# Web chat history and reconnect recovery: 2026-11-11

## Scope

Isolated branch: `feat/web-chat-history-20261111`, from verified shared base `5ddaf28faebf4fec164afab3cf53fb3af66c7e9b`. Only web chat code/tests and this QA note change. No native, backend, release checkout, provider, payment, upload, deployment, or permissions changes.

Inspected the integrated web send/auth safety implementation from `26c16e5f35dff35330746db2713de8ad18edaa46`, its real-handler tests, and the frozen backend pagination contract before implementation. Existing installed dependencies are reused through an ignored local node_modules symlink. No installation or application build was run.

## Implemented behavior

- The existing fenced `readMessages()` still supports its legacy no-query route. Web history opts into `limit=200` and URL-encodes opaque `before` cursors. It recognizes HTTP 400 `CHAT_CURSOR_INVALID` with `refreshRequired: true` without treating it as an authorization loss or logging out the account.
- Response validation requires success, an array of scoped messages, boolean `hasMore`, and a nonempty progressing cursor when more rows exist, or null at exhaustion. Missing/malformed metadata, invalid scope, and stalled cursors retain previous rows/cursors and expose retry instead of claiming the beginning was reached.
- Older-history navigation, latest-response IDs, dated continuity anchors, and each unresolved reconnect gap have independent state. They are not derived from the oldest merged row or JavaScript timestamps. A disjoint latest dated window records a gap to the previous dated response IDs, even if a socket already delivered a new message from that window. Shared null-timestamp rows never prove dated continuity.
- Each active foreground controller permits one history read at a time. Poll, successful rejoin, focus, and visibility bursts coalesce into one trailing latest read. An older response cannot overwrite the latest recovery cursor.
- A new gap gets at most three automatic older-page reads. Any remainder has an explicit Continue loading missing messages action. Further periodic polls preserve existing unfinished gaps without repeatedly spending their budget. A later disjoint latest response adds another retained gap.
- An all-null nonterminal latest window starts a bounded probe behind the null prefix, targeting prior dated IDs or exhaustion if none were verified. A pending null-prefix probe keeps its cursor across polls. Once it crosses into dated rows, it becomes an ordinary retained gap, allowing later refreshes to detect new arrivals above its advanced cursor. Completed probes can run again on later polls. Only a verified server-issued null-row cursor before the dated region is cached; a dated cursor is never used for that cache.
- Invalid cursors preserve loaded rows, block affected pagination, and expose explicit Refresh history. Automatic refreshes do not silently rebase or clear blocked cursors. Explicit refresh rebases the affected traversal from a fresh server page while retaining its original overlap target. Other errors keep the cursor for retry.
- History state survives foreground session replacement in this mounted room. Obsolete replies, errors, and completions cannot mutate it. Room/account/auth-generation changes remount the owned view, preserving the existing authentication ABA and send/upload fencing.
- Merging deduplicates by message ID. Legacy null timestamps sort after known timestamps, matching reversed PostgreSQL DESC NULLS FIRST order, and display “Time unavailable.” Send/upload acknowledgements still require valid timestamps.
- Prepending preserves a visible message's viewport offset. Recent arrivals follow only when already near the bottom; reading older messages no longer triggers unconditional socket scroll-to-bottom. Controls and loading status remain outside the scrollable message list.
- Explicit loading, initial retry, older-page retry, missing-range continuation, invalid-cursor refresh, and beginning-of-conversation states are present. No write retry, outbox, delivery claim, or read receipt was added.

## Reproductions against the unchanged base

The same extracted real React connection effect was executed against base `5ddaf28`, using `WEB_CHAT_SOURCE_ROOT` to select its original Chat.tsx. Four tests fail behaviorally on the base and pass on this candidate:

1. Initial reads do not opt into paging (`limit` is absent).
2. Old messages 1–200 plus latest messages 251–450 leave only 400 loaded rows, missing 201–250.
3. Overlapping rejoin/focus/visibility/poll triggers dispatch five reads instead of sharing one active read.
4. A socket arrival forces scroll-to-bottom while reading.

Reproduce with:

`WEB_CHAT_SOURCE_ROOT=/path/to/base/web node --test --test-name-pattern='real web effect opts|real web reconnect effect|real web poll focus|real web socket event' web/tests/chat-history-integration.test.cjs`

These are observed assertion failures, not missing-symbol failures.

## Verification

- Baseline full web suite: 144 passed, 0 failed.
- Candidate full web suite before independent-review correction: **174 passed, 0 failed**. Final rerun results are recorded below.
- Type check: `web/node_modules/.bin/tsc --noEmit -p web`: **passed**.
- Whitespace check: `git diff --check`: **passed**.
- Added helper/controller, extracted real-effect, transport, and viewport tests cover initial paging, >200 reconnect gaps, bounded recovery/continuation, multiple retained gaps, poll/page overlap, duplicate clicks, arrivals during catch-up, socket-before-refresh, foreground replacement, stale account/scope/unmount completions, auth ABA after body-read, invalid/malformed cursors, network/access errors, nullable dates, deduplication, and scroll policy.
- Existing send, upload, uncertain-outcome, auth writer, cross-tab ABA, file chooser, attachment, and all unrelated web tests remain in the full run.

The candidate was frozen before independent review; the findings and corrections are recorded below.

## Independent-review correction

The reviewer found that a successful initially empty room left `hasOlder=false` after a later nonempty latest window with more than 200 arrivals, because there was no prior response ID to anchor a gap. Added helper and actual connection-effect regressions first: both fail behaviorally on the frozen candidate before the fix.

The first nonempty response after an empty verified head now establishes its own older-history frontier, including when a socket row arrived before the refresh. Older paging can retrieve the missing rows instead of falsely displaying Beginning of conversation. Subsequent latest refreshes do not reset paging progress. A separate test verifies this transition cannot silently clear a blocked invalid cursor; that still requires explicit Refresh.

The reviewer also demonstrated that a sticky null-timestamp row could create false overlap between old and new dated windows. Recovery now uses only dated IDs as continuity evidence and explicitly probes behind null-only heads. Added coverage includes one sticky null, exactly 200 null rows followed by the first dated insertion, more than 600 null rows with bounded continuation, new arrivals after a completed probe, pending older-gap/probe coexistence, and deletion of a cached null cursor followed by explicit refresh and further arrivals.

The reviewer's independent 80-case synthetic-backend model covers 0/1/199/200/201/400/601/1000 null rows, 0/1/199/200/450 old dated rows, with/without fully preloaded old history, and two successive large dated-arrival batches. It also exposed an unfinished probe that had already crossed into dated rows; that traversal now retains its older gap while permitting a fresh probe above it. The corrected implementation passes all 80 scenarios.

Malformed timestamps, string `infinity`/`-infinity`, and numeric nonfinite timestamps are rejected by the real web validator with a visible page error and unchanged rows/anchors/cursors. Null timestamps remain supported. No legacy database repair or cursor ordering change was made.

After both review corrections: **186 full web tests passed, 0 failed**; TypeScript noEmit and git diff whitespace checks passed. The independent synthetic-backend model also passed **80/80** scenarios. Independent rereview passed on the exact frozen source: the reviewer reran 186 full web tests, all 80 synthetic ordering/recovery cases, cached-null cursor reset with later arrivals, and focused date/session-fence checks, plus noEmit and diff checks. No remaining blocking source issue was found. This approval is for the local source checkpoint, not a release-readiness claim.

## Remaining QA and limits

- No real browser React rendering, scrolling/resize/media-layout checks, keyboard interaction, background-tab timing, live Socket.IO reconnect, production backend, or live user data was exercised. These remain open interactive QA, not passed stages.
- Local tests run real source helpers/transports/effects with synthetic data and mocked networking/DOM measurements. Backend pagination route and database behavior are reviewed in its separate change.
- Null timestamps follow backend null ordering. Non-null invalid/infinite timestamps fail the page conservatively and remain retryable; no artificial date is displayed. Cursor traversal and overlap checks never reconstruct timestamps or rely on JavaScript date precision.
- This is memory-only history. Leaving the room, replacing the account, or reloading discards loaded history and recovery position; the next visit starts from the latest server page. Loaded rows are retained through invalid cursor refresh, including rows since removed server-side, consistent with existing merge semantics.
- Attachment media whose dimensions change after the layout effect still needs browser QA for viewport behavior. There is no persistent outbox, idempotent send receipt, automatic resend, delivery/read receipt, or release-readiness claim.
