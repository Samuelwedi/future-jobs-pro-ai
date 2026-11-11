# Native chat reconnect reconciliation: 2026-11-11

## Scope and prior-work check

Base: `64a9f8e31708619f10f2a44eecd7ddfffa13f8fb`, the reviewed native chat send-safety checkpoint. This candidate is isolated on `fix/native-chat-reconnect-reconciliation-20261111` in the `chat-reconnect-reconciliation` worktree. No release-integration or other worktree files were edited.

Inspected the existing ChatScreen lifecycle/history, prior send-safety QA, the authenticated `openChatSession` read transport, and the room-specific backend history endpoint before editing. The native lifecycle previously rejoined on Socket.IO connect but fetched message history only once outside that handler. The current endpoint returns the latest 200 messages after room-access authorization. It is reused without changes.

Read `mobile/AGENTS.md` and its required versioned Expo 55 reference before writing code: https://docs.expo.dev/versions/v55.0.0/. No relevant checkout-local `.agents/skills` files were present. No Expo package, permission, configuration, native module, or dependency changes were needed.

Changes are limited to ChatScreen, its existing lifecycle test fixture, one focused regression suite, and this QA record. There are no backend, native inbox, web, transport, notification, receipt, or outbox changes.

## Reproduced baseline defect

Ran the new behavioral regression against the untouched base through `CHAT_SOURCE_ROOT`:

```sh
CHAT_SOURCE_ROOT=/workspace/scratch/778a404c5ec0/future-recovery-inspect-20261111/chat-send-safety/mobile \
  node --test --test-name-pattern='a successful reconnect fetches' \
  mobile/tests/chat-reconnect-reconciliation.test.cjs
```

It failed because a successful disconnect/reconnect/rejoin still left exactly one history read, where the test required a second read. This is a behavioral `1 !== 2` assertion, not a missing-function or harness failure. The same regression passes against this candidate and verifies a missed message is merged without reopening the conversation.

## Implemented behavior

- Retains the independently authenticated initial HTTP history read even if the socket has not connected, reports a connection error, or rejects a join before the HTTP response arrives. The initial fallback is session/scope-fenced, not connection-generation-fenced.
- After the first successful room join and each subsequent successful reconnect join, requests history through the same current authenticated session. The first join also closes the gap between the initial HTTP snapshot and joining the room.
- Allows at most one active history read per mounted lifecycle. Reconnect bursts replace a single queued generation rather than starting overlapping reads or accumulating a queue. A new eligible read starts only when the existing one settles.
- Increments a connection generation on connect, disconnect, and connection error. Post-join reconciliation successes and failures and room-join acknowledgements from earlier generations cannot update current state. Disconnect/error/cleanup drops the queued generation.
- Ignores duplicate connect events for the same connected transport and consumes at most one join acknowledgement. Only explicit `success: true` authorizes reconciliation. Rejected, malformed, duplicate, and stale acknowledgements cannot trigger another read.
- Validates the entire history array using existing room/company/message checks. Merges by ID with existing socket/HTTP messages taking precedence over the pending snapshot; ordering remains deterministic.
- Current failures display the existing localized error copy and do not start a retry loop. Later successful joins can recover. History/connection errors do not overwrite an existing send/upload warning; successful reconciliation clears only its matching load error. Successful join clears only matching connection/join errors.
- Explicitly unregisters all four owned socket listeners before leaving/disconnecting and clears its socket reference. Existing scope, focus, auth, session, and unmount fences remain in force.
- Text sends, media upload logic, draft revisions, uncertainty locks, attachment session guards, and no-automatic-write behavior from `64a9f8e` are unchanged. No delivered/read status is introduced.

## Independent review correction

The first candidate incorrectly used the socket generation for its initial HTTP read. Independent review reproduced empty history when either a connection error occurred before that response or a connect/denied-join sequence preceded it. Added both exact interleavings: they passed against untouched `64a9f8e`, failed against the first candidate (`[]` instead of `['http-fallback']`), and pass after separating the initial session-scoped fallback from post-join reconciliation generations. The pending-burst test now verifies that initial history survives and merges with the newest follow-up. The disconnect test explicitly starts a post-join read, queues another authorized reconnect, then disconnects again to verify both stale result/error suppression and queued-read cancellation.

## Automated verification

- `node --test mobile/tests/*.test.cjs`: **373 passed, 0 failed**.
- `mobile/node_modules/.bin/tsc --noEmit -p mobile`: **passed**.
- `git diff --check`: **passed**.
- New focused suite: **20 behavioral tests** executing the real extracted lifecycle with deferred reads and mocked sockets. It covers the baseline defect, initial HTTP fallback including connection-error and denied-join interleavings, first-join gap, repeated reconnects while a read is pending, maximum concurrent reads, duplicate connect/ack callbacks, denied/malformed/stale joins, socket/HTTP merge preservation, stale successful/failed reads after disconnect/reconnect, focus/auth/session/unmount changes, malformed/cross-scope history, recovery after failure, uncertainty-warning preservation, connection errors, listener cleanup, and stale startup.
- The existing send-safety lifecycle fixture now supplies `off` and acknowledges the room join before expecting its history refresh. Its original assertions and all existing mobile tests remain enabled.
- Tests use source compilation and local mocks. Existing installed dependencies were reused via an ignored local symlink. No package installation was performed.

## Limits and remaining gates

- Reconciliation is bounded to the endpoint's latest 200 messages. An outage spanning more than 200 missed messages can still leave a gap; this does not implement history pagination or a complete synchronization protocol.
- One initial read plus one read after the first successful join is intentional. Reads do not poll, retry on their own, or accumulate on duplicate callbacks. A read already dispatched before a disconnect is not physically canceled; post-join results are connection-generation-fenced, while the initial HTTP fallback remains session/scope-fenced. A queued newer read waits for the active read to settle. The existing API's 60-second timeout is unchanged.
- This is event-driven Socket.IO reconnect recovery. There is no new app-background/foreground detector, periodic health check, lost-ack timeout, or recovery for an undetected connection interruption. Navigation blur still removes the owned child; reopening establishes a new session as before.
- Session/token changes still require reopening the conversation if the owner scope remains mounted. Drafts/uncertainty state remain memory-only as described in the send-safety checkpoint.
- Room metadata retains its existing session/scope fence and initial read; this patch reconciles message history, not group-photo metadata.
- The tests are not a React renderer, emulator, or physical-device run. Actual Socket.IO reconnect timing, device background suspension, UI scrolling, and live server behavior remain unverified.
- No build, provider/live-user-data call, upload, deployment, payment, push, or release operation was performed. This is not a full WhatsApp-parity or release-readiness claim.

Independent review approved the corrected frozen candidate after separately passing all 373 mobile tests, 33 focused tests, 16 additional matrix checks, TypeScript noEmit, whitespace checks, and frozen-file hash verification. No required changes remain. Parent-controlled integration and release acceptance remain separate gates.
