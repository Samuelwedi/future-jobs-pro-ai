# Native chat group request limit: 2026-11-11

## Scope and contract

Base: `b004025db9658e21a9d0c8903fe9de56a4922103`. Branch: `fix/native-chat-group-limit-20261111`, isolated worktree `native-chat-group-limit`. Reviewed current all-ref history before editing; native creation safety already existed, but neither its picker nor its scoped transport enforced the backend's existing group request limit.

Read `mobile/AGENTS.md` and the required versioned Expo 55 reference at https://docs.expo.dev/versions/v55.0.0/ before editing. No dependencies or native modules changed. Existing installed mobile dependencies are reused through a local node_modules symlink.

The server admits **1 to 100 submitted member IDs before deduplication**, then adds the authenticated creator. The native picker already excludes the creator, so this change permits **100 selected coworkers**, not 99. This is a single create-group request bound, not a commercial team tier or overall company membership limit. Backend UUID validation, current membership checks, authorization and atomic creation remain authoritative and unchanged.

Only native NewChat UI, its scoped creation facade, localized screen copy, targeted tests and this QA note change. No backend, web, receipt/session architecture, pagination, release file or integration worktree is edited.

## Behavior

- Group mode displays the selected coworker count out of 100 and explains that the creator is added automatically. English, Spanish and French copy preserves interpolation.
- At the cap, unselected rows become visibly and accessibly disabled, while selected rows remain available for deselection. A limit notice tells the user how to select someone else.
- Row admission and submit validation use the existing synchronous current-draft ref. Retained callbacks cannot bypass the cap before a React render, after a mode change, or after auth/navigation invalidation. Existing group name and empty-selection constraints remain intact; direct-chat selection and requests are unaffected.
- The scoped `createGroup` facade rejects an oversized or empty raw array, a non-array, and malformed string entries (including sparse holes) with `CHAT_NOT_SENT` before network preflight or POST. Valid submitted IDs are copied synchronously before awaiting. It deliberately does not deduplicate before checking the bound; 101 repeated IDs are still rejected, while duplicates within 100 preserve the backend's accepted request semantics. UUID format and authorization are still checked by the server.
- Existing online-only transport, auth/owner/company/role dispatch fences, conservative uncertain-outcome behavior, and no automatic replay are retained.

## Verification

Independent read-only source review found no required changes. The reviewer verified baseline exports byte-for-byte against `b004025` and captured the frozen runtime diff SHA-256 `5fdd63e170f93493bbf3215b881b9b95492a1be325cf219e48d94def1776c61a`.

After the integration quiet window cleared:

- Exact baseline source was exported from `b004025` without editing the baseline. Running the new tests against it with `CHAT_CREATION_SOURCE_ROOT=../native-group-baseline-20261111/mobile CHAT_SOURCE_ROOT=../native-group-baseline-20261111/mobile node --test --test-concurrency=1 --test-name-pattern='group limit blocks|group submit independently|group transport accepts|group transport caps' mobile/tests/chat-creation-safety.test.cjs mobile/tests/chat-transport.test.cjs` reproduced **4 behavioral failures**: the 101st retained row is selected, an injected 101-ID draft dispatches, 101 unique raw IDs POST, and 101 duplicate raw IDs POST. These are observed assertions, not missing-import failures.
- `node --test --test-concurrency=2 mobile/tests/chat-creation-safety.test.cjs mobile/tests/chat-transport.test.cjs mobile/tests/localization-copy.test.cjs`: **56 passed, 0 failed**.
- Independent scratch probes: **8 passed, 0 failed**. They cover injected 101-ID submission, same-turn stale selection/deselection/replacement, full-group name validation/trim, owner/company/role/token/blur/unmount fences, current direct-mode selection after a full group, raw duplicate counting and unchanged payload, dispatch-time snapshot/auth fencing, and actual Spanish/French interpolation. The reviewer also independently reproduced three relevant behavioral failures on the exact baseline.
- `node --test --test-concurrency=2 mobile/tests/*.test.cjs`: **543 passed, 0 failed**.
- `mobile/node_modules/.bin/tsc --noEmit -p mobile`: **passed**.
- `git diff --check`: **passed**.
- Independent serial rerun: **543/543 mobile tests passed**, TypeScript noEmit and diff check passed. The reviewer confirmed all five frozen source/test hashes and a byte-identical tracked patch before and after verification, and approved source integration with no required changes. No source or test edits occurred after freeze.

The nine new checked-in tests execute actual screen handlers or the scoped API facade, plus translation validation. Ordinary UI boundary cases use real row/submit callbacks, with a labeled test-only fixture seed used solely for defense-in-depth submit validation of an otherwise unreachable over-cap draft. No production test seam was introduced.

## Limits

Complete transpiled screen handlers run with controlled hook, JSX, navigation and API doubles; transport tests run the actual API service with controlled interceptors. This is source-level behavioral coverage, not a React reconciler, simulator, physical-device, accessibility service or visual-layout check. The count and notices have not been visually verified on small displays, dynamic type or a native keyboard layout.

No build, live user-data/provider request, upload, deployment, payment or submission occurs for this checkpoint. Existing group creation locks and uncertainty holds remain memory-only and per mounted view. This patch adds no durable idempotency, cross-view receipt reconciliation or guarantee that an already-dispatched creation cannot save after leaving. Parent-controlled integration and release acceptance remain separate gates.
