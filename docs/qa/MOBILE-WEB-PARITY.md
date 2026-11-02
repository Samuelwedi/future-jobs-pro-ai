# Future Jobs Pro AI — mobile/web source parity audit

Updated 2026-11-01; audited 2026-10-31 against `mobile/App.tsx`, mobile screen implementations, and `web/src/App.tsx`. This is a source inventory, not device acceptance or certification. A registered route does not establish every interaction works. Original remaining-work and tester registers are retained.

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
| Payroll processing and adjustments | Payroll/ManualPayroll | New Payroll screen | Draft preparation, saved calculation, independent review, external payment recording, effective employee rates, cost simulation and PDF/CSV export implemented in PR #6. Bulk raises with exact-cent preview, stale-preview checks and retry-safe atomic apply, plus native schedule/default settings, are implemented. Physical acceptance remains open. |
| Bank/direct-deposit management | `/direct-deposit` renders ManualPayroll | Payroll | Both clients use manual reviewed-payroll/payment recording. Legacy raw bank APIs are retired; secure live settlement and provider enrollment remain unverified. |
| Year-end forms | YearEnd/FinalizedSlips | New YearEnd screen | Employer identity, employee/form/year selection, preview, reviewed-value finalization, finalized archive and JSON sharing implemented in PR #6. Tax box calculations, jurisdiction coverage and actual filing remain subject to independent acceptance; no filing is performed. |
| Invoices and estimates | Invoices/Estimates | New Invoices/Estimates screens | Draft CRUD, approved invoice labor, PDF sharing, recorded external delivery, external invoice payments, estimate decisions and retry-safe conversion implemented in PR #6. Queued PDF email delivery, recurring draft generation and contract-validated milestones are implemented in the current branch. Live SMTP/device acceptance remains open. |
| Reports and exports | Reports | New Reports screen | Project/date summary and real PDF/CSV sharing implemented in PR #6; device sharing acceptance open. Payroll now exports actual OOXML Word/Excel files as well as PDF/CSV. |
| QuickBooks and Stripe integrations | Integrations | New Integrations screen | Status, provider authorization in browser, disconnect and payment sync controls implemented in PR #6; production OAuth/webhooks/settlement acceptance open. |
| Work preferences | WorkPreferences | New WorkPreferences screen | Native unavailability, cover requests, replacement acceptance/decline and manager approval implemented in PR #6. Device timezone is displayed and invalid dates/DST gaps reject; device acceptance remains open. |
| Administration | AdminDashboard/Operations | Administration/Operations plus Team/CompanySettings | Native statistics, employee profile/access, effective wage, masked tax-identity replacement and secure temporary password controls implemented. Tenant/role, audit atomicity and owner protection are checked server-side; live role acceptance remains open. |
| Evidence center | EvidenceCenter | New Evidence screen | Native recent-entry selection, individual media selection, derived PDF/MP4 and ZIP sharing implemented in PR #6. Native evidence streams to temporary files with a 250 MB cap, matching the server package limit; cancellation, signature/type checks and account-change checks apply. Device and chain-of-custody acceptance remain open. |
| Localization | Screen-dependent | Dictionary and screen-dependent | Full screen coverage and translated runtime acceptance remain open. The new expense screen uses en/fr/es copy. |
| Operations enhancements | Operations | New Operations screen | Staffing constraints/cover preview and reviewed assignment, budgets/cost forecasts, text document ingestion/search, labor invoice drafts, scheduled reports, CSV onboarding, usage/measured-value records, saved-project globe and supported undo now have native controls. This is constrained cover planning, not a global schedule optimizer; undo supports documents, report schedules, draft invoices and future assignments only. Device acceptance remains open. |

## Native expenses acceptance

Implemented: claims scoped by the existing API, CAD/USD validation, local calendar date, receipt file metadata, field extraction with an explicit review notice, pending review actions, no self-review controls, per-account persistent drafts, upload reuse after a failed submission, synchronous mutation lock, and fresh connectivity checks. Approval is explicitly described as not sending a payment. API authorization and duplicate-claim protection remain authoritative.

Automated source validation does not prove Android/iOS receipt pickers, external receipt opening, OCR provider availability or physical-device keyboard behavior. No new paid build or store publication is started by this source change.

Validation: mobile TypeScript passed; 36 mobile tests passed; production Hermes/JavaScript exports for iOS and Android passed; git diff --check passed. The existing backend was unchanged. Signed builds 56/10 predate this source addition.

## Native business workflows — PR #6 follow-up, 2026-11-01

Payroll, invoice drafts, reports and integrations now have registered native screens with manager navigation, fresh connectivity checks, synchronous mutation guards and confirmation for consequential actions. Manager visibility includes boss, manager, owner and admin; server authorization is authoritative. New control copy includes Spanish and French translations; a complete application localization audit remains open.

Backend repairs: PDF/CSV payroll export, current active-user/company/manager checks for reports and integrations, strict invoice dates and money validation, approved same-project labor checks, atomic invoice draft edits, and idempotent invoice creation retries. Invoice writes share the company transaction lock with reviewed operations. The new invoice request-key migration must run before release. No bank transfer or tax certification is implied by these controls.

Release status: source only, not production and not in signed iOS build 56 / Android versionCode 10. No further paid build has been started. Device acceptance, production provider authorization and independent financial review remain open.

Validation for the native business workflow follow-up: backend build and all 221 tests passed; mobile TypeScript and 39 tests passed; customer web production build passed; iOS and Android production JavaScript/Hermes exports passed. These checks do not establish physical-device or store acceptance.

Native availability follow-up: local wall-clock dates are converted to UTC without silently normalizing invalid dates or DST gaps. Cover approval uses a stable per-request retry key and authoritative server conflict checks. New controls include Spanish/French copy.

Availability validation: mobile TypeScript and all 41 tests passed, including timezone extremes, calendar normalization, daylight-saving gaps and ordered ranges.

## Estimates, year-end and evidence follow-up

Native estimates now support list/filter/paging, draft create/edit/delete, external delivery and client-decision recording, PDF sharing and conversion to an invoice. Backend creation/edit/conversion use real transactions; retry keys and the converted invoice link prevent duplicate drafts. Relationships are scoped to the active manager’s company. Invoice payment recording is now transactional and retry-safe, rejects overpayment and avoids double-counting the legacy payment trigger. No card charge, bank transfer, email or synthetic payment link is implied by recording external actions. Invoice and estimate PDFs read one database snapshot.

Year-end previews return a fingerprint bound to employee, year, form, identity and payroll values. Both web and mobile submit that fingerprint; stale or absent previews reject before saving. Native employer identity, preview, archive and explicit saved-record sharing are implemented. Tests exercise workflow integrity with synthetic compilation data, not statutory correctness. The existing tax-box mapping and annual calculations still need independent payroll acceptance; these are company records, not filing certificates. Worldwide company-rule generation remains blocked by the existing jurisdiction guard.

Evidence and year-end routes now require a current active manager, including archive and evidence-option reads. Native evidence sharing validates allowed relative routes, content types, binary signatures and a 25 MB limit. Selected evidence may contain sensitive business records; sharing uses the device share sheet and temporary cached files are removed afterward. Physical playback and package verification remain open.

Required additional migrations: `20261101_estimate_request_keys.sql` and `20261101_invoice_payment_keys.sql` (alongside the earlier PR #6 invoice request-key migration). No new production deployment or paid signed build has been started.

Validation for the estimates/year-end/evidence and invoice payment follow-up: backend TypeScript build and all 228 tests passed; the 13 business integration tests passed again after PDF snapshot hardening; mobile TypeScript and all 43 tests passed; customer web production build and iOS/Android production JavaScript/Hermes exports passed; git diff --check passed. No physical device or real external payment was exercised.

Release wiring: Railway predeploy now runs `run-business-parity-migration.cjs`, which applies the three request-key migrations in one transaction and verifies the required columns before commit. Migration or verification failure stops deployment. No production database was accessed during these source checks.

Final predeploy validation: all 230 backend tests passed, including migration order, rollback and schema-verification failures.

## Recurring invoices, milestone contracts and queued email

Recurring templates now produce company-local, due-date-aware draft invoices. Month-end anchors survive short months, each occurrence is unique, and reruns return the existing draft. Users can configure, pause/resume and generate a due occurrence in native/web controls; a bounded worker also creates due drafts. Generation requires an issued template and current manager/workspace entitlement. It does not charge or email automatically. Previously stored recurring flags are not automatically activated by migration; schedules require explicit configuration.

Milestones use an unissued draft contract as the budget. Parent/client/project, percentage, allocated total, exact proportional subtotal and tax rate are checked inside the company transaction. Parents with children cannot be issued or edited. Both clients can fetch the calculated milestone amount; parents cannot reserve worked time or already have payment records.

Invoice/estimate PDF email uses a durable queue. Confirmation is bound to the displayed recipient and document fingerprint, duplicate requests reuse one job, and queued/sending/uncertain deliveries block document edits/deletion. Stale source or entitlement cancels queued work. An interrupted send becomes uncertain and requires provider verification before manager resolution; it is never automatically resent. The UI distinguishes SMTP acceptance from inbox delivery and reports missing SMTP. Tests use a fake transport: no real messages were sent.

Additional migrations `20261102_commercial_billing.sql` and `20261102_commercial_delivery.sql` are wired into Railway predeploy. Final signed builds, deployment and publishing remain on hold under the latest instruction. New web financial-response normalization fixes rendering of PostgreSQL numeric strings. Live SMTP, scheduler soak/concurrency, independent financial review and device acceptance remain open.

Current validation: backend build and all 239 tests passed; mobile TypeScript and 43 tests passed; web production verification build and 2 financial-response regression tests passed. Email tests use a fake transport. No final signed build, deployment or publishing was started.

## Administration, Operations and export follow-up — 2026-11-02

Native Administration now exposes the existing company dashboard and staff maintenance actions. Profile, wage, tax identity and password mutations share a company-locked transaction with their audit record; failed audit inserts roll back the staff change. Owner accounts are protected. Temporary passwords and replacement SIN values are not persisted in client drafts and are cleared when leaving the screen.

Both clients now preview bulk raises against effective historical wages. Exact decimal rounding, same-company active staff checks, a source fingerprint, company locking and a durable request ledger prevent stale or repeated raises. `20261102_bulk_compensation.sql` and the administration audit migration are included in predeploy verification. Native payroll settings expose the existing web schedule/default configuration; these controls do not initiate bank payments. Invalid schedule/time/day/rate defaults reject server-side, and both clients normalize numeric settings before saving.

Payroll Excel and Word downloads contain real OOXML packages, with typed numeric spreadsheet cells and literal employee names (including formula-like text). Files were opened independently with openpyxl and python-docx; ZIP CRC checks passed. Evidence ZIP paths reject traversal and duplicates, preserve UTF-8 filenames and keep artifact-index names consistent with stored entries. Native downloads stream chunks to a private temporary cache file, validate MIME/signatures and delete the file after sharing; evidence allows 250 MB, other business exports 25 MB.

Operations now has native controls for all nine existing web workspace sections. The globe uses bundled public-domain coastline data with no network map calls and displays saved project sites. Knowledge ingestion accepts text/Markdown/CSV up to 200 KB; search returns source excerpts. Private onboarding links remain memory-only and expire in seven days. Reports require the separately configured worker; creating a schedule does not send email. Queued invoice email also blocks invoice undo, with a 409 conflict rather than a generic unavailable error.

Read-only production inspection through the signed-in Railway browser confirmed PR #5 is still active. SMTP and OpenAI variable names are present; `LUCY_LLM_BASE_URL` and `LUCY_LLM_MODEL` are absent. Free inference is therefore not configured. No secrets were revealed or copied and no production configuration was changed. Existing provider credentials do not prove successful delivery, inference, purchase or settlement.

Final signed builds, merging, deployment and publishing remain held. Full parity is NOT accepted yet: free-provider setup, complete localization/runtime coverage, actual store purchase/restore after trial expiry, physical camera/GPS/media/sharing, live SMTP/OAuth/webhooks, independent payroll/year-end review and hosted operational acceptance remain open. Historical lists above are retained; this follow-up supersedes their source-gap descriptions only.

Verified restored checkpoint: backend TypeScript build and all 244 backend tests passed; native TypeScript and all 47 mobile tests passed; web verification build and both web numeric-response regression tests passed; git diff --check passed. Excel/Word packages passed ZIP CRC checks and independent openpyxl/python-docx opening. Tests use isolated synthetic records, not physical devices or live purchases.
