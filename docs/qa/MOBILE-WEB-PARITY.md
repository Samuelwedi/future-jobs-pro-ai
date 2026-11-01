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
| Year-end forms | YearEnd/FinalizedSlips | No dedicated registered screen | Native coverage gap. |
| Invoices and estimates | Invoices/Estimates | New Invoices screen | Invoice list, filters, paging, draft create/edit/delete, approved unbilled labor and payment history implemented in PR #6. Estimates, actual delivery, payment mutations, recurring/milestone workflows and invoice PDF remain open. |
| Reports and exports | Reports | New Reports screen | Project/date summary and real PDF/CSV sharing implemented in PR #6; device sharing acceptance open. Payroll Word/Excel export remains unsupported. |
| QuickBooks and Stripe integrations | Integrations | New Integrations screen | Status, provider authorization in browser, disconnect and payment sync controls implemented in PR #6; production OAuth/webhooks/settlement acceptance open. |
| Work preferences | WorkPreferences | No dedicated registered screen | Native coverage gap. |
| Administration | AdminDashboard/Operations | Team/CompanySettings partial coverage | Complete permission/action mapping still needed. |
| Evidence center | EvidenceCenter | Project files/camera partial coverage | Dedicated review/audit workflow coverage gap. |
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
