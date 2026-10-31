# Future Jobs Pro AI — retained work register

Updated 2026-10-31. The tester report is the current priority; this register remains open alongside it. Historical failures are not evidence that the current deployed release failed.

## Current verified release

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
