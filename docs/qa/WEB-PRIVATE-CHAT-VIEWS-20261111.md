# Web private viewed-message state

## Scope

Based on reviewed web inbox/session checkpoint `a04ffe4bbb96c9099e5100862b45711c1e3b2f96` and backend contract `7c1a573215a03b01d0a8357eb47406423c25e457`. Changes are local source/tests only; no build, deployment, upload, provider or live-data operation.

The inbox and conversation expose only the viewer's **Messages not marked read** count. The cap distinguishes exactly 99 from 99+. Missing rooms, malformed data, stale responses, unsupported endpoints and errors remain unknown. No sender-facing reading, delivery, last-seen or device claim is made. Existing messages start unmarked; explanatory copy says previous views were not recorded.

## Observation and scope

- Only incoming ordinary direct/group messages are eligible. Support, own messages, queued drafts and list previews are excluded.
- A validated current history page supplies actor/company/room/membership incarnation and exact message versions. Metadata is consumed only after history generation and full page validation, with an additional observation-generation stamp. Invalid or pre-interruption history cannot enable recording.
- Actual IntersectionObserver intersection within the message scroll container, full-bubble geometry clipped to the browser viewport, visible styles, unobscured midpoint probes and 1,000 ms uninterrupted `performance.now()` dwell are required. The midpoint probes account for rounded Paper corners. Oversized/partially visible messages are never automatically marked. Rendering, loading history, socket arrival, polling and requesting a scroll are not evidence of viewing.
- Scroll, resize, intersection loss and version changes restart dwell. Background/blur/pagehide, offline, native file chooser and visible modal dialogs invalidate observation. Focus cannot revive pagehide work before pageshow. The file chooser has explicit click/change/native-cancel handling. Browsers without IntersectionObserver do not auto-record views.
- Owner token, actor, company, role and auth-generation guards reuse the reviewed chat transport and authSession. Metadata 401/402/403 stops and clears the current conversation/inbox without generic payment navigation or global authentication mutation. Stale failures cannot act on a replacement session.
- Membership incarnation knowledge survives observer resets and 409. A confirmed new incarnation discards loaded messages, details, cursors, gaps and scroll anchors, fences outstanding detail requests, and starts from a fresh latest page.

## Writes and counts

At most one batch is in flight per observer, with 1–100 exact `{id, viewVersion}` pairs. Nothing is persisted for offline/background replay. Later batches are rebuilt from still-visible DOM nodes. A partial socket update cannot inherit an older version from merged UI state.

All returned identity and exact acknowledgement pairs must match before refreshing counts. There is no optimistic decrement or room-wide clear. Pre-write count reads are invalidated; no count read runs during that observer's write. Every POST settlement also broadcasts a payload-free invalidation to current count readers, even after the originating view was disposed, because an ignored write may have committed. This only makes counts unknown; it never applies old-scope data. Valid successful writes may then read fresh counts. Generic 409 requires fresh accepted history and new observation.

Metadata endpoints returning 404 remain unavailable. An explicit legacy `CHAT_QUERY_INVALID` for `views=1` permits exactly one metadata-free, read-only history fallback per transport session, preserving old-server history while leaving private counts unavailable and recording disabled. After that unsupported response, the transport strips private fields from every legacy history response, blocks new count/acknowledgement requests, and rejects in-flight metadata replies. This remains read-only even when a mixed deployment sends view metadata on the legacy route. No text/media transport fallback was added.

## Verification and limits

Tests use actual source modules/handlers, controlled JSX/DOM/IntersectionObserver, synthetic fetch and deterministic monotonic time. Queue coverage uses the explicitly selected fake IndexedDB VM path. These are not real-browser acceptance tests.

Real Chromium startup was already restricted by `socket() failed: Operation not permitted`. An initial regression selection accidentally included the browser-default queue suite and encountered that same restriction; it was not retried or bypassed. All subsequent queue runs explicitly use `WEB_CHAT_INDEXEDDB_MODULE=/tmp/web-chat-test-deps/node_modules/fake-indexeddb`. No browser visual, OS chooser, native BFCache or browser-persistence acceptance is claimed.

### Independent review corrections

Review reproduced two compatibility edges, both now fixed and covered by source-connected regressions:

1. A mixed deployment returned private metadata on the legacy fallback route. Unsupported sessions now strip that metadata, refuse private acknowledgement/count requests and fence pending metadata responses.
2. A previously displayed count of 5 survived capability loss when the fallback failed. Capability loss now synchronously invalidates current count readers and observation context before the fallback starts. The regression uses no eligible visible bubbles, verifies immediate unknown state, then confirms it stays unknown after HTTP 500 with no acknowledgement dispatch.

### Final independent verification

- Focused private-view/history/inbox/transport/send/media tests: **135 passed, 0 failed**.
- Full web suite with explicit fake IndexedDB: **296 total, 295 passed, 0 failed, 1 expected real-browser persistence skip**.
- `tsc --project web/tsconfig.json --noEmit`: **passed**.
- `git diff --check`: **passed**.
- Independent source and test review: **passed**. Additional independent source probes confirmed the mixed-deployment fallback preserves room/token/cursor, the established count becomes unknown before a failing fallback, and a 503 uncertain write cannot replay without fresh history and full dwell. Source/test hashes remained unchanged during final review.

Commands used for final checks:

- `node --test web/tests/chat-private-views.test.cjs web/tests/chat-history-integration.test.cjs web/tests/chat-inbox-safety.test.cjs web/tests/chat-transport.test.cjs web/tests/chat-send-safety.test.cjs web/tests/chat-attachment-session.test.cjs web/tests/chat-history.test.cjs`
- `WEB_CHAT_INDEXEDDB_MODULE=/tmp/web-chat-test-deps/node_modules/fake-indexeddb node --test web/tests/*.test.cjs`
- `web/node_modules/.bin/tsc --project web/tsconfig.json --noEmit`
- `git diff --check`

This checkpoint is independently reviewed source with synthetic verification, not release or real-browser acceptance. Verify narrow-screen badge layout, actual scrolling/rounded-bubble intersections, OS chooser cancellation, modal interruption, BFCache, two-tab/auth changes and retained browser storage in an authorized real browser before release.
