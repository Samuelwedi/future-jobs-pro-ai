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
| Payroll processing and adjustments | Payroll/ManualPayroll | No dedicated registered payroll screen | Native coverage gap. Payroll rules alone are not payroll processing parity. |
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

