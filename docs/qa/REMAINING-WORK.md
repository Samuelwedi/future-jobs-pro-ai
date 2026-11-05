# Future Jobs Pro AI — retained work register

Updated 2026-11-03 (local). The tester report is the current priority; this register remains open alongside it. Historical failures are not evidence that the current deployed release failed.

## Latest continuation — 2026-11-03 (local)

- Lucy repair run `41774413412` passed 218 backend, 35 mobile and 14 portal tests plus customer-web and portal builds. The reviewed mobile recording guard was integrated as `5a039ac92f9adb49c278d5e149571bb51632ed4b`.
- Railway deployment `b5ebaa69-2430-4ad8-b244-f0c3f5b42fa4` succeeded and portal deployment `dpl_DF1vv46mRbng83w8pdGXegY2Abia` was READY for that commit. Customer web remains on `f6e08b9bf17c843ffa762041e03542641006d93d`; its web source is identical to this checkpoint.
- Signed builds containing the guard succeeded: iOS 1.2.8 (57), `242964ad-afb0-4a92-9ace-de890f7c4685`; Android 1.2.8 (11), `31b1fa27-5e22-46e5-acd4-c104afe2c6fa`. The additional USD 3 plus tax pair was explicitly approved. Neither was submitted. Physical-device acceptance is still open.
- The repair worker has no daily limit. GPT generation, isolated verification and candidate publication have been exercised. Automatic production deployment is restricted to eligible portal repairs; broader/sensitive changes require review. Native store submission remains human-controlled.
- Expo Doctor on the successful iOS build reported available patch updates for Expo, expo-dev-client, expo-location and expo-sharing. These were not incorporated into the verified binary.
- Email-delivery correction: invoices send their escaped line-item summary to a client in the same company and only mark sent after SMTP acceptance; accidental repeat sends and paid/cancelled invoices are rejected. Explicit reminders preserve overdue/viewed status and are limited to once per minute per invoice. No nonexistent public payment link is manufactured. Generic and attachment email failures now propagate, and pay-stub responses reflect provider acceptance. Tests mock delivery: no customer email was sent as part of verification. Inbox delivery and payment acceptance remain unverified.
- A provider accepting an email is not evidence of inbox delivery. If SMTP acknowledgement or the following database commit is uncertain, the API requests checking delivery before retrying rather than claiming success.

- Email correction deployed as `57d56c9` to Railway (`7295e0c2-82f2-47f2-bed8-ab75336be9de`, SUCCESS), customer web (`dpl_84cMJj1dsUY8S8JQJ9cMZsGqZQ3A`, READY), and owner portal (`dpl_EAht8G6E7mDmM8PPGAutcvtJss2o`, READY). Full backend suite passed 226 tests before one additional resend regression; subsequent rebuild and all 9 delivery-focused tests passed. Customer web build passed.
- Authenticated read-only customer acceptance: dashboard, schedule/create form, invoices, support and timesheets loaded. QuickBooks and Stripe both display Connected for the signed-in company. No records were changed and no messages were sent. Connection status does not establish QuickBooks Time/Payroll sync or real billing acceptance.
- Follow-up UI: corrected integration-label encoding; added a visible Cancel button and in-dialog error feedback to scheduling. Dismissal is disabled while saving.
- Follow-up source gaps identified at that checkpoint: estimate delivery/editing and overnight scheduling. The continuation below addresses these; full mobile localization and the retained acceptance groups remain open. Full parity is not complete.

### Parity continuation — 2026-11-04 UTC

- Estimates: Send now submits an escaped line-item summary through SMTP and only marks sent after provider acceptance. It rejects foreign-company recipients and repeat sends. Draft create/edit validates dates, quantities, prices and company-owned references; the previously absent PUT endpoint is implemented. Writes are transactional. Invoice conversion locks the estimate, rolls back partial copies, and reuses the existing invoice on retry; converted estimates cannot be reset through Accept.
- Customer web: estimate numeric strings from PostgreSQL no longer crash amount rendering; edit dates are normalized for date inputs. One-off and recurring overnight shifts end on the next local day. Shift edits save the selected date/project, normalize time inputs, and preserve legacy attachments. Cancel clears form validation.
- Validation: backend TypeScript build and all 235 backend tests passed; customer-web TypeScript/Vite build and both overnight/date-range tests passed; `git diff --check` passed.
- Verification uses isolated local database fixtures and mocked email delivery. No real estimate, invoice, payroll record or customer email was created during tests. Live inbox receipt remains an external acceptance item.
- These changes contain no mobile source changes and do not trigger a new paid native build or store submission. Full localization, QuickBooks Time/Payroll live synchronization, device testing, and all retained groups remain open.

### Mobile localization continuation — 2026-11-04 UTC

- Added Spanish/French copy to Support, Timesheet, Schedule and Create Shift: static labels, form placeholders, key alerts, calendar modes and weekdays, support status, selected-employee counts and attachment labels. Date-fns display dates use the selected locale. Route identifiers, API states, user messages, employee/project names and file names are preserved.
- Mobile TypeScript and all 36 mobile tests passed. Expo production exports produced both iOS and Android Hermes bundles. These source changes are not in the previously built iOS 57 / Android 11 binaries and are held for the final native build; no paid build or submission was started.
- Localization remains partial across the other screens and dynamic/server error messages. These four screens are an expansion, not evidence that the full app is translated.
- API commit `07208d2` deployed successfully: Railway `b965a418-47de-4f24-9687-374705a41a77`, healthy after startup. Customer-web deployment `dpl_ECZMsi8rYds54e1ouCxkQk7dne2C` is READY on the canonical domains. Signed-in estimate listing loads. Real email delivery was not exercised.

### Authentication and chat localization — 2026-11-04 UTC

- Extended Spanish/French static UI copy to Login, Register, Forgot Password, Change Temporary Password, Chat List, Chat, New Chat and Select Employees. Password visibility labels and chat-mode actions are localized. Brand names, route identifiers, file names and customer-authored messages are unchanged. TypeScript and all 36 mobile tests passed, including translation-key coverage for all 12 screens changed in the two localization continuations.
- QuickBooks source audit: `quickbooksOAuth.ts` requests accounting scope only. Current integration service supports customers/sales receipts and Stripe-payment import; it contains no QuickBooks Time schedule or payroll-result import worker. The web integration screen now states that distinction explicitly.
- Provider prerequisite remains unverified: Intuit's current developer documentation limits workforce employee data to approved partners (`qb.employee.read`); Premium Workforce APIs require eligible partner access. The existing accounting OAuth grant does not establish these permissions, and worldwide payroll availability is not established. No paid partner upgrade, new OAuth permission grant, or fabricated synchronization was performed.
- Official references: https://developer.intuit.com/app/developer/payroll-time/docs/workflows/payroll-employee and https://static.developer.intuit.com/output_html/qbo/docs/get-started/partner-faq.html . Account eligibility and per-country API availability must be verified before activating this integration.

### Contact delivery and work-screen localization — 2026-11-04 UTC

- Fixed false success in both Contact forms. They now POST to a public, rate-limited contact endpoint with a fixed support recipient, bounded/escaped input, explicit SMTP acceptance and failure responses. Failed submissions retain the draft; in-flight submits are locked. The mobile form sends directly without putting contact messages in the offline action queue. No live message was sent during validation.
- Removed the placeholder phone number and unverified two-hour/24-hour support response promises from Contact. Success means the mail provider accepted the message, not that a person read it or that inbox delivery is established.
- Added Spanish/French static copy to Tasks, Projects, Contact, Folders and History, including task statuses/actions and key validation messages. The regression covers translation keys across 17 screens changed in these continuations. Other screens, dynamic errors and complete translated device acceptance remain open.
- Validation: backend TypeScript and all 236 backend tests passed; mobile TypeScript and all 36 mobile tests passed; customer-web production build passed. iOS and Android Hermes exports passed before the final label-only translation adjustments, which passed TypeScript and tests. No new signed build or store submission was started.

The earlier records below are retained as historical checkpoints; approval and build statements there do not supersede this continuation. All remaining and paused groups are retained.

## Earlier verified release — 2026-10-31

- 2026-10-31: PR #4 merged as `79fc245b8f4564dee89d46847bc1a6a315e9dba3`. Railway production deployment `481dc079-d376-43fa-b1b0-f85e9142a4f3` is Active; release migrations completed and live health is healthy.
- Customer website production deployment `dpl_EprYJCjhCvPyjUWQUHZn2kcE1xbH` is READY on the same merge commit and assigned to futurejobsproai.com.
- All seven Google Play Team subscription products have an active monthly base plan. Team 95/110 exclude South Korea because converted prices exceed its KRW 600,000 limit. Other regional prices are Google converted; exact Canadian prices are approved. Real purchase/restore acceptance remains open.
- New signed builds await explicit approval of USD 3 plus tax for one medium iOS and one medium Android build. The separate Vercel portal production target awaits explicit confirmation after automatic review rejection.

## Earlier verified release baseline

- Backend commit `47562984dbae9fb15adcd85b815ff4d18374aebc` deployed to Railway production successfully. Deployment `dbdf55ad-5158-4dda-80a7-fe8e027f17ad`; `/api/health` healthy when checked in the preceding release work.
- Customer web production Ready at `f9204b2`; portal production Ready at `4756298`.
- iOS 1.2.8 build 55 uploaded successfully to App Store Connect through Expo project `samuel33/future-jobs-pro-ai`. Submission `3ee979e0-628d-497f-aa5d-29d45216cda8`. Upload does not establish Apple review approval or physical-device acceptance.
- Previous baseline validation: 202 backend, 29 mobile, 13 portal, and 18 repair tests passed.
- Tester QA changes are tracked separately in `TESTER-REPORT-20261031.md`; they are not part of build 55 or the baseline production deployment.

## Remaining groups — retained

1. Real Android/iOS acceptance: recorder, wake word, camera, GPS, offline work, notifications, attachments.
2. Apple processing, TestFlight availability, and public App Review.
3. Android publishing remains paused; Expo binaries exist but current Play publication is unverified.
4. Google Play closed-test and production requirements and evidence.
5. QuickBooks production reconnect, webhook acceptance, payment-to-receipt/invoice flow, automatic schedule/payroll sync.
6. Live Stripe, Apple, and Google billing acceptance, entitlements, and usage enforcement.
7. Independent payroll review, live settlement, tax remittance, and jurisdiction-specific certification. Manual payroll exists; worldwide certification is not established.
8. Full signed-in acceptance for each role and workflow.
9. Real chat media, profile, and pay-rate acceptance.
10. Complete mobile/web parity audit.
11. Hosted load/soak/concurrency, backup restore, monitoring, and rollback acceptance.
12. Closure evidence for older security findings.
13. Automatic invitations and SMTP delivery acceptance.
14. Enhancements: schedule optimization, document ingestion, crew globe, universal undo.
15. Windows installer acceptance.

## Explicitly paused — retained

- AWS: preparation only; no paid rollout.
- Credential/API-key rotation: deferred.
- Android publishing: held.
- Other pricing changes: deferred. The seven existing CAD catalog amounts were explicitly approved and activated; see current release above.

## Existing deliverables

The historical tester guide PDF, sales deck, and Reddit post were already supplied. Update those artifacts when appropriate; do not recreate them as unfinished work.

## Additional screenshot work

See `SCREENSHOT-FOLLOWUP-20261031.md` for media playback, compatible Lucy inference, expired-trial payment recovery, and the store-catalog approval state. The original lists above are retained.

## Current source follow-up

Email verification and web profile persistence are implemented in source, validated locally and pending release. Email links are random, hashed at rest, expire after one hour, and are consumed atomically; old links cannot verify a changed email. Existing accounts are not falsely marked verified or locked out of billing. Mobile Profile and web Settings expose status and email resend; confirmation uses the public verification page. SMTP failure is returned explicitly. Live delivery acceptance remains open.

Validation for this source follow-up: backend build and all 215 tests passed; mobile TypeScript and 34 tests passed; customer web production build passed. Physical devices, SMTP delivery and store acceptance remain open.

### Media and GPS localization continuation — 2026-11-04 UTC

- Extended Spanish/French static copy across Project Album, Project Media, Month Media, Month Media Type, GPS Playback and Crew Tracking. Translated media categories and complete count/empty-state messages avoid joining English plural suffixes into translated sentences. User names and content are preserved. Dynamic errors and remaining screens still require localization.
- Mobile TypeScript and 36 regression tests pass; translation coverage now includes 23 screens in these continuations. No new signed native build or store submission was initiated.
- Confirmed contact-delivery API deployment `42aac52e-8fe9-4a09-a4fc-6ea65e128f0d` SUCCESS and web deployment `dpl_4iYmhp7T8CEGTC9cx3tnqs3tpJYo` READY on the canonical domains, both at `c5df4e2`. Live mailbox delivery has not been exercised.

### PTO correctness and mobile/web parity — 2026-11-03 local (2026-11-04 UTC)

- Removed invented default leave balances. An unconfigured balance is returned as null and explained on web/mobile; balance reads are scoped to the employee's company. This does not add accrual policy or establish jurisdiction-specific leave entitlements.
- The legacy company PTO listing now restricts employees to their own requests and managers to their company. New requests validate real calendar dates and bounded reason/range inputs. A transaction locks the employee before checking overlaps and inserting, preventing concurrent submissions from both passing the check; failures roll back.
- Mobile now prevents duplicate in-flight submissions/decisions, retains failed forms, validates impossible dates and offers unpaid/other leave types like web. PTO and company settings changes require online confirmation, including old queued records; evidence uploads still queue. Old blocked queue records require review and are not discarded automatically.
- Web leave-type options now use the correct menu component; errors appear inside the open form, fields and dismissal are disabled during saves, and date-only values retain their calendar day across timezones.
- Validation: backend TypeScript and all 240 backend tests passed; mobile TypeScript and 37 tests passed; web build and all 4 date/range tests passed. Database fixtures and offline replay are isolated; no live leave request, approval, employee balance or notification was created. Deployment verification follows separately.
- Native changes remain source-only until the final approved build. Existing native binaries still contain their earlier balance fallback. All retained parity/acceptance groups above remain open.

- PTO production verification: API deployment `c2e630f3-b135-4546-8c97-21c8d8ded835` SUCCESS; customer web `dpl_6eQ63tUggiHocTcyemtYfxSFoe32` READY at `7e682a2`. Signed-in `/pto` now shows the unconfigured-balance notice. All five leave options open and selection updates; the form was cancelled without submitting. No live approval/request acceptance is claimed.
- Completed Spanish/French static labels, statuses, leave types, count messages, validation/success messages and selected-language timestamps in mobile PTO. Customer-written reasons and server-returned errors are preserved. Mobile TypeScript and all 37 tests pass; translation-key coverage spans 24 screens in these continuations. These changes await the final native build.

### Offline recovery continuation — 2026-11-04 local

- Added Profile → Offline sync, with queued/review/archived status, manual sync and reversible reminder archiving. Raw request payloads, private notes and file paths are not displayed. Archiving preserves the original action and file reference; restoring returns it to review, never automatic execution.
- Restricted legacy queue items no longer prevent routine media/work items from syncing. Failed routine sends remain queued and preserve their order. Corrupt queue data is not overwritten. Review operations are scoped to the signed-in account and reject an account switch; concurrent sync attempts share one run.
- Closed additional offline-policy gaps: team roles/invitations, user profile changes, kiosk PIN/configuration, workforce corrections/approvals and Lucy v2 now require online confirmation. Existing records for these routes remain available for review. The background sync listener is only active while authenticated.
- Mobile TypeScript and all 41 tests pass. iOS and Android Hermes exports passed before the final endpoint-policy expansion; that expansion passed TypeScript and all tests. These checks do not establish physical-device/offline acceptance or exactly-once delivery after an uncertain network acknowledgement.
- API deployment `c2e630f3-b135-4546-8c97-21c8d8ded835` remains SUCCESS and customer web `dpl_6eQ63tUggiHocTcyemtYfxSFoe32` remains READY at `7e682a2`. No backend/web source changed in this batch. Native changes await the final build; no paid build or store submission was initiated. All remaining and paused groups are retained.

### Team and company settings continuation — 2026-11-04 UTC

- Mobile team actions now follow existing API role permissions. Failed team loads and mutations are visible; synchronous guards prevent duplicate in-flight invitations and member changes. Invitation feedback distinguishes email-provider acceptance from failed delivery. Ownership transfer refreshes access without describing a completed transfer as failed when the old session expires.
- Company settings must load successfully for the signed-in company before editing. Failed loads offer Retry and Back instead of editable defaults; saves block repeated submissions and editing while pending. Settings/profile writes remain separate and are not an atomic transaction.
- Removed unsupported encryption-version, certification and blanket legal-compliance claims from the mobile Security screen, replacing them with account-protection guidance.
- Team/settings changes passed mobile TypeScript, all 41 regression tests and both iOS/Android Hermes exports. The subsequent security-copy correction is validated separately below. Physical-device and live invitation acceptance remain open. No backend/web changes, paid native build or store submission in this batch. All previous remaining and paused groups are retained; full parity is not complete.
- Final validation including the security-copy correction: mobile TypeScript and all 41 tests passed; git diff whitespace checks passed.

### Crew Clock continuation — 2026-11-04 UTC

- Replaced zero-coordinate mobile bulk clock submissions with foreground-permission/current-device-location capture. The UI explains that this is the supervisor device location and selected employees must be present; this is not individual employee GPS proof. Permission/location failure prevents submission.
- Failed employee status lookups now appear as unknown and cannot be selected. Failed list loads clear stale choices and block submission. The project selector uses a scrollable list instead of an alert with an arbitrary number of buttons.
- Bulk and forced clock actions share a synchronous in-flight guard. Modal close, selection and submit controls are disabled while pending. Partial responses identify unconfirmed employees and retain their selection; uncertain network responses instruct refreshing status before retrying. Existing boss/manager API permissions control action availability.
- Supervisor bulk clock-in/out and forced clock-out require online confirmation. Legacy queued actions remain reviewable and cannot replay automatically; ordinary personal clock actions retain existing offline behavior. Regression coverage exercises both sides of this policy.
- Mobile TypeScript, all 42 tests and iOS/Android Hermes exports passed. No live clock record, paid build or store submission was created. These mobile changes await the final native build.
- Additional backend follow-up identified: bulk clock-in currently inserts time-entry and GPS rows separately, does not lock employee rows against concurrent starts, and needs explicit project/company validation. This batch does not close those API concerns, real-device location/clock acceptance, localization or the other retained groups. Full parity remains incomplete.

### Crew Clock API and web continuation — 2026-11-04 UTC

- Bulk clock-in now validates bounded UUID inputs and finite coordinates, checks an active boss/manager and all requested active employees in the same company, and verifies project ownership. Duplicate requested employee IDs are normalized.
- Ordered employee row locks serialize overlapping requests through this bulk endpoint. Time-entry and GPS writes commit together; a failure rolls back the entire new batch. Already-active employees receive individual failure results. Other legacy clock-in paths do not yet share this locking protocol; cross-path concurrency acceptance remains open.
- Customer web now captures browser location for bulk clock actions, explains that it is supervisor-device evidence, checks HTTP failures before reporting success, blocks duplicate submits, refreshes status when opening the form, and retains unconfirmed employees with explicit results. Force clock-out no longer reports success for a failed HTTP response.
- Validation: backend TypeScript and all 242 backend tests passed. A strengthened targeted test also verifies rollback when the second employee GPS write fails, followed by successful retry and duplicate protection. Customer web production build passed. Tests used isolated database fixtures; no real clock records or messages were created.
- Source publication and production status will be verified separately. No native build or store submission was started. Full parity, real-device acceptance, other clock-in paths, and all other retained/paused groups remain open.

- Production verification: API deployment `02df0022-df3b-4977-8858-a4c836f68a46` SUCCESS and customer web `dpl_DRAAooJvaJZjZUkSV9FEkn77kz9d` READY at `ca5b09b`, with canonical domains assigned. Signed-in Crew Clock loads the new supervisor-location notice and employee list. Empty submission shows validation, and Cancel closes the form. No real clock event or location grant was submitted during browser acceptance.

### Shared clock transaction continuation — 2026-11-04 local

- Personal clock-in, manager PIN kiosk, public PIN kiosk, shift crew clock-in and the older time-entry service now share the bulk endpoint transaction and ordered employee locks. All non-manual clock-in inserts are centralized; company, project and active-member checks apply before writes. Both legacy/new coordinate fields and company ID are retained. Unknown kiosk location is stored as null without fabricated GPS evidence.
- Public kiosk PIN, enabled state and subscription entitlement are rechecked inside the transaction. Personal and kiosk duplicate starts return conflict; bulk/crew preserve per-employee results. This is source-level shared-lock coverage, not a hosted multi-connection stress-test result.
- Legacy crew mutations now require an active manager in the company. Shift references are company-scoped, and crew clock-out uses the shared overtime/payroll-lock-aware completion service instead of directly updating time entries. Shift-based clock-out is limited to the shift project. Multi-employee clock-out remains per-employee transactional, not all-or-nothing.
- Successful clock writes are not reported as failed solely because office-location or adaptive event logging fails. Legacy supervisor crew clock-in cannot replay offline; saved legacy records remain reviewable.
- Focused database tests cover rollback after the second employee GPS write, duplicate starts across entry points, foreign-company projects, PIN/entitlement checks, and crew endpoint authentication/authorization. They use isolated fixtures and do not create live work records. Mobile TypeScript and all 42 mobile tests pass. Full backend validation and release results follow separately.
- No native build or store submission started. Full parity, real device/physical GPS acceptance, clock-out batch recovery, shift-assignment concurrency, provider integrations and all other retained groups remain open.
- Final validation: backend TypeScript build and all 246 backend tests passed; mobile TypeScript and all 42 tests passed; whitespace checks passed.

### Current acceptance scope — 2026-11-04 local (2026-11-05 UTC)

- User excludes QuickBooks from the completion/release scope. Preserve its historical findings without treating it as a release requirement for this request. User requests remaining translations/screens, billing/email acceptance and other workflow checks before final build/submission.
- Previous API/portal alignment is verified at `1216ceb`: Railway `1d21c2e4-0a04-4eff-8f23-c422db6fef9d` SUCCESS with healthy new runtime; Vercel portal `dpl_J6Lz5XSJXbjEeKFqKUrBnBB6BF4H` READY on the same commit.
- Signed builds at `1216ceb` succeeded: iOS 1.2.8 (59), `0b4aa088-d5f0-4c23-8ca1-a43c4a032bdc`; Android 1.2.8 (13), `063b9d01-a25f-44a5-9268-a16e1868394b`. Neither was submitted. Earlier iOS 58 and Android 12 submissions are a separate release; older statements that Android publishing is paused are superseded by the user's approved production/open-testing submissions.
- Added Spanish/French screen copy to Team, Kiosk, Company Settings, Crew Clock, Voice Note and Subscription, including complete interpolated invitation/ownership/clock-result messages and billing plan descriptions. Store prices, employee names, API states, route IDs and customer content remain unchanged. This is not complete app localization: remaining camera, Lucy, tools, payroll-rule, legal/about/demo and profile fragments still require review, as do dynamic server errors and translated device layouts.
- Kiosk now uses a scrollable project picker and a shared synchronous lock for clock/PIN/configuration mutations. Inputs and modal dismissal are restricted during pending writes; failed requests release the lock.
- Subscription purchase and restore use a shared in-flight lock. Pending purchases disable all other plans and restore. Active/trial/grace provider subscriptions block starting another subscription; expired subscriptions retain recovery access. Unverified transactions are not acknowledged as completed.
- Validation: mobile TypeScript, all 46 mobile tests and iOS/Android Hermes exports passed. All 246 backend tests passed, including isolated billing/entitlement, email delivery/verification, clock, payroll and tenant-isolation checks. Three new tests execute the actual action handlers with delayed/failing provider responses. These are simulated-provider checks, not live purchases or inbox evidence.
- Customer website currently requires sign-in for live acceptance. No real payment, customer email, employee clock, payroll settlement, or account entitlement was changed. Live Apple/Google purchase/restore needs installed store builds and test accounts; real receipt verification, mailbox receipt, physical-device tests and hosted restore/load tests remain unverified. Do not close those items based on the unit suites.
- No additional paid native build or store submission was initiated for these source changes. Final build/release must use the completed, verified source rather than the earlier `1216ceb` artifacts.

### Email schema and camera acceptance continuation — 2026-11-04 local

- Production PostgreSQL logs confirm `email_verified_at` is missing; this causes the signed-in Settings verification request to return 500. Added a transactional, idempotent migration runner and included it in release predeploy. Six targeted backend tests pass, using the actual runner twice and exercising email verification authentication, expiry, changed addresses and provider failure. No email was sent by these tests.
- Published the previous workforce/billing translations and action locks plus the schema runner in `691bdb42fff881b5c832a5be718b8730d3348222`. Railway source and predeploy-command changes are staged for the Future Jobs service only. Automatic approval review rejected acceptance of the staged production deployment, citing the API restart and production migration. No deployment was started; production remains at `1216ceb` and its missing schema remains unresolved until the staged release runs.
- Removed an invalid nested useCallback from the unbuilt language-provider batch. A lifecycle regression now executes the effect and verifies that a delayed saved-language read cannot override a new selection.
- Camera capture now locks repeated taps through permission and native-camera completion, releases on denial/failure/cancellation, requests microphone permission only for video, and disables changing capture settings while working. Removed the ineffective mute control and states that video records audio. No permission was granted on a real device during tests.
- Camera copy is translated into Spanish/French. Missing AI scores remain unavailable rather than appearing as zero, saved evidence is not described as awaiting upload, and automatic assessment no longer guarantees dispute acceptance. GPS preview uses signed latitude/longitude without fixed incorrect hemispheres; upload requests obtain a fresh location and preserve zero altitude/heading. A stale cached address is not attached to new GPS coordinates.
- Validation: mobile TypeScript, all 50 mobile tests and both iOS/Android Hermes exports passed. These are not signed native builds or real-device acceptance. QuickBooks remains excluded. Remaining localization (including Lucy, tools, payroll-rule, legal/about/demo and profile fragments), live store purchase/restore, real inbox receipt and other retained acceptance checks are still open. No additional paid build or store submission was started.
