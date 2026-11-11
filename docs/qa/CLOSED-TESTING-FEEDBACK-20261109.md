# Closed-testing feedback continuation, November 9, 2026

Source: five-page “Feature Feedback And Improvement Summary.pdf”, supplied November 9. This is Future Jobs Pro AI, separate from Fresh Operations. Fresh retains priority.

## Recovery and verification

Recovered the remote source at `ee6f028b14d5761d9b5fb38815b70ee758838a5c` (draft PR #11) into isolated local branch `fix/closed-testing-feedback-20261109`. The interrupted workspace's unpublished implementation was not available; no exact recovery claim is made. Do not overwrite other release branches or assume this candidate is deployed.

First local changes:
- Chat now uses keyboard avoidance on Android as well as iOS, respects top/bottom system edges, keeps composer taps available with the keyboard open, and scrolls after keyboard/layout changes. Listener cleanup is explicit.
- Site capture no longer forces every captured video to an MP4 MIME type or every photo to JPEG; original camera metadata or URI-derived format is preserved. Offline upload queue acknowledgments are labelled queued rather than failed.
- Mobile TypeScript passed. Full mobile source suite passed 149 tests, no skips/failures. Four new checks include metadata behavior and static chat/capture wiring. Static assertions do not establish physical keyboard, native camera, or background synchronization acceptance. `git diff --check` passed.

No production deployment, paid inference, native signed build, store submission, or physical-device test has occurred for this batch.

## Exhaustive PDF acceptance register

“Existing source” means code was observed, not that device/live acceptance passed. Every item below remains open until its behavior is implemented and verified, including the initial fixes.

### Projects
- Transfer photos between project files: open, inspect APIs and authorization before implementation.
- Archive or permanently delete projects instead of treating deletion as completed: open. Current native list hides completed projects and calls DELETE. Prefer recoverable archive; permanent deletion needs an explicit in-product confirmation and retention design.
- Assign/add/remove employees and managers in project settings: open; preserve tenant and project permissions.
- Single project hub with Schedule, Team, Photos, Voice Notes, Files, Hours: open.
- Interactive empty states and permission indicators: open.

### Schedule
- Search schedule topics: third local candidate adds case/accent-insensitive search over the authorized loaded date range, including shift title, project, address and notes. Physical-device UI acceptance remains open.
- Calendar/grid/day/week/month: native month/week/3-days/day source exists; verify layouts and clarify grid coverage through implementation, not assumed completion.
- Tie shifts to projects and “Start verified shift”: open acceptance, inspect existing create/clock-in integration.
- Highlight today: existing source, device acceptance open.
- Double-booking/overlap warnings: open end-to-end verification.
- Calendar export (including Google Calendar-compatible files): open. Do not create OAuth grants or external calendar events without their required consent.
- Clear attachment preview within a shift: existing open-attachment action; preview behavior still needs verification.

### Voice notes
- AI noise removal: open; choose/evaluate implementation without activating unapproved paid inference.
- Visible timer: existing source; device acceptance open.
- Real waveform feedback: open; current visual bars are deterministic, not measured audio.
- Pause/resume: open.
- Locked-screen recording: open; current Expo audio configuration explicitly disables background recording. Requires privacy/OS lifecycle design and native builds/device acceptance.
- Optional transcription/audio-only mode: open; current processing requires a nonempty transcript.
- Side-by-side editable transcript: open.
- Explicit transcription state: open acceptance.
- AI summary: source displays client summary; quality/provider acceptance remains open.
- Clearly distinguish voice-note microphone from Lucy: open UI acceptance.

### Site photos and video
- Integrated native in-app camera: open; current implementation launches image-picker camera UI, not an embedded expo-camera view.
- Reduce camera switching latency and memory: open measured acceptance.
- High-resolution video capture/sync: metadata correction included locally; actual recording/playback/upload remains unverified. Backend currently buffers uploads in memory and allows up to 1 GB; resource-safety redesign is needed before claiming robust large-video support.
- Timestamp/GPS overlay/verified badges: source watermarking exists; inspect zero-coordinate handling, capture timestamp provenance, company timezone and honest verification language. Do not imply a cryptographic marker proves real-world truth.
- AI safety checks: source exists; availability, correctness and false-positive/negative evaluation remain open. Never substitute invented scores.
- Offline queue/background upload/progress: existing API copies offline uploads to persistent storage and replays on network changes. Durable replay, duplicate suppression, account isolation, OS background operation and progress UI remain open.
- Low-bandwidth image compression: open camera-path implementation/acceptance.

### Messages and roles
- Keyboard overlap/scrolling: first local candidate implemented; physical Android/iOS acceptance open.
- Sending/sent/delivered/read/failed statuses: open. HTTP acceptance is not read/delivery proof.
- Offline message queue: open; requires durable server idempotency and membership rechecks before replay.
- Custom themes (summary matrix): open.
- Job descriptions/custom role labels beyond Boss/Manager/Employee: open. Keep labels separate from authorization roles unless a reviewed permission model supports expansion.
- Admin approval for profile/data edits: open; identify field-level scope and preserve independent approvals.

### Timesheets and tracking
- CSV export: second local candidate uses explicit company timezone, preserves overnight clock-out dates, UTF-8 accents and formula-safe project text. API/database and serialization tests pass. Live/device sharing acceptance remains open.
- PDF export: second local candidate adds `format=pdf` to the same authorized endpoint and a CSV/PDF native chooser. Binary download, content-type validation, duplicate-action lock, stale-account/scope suppression and cache cleanup are implemented. Device sharing acceptance remains open.
- GPS history replay performance/stability: open measured/device acceptance.
- Consistent hours/timestamps across cards/lists/exports: existing native totals utility and tests; cross-surface and export reconciliation remains open.

### Subscriptions
- Non-tester fresh install/reinstall onboarding trapped at subscriptions: open end-to-end reproduction; existing subscription-recovery code is not proof this new report is fixed.
- Storage capacity for site videos: needs proposed capacity/cost model and explicit commercial decision, not an invented free quota.
- APAC/EMEA pricing: needs exact proposed regional prices/currencies and owner approval before store/catalog changes.
- Team-capacity scaling: needs exact tier/capacity decision and compatibility plan for existing customers.
- Premium incentives: product decision and implementation open; do not promise unimplemented benefits.
- Annual discounted billing: requires approved amounts/discounts, store products, entitlement/migration design and actual purchase/restore tests. Do not create charges or subscriptions from this checklist alone.

## Release gates

Future Jobs Android/iOS build and submission are authorized, but unapproved build/service charges are not. Reconcile existing EAS/store accounts and current binaries before any new action. Preserve current signed releases. Run final full affected suites, independent security/correctness review, required backend/web builds, and physical-device/media/offline/subscription checks before claiming readiness. Build success, upload success, review acceptance and public availability are distinct outcomes.

Do not mark this feedback batch complete based on the first four source checks or the baseline tests. User notification is requested only when done or when a decision/input is required.

## Second local checkpoint: timesheet exports

- Added shared CSV/PDF row calculations, retaining locked payroll values, company timezone and net unpaid-break hours. CSV includes a UTF-8 BOM, escaped quotes/newlines and formula-prefix protection even after whitespace.
- Added a PDF report with embedded DejaVu Sans (license included), company timezone and explicit employee ID. It is labelled as a timesheet, not a pay statement; wage amounts retain the record currency without inventing a currency code.
- Both formats use the existing tenant/role checks. Format and calendar-range validation reject arrays, unknown formats and invalid dates. Tests cover cross-company, employee-to-other-employee and anonymous access for both formats.
- Native exporter downloads bytes directly instead of treating PDF as text; it validates status/content type, presents only the explicit OS share chooser, and cleans its unique cache file afterward. Scope/token are rechecked after asynchronous work; duplicate taps share one synchronous lock. New UI labels have Spanish and French translations.
- Backend TypeScript and 25 focused export/overtime/API/database tests passed. Mobile TypeScript and all 154 source tests passed. An independent review identified a stale-scope timing race; it was corrected and a regression added. Re-review confirmed the fix and found no additional blocker.
- Rendered both pages of a synthetic 20-entry PDF and visually checked layout, pagination and accented French text. Text extraction retained all 20 project rows. This is a synthetic artifact check, not real payroll acceptance.
- Final full backend suite passed 485 tests, with no failures or skips. Final mobile suite passed 154 tests, with no failures or skips; TypeScript passed for both backend and mobile. No deployment, native build, payment or store submission occurred.

## Third local checkpoint: schedule search and request safety

- Added a labelled search field over the loaded date range only; no broader endpoint, account or company scope is requested. Multi-word literal search matches shift title, project name/address and notes, ignoring case and common accent marks. Search results span the loaded range, while clearing the query restores the selected-day filter for month/day views. Calendar dots reflect matching shifts.
- Added Spanish/French translations, explicit clear action and a no-results state.
- Scope/date/employee/focus changes clear old shift details and lists, and invalidate pending results and error alerts. Employee requests use a separate counter so refreshing shifts cannot discard a valid pending employee-picker response.
- Eight focused tests cover matching, clearing, no mutation, stale shift results/errors and both employee refresh and stale-scope races. Independent review caught the employee-refresh race; it was fixed and the reviewer confirmed no remaining blocker in this change.
- Native visual/keyboard/device acceptance remains open. No backend source, production service, pricing, subscription, build, payment or store state was changed.
- Final mobile TypeScript and all 162 source tests passed with no skips/failures. Offline iOS and Android Hermes bundle exports passed. Initial concurrent export attempts were killed with exit 137; sequential retries with one Metro worker and a 1536 MB Node heap succeeded. These are JavaScript packaging checks, not signed native binaries or physical-device acceptance.

## Fourth recovery checkpoint: audio-only notes and media upload work

This checkpoint is not release-ready. It is preserved while environment availability is being reconciled.

- Audio-only voice notes: explicit native toggle and `transcribe=false` backend mode skip AI processing/events, save audio with null transcript/summary/structured data, preserve mode through retry/offline replay, and keep existing-client transcription default. Invalid auth returns 401. Worker verified backend build, six HTTP tests, mobile TypeScript and all 168 mobile tests. Real-device capture/playback remains open.
- Media: authenticate active actors before parsing uploads; disk-backed uploads replace 1 GB RAM buffers, with two in-flight jobs per process, a supported-MIME allowlist and partial-file cleanup. Employee attribution requires self or manager role, and supplied shift must match employee/project/company. Videos use 6 MB Cloudinary chunks. Encoder fallback keeps the original container and explicitly reports `applied:false` rather than claiming a watermark. FFmpeg/ffprobe now execute directly without a shell, with bounded timeouts and SIGKILL on timeout.
- Latest backend build and 18 focused media/voice/stream/fallback tests passed. These tests use local mocks/HTTP fixtures, including aborted multipart cleanup, authorization, provider failure, concurrent work and transform fallback. Final full backend suite after these edits has not yet run.
- Important unresolved synchronization gate: native media requests still time out after 60 seconds, while server processing may take longer. Stable durable receipts/idempotency and safe reconciliation are not implemented yet; retries could duplicate evidence. Do not call large-video synchronization complete or deploy this as a finished fix.
- The Cloudinary SDK holds an in-flight HTTP request separately from its chunk stream; destroying the chunker is not proof of full remote cancellation. The existing per-request SDK timeout remains relevant. No live upload/cancellation acceptance was performed.
- A receipt implementation worker paused without edits. Planned contract: stable request key, actor/tenant-scoped durable claim with content/attribution fingerprint before provider work, saved completed result on replay, no automatic retry of processing/uncertain requests, authorized status lookup, atomic photo+receipt completion, and no automatic takeover of crashed uncertain claims.
- No push, deployment, signed build, store submission or payment has occurred for any feedback checkpoint. Local commits alone are not remote preservation.

## Fifth local checkpoint: project guidance and decoder fallback

- Commit `1bb1e1c` adds permission-aware project empty states: managers can create a first project, employees see who can add one, and edit/archive controls reflect existing role permissions. Fetch errors are visible and retryable. Account changes remount owned state, stale responses are ignored, create drafts are separate from edit forms, and unreadable drafts are not overwritten. This does not implement a distinct archive lifecycle; the existing backend completed-status behavior remains open.
- Six project regressions and six localization checks passed, along with mobile TypeScript. Spanish/French project strings and upcoming voice-control labels are included.
- Image metadata/decoder preparation now falls within the watermark fallback guard, so locally undecodable supported media retains its original file/container and reports no applied watermark. Three fallback regressions and backend TypeScript passed.
- Private recovery backup through `2548fb9` was saved and independently materialized, SHA-256 checked and Git-bundle verified. Later checkpoints must be added to that same recovery item before calling them remotely preserved.
- Durable photo receipts and their native lifecycle are under implementation. HTTP receipt regressions pass locally, but database-concurrency tests, native integration, independent re-review, aggregate checks and device acceptance remain pending. This checkpoint is not release-ready.
