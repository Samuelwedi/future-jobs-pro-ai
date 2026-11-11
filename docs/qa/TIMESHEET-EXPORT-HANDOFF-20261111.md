# Timesheet export handoff candidate, November 11, 2026

## Prior inspection and bounded scope

Base: `9c134b4`, isolated branch `fix/timesheet-share-handoff-20261111`. The CSV/PDF handler introduced in `c0895d0` deleted its downloaded file in `finally` immediately after `Sharing.shareAsync`. That lifecycle remained unchanged through the base. The analogous calendar fix in `84f2fb6` and its QA report were inspected first; this candidate does not depend on or modify that branch.

The installed Expo Sharing 55.0.24 Android module resolves its promise at chooser activity result rather than recipient consumption. Its installed `gitHead` is `856b99321eeb04bd528b33f90c0e7fa2859a1fcb`; see `packages/expo-sharing/android/src/main/java/expo/modules/sharing/SharingModule.kt`, lines 39–52 and 80–84. [Corresponding native source](https://github.com/expo/expo/blob/856b99321eeb04bd528b33f90c0e7fa2859a1fcb/packages/expo-sharing/android/src/main/java/expo/modules/sharing/SharingModule.kt#L80-L84). Deleting immediately can invalidate the receiving app's FileProvider URI.

The existing authenticated `/time-entries/export` endpoint, selected employee/week, binary download, status/content-type checks, PDF/CSV MIME and UTI options, and native destination choice remain in place. No backend, auth API, dependency, permission, original attachment/source data, provider, release or integration change is included. Native local-file sharing is rejected explicitly on web; no upload workaround is used.

## Lifecycle and stale-work protection

- Generated files now live only under private `cacheDirectory/timesheet-exports/`. Before a native share attempt, partial downloads, failed validation and stale operations remove only their generated file, best effort.
- After any native share attempt, including a rejection with uncertain outcome or chooser cancellation, the file is retained for the recipient. Resolving the chooser is not a delivery/read receipt.
- Later export attempts prune matching generated CSV/PDF filenames only when both their filename timestamp and file modification time are older than 24 hours. Recently written files, boundary/future timestamps, unknown filenames, unreadable metadata and directories are kept. Pruning never scans the root cache, attachment originals or source files and never recursively removes a directory.
- Cleanup is opportunistic, not a timed deletion promise. No future export means no app-triggered prune. The OS may evict private cache, and a recipient that waits more than the retention window may no longer be able to read it.
- One synchronous operation lock spans format choice through native sharing. Cancel/dismiss releases an unstarted choice, repeated taps/callbacks cannot duplicate work, and callbacks from an old dialog cannot affect a replacement.
- A session guard memoized for the rendered AuthContext user prevents an old user view from capturing replacement authentication before the context update, even during unrelated rerenders. The format chooser additionally captures its own synchronous API token/revision guard plus actor/company/role/employee/week scope and an export generation. Blur, unmount and scope changes invalidate it; returning to the earlier view does not revive it. Checks follow token access, sharing availability, directory preparation/listing/pruning/metadata inspection, download and final token access. Stale downloaded metadata is not consumed, stale errors are suppressed, and stale preparation does not dispatch a later download or chooser.

## Verification

Read before implementation:
- `mobile/AGENTS.md`
- https://docs.expo.dev/versions/v55.0.0/
- https://docs.expo.dev/versions/v55.0.0/sdk/filesystem-legacy/
- https://docs.expo.dev/versions/v55.0.0/sdk/sharing/

Local checks on the candidate:
- `node --test mobile/tests/timesheet-export.test.cjs`: 22 tests passed.
- From `mobile`, `node --test --test-concurrency=1 tests/*.test.cjs`: 339 tests passed, no failures or skips.
- From `mobile`, `./node_modules/.bin/tsc --noEmit`: passed.
- `git diff --check`: passed.

Fixtures execute the screen's extracted export/chooser functions and actual cache helper against stubbed native APIs. They cover both formats, authenticated URL/options, partial and rejected downloads, invalid status/type, share rejection/cancellation, pre-chooser token/revision replacement with an old user view, acceptance after user refresh, stale scope/session/revision/focus across all async preparation boundaries, blur/refocus generations, duplicate taps, old confirmation callbacks, stale metadata, cache filename/age/directory isolation, failed cleanup and missing native facilities. These are source/fixture results, not device acceptance. Independent review approved the isolated source candidate after resolving the pre-chooser stale-session finding. The reviewer independently reran all 339 mobile source tests, TypeScript `--noEmit` and `git diff --check`, all passing with no test skips. No bounded source blocker remains; this is not release or device acceptance.

## Device acceptance still required

1. On Android and iOS, export CSV and PDF, select a receiving app, and verify that the recipient can read the URI after chooser completion. Reopen saved files and check the selected employee/week and format.
2. Cancel each chooser, repeat taps, change employee/week/account, and navigate away/back at preparation and download boundaries. No stale chooser, stale error or duplicate request should appear.
3. Verify private-cache retention after successful, cancelled and uncertain shares, later pruning of only old generated files, and preserved attachments/source files.
4. Verify app background/kill behavior, slow downloads, OS cache eviction and receiving-app delays. These native lifecycle and delivery behaviors remain unverified.

No provider call, upload, build, deployment, purchase, production change or store submission was performed. This candidate is outside the frozen release/integration branch and does not establish release readiness.
