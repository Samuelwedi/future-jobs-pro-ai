# Native conversation inbox: 2026-11-11

## Scope and history

This bounded Future Jobs improvement follows the requested WhatsApp-style chat experience. It adds a useful native conversation list, not WhatsApp feature parity. Fresh Operations is a separate project and was not touched.

Isolated branch: `recovery/chat-inbox-20261111`. Base: `64a9f8e31708619f10f2a44eecd7ddfffa13f8fb`. Before edits, the exact independently reviewed company-history privacy fix `2bad18c1f3631d7687f6458837478f09c666428b` was cherry-picked cleanly as `2d9bc8e`. The existing company-history fix and its tests remain unchanged. This work does not modify or delay the separate release-integration worktree.

Inspected route/list history before changes: the original mobile list (`d39fd84`), the rooms endpoint lineage (`72d858b`, `1d1efa6`), room authorization (`3769726`), media/profile changes (`6b7975b`, `b54e090`), mobile localization (`bd567f5`), and current native send-safety/privacy QA. The native list still had no conversation search, message previews or times, and its empty-dependency focus load could accept stale results. Web already has name search in `web/src/pages/ChatList.tsx`; it was not rebuilt or claimed as new. The backend previously ordered rooms by `updated_at`, which also changes for a group photo, without a last-message projection.

Read `mobile/AGENTS.md` and its required exact Expo 55 reference before coding: https://docs.expo.dev/versions/v55.0.0/. Existing React Native/navigation APIs are used; no dependency or native module change was needed.

## Implemented behavior

- Native conversation names, one-line latest authorized message/caption or media label, and localized local-calendar message time/date. No message displays a fabricated timestamp. Empty conversations have a distinct label. Older servers that omit the additive preview fields retain the previous Group/Direct message description, rather than claiming that their history is empty.
- Case-insensitive, trimmed conversation-name search, clear search, no-match state, and preserved server ordering. This is not full-text history search.
- Separate initial loading, refreshing, empty, error and retry states, with English/Spanish/French static copy. Refresh clears old previews while membership is rechecked. Search resets on account/company/role changes and focus re-entry.
- Authenticated owner/company/role, navigation focus and request sequence fence responses and handlers. Only the newest request can publish state. Blur/unmount and superseding refresh invalidate pending work. Loaded previews and navigation retain the captured token/revision guard. Repeated navigation taps are locked synchronously; stale row closures cannot navigate after refresh, scope change or blur.
- A read-only `getChatRooms` transport verifies stored identity before opening and again at HTTP dispatch, captures the original token/revision, and applies the existing opt-in unauthorized-response fence. It neither queues nor writes messages. The shared 401 guard already present in `64a9f8e` is unchanged. Integration with the subscription branch must preserve that common guard and both callers, not duplicate or remove it.

## Backend contract and authorization

`GET /api/chat/rooms/:userId` preserves its response envelope and existing room fields and adds only:

- `last_message`: null for empty rooms, otherwise at most 160 PostgreSQL Unicode characters of message text/caption.
- `last_message_type`: text/image/audio/file, or null for empty rooms. Classification uses attachment metadata only when its attachment belongs to that room.
- `last_message_at`: nullable message timestamp, serialized as ISO by the existing response path.

The final projection rechecks the active requester, current database company and current room membership in one statement. Duplicate legacy memberships cannot duplicate rooms. It excludes support-prefixed rooms; no ticket/role access policy is expanded. Peer name/avatar metadata is restricted to current active same-company members and chosen deterministically. The API does not return attachment URLs, filenames, storage keys, new membership details or receipt status.

The last-message subquery filters room and message company before `LIMIT 1` and requires an existing sender, matching room-history visibility. Historical messages by a moved/inactive sender remain visible as they do in room history; null/missing-sender rows cannot crowd out a readable message. Message order is `created_at DESC NULLS LAST, id DESC`. Rooms with messages come first by selected message time, with room ID as a stable tie-breaker. Empty rooms follow by room `updated_at DESC NULLS LAST`, then ID. A group-photo change therefore never changes a displayed message time or reorders a messaged room ahead of newer messages. Legacy null group flags normalize to false without a schema change.

The normal application subscription gate remains unchanged and can reject stale JWT tenant claims before the route runs. Isolated-route tests separately prove that the projection uses current database identity/company rather than trusting those claims.

## Verification

Local source verification before independent review:

- Complete mobile suite: **370/370 passed**, including all 353 existing tests.
- New native inbox source harness: **12/12 passed**. It evaluates the complete TypeScript screen through controlled hook and JSX mocks, covering initial/refresh/error/retry/empty/search states, account/company/role changes, focus re-entry, blur/unmount, request races, token changes before auth-context rerender, stale row closures, and same-turn navigation locks. Normalization, text/media/legacy fallbacks and date behavior are also checked.
- New inbox transport cases: **5/5 passed**, alongside all 11 existing chat transport tests. They cover copied/encoded owner identity, storage rechecks at dispatch, token/revision/view changes, token-load races, late 401/402 handling and no queue writes.
- Backend inbox source HTTP/PGlite tests: **11/11 passed**; existing company-history privacy regressions: **12/12 passed**. Actual JWT verification and the application subscription gate are exercised; real route SQL runs in PGlite against synthetic local records.
- Backend negative control: the same 11 inbox tests against untouched `64a9f8e` sources produced **2 passes and 9 expected failures**, including missing previews, duplicate membership behavior, inactive/stale-peer handling, and nullable group flags. This validates the regression coverage, not live-service exploitation.
- Mobile and backend TypeScript `--noEmit`: **passed**. `git diff --check`: **passed**.
- Timestamp regression also passed under `TZ=America/New_York`.

Commands from the repository root:

```sh
node --test --test-concurrency=1 mobile/tests/*.test.cjs
node --test --test-concurrency=1 backend/tests/chat-inbox.test.cjs backend/tests/chat-company-scope.test.cjs
./mobile/node_modules/.bin/tsc --noEmit -p mobile/tsconfig.json
./backend/node_modules/.bin/tsc --noEmit -p backend/tsconfig.json
TZ=America/New_York node --test --test-name-pattern='timestamp' mobile/tests/chat-inbox.test.cjs
git diff --check
```

Negative control uses `CHAT_INBOX_SOURCE_ROOT=/absolute/path/to/unchanged/backend` with the backend inbox source-test command. Dependencies were reused through local symlinks, with no install. Independent review approved the exact frozen nine-file candidate. The reviewer independently reran all 370 mobile tests, all 23 inbox/company-history source tests, 13 existing chat-media/support/billing source regressions, both TypeScript noEmit checks and the whitespace check. All passed, and all nine file hashes matched. Only this QA approval/status wording changed afterward; reviewed runtime and test bytes were preserved.

## Limitations and remaining acceptance

No physical-device or actual React-renderer/OS acceptance, screenshots, emitted build, full backend release suite, production-size query performance check or real multi-connection PostgreSQL test was performed. The hooks/JSX harness is deterministic source testing, not evidence of native layout, accessibility, keyboard or navigation behavior on a device. The inbox refreshes on focus and explicit pull/retry; this patch adds no background/live inbox subscription or unread badges. Authorization already revoked on the server is learned on refresh or the next protected request, not by a new real-time revocation channel.

There are no new delivery/read receipts, typing indicators, encryption claims, durable outbox/retry/idempotency behavior, push-notification guarantees, voice recording or calling features. Existing native send-safety behavior is preserved. This is not a build/release-readiness or complete WhatsApp-parity claim.

No live user data, provider call, upload, payment, deployment, migration, web UI edit or Fresh change was made. The independently approved source and tests were committed locally after review. Publication, deployment and release acceptance remain separate parent-controlled gates.
