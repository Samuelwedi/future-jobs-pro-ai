# Web new-conversation safety: November 11, 2026

## Scope and contract inspection

Isolated branch `fix/web-chat-creation-safety-20261111`, based on combined history candidate `b004025db9658e21a9d0c8903fe9de56a4922103`. No integration/release or pagination worktree was edited. Runtime changes are limited to the web NewChat page and a dedicated creation transport. Shared authentication policy, native and backend runtime remain unchanged.

Inspected the unchanged NewChat history, native creation checkpoint `799688f`, backend atomic creation checkpoint `a3b005f`, and the combined web `authSession`, `chatSession`, API and route implementations before editing. There are no applicable checkout-local web AGENTS.md instructions. Existing installed dependencies are reused through an ignored local symlink; no dependencies were installed.

Verified endpoint contracts:

- `/api/users/company` derives company from the current authenticated account and returns active coworkers. The picker does not use the caller-selected company endpoint.
- Direct creation normalizes UUIDs to lowercase and returns the sorted exact pair joined with a hyphen. A direct room with incompatible legacy membership yields a definite 409 rejection.
- Group creation accepts a trimmed name of 1–100 characters without NUL, and 1–100 submitted recipient IDs. The server adds the creator, so the UI describes selected people, not a total group-member cap.
- Both creation endpoints revalidate current owner activity/company and all participants under transactional row locks. The client does not substitute its snapshot for server authorization.
- A lost COMMIT acknowledgement is a 500 and may have created a room. Both 500 and 503 remain conservative unknown outcomes on web; no retry is automatic.

## Implemented behavior

- The picker is keyed to the owner, company, role, token, shared auth generation and router visit. It uses the existing shared auth revision/capture functions without introducing another authentication policy or modifying auth writers.
- Transport captures immutable original credentials and checks view/identity before dispatch, after response headers and after JSON completion. It never uses a later account's token or invokes generic API 401/402 redirects/cleanup.
- Current list responses require explicit success, valid unique UUIDs and an array of users. Self is excluded, UUIDs are normalized, and missing names cannot crash rendering. Failed loading is distinct from an empty company and supports an explicit, sequence-fenced retry.
- Selection and name handlers use a synchronous current draft. Submission captures one immutable recipient/mode/name snapshot. A synchronous lock blocks same-turn duplicate clicks and retained edit/submit handlers while the request is active.
- The picker and transport both enforce the existing 100-submitted-recipient cap. Group names enforce the endpoint's 100-character/NUL rules. UI inputs show the name limit and explain that the creator is added automatically.
- Navigation requires `success === true` and an exact canonical direct-room ID or the backend's valid group-room format. A successful response replaces the creation route and synchronously fences retained handlers before navigation is rendered.
- Back, popstate, pagehide, route/address/history-key changes and layout unmount suppress stale results. Backgrounding a pending creation marks it uncertain; returning focus never retries or permits the late result to navigate. A persisted pageshow (browser back-forward cache) reloads only an idle picker; a pending creation stays uncertain and Back remains usable. Idle background handlers cannot submit. A same-entry popstate after BFCache pageshow keeps the restored picker usable, while a changed address/history key still invalidates it. Router context must match the live browser visit, so a pending navigation cannot be adopted by an old route render.
- Offline/definite precommit rejection leaves the draft intact for deliberate retry. Access denials clear private picker rows and disable the old view. Lost replies, network errors, abort timeouts, 5xx and malformed/wrong-kind acknowledgements retain the draft and hold further creation in this mounted view, with an instruction to check the inbox.
- The transport has a 60-second abort bound. There is no outbox, automatic retry, receipt lookup, durable idempotency key or invented client-side group identity.

## Verification

Local verification: 30 focused creation tests passed; the complete web suite passed 222/222, and web TypeScript noEmit plus `git diff --check` passed. Independent final review approved the frozen runtime and tests: all 222 web tests and five additional lifecycle/selection probes passed, TypeScript noEmit and diff checks passed, and all four baseline behavioral failures were independently reproduced. Both browser back-forward cache findings are closed. Tests execute the complete source-loaded web TSX component with controlled hooks/JSX, real web creation transport and the existing auth module, plus synthetic fetch/storage/browser events. They do not reuse native navigation or SecureStore assumptions.

Commands:

- `node --test web/tests/chat-creation-safety.test.cjs`
- `node --test web/tests/*.test.cjs`
- `web/node_modules/.bin/tsc --noEmit -p web`
- `git diff --check`
- Baseline behavioral proof: `WEB_CREATION_SOURCE_ROOT=/path/to/untouched/base/web node --test --test-name-pattern='two same-turn direct|lost creation reply|late create success|retained callbacks read' web/tests/chat-creation-safety.test.cjs`

Four behavioral regressions were run against the unchanged NewChat page at the combined base. All four failed as expected, with no missing-function or harness-startup failures:

- Same-turn clicks dispatched two requests instead of one.
- Repeated creation after a lost response dispatched again instead of holding uncertainty.
- A response after the owner changed navigated to the old account's room.
- A retained submit callback sent the previous recipient instead of the current selection.

Independent early source review found a browser back-forward cache lifecycle gap. Before final verification, dedicated pagehide/pageshow recovery was added, together with tests for idle read replacement, pending uncertainty, changed owner rejection and usable Back. Independent event-order probing then caught the browser sequence pagehide → persisted pageshow → same-entry popstate. The follow-up correction checks the actual current visit before invalidating on popstate. Both idle and pending-uncertain sequences now have regression tests, and the original independent probe passes. Additional tests cover deselecting/replacing a recipient at the cap, retained edit callbacks during unknown outcomes, and a stale router context during same-path navigation.

## Limits and manual acceptance

- Uncertainty and drafts remain memory-only. They survive focus loss in the mounted view, but leaving/reopening, account replacement or reloading discards them. Checking the inbox before another attempt is necessary; group duplication after a manual revisit is not prevented by this patch.
- Client active-coworker data is a fetched snapshot. Backend transaction-time authorization remains authoritative for transfers/deactivation after loading.
- Existing shared auth limits still apply: an external raw-storage ABA mutation that bypasses all app writers and produces no observable event cannot be detected. An older deployed tab must refresh to participate in the shared persisted generation guarantee.
- Controlled-hook tests are not a browser DOM or React reconciliation test. Real browser rapid clicks/keyboard, Back/Forward, same-path navigation, two tabs, backgrounding during slow creation, network interruption after COMMIT and narrow-screen accessibility need interactive QA.
- No application builds, native builds, live user-data/provider calls, uploads, payments, deployment or release submissions were performed. This is a source-level safety checkpoint, not a release-readiness claim.
