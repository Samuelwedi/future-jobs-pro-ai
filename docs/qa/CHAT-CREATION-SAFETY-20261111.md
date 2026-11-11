# Native chat creation safety: 2026-11-11

## Scope and history

Base: `64a9f8e31708619f10f2a44eecd7ddfffa13f8fb`. Candidate branch: `fix/native-chat-creation-safety-20261111`, isolated worktree `chat-creation-safety`. No frozen release or other worktree was edited. Backend changes, migrations, builds and release operations are outside this checkpoint.

Before runtime edits, reviewed all-ref `NewChatScreen.tsx` and chat-route history, current picker/create routes, AuthContext, the reviewed chat transport and offline policy, and related chat tests. No earlier recovered fix for these creation races was present. No checkout-local skills were present. Read `mobile/AGENTS.md` and its required versioned Expo 55 reference: https://docs.expo.dev/versions/v55.0.0/ . No Expo dependency or native module changed.

## Reproduced defects

The same complete-screen source harness was run against untouched base mobile source using `CHAT_CREATION_SOURCE_ROOT=../chat-send-safety/mobile`. Five selected regressions fail there:

- Two same-turn create taps issue two requests.
- Late create results navigate after the current user changes.
- An unknown create has no uncertainty warning or repeated-submit hold.
- A retained submit callback uses the earlier recipient after selection changes in the same view.
- Multiple name/selection changes before React renders are not reflected in the submitted draft.

These fail behavioral assertions, not missing helper imports. The baseline source was not modified. Command:

`CHAT_CREATION_SOURCE_ROOT=../chat-send-safety/mobile node --test --test-name-pattern='two same-turn|late create|uncertain creation|retained submit|two selection' mobile/tests/chat-creation-safety.test.cjs`

The independent reviewer additionally reproduced stale same-scope recipient dispatch and acceptance of an impossible `group-x` acknowledgement before correction. Both independent probes pass after the corrections.

## Implemented behavior

- A keyed owner/company/role child owns the picker, selection, draft and create session. Blur or owner replacement unmounts it; auth token/revision guards work before AuthContext renders a replacement.
- Back, native blur and native before-remove events invalidate pending work synchronously. Late successes, failures and finalizers cannot replace newer navigation or update a departed view.
- Picker reads use the existing `GET /users/company` route. Its current middleware authenticates an active requester; the route derives company from the requester's current database record, filters active coworkers and does not impose a new role restriction. The former parameterized picker includes inactive users. This is an existing-route change, not a new permission model.
- Picker state keeps only ID, first name, last name and role. It rejects malformed/duplicate IDs, excludes the current user, tolerates missing optional names, and distinguishes loading, a failed load/retry and an empty list. After a token revision change the view asks the user to reopen it.
- A synchronous ref lock admits only one create at a time, including multiple taps before React renders. Current-draft refs prevent retained callbacks from submitting an earlier recipient, mode or group name; a submitted snapshot cannot be changed while pending.
- Creation uses a new narrowly scoped API facade over the existing reviewed chat transport. The public `openChatSession` contract remains available. Token, auth revision, owner/company/role and current-view guards apply to picker reads and create mutations; stored ownership is rechecked at actual interceptor dispatch, after asynchronous network preflight.
- Mutations never queue or automatically retry. Existing offline queue/replay code is unchanged. HTTP 400/403 and other existing proven non-send classifications permit an explicit retry; timeout, 5xx and malformed acknowledgements remain uncertain. The shared transport conservatively also treats 404 as uncertain.
- A direct acknowledgement must identify the exact existing sorted owner/recipient room ID. A group acknowledgement must match the server's current `group-<timestamp>-<base36 suffix>` form. Success must explicitly be true. A bad acknowledgement cannot navigate.
- An uncertain result preserves the draft, blocks further creation in that mounted view, and tells the user the conversation may already exist and to check their conversations before trying again. No recipient-delivery, unread or read-status claim was added.
- New status, fallback and accessibility copy has Spanish and French translations. Existing POST endpoints and their required fields are unchanged; redundant userId1/creatorId fields were removed because the server owns those identities.

## Verification

- `node --test --test-concurrency=2 mobile/tests/*.test.cjs`: **375 passed, 0 failed**.
- `mobile/node_modules/.bin/tsc --noEmit -p mobile`: **passed**.
- `git diff --check`: **passed**.
- Independent review probes for stale recipient callback, impossible group acknowledgement, token replacement before AuthContext render, roster reload/revoked selection, and old row callbacks after same-turn mode change: **5 passed**.
- Added 14 complete-screen source-harness tests and 8 creation transport tests. Existing chat sending, attachments, keyboard, queue, translations and all other mobile tests pass.
- Existing installed dependencies were reused through a local node_modules symlink; no dependency install, app/backend build, live server/user/provider request, upload, deployment, payment or submission occurred.

The first targeted run caught a missing shared translation for the fallback Chat label; it was added before the passing full run. Independent review found the same-scope stale callback and overly broad group-ID checks before final freeze; their fixes and regression coverage are included.

## Limits and separate work

The tests execute complete transpiled screen source with controlled hook/JSX/navigation doubles and mocked transport/interceptors. They are not a React reconciler, simulator or physical-device test. Native gesture timing, keyboard/scroll layout, actual network failures and background/process death are not device-verified. No build or release-readiness claim is made.

The create lock and uncertain-result hold are **memory-only and per mounted creation view**. Back, blur/reopen, account replacement or process restart clears them, including an immediate reopen in the same authenticated session. Already-dispatched requests can still save after leaving. There is no persistent/session-wide/cross-device idempotency, receipt lookup, automatic status reconciliation or guaranteed duplicate prevention. Users are explicitly told to inspect their conversations before another attempt. This bounded patch does not implement a durable chat outbox or group-create idempotency.

Backend direct-create atomicity, validation of preexisting deterministic rooms, and membership/company races are separate integrity work. Native locking is not server concurrency protection and does not repair or regrant membership. Route-level inactive-actor checks alone should not be reported as an application bypass: the real application subscription gate already rejects inactive users. The backend reviewer owns its independent tests and checkpoint.

Parent-controlled integration, final full-app/tester acceptance, builds and submissions remain separate gates. Candidates for inbox previews, reconnect reconciliation, company history privacy and web send safety were not cherry-picked here.
