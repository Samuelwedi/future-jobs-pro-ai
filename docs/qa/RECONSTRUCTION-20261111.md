# Feedback recovery and reconstruction — November 11, 2026

## Verified source boundary

The Space recovery bundle (46,971,223 bytes) was materialized and verified with `git bundle verify`. It contains complete history through b68ee572208576e75807f35d6ca83786a42bbd2d, an interrupted implementation snapshot based on 6c02f9f. Backup SHA-256: `18e95445baad8005473f70ea2828449c0237ec56e9f7c31584bf0e1f1a9aab87`. The original backup and original working tree were not changed. Work continues on isolated branch `fix/reconstruct-feedback-20261111`.

Later reported local commits are unavailable in the recovered object database. This is a reconstruction, not exact recovery of those commits, and not release-ready.

## Restored or independently verified in this checkpoint

- Restored the exact publicly recorded privacy fix from 5c009139dabf0be3331d69bdbc6dfb51a7a8a765. Employee self SIN/DOB responses are redacted; sensitive reads require current database boss/manager authorization. This preserves the live privacy rule rather than replacing it with an inferred design.
- Repaired stale camera test fixtures to exercise the recovered durable-receipt flow rather than the older upload signature.
- Added camera session fences after permission, speech, and file-validation waits. A changed account/project or unmounted screen cannot continue opening the native camera or raise stale launch errors from those waits. This is source coverage, not physical-device acceptance.
- Added deletion of only app-owned, request-key-named evidence copies after matched server completion. Failed cleanup retains the queue receipt for a later status-only retry; unrelated paths and other accounts are not removed. Ambiguous uploads are never retried merely to clear disk space.
- Existing b68ee57 recorder pause/resume/metering and durable photo-receipt source is recovered, not newly implemented in this checkpoint. Their device acceptance remains open.

## Reported later work not recovered

These historical summaries identify reconstruction targets, not verified implementation:

- 1ea47d9: archive/restore, subscription demo, native voice guards.
- 81823f0: editable transcripts.
- ae22e8f: durable voice receipts.
- bc9b61b: embedded camera.
- 183a82b: project hub.
- 07158d3: Files and messaging.
- 316f789: shift start.
- 567db1d / 78bacbb: timesheet safety and attachment recovery.
- 9df0cb7: ES/FR password guidance and Lucy refresh/error fallback.
- f2d06a0: bounded dispute/GPS/tamper-proof/annual ACH claims and recorded-data/checksum labels.
- 0ad83bb: bounded encryption wording rather than unsupported exact-version claims.

The original exhaustive PDF register remains in CLOSED-TESTING-FEEDBACK-20261109.md. Do not mark these later items complete based on the recovered snapshot.

## Confirmed unresolved recovery gates

- A post-claim photo failure becomes permanently uncertain; native retry conservatively checks status and cannot resolve it. The current camera can remain blocked by that capture. Add explicit safe reconciliation without blindly resubmitting ambiguous provider work.
- Provider success followed by database failure can leave an untracked remote asset. Durable provider identifiers/reconciliation and intended delivery privacy need verification before release.
- New local copy creation interrupted before queue persistence can still leave an orphan; cleanup added here only covers acknowledged queued uploads.
- Physical device camera/media/audio/offline, store purchase/restore, complete PDF acceptance and final aggregate review remain open.
- Pending owner choices on profile approval fields/approvers, project permission policy, pricing and photo AI remain pending. No consequential defaults were invented.
- No signed builds, paid services, publication, production changes or live records were made.

## Validation

Mobile TypeScript and all 196 source tests pass with no failures or skips. Backend build and all 518 backend tests pass with no failures or skips, including privacy and payroll checks. Independent review approved the scoped camera/session, receipt reconciliation, persistence and cleanup changes, and independently reran 15 evidence/offline regressions. Matching completed receipts bypass local file access; transient or ambiguous status failures persist new captures and never authorize reposting. These checks do not establish physical-device acceptance.

## Editable transcript reconstruction

Reconstructed the lost editable-transcript capability independently, without claiming recovery of 81823f0.

- The immediate voice-note result now offers audio playback beside an editable transcript, localized in English, Spanish and French. Playback stops on backgrounding, navigation and cleanup. This restores editing for newly processed notes; opening an older note directly in this editor remains unimplemented.
- Saves are explicit and online-only, bound to the current authenticated session. Restricted legacy queued transcript edits cannot replay silently. Duplicate taps are locked, drafts survive failed requests within the editor, and stale component/account results are ignored.
- Author-only GET/PATCH endpoints revalidate the active user's current company and the note's current project/company. Management roles receive no new access to other authors' notes.
- Writes use a locked transaction and compare the previous transcript. A conflicting edit returns 409; exact retries of the latest transition do not create duplicate audit revisions. The original transcript is retained, including a NULL original, with a durable revision history.
- Transcript changes clear old summary, extracted data and tags; no AI/provider regeneration or shift/time writes occur. An additive, repeatable migration is included in the existing voice migration runner but has not run against production.
- Independent review found a missing conflict recovery path. Added an explicit Load saved transcript action that updates the optimistic baseline, shows the saved text, preserves the local draft, and clears potentially stale derived UI. A regression covers backgrounded success, a different correction, conflict, reload and a successful next save.
- Native layout/playback, physical-device keyboard acceptance and older-note editing remain open. No push, upload, deployment, payment or signed build occurred for this checkpoint.
- Final validation: backend build and all 528 backend tests passed; mobile TypeScript and all 207 mobile tests passed, with no skips or failures. Independent review approved the authorization/audit flow and verified the conflict-recovery sequence. Diff whitespace checks passed. This checkpoint is local-only; no remote preservation is claimed.

## Project archive/restore reconstruction

Reconstructed the archive/restore part of unavailable 1ea47d9; unrelated subscription/native voice work from that historical checkpoint remains unrecovered.

- Added a separate archived_at field and recoverable archive/restore endpoints. Archiving no longer marks a project completed; restoring retains its existing active/on_hold/completed status. No project, media or history rows are deleted.
- Existing boss/manager/admin permissions are unchanged. Current active-user role/company is revalidated and locked through project writes. Cross-company targets are rejected; repeated archive/restore is idempotent. Ordinary project updates preserve omitted status and cannot silently restore an archived record.
- Project lists distinguish unarchived from archived. Completed projects remain visible with their completion status instead of being treated as archived. Active-project lookup excludes archived rows.
- Native archive/restore uses an explicit confirmation, a shared synchronous write lock, online-only session-bound requests and stale-result fencing. Legacy queued project writes remain review-only rather than executing later. Spanish/French labels and archived empty-state guidance are included.
- Independent review caught misleading failure wording for uncertain outcomes. Failures now say the change is not confirmed and advise refreshing before retrying, without claiming the server did nothing.
- Historical DELETE stored only status=completed. There is no reliable way to distinguish those old archive intents from genuine completion, so no automatic backfill is attempted. Those records remain unarchived and retain their completion status.
- The additive migration has not run against production. Archiving is a list/lifecycle operation, not proof every other endpoint forbids new work on archived projects. Historical record access remains; device UI acceptance and broader workflow restrictions remain open.
- No third-party upload, push, deployment, payment or signed build occurred. Checkpoint preservation remains local-only.
- Final validation: backend build and all 534 backend tests passed; mobile TypeScript and all 213 mobile tests passed, with no failures or skips. Independent review approved the scoped behavior after the uncertain-outcome wording correction. Diff whitespace checks passed.

## Bounded watermark metadata correction

- Corrected a source defect that omitted latitude or longitude zero. Watermark display, reverse geocoding and weather lookup now require a finite numeric coordinate pair within geographic ranges, including the origin and boundary coordinates. Invalid/missing pairs are not displayed or sent to those lookup functions.
- Replaced the image/video overlay label `Verified` with `Metadata checksum` and labelled GPS as recorded data. The short metadata hash is not a signature, media-content hash, or proof of capture location/time. The existing `verificationHash` response field is retained for API compatibility; legacy stored hashes are unchanged. Newly generated missing-coordinate hashes no longer conflate missing location with the origin.
- This is only a bounded correction, not recovery of all historical claims-related changes. Other verification language, company timezone, capture-time provenance, photo-route input validation and physical-device media acceptance remain open.
- Seven prior/current watermark regressions plus a weather-lookup regression passed (8 tests, no skips/failures), with providers, encoders and lookup fetches mocked. Tests load current TypeScript source, not stale dist output. Backend TypeScript `--noEmit` passed; diff whitespace checks passed. Independent review found no scoped blocker; its weather-path test gap was then covered and the focused suite rerun.
- No build, full aggregate suite, physical-device test, provider request, upload, push, payment, production migration or deployment ran for this checkpoint. Preservation is local-only.

## GPS logout race regression

- A historical GPS-after-logout report prompted targeted source tests, not a claim of current physical-device reproduction. The existing consent/stop tests passed, but a new delayed-SecureStore regression exposed a current race: stopping tracking during the last stored-session read could still launch one queued GPS request with the prior session.
- Added a generation check immediately after that asynchronous read, before starting the request. The regression failed before the fix and passes after it. This prevents an old queued request from starting after stop; it does not cancel an already-started network request or prove OS-level polling stops on a physical device.
- All 214 mobile source tests and mobile TypeScript `--noEmit` passed, with no failures/skips. Independent review approved the scoped fix and independently reran all 11 background-location tests. Diff whitespace checks passed. Expo v55 reference and Location documentation were consulted as required by the mobile repository.
- No build, device test, provider request, upload, push, payment or deployment occurred. Latest checkpoint preservation remains local-only.

## Lucy speech/microphone lifecycle correction

- Historical released-native-object reports were not assumed to remain current. The recovered RecorderSession already guards prepare/stop/release lifetimes and has source regressions; its device acceptance remains open.
- Independently reproduced three current source gaps with mocked speech: microphone startup did not stop speech, delayed voice selection could start speaking over a recording, and a new speech request could run while recording. Those regressions failed before this correction.
- Microphone startup now invalidates pending speech and awaits speech stop before permissions/audio setup. Speech initiation is fenced by its own generation, screen/auth scope and recorder state. Superseded callbacks cannot clear the current utterance state. Failed speech stop prevents recording rather than recording over uncertain speech.
- Independent review found a stale speaking flag after authentication-scope reset and an audio-mode ordering gap. Both are corrected: scope reset clears the flag, and screen-owned mode writes serialize with a validity check immediately before native invocation. A deferred older playback-mode operation must settle before microphone mode and recording begin. This demonstrates source ordering, not a claim of native Expo reordering or device verification.
- All 223 mobile source tests and mobile TypeScript `--noEmit` passed, with no failures/skips. Independent re-review approved the final scoped diff and reran all 9 new speech lifecycle tests. Diff whitespace checks passed. Expo v55 Speech documentation was consulted.
- No builds, provider calls, uploads, production writes, payments or deployments occurred. Native speech/camera/navigation/audio acceptance, the rest of the feedback register and pending owner decisions remain open. Preservation is local-only.

## Timesheet submission safety reconstruction

- Reconstructed a bounded portion of the lost timesheet-safety work: correction and approval share a synchronous submission lock, disable duplicate submission controls, use explicit online-only writes, and suppress stale results after account/company/role, selected entry, date range, dialog generation or unmount changes.
- Requests bind the original token and authentication revision. Independent review reproduced a same-token replacement session dispatch race in the first candidate; the request interceptor now checks the captured revision before dispatch. An old-revision 401 cannot log out a replacement session. The new revision field is used by these timesheet writes; other existing token-bound callers were not comprehensively re-audited in this checkpoint.
- Failed or uncertain writes retain the correction draft and ask the user to refresh before retrying, without claiming the server did nothing. Closing/reopening or changing entries exits the old edit form. Spanish/French guidance is included. No backend payroll policy, approver roles, audit rules or paid behavior changed. This is not server-side idempotency or multi-device conflict prevention.
- The existing generic offline path already rejected workforce writes before enqueueing, and older restricted queue entries remain review-only. This checkpoint makes the timesheet call path explicitly online-only; it does not claim to fix a previously working offline restriction.
- Added a CSV export source regression confirming range parameters, CSV filename/MIME/UTI, native share API invocation and cleanup. It passes against the recovered source, so the historical no-share report is not treated as a reproduced device defect.
- Final mobile TypeScript `--noEmit` and all 232 mobile source tests passed with no failures/skips. Independent re-review approved the final scope and reran all 8 focused write-safety tests. Diff whitespace checks passed. No build, upload, provider call, payment, production mutation or deployment occurred. Physical-device and end-to-end acceptance remain open; preservation is local-only.

## Attachment upload admission hardening

- Corrected attachment authentication order: active current-database authentication now occurs before multipart parsing writes a file to disk. The actor is rechecked after file receipt; deactivation or company reassignment during receipt rejects the upload before storage-provider work.
- Attachment actor lookup now rejects inactive users for upload/list/delete. Legacy NULL active flags retain the existing COALESCE(active,TRUE) convention. Existing role and company/target policy was not expanded or redesigned.
- Five isolated source HTTP/PGlite tests pass, covering anonymous/invalid-token/inactive admission, active/legacy-null upload access, account changes during receipt, cross-company project targets, inactive reads/deletes and eventual local cleanup. Provider and attachment-persistence calls are mocked. Independent review approved the scope; its cleanup-timing test suggestion was implemented with bounded polling and the suite rerun.
- Backend TypeScript `--noEmit` and whitespace checks passed. No build or full backend aggregate ran for this checkpoint; existing dist-based suites were not represented as validating changed source. No third-party upload, provider call, production change, payment or deployment occurred.
- This is admission hardening, not durable attachment receipts, provider/database atomicity, continuous authorization locking through provider completion, or a new project-permission model. Other attachment targets retain their existing checks and were not newly covered by this focused project-target suite. Remaining feedback and device acceptance stay open. Preservation is local-only.

## Saved timesheet attachment retrieval/display recovery

- Corrected the timesheet listing's hardcoded empty attachment arrays. The endpoint now retrieves minimal saved file metadata only for time entries already returned by the existing self/manager/company-authorized date-range query, with an additional attachment company filter and stable newest-first ordering.
- Native shift details list saved filenames with explicit open actions. Only HTTPS links without embedded credentials can be opened. Errors and fetch results from a stale account/company/role/date/selection scope are suppressed. The open detail is reconciled on refresh so recovered attachments appear without closing/reopening, while a closed modal stays closed.
- This reconstructs saved-attachment discovery/display, not durable upload receipts, preview rendering, provider privacy, or safe retry after an uncertain upload. Existing upload-path metadata/session issues and physical-device link opening remain separate acceptance work. No project-permission policy or payroll authorization rule was changed.
- Three source HTTP/PGlite authorization/retrieval tests and all 237 mobile source tests passed, with no failures/skips. Backend and final mobile TypeScript `--noEmit` passed. Independent review approved tenant isolation; its stale-detail suggestion was implemented and all 5 focused mobile tests rerun successfully. Whitespace checks passed.
- No build, full backend aggregate, provider call, third-party upload, production change, payment or deployment ran. The unchanged dist-based backend suite is not claimed as validating this source change. Preservation is local-only.

## Opt-in durable backend attachment receipts

- Added an additive receipt schema and migration-runner verification. Receipt-bearing uploads use a stable actor/company/key claim before provider work. The fingerprint binds bytes, original filename, MIME, category and all attachment targets; changed content/metadata rejects key reuse. Legacy clients without a key retain their existing path until native receipt integration is reconstructed.
- Repeated processing/uncertain requests return status without invoking the provider. Completed requests return the original response. Missing receipts do not authorize blind retries. There is no lease expiry, takeover, or automatic resubmission of uncertain provider work.
- Attachment insertion and completed receipt commit atomically. Actor and target ownership are revalidated before provider work and again inside the completion transaction, with row locks. Status lookup is actor/company scoped and rechecks current target access. Deleted completed attachments cannot be recreated by replay; unavailable records return 410 when targets remain authorized, or an authorization/unavailable response when target access has also changed.
- Provider failure or database completion failure leaves an uncertain receipt and never automatically uploads again. An ambiguous COMMIT acknowledgment is covered: when the database committed, status recovers the completed response despite the failed initial response. Provider success followed by database failure can still leave an untracked remote asset; durable provider identifiers and reconciliation remain open.
- Final 21 source regressions passed (13 receipt, 5 admission, 3 retrieval), with no failures/skips. Backend TypeScript `--noEmit` and whitespace checks passed. Independent review approved the scoped design and reran 12 receipt tests; its MIME and ambiguous-COMMIT coverage suggestions were subsequently added and the combined suite rerun. Actual multi-connection PostgreSQL contention remains untested; PGlite fixtures use a shared local connection.
- No native integration, live migration, build, full backend aggregate, provider call, external upload, payment or deployment ran. This is a backend checkpoint, not end-to-end upload acceptance or complete feedback reconstruction. Preservation is local-only.

## Native timesheet attachment receipt integration

- Native timesheet attachments now persist an app-owned copy plus actor/company/entry scope, original filename/MIME and stable request key before sending. Prepared offline records can be sent explicitly later. The submitted phase is persisted before POST; after submission, restart/recovery performs status lookups only, including 404/410, network failures and ambiguous outcomes. It never silently reposts an uncertain attachment.
- One pending record per entry and a shared in-flight lock prevent duplicate choices/submissions. Account/authentication-revision and current-dialog checks fence storage, transport preparation and Axios dispatch. Pending records load when reopening the original time entry. Stale results do not display success or change another detail view.
- Completion requires the exact request key, actor/company, entry and filename. Only then is the scoped app copy removed and the receipt index cleared. Cleanup failure keeps the submitted record for a later status-only cleanup attempt. Corrupt records fail closed; unrelated originals and other-account paths are not deleted. Unsupported names/formats and files over 100 MB are rejected before submission.
- Legacy attachment uploads in the old offline queue now remain review-only, because their prior upload outcome cannot be safely inferred. Existing other queue categories are unchanged.
- Independent review identified two integration blockers, both fixed and re-reviewed: React Native percent-encodes filename headers, and a dialog could change during transport preparation. Native now sends an explicit UTF-8 originalFileName field; backend validation binds that exact value to fingerprint/storage. Local HTTP fixtures cover spaces, Unicode, literal percent names and invalid names. Current-dialog guards run after SecureStore reads and in the real request interceptor.
- Final all 258 mobile source tests and 24 backend attachment source regressions passed, without failures/skips. Backend and mobile TypeScript `--noEmit` passed. Independent re-review approved and ran 51 focused tests; a final native invalid-name regression was subsequently added and the full mobile suite rerun. Whitespace checks passed. Expo v55 legacy FileSystem and DocumentPicker docs were consulted.
- Remaining limits: process death between copying and index persistence can orphan a local copy; process death or cancellation after marking submitted but before HTTP dispatch can conservatively leave a missing pending receipt. Missing/unavailable/uncertain outcomes remain blocked for future reconciliation, rather than allowing a possibly duplicate file choice. Provider-orphan reconciliation, actual PostgreSQL multi-connection contention, device picker/background/storage/native transport acceptance and complete feedback acceptance remain open.
- No builds, live providers, external uploads, production migrations/writes, payments or deployments occurred. Backend receipt migration must precede deployment of this native flow; it has not run against production. Preservation is local-only.

## Voice transcript admission and listing scope

- Transcript-only creation now applies the same existing own-shift/project admission check as audio creation before invoking model processing or saving evidence. Non-string, empty/whitespace-only and oversized transcripts are rejected before processing. Authentication and foreign-project failures return 401/404 rather than an undifferentiated 500, and internal processing errors are no longer returned verbatim.
- Voice listing now checks the current active database actor and current company project access, and filters saved notes by actor, project and company. This prevents a stale authenticated account from retrieving former-company notes. It retains the existing own-notes and company-level project policy; it does not invent the pending project-permission model.
- Converted the existing audio-only HTTP suite from emitted dist to current TypeScript source. Nine voice source tests pass, covering unchanged audio-only behavior, transcript admission, bounded payloads and list scoping. The combined voice/attachment suite passes all 33 tests without failures/skips. Backend TypeScript --noEmit and whitespace checks pass. Independent review approved and passed all 19 audio-only/transcript-edit source tests plus the type check.
- This is a bounded authorization/admission checkpoint, not durable voice receipts. Provider completion authorization races, provider/database atomicity, safe voice retry/recovery and real-device acceptance remain open. No build, live provider, external upload, production migration/write, payment or deployment ran. Preservation is local-only.

## Opt-in durable backend voice receipts

- Added actor/company/request-key receipts shared by audio and transcript-only creation. Fingerprints bind exact input, targets, audio filename/MIME and processing mode. The durable claim commits before any storage, model or adaptive-event call; identical replay does not repeat those calls, and changed inputs conflict.
- Completed response identity includes actor/company/project/shift/mode for future strict native reconciliation. Status checks and replay revalidate the active actor, project, owned shift and saved note. Deleted or reassigned notes cannot be resurrected. Missing, processing and uncertain receipts never authorize automatic resubmission; there is no expiry/takeover mechanism.
- Saved note and completed receipt commit together under current authorization row locks. Lost completion acknowledgments recover the committed response rather than downgrading it. A lost claim acknowledgment can conservatively leave processing without provider execution. Provider configuration errors roll back new audio claims but do not prevent completed replay.
- Additive migration is included and verified by the existing voice release migration runner. No migration ran against production. Legacy no-key clients remain separate and continue to work before rollout; keyed requests fail closed when the receipt table is absent. API details and limits are in docs/voice-receipt-contract.md.
- Independent review approved. All 63 final voice/attachment source regressions passed, including 20 new receipt tests, without failures/skips. Backend TypeScript --noEmit and whitespace checks passed; all 258 unchanged mobile source tests also passed. Local verification includes real HTTP/PGlite fixtures with stubbed providers, failures and lost acknowledgments. Single-connection PGlite does not establish real PostgreSQL lock contention behavior. Native voice retries/offline replay remain unchanged and require a separate integration checkpoint. Provider artifacts and adaptive events remain outside the final transaction and may survive later failures; manual reconciliation remains open.
- No build, live provider, external upload, production write, payment or deployment occurred. Preservation is local-only.

## Native voice receipt integration and restart recovery

- Voice recordings now persist an app-owned audio copy, actor/company/project/shift scope, original transcription mode and stable key before submission. Prepared offline recordings can be sent explicitly later. Submitted state is persisted before dispatch; all later recovery uses status only, even with a missing local file or a missing/uncertain/unavailable server receipt. Legacy unkeyed voice queue entries remain review-only with their files/payloads preserved.
- Completion requires exact receipt identity, key, completed state, note ID, audio URL and mode-specific transcription status. Session/auth-revision, navigation/focus/background and shift changes fence dispatch and stale results. Pending reads serialize behind storage writes. Corrupt/unreadable or unresolved pending data blocks replacement recording. Cleanup only removes the matched app-owned copy; original source files are not deleted.
- Independent review found and fixed four edge cases: stale/ambiguous final cleanup exposing a new-key retry of already saved audio; replacement-screen reads racing preparation; misleading not-submitted text while upload was underway; and completed recovery being hidden by denied microphone permission. Recovery/results now work without microphone permission, although the existing mount-time permission prompt remains. Valid completed evidence with an empty transcript never becomes a fresh upload.
- All 288 mobile source tests passed, including interrupted/repeated/restart-model, mode, identity, storage failure, transport, UI and legacy queue cases. Independent review passed 59 focused tests and found no remaining blocker. Mobile TypeScript --noEmit and whitespace checks passed. Spanish/French copy and API/recovery documentation were updated; Expo 55 audio and legacy filesystem docs were consulted.
- No device/simulator or browser acceptance is claimed. Conservative submitted-before-dispatch failures can remain missing/pending for manual reconciliation. Provider-orphan/adaptive-event reconciliation and real PostgreSQL contention remain open. The backend migration is still a release prerequisite and has not run against production. No builds, live providers/uploads, production changes, payments or deployments occurred. Preservation is local-only.

## Read-only project Files reconstruction

- Project cards now expose a separate Files action while retaining the existing Photos entry. The new screen lists files linked directly to the selected project through the existing attachment endpoint, with distinct loading/error/empty states, refresh/retry, filenames and explicit open actions. English, Spanish and French copy identifies the read-only scope. No upload, deletion or transfer control was added.
- The backend endpoint and permission policy are unchanged. Local HTTP/PGlite tests exercise the actual current source and attachment-list SQL: active database identity, existing company/project scope, employee/manager/boss/admin access, deactivation, stale token company claims, archived projects and rejection of cross-company records. This is existing company-level project access, not the pending project membership/permission redesign.
- Navigation, reads and cached-link actions are fenced by account/company/role, project, focus, request generation and authentication revision. Only HTTPS links without credentials are opened, on an explicit tap; unsupported links retain the filename with an unavailable label. Refresh clears old links while access is rechecked. Duplicate open actions are locked and stale failures are suppressed.
- Independent review identified stale 402 subscription navigation and a cached-link opening window during logout/login storage waits. Both were corrected, including session checks after the read continuation and before displaying ready rows. Final independent re-review found no remaining blocking findings and passed 34 focused mobile tests. Final full mobile source suite passed all 307 tests; the backend attachment/Files source suite passed all 28 tests. Backend and mobile TypeScript `--noEmit` and whitespace checks passed.
- Verification commands: from `mobile`, `node --test tests/*.test.cjs` and `./node_modules/.bin/tsc --noEmit`; from `backend`, `node --test --test-concurrency=1 tests/project-files.test.cjs tests/attachment-admission.test.cjs tests/attachment-receipts.test.cjs tests/timesheet-attachments.test.cjs` and `./node_modules/.bin/tsc --noEmit`; repository root, `git diff --check`.
- This covers the modern `attachments` table only. Legacy `project_attachments` records with local filesystem paths remain separate and are not claimed as recovered or publicly reachable. Files linked only to shifts/timesheets remain with those records. The complete six-section project hub, file transfers, permission design, authenticated provider delivery/privacy and physical-device rendering/native-link/navigation acceptance remain open.
- No build, live provider, third-party upload, production migration/write, payment or deployment occurred. No full dist-based backend aggregate was represented as validating current source. This is a bounded local checkpoint, not complete feedback or release acceptance.

## Personal shift submission and foreground GPS safety

- Compared recovered original dirty files and older Oct 21 dangling sources before continuing: the 17 original files matched baseline b68ee57 exactly, and older Home/API blobs supplied no missing personal-clock implementation. Regression tests reproduced duplicate dispatch, missing active-entry IDs, fabricated zero GPS and unsafe personal-clock offline replay before the fixes.
- Start/finish now share a synchronous lock, use online-only session/view-bound transport, validate acknowledgments, and block another write until status is explicitly reconciled after an uncertain outcome. Clock-in response fields map to canonical entry/project identifiers before tracking starts. Personal clock-in/out legacy queue records remain review-only because replay would record a later server timestamp.
- Missing/invalid start coordinates are not replaced with zero; valid zero coordinates remain supported. Explicit location refresh recovers denied/failed acquisition, with stale-session suppression. Finish remains possible without GPS or a project association. Null/non-string timestamps cannot acknowledge success. Foreground GPS now cancels pending location work and fences transport across logout/session changes rather than merely stopping future timer ticks.
- Independent review approved after fixes for GPS recovery, foreground auth races, malformed dates and existing projectless-entry completion. Source tests exercise rapid taps, failures, stale scope/session responses, status reconciliation, analytics failure, transport interception and interrupted foreground GPS. Device permission-dialog/native GPS acceptance remains untested; this is not durable server idempotency or a new offline timestamp/payroll policy.
- Final all 323 mobile source tests passed without failures/skips. Mobile TypeScript --noEmit and whitespace checks passed. Independent review passed 27 focused tests; additional foreground-GPS and localization tests were then included in the final aggregate.
- Nine shift ES/FR entries were appended to the END of screenTranslations.ts in a labeled section. Preserve these alongside the isolated camera worker’s changes during integration; no CameraView, App.tsx or app.json edits were made here.
- No builds, live providers, third-party uploads, migrations, production writes or release actions ran. Preserve and deploy only the committed, verified checkpoint through the release workflow.

## Subscription status recovery without entitlement changes

- Checked earlier trial/billing history before editing. A rendered regression reproduced failed status reads incorrectly displaying that the trial/subscription had ended. The isolated fix now shows explicit unavailable/retry states, rejects malformed or undocumented responses, and requires verified current status before starting a new purchase. Restore remains available with verified permissions; pricing, entitlement rules and provider verification were not changed.
- Subscription reads bind stored actor/company/role, token/revision, focused view and request generation. Superseded reads cannot display status or trigger subscription-specific logout/navigation side effects. Retained old purchase callbacks are bound to the validated status snapshot so a later active-subscription refresh cannot leave a stale inactive-plan action usable.
- Checked recognized status/provider values against current backend emitters, including internal trials and complimentary testers. Independent review passed 43 focused/regression tests and approved source integration. Final all 342 mobile tests, mobile TypeScript --noEmit and whitespace checks passed. No native/store purchase or restore verification is claimed.
- Known pre-existing shared-auth limit: SecureStore setToken/clearToken writes/deletes remain asynchronous without JavaScript serialization. Native cross-operation ordering has not been established; the new subscription callback fence protects the replacement in-memory session but does not prove persistence ordering across restart. This bounded patch does not claim complete auth-race elimination or full reinstall/subscription acceptance.
- Developed separately from release integration at base 9c134b4. API changes are isolated helper/opt-in response guards; four ES/FR entries append after the shift block in screenTranslations.ts. Preserve both blocks and camera translations during integration. No App.tsx, CameraView, app.json, catalog, backend or provider source changes; no builds, uploads, payments, deployments or production writes ran.
