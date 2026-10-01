# Future Jobs Pro AI 1.2.0-rc.4 — verification and release decision

**Decision: isolated staging candidate; not yet authorized for production deployment.**

## Completed evidence

| Gate | Result | Evidence and boundary |
| --- | --- | --- |
| Restored production schema | Passed locally | PostgreSQL 18.6 schema-only dump verified by SHA-256; 364 schema objects restored; zero company/user rows |
| Baseline release migrations | Passed locally before the payout-schema addition | Transaction committed; 81 public tables; 16/16 baseline release tables, 4/4 baseline release columns, 6/6 baseline release indexes; zero release/customer rows. This evidence does not replace a fresh run of the payout migration. |
| Rollback point | Passed locally | Valid pre-migration custom dump, 442 objects, SHA-256 recorded; production untouched |
| Expanded backend build and release suite | Passed in the RC3 source artifact | TypeScript build plus 56 tests passed: 32 core release tests, 17 native payout orchestration tests, and 7 payout migration/security tests. The core suite now also exercises payout HTTP authentication and manager-role denial. |
| Native Payout Center source | Implemented and source-tested; provider acceptance pending | `/api/payouts` is mounted; UI, service, PostgreSQL repository, additive migration, service tests, and migration tests are present. The adapter registry is empty, so execution remains fail-closed. |
| Payout database controls | Passed in repeatable in-memory PostgreSQL migration tests; isolated application pending | The migration applied twice and enforced certified payroll provenance, tenant-bound foreign keys, encrypted-token shape, immutable batch intent/items/approval/provider references, maker-checker, guarded status transitions, and append-only events. Apply and verify on the isolated PostgreSQL 18 target before production consideration. |
| Web production build | Passed | TypeScript and Vite 8 production bundle |
| Mobile source/bundles | Passed | Expo SDK 55 dependency check, TypeScript, native prebuild generation, custom wake-module autolinking, Android/iOS Hermes export |
| Production dependency audit | Passed | `npm audit --omit=dev`: zero known vulnerabilities for backend, web, and mobile at packaging time |
| Backend local health | Passed on RC1 baseline before RC3 rebuild | PostgreSQL and Redis healthy; Socket.IO Redis adapter enabled; RC3 Windows rerun still required |
| Production environment | Untouched | No deployment, production migration, price change, customer-row copy, payment, or store submission |

The online Expo Doctor service was not used because it would transmit project/package metadata. Local dependency, configuration, autolinking, prebuild, TypeScript, and bundle checks were used instead.

## Required Windows RC3 acceptance

1. Verify archive SHA-256, extract RC3 to a new folder, and retain RC1/RC2 plus the database rollback dump.
2. Run `Install-App.ps1 -ApplyMigration -IncludeMobile` against the isolated PostgreSQL/Redis environment.
3. Confirm the migration runner applied and verified the payout tables and payroll provenance fields; existing payrolls must remain uncertified and ineligible rather than being backfilled.
4. Run `Test-App.ps1`. Anonymous unknown protected API returning 401/403 is correct fail-closed behavior.
5. Sign in and verify: disposable registration/trial; subscription-expired denial; owner/manager/employee boundaries; payroll proposal/confirm once; expenses; staffing/cover; invoice draft/undo; invitation acceptance once; kiosk PIN throttling; PDF authorization; Socket.IO denial after entitlement loss.
6. Open Payout Center as an owner/manager. With no adapter registered, capability status and all execution paths must fail closed. An employee and a cross-tenant actor must be denied. Raw banking fields must be rejected.
7. Run the expanded `npm run test:release` in `backend`; it includes core release, native payout service, and payout migration tests. Record the actual final-artifact result rather than copying a count from an earlier build.
8. Review logs, stop with `Stop-App.ps1`, restart, and repeat health plus one write/read workflow.

## Open production gates

- Rotate the historically exposed JWT secret in every environment where it may have been used, restart all instances, and verify old access/reset tokens no longer authenticate.
- Credentialed sandbox validation for SMTP, storage, receipt vision, QuickBooks, Stripe, Apple/Google billing, push notifications, and payment paths.
- Payout provider integration: a licensed live adapter, explicit employer onboarding, an allowlisted hosted-enrollment provider, callback/token persistence, signed webhooks or polling, a durable submission outbox, settlement reconciliation, returns/reversals, partial-result handling, and operator alerts.
- Payout access and treasury hardening: recent-auth/MFA for approval/execution, daily/rolling velocity controls in addition to per-recipient/per-batch limits, employee self-service enrollment, key-rotation/re-encryption procedure, and tested cancellation/retry policy.
- Certified payroll calculation provenance for each exact country/currency corridor. The migration deliberately leaves existing payrolls uncertified and ineligible.
- Physical Android/iOS permission, wake-word, audio/video, background GPS, offline replay, battery, upload, and notification tests; signed preview builds.
- Concurrent invoice, assignment, expense, report-worker, and subscription-transition tests on hosted PostgreSQL/Redis; realistic load, soak, and failure injection.
- Full legacy end-to-end regression, independent security review, accessibility/privacy/legal review, backup restoration rehearsal, monitoring, and alert thresholds.
- Review/certification of payroll deductions and statutory behavior. The in-app Payout Center does not make RC3 a certified payroll engine, bank, money transmitter, tax filer, remittance service, or compliant funds-transfer service.

## Honest capability limits

Staffing is rule-based per shift, profitability forecasting is linear, knowledge ingestion is text/Markdown, invoice preparation is labor-only and draft-only, receipt extraction needs human verification, reports are in-app snapshots, and undo covers named guarded actions rather than every legacy mutation. Payout Center supplies guarded in-app orchestration only; no adapter is enabled and no money moves by default. Capacity, uptime, margins, hours saved, country coverage, settlement, and compliance are not guaranteed until measured and certified in an approved pilot.
