# Native chat send safety: 2026-11-11

## Scope and prior-work check

Base: `9c134b4` (`fix: fence personal shift actions and foreground GPS`). The candidate lives on `fix/chat-send-safety-20261111` in its own worktree. The frozen release-integration checkout was not modified. This is a bounded native chat safety patch, not completion of the messaging-status or offline-outbox requests in `CLOSED-TESTING-FEEDBACK-20261109.md`.

Before editing, inspected ChatScreen history (`07445c0`, `7c3f401`, `bd567f5`, `defefc4`), current ChatScreen and MediaAttachment, API interceptors/session helpers, offline queue/replay policy, backend chat routes, and `chatService.saveMessage`. Existing authenticated room access, attachment playback, keyboard/safe-area behavior, and Spanish/French copy were retained. No relevant checkout-local `.agents/skills` files were present. Read `mobile/AGENTS.md` and the required versioned Expo 55 reference plus DocumentPicker, ImagePicker, and ImageManipulator docs:

- https://docs.expo.dev/versions/v55.0.0/
- https://docs.expo.dev/versions/v55.0.0/sdk/document-picker/
- https://docs.expo.dev/versions/v55.0.0/sdk/imagepicker/
- https://docs.expo.dev/versions/v55.0.0/sdk/imagemanipulator/

## Verified original defects

The same behavioral tests were executed with `CHAT_SOURCE_ROOT` pointing at the untouched base's mobile directory. Four selected tests failed on `9c134b4`:

1. Two same-turn send taps made two POST attempts before React rendered the state lock.
2. A successful send cleared text typed while the request was pending.
3. A late success/failure changed visible state after account, room, or unmount changes.
4. An unknown network outcome had no uncertainty record or identical-message admission block.

These were behavioral assertion failures (2 sends versus 1, newer draft cleared, stale state updates, and missing uncertainty record), not missing-function failures. The tests pass against this candidate. The source supports this reproduction without editing base: `CHAT_SOURCE_ROOT=/path/to/base/mobile node --test --test-name-pattern='two same-turn|acknowledgement preserves|late send successes|unknown sends' mobile/tests/chat-send-safety.test.cjs`.

## Implemented behavior

- Synchronous text-send and picker/upload locks; uncertainty admission also uses refs rather than waiting for a React render.
- Draft revision comparison prevents an acknowledgement from clearing newer text, including words edited away and back to the original value.
- A current authenticated owner/company/role/room owns chat state. Scope changes and navigation blur remove the old child, disconnect its socket, and invalidate pending reads, sends, picker results, image manipulation, and uploads.
- Chat-specific transport binds token and auth revision, verifies the stored owner before opening and again at dispatch, and checks scope around asynchronous steps. Generic offline-capable POST/upload transport is no longer used by ChatScreen.
- The opt-in unauthorized-response fence uses the existing reviewed mechanism from subscription commit `51c5b7479ea27f249cef89bd2e44e55e4e411837`, including the revision check after asynchronous token deletion. Integration with that branch must retain the shared guard and its subscription caller, not duplicate or remove either.
- Socket messages must match room/company. HTTP acknowledgement must match room/company/sender/text; attachment success also requires an attachment ID, and group-photo success requires the success flag. Socket/history/HTTP results merge by message ID so an older history response cannot erase a newer message.
- Status copy distinguishes sending, a server-confirmed saved message, known non-send, and unknown outcome. It does not claim recipient delivery or reading. Unknown same-text resend is blocked in the current mounted view; ambiguous media writes block immediate repeated picker use.
- Offline text/media writes are not queued by this path. Old chat queue entries are retained, review-only, reversibly archivable, and never silently replayed or deleted.
- Chat attachment viewers receive an optional current-session guard. Cached open, token lookup, download completion, and native share availability are fenced; stale results are cleaned up without opening the viewer. Existing support callers do not need to supply this prop.

## Independent review corrections included before freeze

- Multipart routes can return HTTP 400 after a committed attachment or group-photo change. Multipart 400 therefore remains unknown; it is not evidence of rejection. Text 400 is pre-save validation. Timeouts and 5xx also remain unknown.
- Stored owner/company/role is rechecked at interceptor dispatch after network awaits.
- A React-state-only media uncertainty flag was replaced with a synchronous ref to close the retained-handler gap.
- Wrong-kind attachment acknowledgements and unsuccessful group-photo acknowledgements are rejected conservatively.

## Verification

- `node --test mobile/tests/*.test.cjs`: **353 passed, 0 failed**.
- `mobile/node_modules/.bin/tsc --noEmit -p mobile`: **passed**.
- `git diff --check`: **passed**.
- Supplemental legacy `node --test tests/tester-regressions.cjs`: **7 failed**, matching all seven failures on untouched `9c134b4`. Its outdated mocks/expectations are a known separate harness issue; reviewed repair `ef7e793512c1e46b08754b5fef94faec61924b4e` is not part of this candidate. An initial attempt lacked the backend dependency link; after linking the existing installed dependencies, both base and candidate produced the same seven failures. This supplemental gate is not claimed passed.
- New targeted coverage: 13 ChatScreen behavioral/lifecycle tests, 11 chat transport/interceptor tests, 5 attachment-session tests, and 1 legacy-queue preservation test. Existing keyboard and localization tests pass as part of the full suite.
- The first full run found one missing shared translation for the newly translated Send label; Spanish/French copy was added and the complete suite rerun successfully.
- Tests run with local mocks/source compilation only. No build, install, upload, deployment, live provider/server call, payment, or production operation was performed. Existing installed dependencies were reused by local symlink.

## Limitations and remaining gates

- There is no durable chat idempotency key, server receipt/status lookup, persistent outbox, automatic retry, delivery receipt, or read receipt. Those require a separately reviewed backend contract and membership checks before replay.
- Draft preservation here is limited to edits during a send in the current mounted conversation. Drafts and uncertain-state records are memory-only and reset on navigation blur, leaving/reopening the conversation, account/room replacement, or process restart. The screen explicitly warns not to resend unknown messages. This patch does not provide durable recovery or prove whether an unknown send was saved.
- A token/revision change invalidates the mounted session immediately. If an unchanged owner scope remains mounted, reopening the conversation is needed to establish a new chat session.
- Upload picker/cache data are not turned into durable receipts. An already-dispatched native share chooser cannot be recalled; the guard prevents opening one after a detected scope change before dispatch.
- Tests exercise extracted real handlers and mocked transports, not a React renderer or device. Physical-device keyboards, navigation, picker cancellation, actual Socket.IO reconnection, media playback, OS sharing, process death, and real backend faults remain unverified. No build or release-readiness claim is made.

## Separate authorization finding, not changed here

`GET /api/chat/company/:companyId` authenticates the caller and checks only company equality, then selects the latest 200 `chat_messages` by company without a room-membership filter (`backend/src/routes/chatRoutes.ts`). The database includes direct/group rooms in that table. This can disclose same-company private-room message text/attachment metadata to a nonmember. This route is not used by this patch's room-specific transport. It needs a separate backend authorization fix and adversarial tests; no live-data query was made and this patch does not close it.

Independent review approved the frozen ten-file candidate after separately rerunning all 353 mobile tests, TypeScript noEmit, whitespace checks, and file-hash verification. Parent-controlled integration and release acceptance remain separate gates. The company-history issue is being fixed in a separate release-blocker checkpoint, not in this native candidate.
