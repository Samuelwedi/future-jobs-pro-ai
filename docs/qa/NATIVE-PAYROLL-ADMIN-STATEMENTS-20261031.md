# Native payroll administration and employee statements

Source follow-up to PR #7, 2026-10-31 (America/Edmonton). This is implementation and local verification evidence; physical devices, hosted role acceptance, tax review and bank settlement remain separate.

## Added workflows

- ManualPayroll links to manager-only PayrollAdministration: effective-dated exact rates, selected-employee fixed/percentage raises, history, saved company settings and read-only current-rate/40-hour scenarios.
- Home links to PayStatements for every authenticated account. The screen lists the actor’s reviewed payroll snapshots and exports their PDFs.
- GET `/api/pay-stubs/reviewed` and GET `/api/pay-stubs/reviewed/:id/download` require current active database identity, own employee ID and matching company on both user/payroll. Approved/paid status, review and saved calculation are mandatory. The manager-only existing PDF route is unchanged.
- PDF output uses saved snapshot/rules/currency precision. No draft calculation, wage mutation, payment record, email or persistent legacy PDF is produced by self-service reads.

## Validation

Mobile TypeScript and all 57 mobile tests passed. Backend TypeScript and all 61 targeted employee/payroll/worldwide/release tests passed. Five new HTTP/database tests cover employee/company isolation, exact decimals, inactive/anonymous/verification-only identities, draft/missing-review/calculation rejection, actual PDF bytes and stale company claims.

Ten administration browser checks passed using actual React/LanguageContext with native-to-DOM and synthetic HTTP adapters. Six employee checks passed using actual React/LanguageContext and the real local Express routes, signed fixture JWTs, PGlite SQL and PDF renderer. Only native layout/files/sharing are adapted in the employee harness; no production session or real bank is used. Temporary PDF bytes are deleted after simulated sharing.

## Reproduction

From `mobile`, run `npx tsc --noEmit` and `node --test tests/*.test.cjs`.

From `backend`, run `npm run build`, then `node --test --test-concurrency=1 tests/employee-pay-statements.test.cjs tests/payroll-rules.test.cjs tests/worldwide-payroll.test.cjs tests/release.test.cjs`.

From repository root, set `FJ_QA_NODE_MODULES` to isolated tooling containing Vite 6, React/ReactDOM 19.2, Playwright and @sparticuz/chromium. `BROWSER_PATH` optionally selects the test Chromium executable; set its library/font paths when the host requires them. Run `node scripts/check-payroll-administration-browser.mjs` and `node scripts/check-pay-statements-api-browser.mjs`. Build the backend before the second harness. Tests create isolated fixture databases and use test-only JWTs; they do not connect to production.

## Release limits

No dependency, migration, production deployment, paid native build or store publication was changed. These additions are not in signed iOS build 56 / Android version code 10. The prior USD 3 plus tax pair is exhausted. Android publication and the other retained pauses remain in force. Banking/settlement, year-end, invoices/estimates, reports, integration screens, broader administration/evidence/localization coverage and retained physical/live/store acceptance remain open.
