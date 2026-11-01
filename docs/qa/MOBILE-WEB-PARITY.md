# Future Jobs Pro AI — mobile/web source parity audit

Audited 2026-10-31 against `mobile/App.tsx`, mobile screen implementations, and `web/src/App.tsx`. This is a source inventory, not device acceptance or certification. A registered route does not establish every interaction works. Original remaining-work and tester registers are retained.

| Workflow | Web surface | Mobile surface | Current source finding |
|---|---|---|---|
| Sign in, registration, recovery | Login/Register/ForgotPassword/ResetPassword | Login/Register/ForgotPassword | Core flows present; reset confirmation opens website. Device acceptance open. |
| Temporary passwords | Auth/password gate | ChangeTemporaryPassword | Server gate and native forced-change flow implemented. |
| Email verification | Settings/VerifyEmail | Profile resend/status | PR #5 deployed; delivery acceptance open. |
| Profile and compensation | Settings/Team/EmployeePortal | Profile/Team | Web profile persistence fixed in PR #5; pay-rate source exists. Cross-role acceptance open. |
| Clock in/out and evidence | CommandCenter/Dashboard/CrewClock | Home/Camera/CrewClock | Source exists. Real camera, location and offline replay acceptance open. |
| Timesheets | Timesheet | Timesheet | Source exists. Payroll locking and role acceptance open. |
| Scheduling | Schedule | Schedule/CreateShift/SelectEmployees | Source exists; tester date/edit/assignment fixes retained. |
| Tasks | Tasks | Tasks | Source exists; signed-in acceptance open. |
| Time off | PTO | PTO | Source exists; role acceptance open. |
| Projects and files | Projects/MediaFolders/ProjectMedia | Projects/Folders/ProjectMedia/ProjectAlbum | Source exists; offline drafts and archive fixes retained. |
| Chat and group media | ChatList/Chat/NewChat | ChatList/Chat/NewChat | Viewer/player and attachment source present. Physical playback acceptance open. |
| Human support and media | Support and agent portal | Support | Source present; live human handoff and device acceptance open. |
| Crew tracking/history | CrewTracking/GPSPlayback | CrewTracking/GPSPlayback/History | Android map-key configuration and live background tracking acceptance open. |
| Worker calculators | WorkerTools | WorkerTools | Source present; full calculator-by-calculator acceptance open. |
| Expenses and receipts | Expenses | New Expenses screen | Native list, per-account draft, receipt upload/extraction, submit, manager review and receipt opening implemented in current branch. Not in build 56 / Android 10. |
| Subscription recovery | Subscription/Pricing/PaymentRequired | Subscription | Source and seven Play products ready. Real store receipt/purchase/restore acceptance open. |
| Company policies | CompanySettings/PayrollRules | CompanySettings/PayrollRules | Source exists; policy-by-policy acceptance open. |
| Kiosk | Kiosk/KioskClock | Kiosk | Source exists; physical PIN clocking acceptance open. |
| Lucy text/voice | AskLucy/VoiceAssistant | AIAssistant/VoiceNote | Compatible inference adapter deployed. No free inference provider configured; voice/photo provider acceptance open. |
| Payroll processing and adjustments | Payroll/ManualPayroll | ManualPayroll | Native draft preparation/deletion/notes, reviewed calculations, manual-payment records and reviewed PDF export source added. Native compensation/settings and employee reviewed-statement source are implemented; role, physical-device and live acceptance remain open. |
| Bank/direct-deposit management | DirectDeposit | No dedicated registered screen | Native coverage gap; live settlement also unverified. |
| Year-end forms | YearEnd/FinalizedSlips | No dedicated registered screen | Native coverage gap. |
| Invoices and estimates | Invoices/Estimates | No dedicated registered screens | Native coverage gap. |
| Reports and exports | Reports | Timesheet CSV only | Native report coverage gap; CSV share device acceptance open. |
| QuickBooks and Stripe integrations | Integrations | No dedicated registered screen | Native coverage gap; production OAuth/webhooks/settlement acceptance open. |
| Work preferences | WorkPreferences | WorkPreferences | Native unavailability, replacement request/response and manager approval source implemented. Physical and deployed role acceptance open; not in builds 56/10. |
| Administration | AdminDashboard/Operations | Team/CompanySettings partial coverage | Complete permission/action mapping still needed. |
| Evidence center | EvidenceCenter | Project files/camera partial coverage | Dedicated review/audit workflow coverage gap. |
| Localization | Screen-dependent | Dictionary and screen-dependent | Full screen coverage and translated runtime acceptance remain open. The new expense screen uses en/fr/es copy. |
| Schedule optimization/document ingestion/crew globe/universal undo | Enhancement register | Enhancement register | Requirements and implementation acceptance remain open; do not count generic screens as completed features. |

## Native expenses acceptance

Implemented: claims scoped by the existing API, CAD/USD validation, local calendar date, receipt file metadata, field extraction with an explicit review notice, pending review actions, no self-review controls, per-account persistent drafts, upload reuse after a failed submission, synchronous mutation lock, and fresh connectivity checks. Approval is explicitly described as not sending a payment. API authorization and duplicate-claim protection remain authoritative.

Automated source validation does not prove Android/iOS receipt pickers, external receipt opening, OCR provider availability or physical-device keyboard behavior. No new paid build or store publication is started by this source change.

Validation: mobile TypeScript passed; 36 mobile tests passed; production Hermes/JavaScript exports for iOS and Android passed; git diff --check passed. The existing backend was unchanged. Signed builds 56/10 predate this source addition.

## Native work preferences source follow-up

WorkPreferences is registered in authenticated navigation and Home tools. Explicit timezone input is validated against impossible dates and normalized to UTC. Only a worker's own upcoming shifts are offered; colleagues can accept or decline their incoming requests, and managers can approve accepted requests through the existing audited action API. Acceptance alone does not change an assignment. The server remains authoritative for eligibility, company access and approval. Reads now provide company timezone and shift context, and reject inconsistent foreign-company shift relations.

English, Spanish and French copy is included. Mutations require a fresh connection and coherent actor-scoped reads; uncertain failures require refreshing current records before retrying. A stable swap-scoped approval key prevents a lost response from creating a second action. Forms are in memory; no offline queue is claimed.

Validation: mobile TypeScript, all 44 mobile tests and backend TypeScript passed. The backend run passed 176 tests; four entry files initially lacked supporting checkout files. After restoring those files, all 40 affected/aggregated tests passed (216 successful tests total across the two runs). Seven new real React/LanguageContext checks passed through explicit native-to-DOM adapters and synthetic HTTP records. They cover confirmations, UTC payloads, removal, request/accept/approve roles, offline write prevention and Spanish rendering. These are not physical-device or deployed API acceptance. No new paid build or store publication was started.


## Native payroll processing source follow-up — 2026-11-01 UTC

The authenticated ManualPayroll route and manager Home card now cover draft preparation from all approved/unlocked company time entries at saved effective rates; draft notes and deletion; employee calculation using the saved rule revision; independent company review; recording an exact external bank payment; and sharing a reviewed PDF statement. Regular Alberta inputs and company-configured worldwide manual/capped lines retain the existing server engine and approval rules. Gross can be independently corrected before calculation; no client-side tax engine was added.

Blank YTD is not silently treated as zero. Calendar dates are validated without device timezone conversion. Worldwide manual amounts, taxable basis, caps and review references must be supplied explicitly. Employer/employee scope notices remain visible. Manager-only coherent reads verify actor and company; account/run changes clear forms and invalidate stale responses. Uncertain mutations disable the workflow until current server records are refreshed. Net payment amounts remain exact server strings. Recorded payment is explicitly not app-verified bank settlement.

All payroll POST/PUT/PATCH/DELETE actions now refuse offline queueing, including generation, notes and deletion; legacy replay is also rejected. Reviewed PDF export authenticates to the configured API, requires an HTTP 200 PDF with a nonempty bounded file, checks current account before sharing, and deletes its temporary file. English, Spanish and French screen copy is provided; company names, references, rule line labels, server scope text and recorded values are unchanged.

Validation: mobile TypeScript and all 51 mobile tests passed. The 19 existing backend payroll/worldwide tests passed against the unchanged engine/API. Thirteen real React/LanguageContext browser checks passed through explicit native-to-DOM, file-sharing adapters and synthetic HTTP state: manager-only visibility, draft confirmations/notes, required YTD, calculation, review, ambiguous payment reconciliation, account switch, company rules, offline refusal, deletion, reviewed PDF sharing and French rendering. File and network adapters do not prove physical iOS/Android sharing, live tax compliance or bank settlement. No new paid build, deployment or publication was started.

Employee pay-statement source, compensation/rate administration and payroll settings were subsequently added below. Physical/live acceptance remains open. Existing banking, year-end, invoice/estimate, report, integration, administration/evidence and device/live/store gaps remain open. This source is later than signed builds 56/10.

## Native payroll administration source follow-up — 2026-10-31

The manager-only PayrollAdministration route, reached from ManualPayroll, implements effective-dated exact hourly rates, fixed/percentage raises for selected employees, current rates and history, saved company payroll settings, and selected-employee cost scenarios using the existing APIs. Exact rates require exactly one current company selection; raises deduplicate IDs, validate positive amounts and require valid explicit effective dates. Weekly/monthly days, wall-clock time, rate, overtime multiplier and legacy tax percentage are validated before a confirmation prompt.

Company timezone and configured payroll currency remain visible. The cost scenario is explicitly a read-only 40-hour estimate at current rates, excluding deductions/overtime/employer costs and future effective changes. Settings do not activate an automatic scheduler, and the legacy tax percentage does not replace independently reviewed payroll rules. Existing reviewed payroll is not recalculated by the screen.

Read responses verify the actor and manager flag before exposing controls; account changes hide old records, writes require a fresh connection and use a synchronous lock, and uncertain responses force refresh/reconciliation before another action. English, Spanish and French copy is provided. No client-side wage update, automatic retry, offline queue or money movement is introduced. Existing API authorization and effective-rate/profile/payroll behavior remain authoritative.

Validation: all 56 mobile tests and mobile TypeScript passed. Ten real React/LanguageContext browser checks passed through explicit native-to-DOM adapters and synthetic HTTP records: manager gate, confirmed settings, effective-rate/history, lost-response reconciliation, exact-rate selection guard, bulk raises, read-only scenario, offline refusal, French rendering, actor/company-response mismatch and account isolation. This is not live API, physical-device or tax/settlement acceptance. No payroll write behavior, dependency, deployment, paid build or publication changed. Work-options reads additionally return the current company ID for coherent native administration reads.

## Employee reviewed pay statements — 2026-10-31

The PayStatements route/Home card lists the authenticated employee’s reviewed payroll snapshots and exports their PDFs through new `/api/pay-stubs/reviewed` and `/api/pay-stubs/reviewed/:id/download` endpoints. These endpoints use current active database membership, scope both payroll and employee to that company, and require approved/paid payroll, independent review and a calculation snapshot. Even a manager cannot download another employee’s statement through the self-service endpoint; the existing manager export remains separate. Legacy generated-file endpoints are unchanged.

Read responses identify the actor/company, carry exact gross/net/tax strings, and distinguish a recorded external payment from bank verification. Payment markers must also belong to the payroll company. PDFs are rendered from immutable saved calculations; reading/exporting does not recalculate, pay, write a legacy file or send an email. The native screen rejects a mismatched actor/company or foreign employee row, clears records on account changes, requires a connection to export, and uses the authenticated bounded-PDF/temporary-file cleanup helper. English/Spanish/French copy is included.

Validation: backend and mobile TypeScript passed; all 57 mobile tests and 61 backend employee/payroll/worldwide/release tests passed. The five new backend tests exercise real JWT middleware, PGlite SQL, tenant/employee isolation, disabled/verification-only tokens, draft/unreviewed/missing calculations, actual PDF generation and stale company claims. Ten administration React/native-to-DOM checks passed against synthetic HTTP records. Six employee browser checks passed through the real local Express route, signed fixture JWTs, PGlite queries and actual PDF generation, with explicit native UI/files/sharing adapters. They verify exact three-decimal amounts, self-service PDF path/bytes/cleanup, offline refusal, foreign-row rejection, actor changes and French rendering. This is local API/database/PDF evidence, not physical-device or production-service acceptance.

No migration, payroll calculation/approval/payment write behavior, dependency, production deployment, paid native build or store publication changed. Signed builds 56/10 predate this source. Banking/settlement, year-end, invoices/estimates, reports, integrations, administration/evidence completeness, broader localization and retained physical/live/store acceptance remain open. See NATIVE-PAYROLL-ADMIN-STATEMENTS-20261031.md for commands and scope.
