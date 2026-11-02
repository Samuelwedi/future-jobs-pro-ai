# Company administration source — 2026-11-02

Local source continuation for Future Jobs Pro AI. Not deployed or included in signed builds 56/10. Public GitHub source updates remain blocked by automatic approval review pending explicit approval of the current payload. No real company user was edited, emailed, deactivated, promoted or reset; no real ownership, payment, environment credential or pricing change was made.

## Action and permission map

This is company-level administration. Platform-owner/support-agent authentication and global administration remain separate.

| Action | Company owner/boss | Company admin | Manager | Employee |
|---|---|---|---|---|
| Overview, masked employee records, scoped audit | Yes | Yes | Yes | No |
| Edit employee profile/active status, rate, tax, temporary password | Yes | Yes | Yes | No |
| Edit a manager's profile/rate/tax/temporary password | Yes | Yes | No peers or self | No |
| Edit own/protected owner/admin through employee administration | No; use dedicated account/ownership flow | No | No | No |
| Assign manager role or invite a manager | Yes | Yes | No | No |
| Invite an employee | Yes | Yes | Yes | No |
| Deactivate ordinary employees and retain historical records | Yes | Yes | Yes | No |
| Deactivate managers | Yes | Yes | No | No |
| Transfer ownership to an active same-company manager | Explicit confirmed flow | No | No | No |
| Enter raw payout bank details | Retired | Retired | Retired | No |

## Native and web behavior

Native CompanyAdministration adds current-company employee search, masked tax status, current/effective rate display, profile/role/active editing, effective compensation, tax/date-of-birth updates, temporary password resets, company audit paging and links to invitations/payroll/payout inspection. Sensitive input is never persisted as a draft; it clears after a successful change, editor close, account/focus change or an uncertain response. Writes require fresh connectivity, synchronous mutation locking and confirmation. Responses bind current actor/company/target; stale data or uncertain mutations disable old controls. English/Spanish/French copy is included.

Web AdminDashboard now uses the same versioned endpoints, server permission flags and masked data, clears sensitive form fields, defaults effective dates to the company calendar, and separates recorded payments by currency. Missing metrics are unavailable rather than fabricated zeroes; margins are not computed from incomparable/unrecorded wage currencies. Payroll totals are records created in the company-calendar month, not verified paid-date settlement or certified earnings. Historical wage/payroll currency is explicitly unspecified. Web Team now obtains a permitted, fresh employee detail/version and sends tax updates through the audited API, without pretending contact-list rows contain tax fields.

Native Team respects protected roles and owner aliases, handles action errors, shows inactive status, and reports email provider acceptance/failure accurately. Removing a team member now deactivates the account and retains employee/payroll/audit records instead of deleting the identity. Existing active sessions still face the server's current-role/active-account gates. Native team/company-admin mutations and old queued URLs (including query/API-prefix variants) cannot replay offline. Broader legacy Team translation/focus/invitation acceptance remains open.

## Server and data integrity

Every company-administration call uses the current active database company/role rather than JWT company claims. Sensitive mutations recheck/lock the actor and permitted target, reject self/protected/peer escalation, validate input and a server HMAC resource version, then commit the employee/rate change and audit record in one transaction. Versions cover relevant account state and rate-history changes without exposing password hashes or tax identifiers. Stale repeats cannot overwrite a later edit. Audit failure rolls the entire mutation back. Legacy Team role/password/deactivation paths share the protected-account policy and audited transaction semantics, so they cannot bypass the new editor.

The older `/users/:id/tax-info` path allowed a same-company employee to update someone else's tax identity. It is retired with HTTP 410 and no write; the updated web Team uses current permissions/version/audit checks. Self-profile updates remain on their existing own-account path. This is a source-level closure with local tests, not a claim that production has received the fix or that all historical security findings are closed.

SIN fields receive format checks only, not identity certification. Blank tax fields preserve existing data. Date-of-birth/effective-date validation uses actual calendar dates; future birth dates fail. Temporary passwords require at least 12 characters and at most 72 UTF-8 bytes, are hashed, never returned by reset APIs and force change on sign-in. Only creation's existing temporary credential handoff is returned to the authorized inviter. No raw tax identifier or password enters new audit details.

Invitation creation now locks/rechecks the active inviter, validates manager assignment authority and commits the new identity/audit atomically before contacting SMTP. A failed audit sends no email and leaves no identity. Failed mail acceptance leaves an explicit emailSent:false response and secure manual handoff; it does not silently recreate the account. Duplicate emails do not create another user or automatically resend mail. Invitation HTML escapes dynamic values. Live mailbox delivery, retry/outbox reconciliation and real recipient acceptance remain open.

## Rollout and verification

The verified `run-company-administration-migration.cjs` release step applies the existing idempotent `20260813_company_admin_operations.sql` audit schema and checks prerequisite user/compensation columns in a transaction. It is wired into predeploy. No production migration was run. Backend and updated web clients must roll out together: employee edits now require expectedVersion; old tax-write clients must refresh to use company administration. Earlier commerce/year-end migration and release holds remain.

Eleven real Express/JWT/PGlite tests exercise owner/manager/employee/inactive/foreign scope, masked outputs, mixed currencies, protected accounts/peers/self, stale edits, audit rollback, effective rates, tax validation, password hashing/forced change, legacy Team bypass prevention, history-preserving deactivation, confirmed ownership transfer, invitation transaction/email failure, HTML escaping and the retired tax path. The migration runner is applied twice in the fixture. Two mobile tests cover display copy/placeholders and no offline queue/replay. Fourteen browser checks exercise the actual native component plus actual MUI administration/team editors against the real local API/database/version/audit/password logic. UI/Alert adapters and the unchanged employee-document list fixture are explicit; no physical device, real mail, bank action or production acceptance is inferred.

Reproduce: `npm run build --prefix backend`; from backend `node --test --test-concurrency=1 tests/*.test.cjs`; `mobile/node_modules/.bin/tsc --noEmit -p mobile/tsconfig.json`; `node --test mobile/tests/*.test.cjs`; `npm run build --prefix web`; with isolated Chromium/QA modules configured, `node scripts/check-company-administration-browser.mjs`.

Full parity remains open for accounting synchronization/reconciliation/currency/import/refund completeness; real document email delivery/automatic recurring invoices; broad Operations/enhancement coverage; employee-document/native legacy Team localization; historical storage/employer provenance reconciliation; and retained physical/live/store/security/load/backup/rollback/tax acceptance. This batch does not certify those flows or start a final paid native build/publication.

Current verification: 275/275 backend tests, 74/74 mobile tests, backend/mobile TypeScript and production customer web build passed. The current evidence and administration browser checks passed 9 + 14 cases (23 total), with the adapter limitations above. Earlier commerce/report/integration results remain recorded in their own documents.

## Exact pending public source payload

Target: existing public repository `Samuelwedi/future-jobs-pro-ai`, draft PR #7, branch `fix/work-screen-localization-20261031`. Its head remains `ff4e3cf43dd97b09a07e7410fb51046765469dc7`. The complete pending local source/test/migration-runner/documentation payload is 72 files, combining the prior 44-file batch with the evidence/administration work below. No environment files, production records or real credentials are included. Automatic approval review has blocked public source uploads pending explicit approval of the payload. No branch ref was updated.

- `backend/migrations/20261101_commercial_documents.sql`
- `backend/scripts/run-commercial-documents-migration.cjs`
- `backend/scripts/run-release-predeploy.cjs`
- `backend/scripts/run-railway-migration.js`
- `backend/scripts/add-progress-invoicing.js`
- `backend/src/services/commercialDocuments.ts`
- `backend/src/services/pdfService.ts`
- `backend/src/services/pdfTemplates.ts`
- `backend/src/routes/commercialDocumentRoutes.ts`
- `backend/src/routes/invoiceRouter.ts`
- `backend/src/routes/estimateRouter.ts`
- `backend/tests/commercial-documents.test.cjs`
- `mobile/App.tsx`
- `mobile/src/screens/HomeScreen.tsx`
- `mobile/src/screens/CommercialDocumentsScreen.tsx`
- `mobile/src/services/commercialFiles.ts`
- `mobile/src/services/api.ts`
- `mobile/src/services/offlineService.ts`
- `mobile/src/utils/manualPayroll.ts`
- `mobile/src/services/screenTranslations.ts`
- `mobile/tests/commercial-documents.test.cjs`
- `web/src/pages/Invoices.tsx`
- `web/src/pages/Estimates.tsx`
- `web/src/services/commercialDocuments.ts`
- `scripts/check-commerce-browser.mjs`
- `docs/qa/COMMERCIAL-DOCUMENTS-20261101.md`
- `docs/qa/MOBILE-WEB-PARITY.md`
- `docs/qa/REMAINING-WORK.md`
- `backend/src/routes/reportRoutes.ts`
- `backend/src/services/comprehensiveReportService.ts`
- `backend/tests/reports-parity.test.cjs`
- `mobile/src/screens/ReportsScreen.tsx`
- `mobile/src/services/reportFiles.ts`
- `mobile/tests/reports-parity.test.cjs`
- `web/src/pages/Reports.tsx`
- `scripts/check-reports-browser.mjs`
- `backend/src/routes/integrationRoutes.ts`
- `backend/src/services/integrationService.ts`
- `backend/tests/integration-access.test.cjs`
- `mobile/src/screens/IntegrationsScreen.tsx`
- `mobile/src/utils/integrationLinks.ts`
- `mobile/tests/integrations-parity.test.cjs`
- `scripts/check-integrations-browser.mjs`
- `docs/qa/REPORTS-INTEGRATIONS-20261102.md`
- `backend/src/routes/evidenceBundleRoutes.ts`
- `backend/src/services/evidenceBundleService.ts`
- `backend/src/services/evidenceMediaService.ts`
- `backend/src/services/evidenceDownload.ts`
- `backend/tests/evidence-parity.test.cjs`
- `mobile/src/screens/EvidenceScreen.tsx`
- `mobile/src/services/evidenceFiles.ts`
- `mobile/src/components/MediaAttachment.tsx`
- `mobile/tests/evidence-parity.test.cjs`
- `web/src/pages/EvidenceCenter.tsx`
- `web/src/components/EvidencePackageDialog.tsx`
- `scripts/check-evidence-browser.mjs`
- `docs/qa/EVIDENCE-20261102.md`
- `backend/src/routes/companyAdminRoutes.ts`
- `backend/src/services/companyAdministration.ts`
- `backend/src/routes/teamRoutes.ts`
- `backend/src/services/teamService.ts`
- `backend/src/services/emailService.ts`
- `backend/scripts/run-company-administration-migration.cjs`
- `backend/tests/company-administration.test.cjs`
- `mobile/src/screens/CompanyAdministrationScreen.tsx`
- `mobile/src/screens/TeamScreen.tsx`
- `mobile/tests/company-administration.test.cjs`
- `web/src/pages/AdminDashboard.tsx`
- `scripts/check-company-administration-browser.mjs`
- `docs/qa/ADMINISTRATION-20261102.md`
- `backend/src/routes/userRoutes.ts`
- `web/src/pages/Team.tsx`
