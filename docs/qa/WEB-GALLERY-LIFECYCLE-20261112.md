# Web gallery privacy checkpoint

Narrow release candidate transplanted onto verified live `8e78fc6` from the independently reviewed `50cea85` delta. The unpublished parent feature branches are excluded. Existing production provenance labels and the preceding upload-security fix are unchanged.

The existing web gallery showed prior project/account data and selected media before effects, did not reload on a token change, and accepted late previous-project results. Three actual-source synthetic negative controls reproduced these defects on both `2ccbe29` and published `d1d077e`. Controls and logs are preserved separately, not relabeled as passing fixes.

The gallery now tags data and selections with render scope/version, uses the existing synchronous auth revision, and checks the current browser route and visibility. Old views are masked during render before effects. Auth changes, route changes, blur/pagehide, visibility and unmount invalidate observations, abort requests and release playback. Retained open/close/retry/download/audio callbacks cannot act on old scopes or selections. A replaced audio instance cannot be stopped by its old stop callback. Download admission is single-flight within the mounted gallery; stale completion does not publish into another scope. Download helper's optional caller guard runs before dispatch, after response/blob and before DOM click; allocated object URLs are cleaned if DOM setup or dispatch throws. Existing storage address and no-JWT/credentials policy is unchanged.

No backend access, capture, receipt, original asset, AI result, membership or billing change. Existing live `8e78fc6` timestamp and checksum labels are preserved; unpublished provenance and P1 labels are excluded. For integration onto live `8e78fc6`, apply the privacy delta without replacing unrelated gallery labels or requiring the unpublished P1 helper. Recheck the exact integrated source and tests; no whole-file overwrite across label changes.

Verification: 29 focused tests passed, zero skipped, including actual component/auth source with passive effects withheld and actual download helper. Existing backend media-download allowlist/no-JWT regressions also pass. `tsc --noEmit -p web/tsconfig.json` passed. Tests use synthetic hooks, route/storage/HTTP/audio/DOM boundaries with outbound network denied, not a browser or device. Initial two runs failed due to the new synthetic tree walker recursively substituting the root for undefined children; fixed harness only and retained both failure logs. Runtime did not change during the gate.

Commands from repository root. Verification additionally used an external outbound-network-denial preload; browser execution was not attempted:

```
NODE_PATH=$PWD/web/node_modules node --test --test-concurrency=1 web/tests/gallery-lifecycle.test.cjs web/tests/media-download-lifecycle.test.cjs backend/tests/media-download.test.cjs
node web/node_modules/typescript/bin/tsc --noEmit -p web/tsconfig.json
```

The source delta passed independent review; exact live-baseline transplant validation is recorded separately during release assessment. Actual browser acceptance remains unavailable under the existing execution restriction. No live private records, provider calls or native builds were used in verification.

## Exact live-baseline release assessment

The six-file transplant on `8e78fc6` passed 29 focused tests, 329 non-browser web tests, four additional lifecycle probes, web TypeScript checking and the production web bundle build. Independent source review confirmed the prior upload-security blob is unchanged and the only differences from the original gallery checkpoint preserve production labels without unpublished provenance helpers. Synthetic probes cover month/type ABA, raw token replacement before render, and responses arriving after unmount. This is not real-browser acceptance or full tester-list completion. No native build is included.
