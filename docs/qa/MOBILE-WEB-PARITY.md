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
| Payroll processing and adjustments | Payroll/ManualPayroll | New Payroll screen | Draft preparation, saved calculation, independent review, external payment recording, effective employee rates, cost simulation and PDF/CSV export implemented in PR #6. Bulk rate changes and physical acceptance remain open. |
| Bank/direct-deposit management | DirectDeposit | No dedicated registered screen | Native coverage gap; live settlement also unverified. |
| Year-end forms | YearEnd/FinalizedSlips | New YearEnd screen | Employer identity, employee/form/year selection, preview, reviewed-value finalization, finalized archive and JSON sharing implemented in PR #6. Tax box calculations, jurisdiction coverage and actual filing remain subject to independent acceptance; no filing is performed. |
| Invoices and estimates | Invoices/Estimates | New Invoices/Estimates screens | Draft CRUD, approved invoice labor, PDF sharing, recorded external delivery, external invoice payments, estimate decisions and retry-safe conversion implemented in PR #6. Automatic email delivery, recurring generation and milestone workflows remain open. |
| Reports and exports | Reports | New Reports screen | Project/date summary and real PDF/CSV sharing implemented in PR #6; device sharing acceptance open. Payroll Word/Excel export remains unsupported. |
| QuickBooks and Stripe integrations | Integrations | New Integrations screen | Status, provider authorization in browser, disconnect and payment sync controls implemented in PR #6; production OAuth/webhooks/settlement acceptance open. |
| Work preferences | WorkPreferences | New WorkPreferences screen | Native unavailability, cover requests, replacement acceptance/decline and manager approval implemented in PR #6. Device timezone is displayed and invalid dates/DST gaps reject; device acceptance remains open. |
| Administration | AdminDashboard/Operations | Team/CompanySettings partial coverage | Complete permission/action mapping still needed. |
| Evidence center | EvidenceCenter | New Evidence screen | Native recent-entry selection, individual media selection, derived PDF/MP4 and ZIP sharing implemented in PR #6. Native sharing is limited to 25 MB (web/server packages support larger sizes); device and chain-of-custody acceptance remain open. |
| Localization | Screen-dependent | Dictionary and screen-dependent | Full screen coverage and translated runtime acceptance remain open. The new expense screen uses en/fr/es copy. |
| Schedule optimization/document ingestion/crew globe/universal undo | Enhancement register | Enhancement register | Requirements and implementation acceptance remain open; do not count generic screens as completed features. |

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
