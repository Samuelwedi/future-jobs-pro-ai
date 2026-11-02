# Year-end review and payout inspection source verification

2026-11-01, America/Edmonton. PR #7 source follow-up; not production or device acceptance.

## Implemented

- Native PayoutStatus reads saved configuration, capabilities, masked destinations, payroll eligibility, batches and events through existing manager-only APIs. Direct deposit remains disabled, including when a capability claims execution is configured. The screen never enables enrollment/approval/execution or accepts bank numbers.
- Native YearEnd edits employer identity, selects employees (including inactive employees still belonging to the company), previews supported records, obtains an independent review/reference and stores/reopens reviewed snapshots. English, Spanish and French copy is included.
- Web YearEnd and YearEndCompanyProfile now use the working employer endpoint, normalize null fields, bind finalization to the displayed preview and require independent review/reference. CPP2 has a separate display label. Changing employee/year/form or employer edits invalidates the preview.
- Year-end API checks current active manager/owner membership on every route. Gross/deductions come from reviewed payment snapshots and recorded pay dates, not reconstructed hours or period-end dates. The engine reference comparison normalizes JSONB object ordering. Unsupported and incomplete cases fail explicitly.
- Finalization recomputes and hashes employee/year/form, employer identity and totals inside a serializable transaction. The employer-scoped archive freezes the summary, reviewer and reference. Re-finalizing explicitly updates the same company/employee/year/form record; this is not an immutable revision history. Company/employee profile edits and membership moves do not rewrite stored summaries or grant another employer access.
- Old generated-slip tables are neither deleted nor backfilled with guessed employer ownership. Their attribution and reconciliation remain open. Source/import completeness and real bank settlement cannot be inferred.

## Supported scope and references

Only recorded, reviewed 2026 regular Alberta/CAD employee payments with reference rules and matching payment date, net amount and currency are automatically compiled. Contractor T4A, Quebec QPP/QPIP/RL-1, worldwide/custom rules, unsupported years, special payroll treatment and incomplete legacy/imported records require the local process. Annual records must be independently checked before filing; no return or remittance is submitted by this change.

Primary references used for the restricted T4 projection:

- [CRA T4 information for employers](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/completing-filing-information-returns/t4-information-employers/t4-slip.html): total remuneration, separate CPP2 box, and pensionable/insurable earnings reporting.
- [CRA Alberta 2026 payroll reference](https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032ab-jan/t4032ab-january-general-information.html): the 2026 additional pensionable earnings maximum is CAD 85,000; the EI insurable earnings maximum is CAD 68,900.
- [Revenu Québec RL-1 guide](https://www.revenuquebec.ca/en/online-services/forms-and-publications/rl-1-g-v/guide-to-filing-the-rl-1-slip-employment-and-other-income/): Québec mappings differ. The previous CPP/EI relabeling is not reused as QPP/QPIP.

These references support the narrow implementation and do not certify the product, all jurisdictions or filing readiness.

## Validation

- Full backend suite: 229 passed. Includes eight new real JWT/Express/PGlite year-end tests covering active owner/manager roles, employees/disabled/anonymous rejection, paid-date selection, exact snapshot gross, CPP2/annual limits, unsupported cases, changed-preview rejection, repeat-save behavior, frozen company ownership across membership moves, preserved legacy rows and employer-field validation and bounded connection-failure handling.
- All mobile tests: 61 passed, including new selection/review binding, offline refusal and translated copy coverage.
- Backend/mobile TypeScript and customer web production build passed.
- Twelve browser checks passed in scripts/check-year-end-banking-browser.mjs. Year-end uses real local routes, fixture JWTs, PGlite, the actual migration/compiler and actual web MUI components; only native UI is adapted. Banking uses actual payout routes with fixture read orchestration. Checks cover employer editing, masking, review gating, finalization, archive reopening, stale preview rejection, unsupported RL-1, masked bank status, read-only batch events, French rendering and actor isolation; the web flow also saves nullable employer fields and previews/finalizes through the API.
- No real users, provider execution, government filing, live bank payment or physical device was used.

## Reproduction and rollout

Run npm ci in backend, mobile and web with their checked-in lockfiles. Build backend, then from backend run node --test --test-concurrency=1 tests/*.test.cjs. From mobile run TypeScript and node --test tests/*.test.cjs. Build web with npm run build.

For the browser harness, build backend and install web dependencies. Set FJ_QA_NODE_MODULES to isolated Vite 6, React/ReactDOM 19.2, Playwright and @sparticuz/chromium tooling. BROWSER_PATH and library/font variables can select a host-compatible test Chromium. From repository root run node scripts/check-year-end-banking-browser.mjs.

Apply 20261101_reviewed_year_end_archive.sql with a verified backup and the existing release process. A verified predeploy runner was added. Roll out migration, backend and updated customer web together. Old finalize clients must refresh the updated UI and provide a fresh hash, review confirmation and reference. Do not bypass legacy provenance or unsupported-scope failures.

No production deployment/migration, dependency update, paid native build or publication occurred. Signed iOS 56 / Android 10 predate this source. The previous USD 3 plus tax pair is exhausted and Android publication remains held. Invoices/estimates, reports, integrations, broader administration/evidence/localization and retained physical/live/store/load/backup/security acceptance remain open in the original registers.
