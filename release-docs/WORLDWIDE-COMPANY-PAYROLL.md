# Worldwide company-configured payroll

Implemented in source release 1.2.1, 2026-09-30. This is configurable arithmetic and payroll recordkeeping, not an automatic or certified tax engine for every country. The earlier limited Alberta 2026 reference engine remains available separately.

## Coverage and controls

- 249 ISO country/territory identifiers. Names identify a location; they do not certify legal coverage.
- 165 currency/fund codes with numerical minor units from SIX ISO 4217 List One, published 2026-09-17 and retrieved 2026-09-30. No currencies with undefined minor units or precious metals are offered. These codes are selectable calculation units; not every unit is suitable or lawful for wages in every jurisdiction. No FX conversion is performed.
- Web and mobile company-rule editors, revision history and previews. Web payroll calculation, review, manual bank-payment records and reviewed statement export.
- Fixed amounts, percentages, marginal brackets, contribution caps, per-payment credits, employee deductions and separate employer contributions.
- Manual final amounts for withholding calculations that cannot be represented by these formulas. An income-tax line is required even where the reviewed amount is zero. Blank inputs are not silently treated as zero tax.
- One country/subdivision/currency per reviewed run. A workspace cannot change currency after it has reviewed payroll in another currency. Use separate workspaces for other currencies.
- Immutable review/calculation history and snapshots. No automatic bank transfer, tax remittance, filing, government certification or government verification.

## Set up

Open Company payroll rules and select **Configure worldwide company rules**. Choose country, subdivision and currency. Set the effective dates and pay frequency. The template deliberately has no country tax rates. Start with reviewed manual tax figures, or have the company's local payroll reviewer configure the applicable rules and contribution lines.

On mobile, enter the ISO country and currency codes; the screen displays the matching country name and currency precision. Both clients support adding/removing lines and marginal brackets. Provide reviewer, reference, review date, confirmation and a reason for saving a new revision. Company attestation is not independent verification by the app.

Use Payroll & Manual Payments on the web to select a draft and employee. Enter actual pay date, gross cash pay and the independently determined taxable basis. Provide every required final manual amount and YTD contribution balance, plus the employee calculation's review reference. Calculate, independently check all employees, then approve. Only then pay through your bank and record the matching amount/date/reference. The app records employer confirmation, not bank settlement.

## Exact formula semantics

Every line calculates independently. There is no implicit ordering where one contribution reduces another line's taxable basis. Supply the correct taxable pay separately; use reviewed manual amounts for employee-specific bases or special treatment that cannot be represented.

- `fixed`: amount for the selected period. Annualized fixed amounts are divided by periods per year. A fixed line cannot have a basis exemption.
- `percentage`: `max(0, selected basis × period factor − exemption) × rate ÷ period factor`.
- `progressive`: compute marginal tax on each slice of `max(0, selected basis × period factor − exemption)`, then divide by the period factor. Brackets begin at zero and ascend. These are marginal brackets, not the CRA rate-minus-constant form used in the Alberta reference mode.
- Period factor is 1 for per-payment rules, or periods per year for annualized rules.
- Per-payment credit is subtracted after the formula, floored at zero. An annual contribution cap limits the result to the remaining cap after supplied YTD contributions. YTD must be for the correct statutory contribution year, exclude this payment, and be independently checked.
- `manual`: a required final reviewed amount for this payment. Automatic exemptions, credits and caps are prohibited for manual lines. Method-specific unused fields do not affect the manual amount.
- Each final line rounds half-up to the currency's ISO minor units. This is not a claim that half-up is the statutory intermediate-rounding method in every jurisdiction. Use independently calculated manual amounts when another method is required.
- Employee tax, contribution and other-deduction lines reduce net. Employer-contribution lines add employer cost and do not reduce employee net. Deductions greater than gross are rejected.
- Gross, taxable pay, manual amounts, caps and YTD balances must respect currency precision. The reviewed snapshot and manual-payment record preserve that precision. Legacy ledger fields and old analytical views may have two-decimal assumptions; use the new reviewed statements and manual-payroll screen as the authoritative outputs. Canadian year-end form preview/finalization is blocked for company-configured worldwide payroll. Other legacy reports are not certified worldwide output.

Example tests use hypothetical company rules, not statutory country rates. Country/currency loops demonstrate accepted configuration and arithmetic only. All 249 location codes and all 165 currency units are exercised with explicit synthetic manual values.

## What still needs country-specific implementation

Automatic local withholding, cumulative tax codes, residence and work-location rules, state/local tax allocation, employee-specific contribution categories, pension interactions, statutory leave, bonuses, benefit valuation, garnishments, termination pay, retroactive amendments, tax returns and year-end forms are not solved simply by selecting a country. Employers must obtain local payroll review, enter reviewed amounts for unsupported cases, and handle statutory reporting/remittance externally. Do not market this as verified worldwide payroll.

Primary references reviewed to define these boundaries:
- SIX, the ISO 4217 Maintenance Agency: https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html
- Current numerical currency units: https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml
- U.S. federal withholding, Publication 15-T (2026): https://www.irs.gov/publications/p15t — requires employee-specific withholding information; this release does not implement it.
- HMRC payroll software guidance: https://www.gov.uk/payroll-software — this release does not claim HMRC recognition or RTI filing.
- CRA T4127: https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas.html — used only for the limited Alberta reference implementation documented separately.

## Installation and validation

Use the updated full source package in a new folder. Its release runner now includes 20 ordered migrations; the new `20261001_worldwide_payroll_records.sql` preserves up to four decimal places for manual-payment amounts. Existing migration files were not replaced by this worldwide addition. Follow Validate, Check, Backup, DryRun and Migrate before deployment.

Source validation: 100 backend tests, web production build, mobile TypeScript, Android/iOS JavaScript exports. Windows installer execution, actual production migration rehearsal, signed native builds and real-device acceptance are still required. Production and store accounts were not accessed or changed to prepare this package.
