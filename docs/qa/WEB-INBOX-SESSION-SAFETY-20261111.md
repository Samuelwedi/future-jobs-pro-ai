# Web inbox session safety: November 11, 2026

## History and scope

This isolated change starts at web ordinary-text outbox checkpoint `38c510c9b592295155b21b04c329207dee58d044` on `fix/web-inbox-session-scope-20261111`. It does not edit integration/release worktrees, backend/native code, read/unread state, group creation, or support authorization.

The ChatList history was inspected before changing source. Its last change, `54e4918`, added avatars. Earlier presentation/creation commits are `a4a7506`, `1d1efa6`, and `7fa9b20`. At the base, ChatList captures the local-storage user once with an empty-dependency memo and accepts every request result/error/finally without an owner, request-generation or view-lifecycle check.

Existing `authSession`, `chatSession`, `NewChat`, `Chat`, and backend inbox routes/tests were inspected. There are no applicable web AGENTS.md or checkout-local web skills. Existing installed web dependencies are reused through an ignored local symlink; no installation is needed.

The backend `/api/chat/rooms/:userId` already verifies the authenticated user matches the requested user, checks current activity/company and membership in the final projection, and excludes support-ticket rooms. It returns an explicit success flag and an array of uniquely identified rooms, with a boolean group flag and nullable display fields. The client continues to depend on that server authorization rather than treating its identity snapshot as an access grant.

## Implementation

- ChatList uses the existing auth revision and owner helpers. The inner view is keyed to owner, company, role, token, shared auth generation, and router visit. Account changes discard the prior rows/search. Same-account display/profile changes do not discard them.
- Existing chat transport is factored into a private shared function, with an inbox wrapper. It captures immutable credentials and inbox path, checks auth/view before dispatch and after headers/JSON, uses no-store and the existing 60-second abort bound, and never invokes generic API authentication/payment redirects. Ordinary chat text, support messaging, attachments and history retain their existing endpoint behavior.
- A request sequence and lifecycle epoch reject out-of-order refreshes, late success, late failure, and stale loading completion. Refresh clears previously loaded rows before requesting current membership. Malformed/partial list payloads fail locally and do not render a partial private list.
- Foreground loss, pagehide, layout cleanup, changed browser address/history key, and popstate invalidate old reads and retained row/new-conversation handlers. Read-only foreground and BFCache restoration fetch fresh rows. Same-entry pageshow/popstate ordering remains usable, as does rapid Back/Forward returning to the original visit before React commits an intermediate route.
- Before clearing rows, the scoped view measures its rendered list height and reserves that space while loading. Refresh, blur and BFCache suspension therefore do not collapse a long inbox. No global scroll position is saved/restored, so deliberate movement during loading is not undone. Owner/auth/visit remounts discard the measured geometry.
- Retained row handlers cannot navigate after refreshed membership removes/replaces the row. New-conversation and room navigation preserve existing URLs and display names, but immediately fence older callbacks.
- Failed loading is distinct from an empty inbox, including after an error alert is dismissed. Current access denials clear rows and disable the old view, with instructions to reopen or sign in. Other failures permit explicit refresh and show no raw server error data.

## Verification status

Focused source tests pass: 27/27. They load the actual web TSX page, shared auth module and chat transport with controlled hooks/JSX and synthetic browser/storage/fetch events. They are not a browser DOM or React reconciliation test.

Final exact-code verification passed: 273 web tests total, 272 passed, zero failures, and one true-browser process restart explicitly skipped. The full suite used synthetic IndexedDB/VM mode; it did not launch Chromium. Final web TypeScript noEmit and `git diff --check` passed.

Independent review first passed 140 inbox/transport/attachment/send/create/history tests and five probe groups, including all 24 show/focus/pageshow/popstate orders, loaded identity resets and delayed error bodies. A scroll preservation caveat prompted the measured-placeholder correction and two new focused tests. Independent re-review then passed all 27 final inbox tests and five final probe groups using the actual final source, controlled hooks/JSX layout, and child-layout-before-parent-passive setup. These covered long-list geometry in all 24 lifecycle event orders, cross-tab owner replacement, harmless profile updates, empty refresh releasing the reservation, invalid hidden measurements, and absence of forced scrolling. Final source hashes were unchanged through the aggregate/TypeScript gates and review.

These controlled tests establish the scoped reservation mechanism, not real browser scroll anchoring, resize/media layout, DOM rendering or persistence across a browser process restart.

Four behavioral negative controls against the untouched base ChatList failed as intended, without startup/import/harness failures:

1. Retained callbacks navigated after account replacement.
2. A delayed old-owner result wrote state after identity changed.
3. An older refresh overwrote the latest list.
4. A delayed result wrote state after browser navigation.

The new scroll regression also fails against the exact pre-scroll candidate: a 2400px loaded list collapses to 300px during refresh. A small source-driven layout model verifies the placeholder mechanism and modeled scroll clamping, not actual browser layout/scroll restoration.

Commands:

- `node --test web/tests/chat-inbox-safety.test.cjs`
- `WEB_INBOX_SOURCE_ROOT=/path/to/base/web node --test --test-name-pattern='switching account replaces|late success or rejection|latest refresh wins|address, history visit' web/tests/chat-inbox-safety.test.cjs`
- `WEB_CHAT_INDEXEDDB_MODULE=/tmp/web-chat-test-deps/node_modules/fake-indexeddb node --test web/tests/*.test.cjs`
- `web/node_modules/.bin/tsc --noEmit -p web`
- `git diff --check`

## Limits and manual acceptance

The endpoint remains authoritative for changes not yet delivered to the client. An active same-account list is a fetched snapshot until refresh or foreground return; this change adds no realtime membership feed or polling of room content. Shared-auth limitations remain: raw-storage ABA changes bypassing app writers with no observable storage event cannot be detected; older deployed tabs need refreshing to participate in the persisted-generation guarantee.

Before release, verify in a real browser: account switch/logout/company or role update with pending requests; two-tab ABA changes; repeated refresh with delayed response bodies; Back/Forward and BFCache return; same-path new history entry; long-inbox refresh/blur/BFCache scroll retention and deliberate scroll during loading; narrow-screen search/group/direct navigation; current 401/402 handling; support and New conversation entry. Confirm old rows and stale redirects cannot reappear and the returned current view remains usable.

No application builds, uploads, live data/services/providers, browser automation, payments, deployments or release submissions were performed. This is a source-level safety checkpoint, not release acceptance.
