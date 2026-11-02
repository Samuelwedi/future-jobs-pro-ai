# Invoices and estimates source — 2026-11-01

PR #7 draft source, not deployed or included in signed builds 56/10. No paid build, publication, production migration, real customer email or transfer was started.

The manager-only native CommercialDocuments screen covers paged/status-filtered lists, new/edit/delete drafts, explicit CAD/USD, project/client selection, ordered lines, tax/notes, approved unbilled time links, recurrence/milestone metadata, private PDF sharing, external-sharing records, referenced acceptance, one-time conversion, recorded payments and client totals by currency. Linked time-entry amounts are recorded wages; managers must review customer rates and currency. Internal notes stay out of customer PDFs. Recurrence is metadata only; automatic generation remains unimplemented.

Matching web screens now send stable save keys/draft versions, require explicit legacy currency, preserve recurrence metadata, handle failed detail/deletion requests, confirm external events, request conversion dates, download authenticated PDFs, page records and render PostgreSQL numeric strings. Client totals are grouped by currency. Date-only API values stay YYYY-MM-DD across drivers.

The shared backend rechecks active company membership/manager role. Transactional writes recompute decimal totals, validate company/project/client/time-entry relations, reject stale edits, and preserve positions. Durable company-scoped receipts deduplicate actions and reject conflicting reuse. Payment writes lock the invoice, require ledger/header agreement, reject overpayment, validate the company calendar and set the exact cumulative paid total without double-counting the legacy sum trigger. Only unpaid drafts may be deleted. Number triggers serialize and continue past 9999. Estimate conversion requires recorded acceptance and creates one invoice. Send records confirmed external sharing only; it never claims SMTP delivery or invents a payment URL. Payment recording neither charges a card nor verifies settlement.

## Rollout

Apply `backend/migrations/20261101_commercial_documents.sql` using the transactional runner wired into release predeploy, then roll out backend and updated customer web together. Existing invoice/estimate tables are prerequisites; this is not a bootstrap. Currency and old positions remain nullable rather than guessed; issued legacy currency/ledger issues need owner-reviewed reconciliation. Legacy ordering cannot be reconstructed where no order was recorded. No production data has been migrated.

Old clients must refresh: create/update need requestKey; edits need expectedUpdatedAt; shares need confirmed:true; acceptance also needs reference; conversion needs invoiceDate/dueDate; completed external payments need confirmation and unique receipt reference. Native financial actions and old queued invoice/estimate/integration writes refuse offline replay.

## Verification

- Backend build: `npm run build --prefix backend`. Full tests from backend: `node --test --test-concurrency=1 tests/*.test.cjs`.
- Mobile: `mobile/node_modules/.bin/tsc --noEmit -p mobile/tsconfig.json`; `node --test mobile/tests/*.test.cjs`.
- Web: `npm run build --prefix web`.
- Browser: `FJ_QA_NODE_MODULES=/path/to/isolated/qa/node_modules BROWSER_PATH=/path/to/chromium node scripts/check-commerce-browser.mjs`. Shared libraries/fonts may need their environment paths.

Eleven real Express/JWT/PGlite tests exercise repeatable migration, active roles/tenant isolation, dates/currencies/decimal limits, stale edits, transaction rollback, receipt deduplication, sum-trigger coexistence, approved time-entry exclusivity, conversion, legacy currency, counters and PDF bytes. Thirteen browser checks cover actual native React flows with explicit DOM/file/share adapters plus real MUI create/edit/share and invoice create through the real local API/database. Two mobile tests cover offline refusal and en/es/fr copy. The broader suite counts are recorded in PR #7. No physical-device, real mail, live banking or production acceptance is inferred.

Real delivery, automatic recurrence, unsupported currencies/credits, legacy reconciliation, physical sharing and all retained acceptance groups remain open.

## Review scope

The commerce batch contains these 28 files for public repository `Samuelwedi/future-jobs-pro-ai`, draft PR #7; later report/integration changes also update shared app/dictionary/checklist files. Commerce verification: 240/240 backend tests, 63/63 mobile tests, 13 browser checks, backend/mobile TypeScript and the production web build.

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
