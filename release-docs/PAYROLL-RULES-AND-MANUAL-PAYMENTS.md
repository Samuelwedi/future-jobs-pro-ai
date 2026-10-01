# Editable payroll rules and manual payments — 1.2.1

Status: implemented and tested in source; not deployed to your production account. Government certification, country-wide compliance review and bank settlement verification have not been performed.

## Where to use it

Web: Company payroll rules at `/payroll-rules`; Payroll & Manual Payments at `/direct-deposit` (existing navigation URL retained). Mobile: Company payroll rules from the manager's Home footer. The mobile rules editor supports saving, history and previews. Draft calculation, company review, pay-statement export and manual-payment recording are web workflows in this release.

Boss, owner, manager and admin roles can manage company rules. Employees cannot edit them. Every API resolves the current user and company on the server. Saving requires the revision the editor loaded, preventing silent overwrites by another manager. Rules history is append-only with actor, timestamp, reason and content hash. Loading an older revision into the editor creates a new revision when saved; it does not erase history.

Editable fields include country, subdivision, currency, effective dates, annual pay frequency, overtime multiplier, vacation accrual preview rate, CPP/CPP2 and EI rates/caps, employer EI multiplier, personal amounts, tax brackets and constants. Rates use decimals (0.04 means 4%). Invalid dates, unsupported frequencies and unordered brackets are rejected. Custom statutory values are identified as custom rules requiring review, never as verified law.

Pay frequency drives the regular-wage annualization formula. The saved overtime multiplier applies to newly generated gross drafts, selecting the latest rule revision effective at period end. Vacation accrual rate is a preview estimate only: employee vacation settings still control draft vacation pay. Neither changing rules nor creating a draft changes an employee's accrued vacation balance. Existing time-entry overtime classification is not recomputed by this editor.

## Calculation coverage

Update: a separate worldwide **company-configured** mode is now available. See [Worldwide payroll](WORLDWIDE-COMPANY-PAYROLL.md). The following scope describes the Alberta reference engine only.

Only Alberta, Canada, CAD, pay dates in 2026 are implemented. The model covers regular cash wages, full-year CPP eligibility and standard EI. It excludes bonuses, commissions, noncash benefits, Quebec transfers, partial-year CPP eligibility, pension/RRSP deductions, garnishments and special credits. Other countries, subdivisions, currencies and tax years are rejected. Storing a jurisdiction name does not implement its payroll law.

Reference sources reviewed on 2026-09-30:
- CRA January 2026 T4127: https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan/t4127-jan-payroll-deductions-formulas-computer-programs.html
- CRA July 2026 T4127: https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jul/t4127-jul-payroll-deductions-formulas.html
- Independent calculation comparison: https://www.canada.ca/pdoc

The sources govern the reference formula; their publication is not certification of this implementation. Company overrides do not waive statutory obligations. The worldwide research and independently validated country engines requested earlier are not complete. Do not market this release as verified worldwide payroll.

## Workflow

1. Save company rules with a reason and reviewer/reference. Check the applicable frequency and effective dates.
2. Prepare a payroll draft from approved time entries. New drafts hold gross preparation only, without the old flat CPP/EI/tax estimates. Their totals are not net pay.
3. Open Payroll & Manual Payments, select the payroll and employee, and enter the actual pay date, reviewed gross and current-employer YTD amounts excluding this payment. Zero YTD is not automatically correct. Confirm the supported standard case. The latest saved rule revision must cover the pay date.
4. Calculate each employee. Results save the full rule/input/output snapshot, rule hash, revision and calculating actor. Later rule edits do not recalculate these records.
5. Independently compare all calculations with CRA PDOC or a qualified payroll reviewer. Record the review reference and approve the payroll. All items must have calculations and the same pay date. Payroll total becomes the sum of reviewed net amounts. Database triggers prevent changes to reviewed items and financial fields.
6. Pay employees through your bank. Record each exact reviewed net amount, the actual payment date and a reference without banking account data. The date must match the reviewed pay date. Duplicate identical confirmations replay safely; conflicting confirmations are rejected. The app records your statement of payment, not bank-verified settlement. No payout adapter or live funds movement is enabled.
7. Export an individual pay statement from the Payroll page after review. It uses the saved gross/net and shows CPP, CPP2, EI, income tax, pay date, currency and rule revision. It is not a bank receipt or a claim that all statutory statement requirements have been independently certified.

If the date, amount or employee information changes after review, stop and reconcile with your payroll reviewer. This release does not provide an automated reversal, amendment or payroll-tax filing workflow. YTD entry and external remittances remain employer responsibilities; do not assume the app has filed taxes or paid government liabilities.

## Validation and installation

The release now has 100 passing backend tests including rule access, revision conflicts, immutable history, rounding/caps, unsupported jurisdictions, snapshot retention, review locks, payment replay, payment provenance and disabled direct-deposit mutations. Tests use embedded PostgreSQL fixtures; they are not a production-schema rehearsal. Web build, mobile TypeScript and Android/iOS JavaScript exports passed. Native signed builds and physical-device verification remain required.

A new migration, `backend/migrations/20260930_payroll_rules.sql`, creates company rule history and manual-payment records and adds calculation/review snapshots and guards. It is included in the ordered 20-migration runner. Use the release Validate, Check, Backup, DryRun and Migrate stages before deploying this source. The production backup must be fresh and match the target. Rehearse with a production schema copy first. Do not overlay this archive onto the earlier RC4 installation, reuse an old compiled bundle, or delete production volumes.

No .env, customer database backup, bank credentials or production secrets are included. No production data was modified in preparing this release.
