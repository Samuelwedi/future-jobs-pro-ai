# Future Jobs Pro AI — retained work register

Updated 2026-10-31. The tester report is the current priority; this register remains open alongside it. Historical failures are not evidence that the current deployed release failed.

## Current verified release

- 2026-10-31: PR #4 merged as `79fc245b8f4564dee89d46847bc1a6a315e9dba3`. Railway production deployment `481dc079-d376-43fa-b1b0-f85e9142a4f3` is Active; release migrations completed and live health is healthy.
- Customer website production deployment `dpl_EprYJCjhCvPyjUWQUHZn2kcE1xbH` is READY on the same merge commit and assigned to futurejobsproai.com.
- All seven Google Play Team subscription products have an active monthly base plan. Team 95/110 exclude South Korea because converted prices exceed its KRW 600,000 limit. Other regional prices are Google converted; exact Canadian prices are approved. Real purchase/restore acceptance remains open.
- The user explicitly approved merging/deploying PR #5, production deployment of the separate Vercel portal, and USD 3 plus tax for one iOS and one Android build. PR #5 merged as `f6e08b9bf17c843ffa762041e03542641006d93d`. Backend and both web production deployments are verified; both signed builds succeeded and iOS submission succeeded.

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

Email verification and web profile persistence were deployed in PR #5. Email links are random, hashed at rest, expire after one hour, and are consumed atomically; old links cannot verify a changed email. Existing accounts are not falsely marked verified or locked out of billing. Mobile Profile and web Settings expose status and email resend; confirmation uses the public verification page. SMTP failure is returned explicitly. Live delivery acceptance remains open.

Validation for this source follow-up: backend build and all 215 tests passed; mobile TypeScript and 34 tests passed; customer web production build passed. Physical devices, SMTP delivery and store acceptance remain open.

## Approved release execution — 2026-10-31

- Railway deployment `170056be-8315-4e12-877d-8f215c0d7a29` is Active for PR #5 merge; all release migrations completed; live health returned healthy. The new verification endpoint rejects an invalid token with HTTP 400.
- Customer web production deployment: `dpl_84uVyVQgFchw9y1ddBnanifD7jzp`, READY with custom domains assigned. The live /verify-email page renders correctly and disables confirmation without a token.
- Portal production deployment: `dpl_GUgC6WsmGj2t8sqcm8HqxaxNoyeq`, READY; production alias returned HTTP 200.
- iOS 1.2.8 build 56: `556ce160-0d7d-4a9d-98c7-4fb51047285a` succeeded. Automatic App Store Connect submission `7cec3285-bfb7-4ab7-9b70-36fb40f4bd6a` shows Succeeded. This is upload success, not Apple public App Review approval.
- Android 1.2.8 version code 10: `70b7dc05-062d-4724-a6f6-c6acf19cf433` succeeded and produced a signed AAB. Automatic submission disabled; Android publication hold retained.
- All targets use the exact PR #5 merge commit. Build initiation is not terminal success. No additional paid builds are authorized beyond this USD 3 plus tax allowance.

Expo Doctor in the signed build reported 19/20 checks: four patch updates became recommended (expo 55.0.32 vs 55.0.31, expo-dev-client 55.0.41 vs 55.0.40, expo-location 55.1.15 vs 55.1.14, expo-sharing 55.0.25 vs 55.0.24). Native compilation continued and iOS succeeded. Record these for the next reviewed dependency update; this release uses the exact tested commit.

Approved release result: PR #5 merge, Railway backend, customer website, separate portal, iOS signed build and App Store Connect upload, and Android signed build all completed successfully. Only one paid build per platform was started. Full parity and physical/device/store/live integration acceptance in the retained groups above remain open; release success does not close them automatically.

## Mobile/web audit continuation

See `MOBILE-WEB-PARITY.md` for the source inventory and explicit native workflow gaps. A native Expenses screen now implements claims, receipt attachment/extraction and manager review in the QA branch. It is not part of the already signed iOS build 56 or Android version code 10. Native direct deposit, year-end, invoices/estimates, reports, integrations and evidence review still need coverage. Employee reviewed-statement source was subsequently added below. Native work-preference source is now implemented; device and deployed role acceptance remains open. Existing publishing/paid-build limits remain in force.

## Work-screen localization source follow-up — 2026-10-31

Projects, Schedule, Timesheet, Tasks and Create/Edit Shift now consume the saved language context for display copy, validation, alerts, placeholders and accessibility text. Spanish/French status, calendar and task-count labels are translated; names, task descriptions, notes, IDs, enum values and serialized API dates remain unchanged. Calendar labels preserve date-only values, and clock displays honor the returned company timezone. Interpolation replaces repeated placeholders without recursively interpreting inserted user text.

Validation: all 40 mobile tests and mobile TypeScript passed. Seven real React/LanguageContext checks passed in a browser using explicit native-to-DOM adapters and synthetic local HTTP records. This is source/React evidence, not physical React Native acceptance. Full mobile/web translation coverage remains open. See WORK-SCREEN-LOCALIZATION-20261031.md.

This follow-up is later than iOS build 56 / Android version code 10 and is not in those binaries. The approved USD 3 plus tax pair already completed. No additional paid build was started or authorized by this source follow-up; include these changes in the next reviewed native release after remaining work is ready.

The combined localization branch preserves PR #6 mobile expenses, receipts, helper validation, screen navigation and translations unchanged. Combined TypeScript and all 40 mobile tests passed; the seven localization React/DOM harness checks were repeated against the combined dictionary. No paid native build was started.

## Native work-preferences source follow-up — 2026-10-31

Availability and shift cover are now available in the authenticated native navigation. Workers submit/remove unavailability and request cover for their own upcoming shifts; only the recipient can accept/decline, and the existing manager approval changes assignment after current eligibility checks. The native screen uses explicit timezone input, company shift-time context, English/Spanish/French copy, actor-change guards, fresh connectivity checks and stable approval retry keys. Backend read responses add timezone/shift context and exclude corrupt foreign-company shift relations. Mutation authorization is unchanged.

Validation: backend/mobile TypeScript passed, 44 mobile tests passed, 176 backend tests passed on the first correctly rooted run and 40 affected/aggregated tests passed after restoring missing checkout support files. Seven explicit React/native-to-DOM synthetic-HTTP workflow checks passed. No physical-device or production role acceptance is inferred from these checks. This source is not in signed builds 56/10. All remaining groups and paid-build/publication limits above remain open.


## Native manual payroll source follow-up — 2026-11-01 UTC

A manager-only native ManualPayroll screen adds draft generation/notes/deletion, saved-rule employee calculations, independent company review, external bank-payment recording and reviewed pay-statement PDF sharing. It supports the existing Alberta reference and company-configured worldwide input shapes, with explicit nonblank YTD/manual amounts, exact server net strings and confirmation before financial record changes. The server engine, independent review, currency restrictions and payment uniqueness remain authoritative. No app-initiated money movement is introduced.

Payroll API mutations and old queued payroll actions now fail closed instead of being queued/replayed offline. Read failures, actor changes and uncertain mutations disable stale controls and require refreshing records. A lost payment response reconciles to the existing recorded payment without offering another payment action. PDF export checks account, response type/status and file size, then removes its temporary file after sharing. Native screen copy includes English/Spanish/French.

Validation: mobile TypeScript, all 51 mobile tests, 19 backend payroll/worldwide tests and 13 actual React/native-to-DOM synthetic-HTTP/file workflow checks passed. Native employee statement access and compensation/settings source were subsequently implemented below, alongside the retained banking/year-end/invoice/report/integration and physical/live/store acceptance groups. Source tests and synthetic adapters are not physical-device or settlement evidence. Not deployed or present in signed builds 56/10; no new paid build or publication was started.

## Native payroll administration continuation — 2026-10-31

PayrollAdministration adds effective-dated single rates, selected-employee fixed/percentage raises, rate history, saved payroll settings and read-only current-rate/40-hour cost scenarios. It is linked from native ManualPayroll. English/Spanish/French labels and confirmations are included. Actor-scoped reads, fresh online checks, synchronous write locks and reconciliation after uncertain responses prevent stale controls or automatic reapplication of a raise. The existing server authorization and effective-rate payroll calculations remain unchanged.

Validation: mobile TypeScript and all 56 mobile tests passed; ten real React/native-to-DOM synthetic-HTTP checks passed for settings, rates/history, raise selection, cost previews, lost-response refresh, offline refusal, French rendering and account isolation. A scenario does not change pay rates; settings do not activate automatic payroll or replace independent deduction review. Physical employee pay-statement acceptance, other native workflow gaps and all physical/live/store acceptance remain open. Source is not deployed or included in signed builds 56/10. No additional paid build or publication was initiated.

## Employee reviewed-statement continuation — 2026-10-31

Native PayStatements now lists and shares the logged-in employee’s reviewed payroll snapshots. New self-service API endpoints verify current active membership and both employee/payroll company, exclude drafts and missing review/calculation snapshots, preserve exact money strings, and render PDFs directly from saved calculations. Manager self-service cannot impersonate another employee. Legacy file endpoints remain unchanged; no migration or calculation/payment writes were added. Recorded external payment is explicitly not verified bank settlement.

Validation: mobile/backend TypeScript, all 57 mobile tests and 61 backend employee/payroll/worldwide/release tests passed. Ten administration React/DOM synthetic-HTTP checks and six employee browser-to-real-local-Express/PGlite/PDF checks passed. UI/file/share adapters remain explicit; production and physical device acceptance stay open. These source changes are not deployed or in builds 56/10; no paid native build or store publication was started. All remaining banking/year-end/invoice/report/integration and retained review/acceptance groups remain open.
