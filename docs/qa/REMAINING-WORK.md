# Future Jobs Pro AI — retained work register

Updated 2026-11-01. The tester report is the current priority; this register remains open alongside it. Historical failures are not evidence that the current deployed release failed.

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

See `MOBILE-WEB-PARITY.md` for the source inventory and explicit native workflow gaps. A native Expenses screen now implements claims, receipt attachment/extraction and manager review in the QA branch. It is not part of the already signed iOS build 56 or Android version code 10. Native payroll, direct deposit, year-end, invoices/estimates, reports, integrations, work preferences and evidence review still need coverage. Existing publishing/paid-build limits remain in force.

## Mobile business workflow follow-up — PR #6

Native payroll, invoice drafts, reports and integration controls have been added alongside expenses. Backend repairs include real payroll PDF/CSV export, active company-role checks, atomic invoice edits, approved labor validation and retry-safe invoice creation. See `MOBILE-WEB-PARITY.md` for the remaining action-level gaps. These additions are not deployed or included in builds 56/10. Migration `20261031_invoice_request_keys.sql` is required. The prior USD 3 plus tax build allowance has been used; no additional paid build was started.

Validation for the native business workflow follow-up: backend build and all 221 tests passed; mobile TypeScript and 39 tests passed; customer web production build passed; iOS and Android production JavaScript/Hermes exports passed. These checks do not establish physical-device or store acceptance.

Native availability and shift cover are also implemented: unavailability creation/removal, colleague cover requests, acceptance/decline, manager approval and refresh. Device timezone is shown; invalid dates and daylight-saving gaps reject rather than shift silently. Mobile validation now includes 41 passing tests and TypeScript. Device acceptance remains open.
