# Reports and accounting connections — 2026-11-02

Local source continuation. Not deployed, not in signed builds 56/10; no new paid build, publication, real provider authorization, accounting write or banking test was performed.

## Reports

Native Reports adds manager-only company project selection, explicit calendar range, summary metrics/workforce paging and authenticated PDF/CSV sharing. Responses bind the actor/company/project/range. Focus, account and date changes invalidate old previews; export requires fresh connectivity, checks MIME/status/size/current account, and deletes its private temporary file. English, Spanish and French display copy is included. The updated web report clearly describes recorded wage units rather than inventing CAD currency for historical time entries with no currency metadata.

All report API endpoints now require current active database manager membership, ignore stale JWT company claims, validate actual calendar dates/UUIDs/range bounds and use company-timezone day boundaries, including DST. Employee counts/grouped PDF rows use employee IDs rather than names. Approved counts include completed entries only. Foreign photo-user names do not leak through corrupt references. Queries refuse reports with more than 5000 records in any source; narrow the date range rather than receiving silently truncated exports. CSV dates use the company calendar, instants remain UTC, and spreadsheet formula prefixes are escaped. GET comprehensive.pdf is added alongside the existing POST API. Error bodies do not echo SQL diagnostics. These are live operational reads, not a point-in-time audit archive or a reviewed payroll/payment report.

Seven Express/JWT/PGlite tests cover current roles/tenants, invalid dates/ranges, the Edmonton DST boundary, same-name employees, completed approval counts, CSV formula safety, actual PDF bytes, bounded failures and oversized reports. Three mobile tests cover copy, date selection and file export guards/cleanup. Nine browser checks exercise the actual native component and actual local API/PGlite/PDF/CSV with explicit UI/file adapters; no physical device or production acceptance is inferred.

## Accounting connection scope

Native Integrations adds scoped status/environment/account inspection, verified external provider authorization links, confirmed disconnection, sanitized QuickBooks company/item reads and refresh-after-browser guidance. Provider authorization stays in the external browser and tokens remain server-side. Links must match the exact HTTPS Stripe/Intuit authorization host/path and contain an opaque nonce. Account/focus/network guards invalidate stale controls. This is company accounting access, separate from platform subscriptions and employee payouts.

The integration APIs now re-read active manager membership rather than trusting JWT company claims. Status identifies the current actor/company and responses are no-store. Existing one-use, hashed, expiring company-bound OAuth state is preserved; callbacks reject a manager who was disabled, moved company or lost the role. Before saving acquired credentials, a transaction locks and rechecks the initiating user, preventing revocation during exchange from installing the grant. Tokens remain encrypted. Callback redirects and logs do not echo raw provider errors. QuickBooks realm IDs must be numeric.

Seven real API/database tests cover role gates for every management route, current company selection, no credentials in status, nonce hashing/replay/expiry/provider binding, encrypted persistence, revoked access before/during exchange and bounded errors. Two mobile tests cover en/es/fr copy and authorization URL validation. Eight browser checks use the actual native component/API/state encryption and actual QuickBooks response transformation with explicitly mocked provider transport/revocation and external Linking; they perform no real OAuth navigation or provider calls.

Accounting synchronization is deliberately not exposed as a new native write action. Existing service limitations still need work: durable reconciliation/idempotency across lost external responses, supported currency/QuickBooks home-currency handling, complete import paging, refunds/fees and provider/live acceptance. Connecting does not activate automatic sync, employee payouts or verified settlement. Source parity is partial for integrations until those accounting flows are completed and accepted. Existing web sync behavior has not been represented as verified.

## Reproduction and rollout

- `npm run build --prefix backend`
- From backend: `node --test --test-concurrency=1 tests/*.test.cjs`
- `mobile/node_modules/.bin/tsc --noEmit -p mobile/tsconfig.json`
- `node --test mobile/tests/*.test.cjs`
- `npm run build --prefix web`
- With isolated QA node_modules and a Chromium binary configured: `node scripts/check-reports-browser.mjs` and `node scripts/check-integrations-browser.mjs`. Set FJ_QA_NODE_MODULES/BROWSER_PATH and any required library/font environment paths.

No new migration is required for these report/connection changes. Existing secure integration/environment migrations and server-side configuration remain prerequisites. The earlier uncommitted commerce changes still require their coordinated migration/backend/web rollout; year-end migration requirements and release/acceptance holds are retained. Full source and live parity are not claimed.

Current regression: 254/254 backend tests, 68/68 mobile tests, backend/mobile TypeScript and production customer web build passed. Nine report and eight integration browser checks passed; the earlier 13 commerce checks remain recorded separately. No physical/live/production acceptance is inferred.

## Pending public source update

Target: `Samuelwedi/future-jobs-pro-ai`, existing draft PR #7, branch `fix/work-screen-localization-20261031`, verified head `ff4e3cf43dd97b09a07e7410fb51046765469dc7`. Automatic approval review blocked the upload pending explicit approval of this 44-file payload. No branch ref changed, no new merge/deployment/build/publication occurred. The source update preserves the existing base and excludes environment files, credentials and production data. Full parity remains open as described above and in the retained checklist.

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
