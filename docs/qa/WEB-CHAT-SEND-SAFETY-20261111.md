# Web chat send safety: 2026-11-11

## Scope and history

Isolated candidate: `fix/web-chat-send-safety-20261111`, based on native safety `64a9f8e31708619f10f2a44eecd7ddfffa13f8fb` plus a privacy-only cherry-pick of `2bad18c1f3631d7687f6458837478f09c666428b` (local parent `e542acfb26ab2475e394c7af92640031ef32bdb8`). No release-integration, native, backend, Fresh Operations, or deployment changes are part of this diff.

Before editing, inspected the web Chat/API history including `defefc4`, current web authentication writers, native safety implementation/tests, existing web test conventions, room membership routes, message saving, multipart commit/error paths, and Socket.IO authorization/acknowledgements. No applicable checkout-local AGENTS.md or skill instructions exist for web. Existing installed dependencies were reused through a local symlink; nothing was installed.

The parent approved the necessary expanded web-only scope: a shared authentication-generation helper and migration of existing credential/identity writers in Login, Register, Layout, Settings, PaymentRequired, and API 401 handling. No Storage API monkey-patch is used.

## Reproduced original defects

The same extracted-handler tests were executed against the untouched base web directory. All four selected behavioral tests fail on the base and pass on this candidate:

- Two same-turn sends dispatch two POSTs before React commits the state lock.
- A successful send clears a newer draft.
- A late result updates a replaced account/room or an unmounted view.
- A lost reply leaves no uncertainty admission block, permitting duplicate resends.

Reproduction: `WEB_CHAT_SOURCE_ROOT=/path/to/base/web node --test --test-name-pattern='two same-turn|acknowledgement preserves|late web send|unknown web send' web/tests/chat-send-safety.test.cjs`.

## Implemented behavior

- Synchronous text and attachment/group-photo admission locks, with attempt ownership so a stale completion cannot release a newer lock.
- Revision-aware draft preservation, including edits away from and back to the original wording. IME composition and repeated Enter key events cannot trigger sends.
- Chat identity includes owner, company, role, token, auth generation, and room. All transport captures immutable owner credentials and rechecks session/view before dispatch, after headers, and after body/download completion.
- App-owned login/logout/identity changes advance a persisted nonsecret generation nonce, so same-tab and cross-tab A-to-B-to-A transitions cannot revive old work, including before storage events arrive. Direct raw storage replacement is also checked through current identity snapshots. Same-identity profile refreshes do not reset a draft.
- A full storage quota cannot prevent logout or current-session API 401 cleanup. New logins and identity changes fail closed before changing credentials if generation persistence fails. Generic API 401/402 effects and Layout session-refresh writes are fenced to the request's original auth generation. Current-session behavior is preserved.
- Focus loss invalidates in-flight callbacks and marks pending text/media writes uncertain. It retains the draft and uncertainty warning in this mounted conversation. Resume only fetches history; it never retries writes. Connection effects survive React StrictMode replay.
- Native file-picker focus ordering is handled explicitly. Returning focus before React's connection effect can acquire a fenced transport synchronously. If the browser reports the selection before returning focus, a visible selected-file prompt requires an explicit Send attachment/Update group photo action; focus alone never uploads it.
- HTTP success requires a valid saved message with matching room, company, sender, text, and timestamp. Support ticket rooms retain their separate cross-company ticket-authorization behavior. Attachment acknowledgements require an attachment ID; photo acknowledgements require success and a nonempty URL.
- Network loss, timeout, malformed acknowledgements, server errors, and multipart HTTP 400 remain unknown outcomes. The attachment route can return 400 after COMMIT, so that status is never described as a confirmed upload rejection. Same-text resend and repeated media selection are blocked synchronously while uncertain.
- Requests have a 60-second abort bound. An aborted write remains uncertain; no automatic retry or offline queue is added.
- Copy distinguishes sending, server-confirmed saved, known non-send, and uncertain results. There are no recipient delivery/read claims.
- Existing HTTP polling every five seconds, reconnect history fetches, focus/visibility reconciliation, and WebSocket-to-polling transport fallback remain. All callbacks are scoped, messages merge by ID, and wrong-room/company socket events are ignored. Room details now populate the existing avatar/group-photo controls.
- Attachment viewers use the bound session. Stale downloads cannot open a preview; saves recheck the guard. Preview URLs are revoked on close, replacement, and unmount, including unmount before a state update commits. Existing non-chat callers can omit the guard.

## Review corrections before freeze

Independent review identified and the candidate corrected:

1. A queued storage-event gap for cross-tab app-owned ABA, closed by the persisted generation marker.
2. Generation-marker quota failure blocking logout, corrected with unconditional credential-removal attempts and in-memory invalidation.
3. Profile-only storage events unnecessarily remounting chat, corrected by comparing identity fields.
4. File-picker focus ordering that could silently discard a valid selection, corrected with synchronous acquisition or a visible explicit-send prompt.

## Verification

- `node --test web/tests/*.test.cjs`: **144 passed, 0 failed**.
- New focused coverage: **44 tests**, covering real extracted send/upload/lifecycle handlers, transport, two isolated auth contexts with shared storage, auth writer flows, and attachment preview lifecycle.
- `web/node_modules/.bin/tsc --noEmit -p web`: **passed**.
- `git diff --check`: **passed**.
- Base regression reproduction: **4 expected behavioral failures**, not missing-function errors.
- The final frozen candidate is subject to an independent rerun/review before commit.

All tests use local source compilation, mocked transport, and synthetic data. No application build, live backend/provider/user-data call, upload, payment, deployment, or production operation was performed.

## Remaining limits

- No durable chat idempotency key, receipt lookup, persistent outbox, automatic resend, delivery receipt, or read receipt is implemented. Those need a separately reviewed backend contract.
- Drafts and uncertainty records remain memory-only. They survive focus loss in this mounted view, but leaving/reopening the room, replacing the account, or reloading loses them. Identical text in history cannot safely prove which uncertain attempt it belongs to; no such inference clears the block.
- A manual/external raw-storage A-to-B-to-A mutation that bypasses app helpers and produces no observable storage event cannot be detected. Ordinary app-owned transitions in either tab are covered. Existing tabs running an older deployed app cannot provide the new generation guarantee until refreshed.
- These are handler/transport/lifecycle tests, not a full browser React render or OS picker test. Real browser keyboard, file-dialog event ordering, media playback, cross-tab scheduling, network fault injection, and actual Socket.IO reconnection still need interactive QA. This patch is not a release-readiness or WhatsApp-feature-parity claim.
- The generic API change fences global authentication side effects; it is not a full account-isolation rewrite of every unrelated web feature.
