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
