# Native multi-country payroll payouts — architecture and release runbook

**Release status: foundation only; payout execution is not live.**

This release adds an in-app Payout Center, a tenant-scoped payout orchestration service, a PostgreSQL repository contract, and a pluggable provider-adapter boundary. It does **not** include a registered bank or payment-provider adapter, provider credentials, a certified clearing connection, or evidence that any country corridor can move money. The adapter registry is empty by default, so payout execution is fail-closed.

The customer experience can remain inside Future Jobs Pro AI for preparation, approval, execution confirmation, and status review. Actual settlement must still be performed by a licensed bank or payment provider behind a reviewed adapter. QuickBooks is an optional accounting connection; it is not the payout rail.

## Current code status and release gates

| Item | Current state | Required before any live payout |
| --- | --- | --- |
| Payout Center UI | Implemented in `web/src/pages/DirectDeposit.tsx`; calls `/api/payouts` and disables actions when capability data is incomplete or execution is unavailable | Build and acceptance-test against the deployed backend |
| Orchestration service | Implemented in `backend/src/services/nativePayoutService.ts` | Security review, adapter integration, provider sandbox tests, and production acceptance |
| HTTP API | Implemented in `backend/src/routes/payoutRoutes.ts` and mounted at `/api/payouts` behind the existing authentication, company, role, and subscription controls | Route-level staging acceptance and independent security review |
| PostgreSQL repository and migration | `postgresPayoutRepository.ts` is backed by the additive `20260926_native_payroll_payouts.sql` migration; the release migration runner verifies the payout tables and provenance fields | Backup/restore rehearsal, isolated migration acceptance, and production change approval |
| Payroll certification gate | A payroll must carry immutable country, currency, calculation-engine, calculation-version, and certification-time provenance that exactly matches the requested payout pair; legacy/unprovenanced payrolls fail closed | A certified payroll engine and country-specific calculation acceptance for every enabled corridor |
| Concrete payout adapter | **None registered by default** | Implement, review, configure, and explicitly register a certified adapter |
| Employee account enrollment | Hosted-tokenized enrollment contract and adapter hostname allowlist exist; stored opaque recipient references use encrypted `v2` ciphertext and active destinations require provider verification | Provider callback/token-ingestion flow, employee self-service, signed status handling, and end-to-end provider testing |
| Legacy direct deposit | Retired; `/api/direct-deposit` returns `410 LEGACY_DIRECT_DEPOSIT_RETIRED` | Keep the tombstone in place so stale clients cannot bypass the reviewed workflow |
| Legacy payroll execution | `/api/payroll/run` and `/api/payroll/process` return `410 LEGACY_PAYROLL_EXECUTION_RETIRED` | Keep disabled; use reviewed payroll preparation plus Payout Center |
| QuickBooks | Reported separately as accounting-sync availability | Configure only for accounting synchronization; do not describe it as a bank or payroll payout provider |
| Provider callbacks, settlement reconciliation, returns and reversals | Not delivered by this foundation | Required adapter-specific implementation and operational acceptance before production |
| Operational money-movement controls | Company readiness, configuration-version binding, per-recipient/per-batch limits, 24-hour approval freshness, maker-checker, and exact execution confirmation are enforced | Recent-auth/MFA, daily velocity limits, durable submission outbox, and operator runbooks are still required |

Do not advertise a country as “live,” “connected,” “bank certified,” or “available for payouts” merely because it appears in the catalog or UI.

## Architecture

### Application-owned layer

- `DirectDeposit.tsx` presents capabilities, company payout settings, employee destination readiness, eligible payrolls, approval batches, execution confirmation, history, and provider-hosted enrollment links.
- `payoutRoutes.ts` exposes capability, settings, account, payroll, batch, approval, execution, and event endpoints. It requires an authenticated, active company actor with a manager role.
- `nativePayoutService.ts` owns country/currency and certified-payroll validation, company-specific adapter readiness and limits, read-only preview, immutable batch intent, idempotency, 24-hour approval freshness, maker-checker approval, explicit execution confirmation, adapter submission, and safe status mapping.
- `postgresPayoutRepository.ts` scopes reads and writes by `company_id`, uses transactions and PostgreSQL advisory locks for serialized financial actions, and stores batch snapshots, events, and idempotency records.
- `20260926_native_payroll_payouts.sql` adds certified payroll provenance and payout records with tenant-bound foreign keys, immutable snapshots, guarded status transitions, append-only events, and encrypted opaque recipient-token constraints.
- QuickBooks connectivity is read only as a separate accounting-sync capability. Payout eligibility does not turn QuickBooks into a payment rail.

### Licensed-provider layer

A production adapter must implement the `PayoutAdapter` contract:

- a stable adapter ID;
- an explicit country/currency allowlist;
- a runtime `isConfigured()` check and a per-company `isCompanyReady(companyId)` decision;
- a per-company configuration version, used to invalidate approvals prepared against changed credentials or funding configuration;
- positive per-recipient and per-batch limits for the company and currency;
- tokenized hosted enrollment plus an exact hostname allowlist when employee destination setup is offered; and
- idempotent batch submission returning only a supported state and provider reference.

No adapter is auto-created from environment variables. An implementation must be imported and passed to `registerPayoutAdapter(...)` during controlled backend startup. Until that happens, the capabilities response reports execution unavailable and no payout submission can occur.

### Transaction flow

1. The UI loads all capability, settings, account, payroll, and batch data. Any load failure leaves payment actions disabled.
2. A manager selects a country/currency pair only when a registered adapter supports the pair, is globally configured, and reports that exact company ready with valid treasury limits and a configuration version.
3. Employee destinations are created through a provider-hosted HTTPS enrollment session whose returned hostname must be on the adapter allowlist. Requests containing raw account, routing, transit, sort-code, IBAN, SWIFT/BIC, or BSB fields are rejected.
4. Only an `approved` or `processed` payroll carrying a complete, immutable certification tuple for the exact country/currency pair can become a batch. Existing payrolls are not inferred, backfilled, or silently certified.
5. Creation enforces per-recipient and per-batch limits, then snapshots employees, amounts, currency, destination fingerprints, payroll calculation provenance, and the adapter configuration version. An idempotency key and transaction lock prevent duplicate batch creation.
6. A different authorized manager must approve the batch. The creator cannot approve their own batch.
7. Approval is valid for 24 hours by default. Execution requires the exact text `EXECUTE <batch-id>` and re-checks company readiness, configuration version, limits, approval freshness, item count, total, currency, and destination fingerprints immediately before submission.
8. The adapter receives provider recipient references, never raw bank coordinates, and a stable provider idempotency key derived from the batch ID.
9. A timeout or uncertain provider response leaves the batch in `submitting`, records `submission_outcome_unknown`, and does not claim success or invent a provider reference.

## Country catalog is not live coverage

The current application allowlist can model the following ISO country/currency pairs:

| Group | Catalog pairs |
| --- | --- |
| North America | CA/CAD, US/USD, MX/MXN |
| United Kingdom and Oceania | GB/GBP, AU/AUD, NZ/NZD |
| Asia | SG/SGD, IN/INR, MY/MYR |
| Africa and South America | ZA/ZAR, BR/BRL |
| EUR/SEPA-modeled countries | AT, BE, HR, CY, EE, FI, FR, DE, GR, IE, IT, LV, LT, LU, MT, NL, PT, SK, SI, ES — each with EUR |

The rail names in the source are modeling metadata, not proof of bank access or regulatory approval. A pair becomes executable only when a registered adapter declares support, reports itself configured, reports that employer ready, supplies valid company limits, and is bound to the batch by configuration version. Production release additionally requires corridor-specific certification, a certified payroll engine, and company onboarding.

## Fail-closed controls

- The process-wide adapter registry starts empty.
- Missing, unknown, unsupported, unconfigured, or company-unready adapters fail closed; the UI does not expose a usable create or execute action.
- Settings do not assume a default country, currency, or adapter.
- Company identity comes from the verified token and database record, not from request-supplied company IDs.
- Only `boss`, `owner`, `manager`, or `admin` roles can access the payout API.
- Raw banking field names are rejected recursively before persistence or provider submission.
- IDs, ISO codes, minor-unit amounts, request fields, state transitions, and idempotency keys are validated.
- A payroll without complete certified provenance, or whose country/currency does not exactly match company payout settings, cannot enter a payout batch. Certified provenance is immutable in PostgreSQL.
- Batch creation, approval, and execution are tenant-scoped, locked, and idempotent.
- Adapter configuration changes invalidate an existing batch instead of reusing its approval.
- Per-company recipient and batch limits are checked during preparation and immediately before submission.
- Approval expires after 24 hours by default; stale approvals cannot execute.
- Batch and item snapshots, approval identity, provider reference, execution key, audit events, status transitions, and tenant relationships are protected by database constraints and triggers.
- The batch creator cannot approve the same batch.
- Provider uncertainty is not converted into a success state.
- Schema-not-ready errors return `503 PAYOUT_SCHEMA_NOT_READY` rather than silently falling back.
- Opaque provider recipient references are encrypted before storage; the schema accepts only the versioned ciphertext form, and active destinations require provider verification time.
- A hosted-enrollment URL must use HTTPS and match the adapter's explicit hostname allowlist.
- The old raw-bank/NACHA-like API is a `410` tombstone.

## Exact deployment environment variables used by this path

These names come from the current source. Secrets belong in the deployment secret manager, never in source control or browser variables.

### Required platform variables

| Variable | Current code behavior |
| --- | --- |
| `JWT_SECRET` | Required by `backend/src/utils/auth.ts` to verify the bearer token used by the payout API. Use a high-entropy production secret. |
| `DATABASE_URL` | Preferred PostgreSQL connection string used by `backend/src/config/database.ts`. If omitted, all five `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` settings are used, with the code's local defaults. |
| `NODE_ENV` | Set to `production` in production. This makes payout enrollment reject non-HTTPS return URLs. |
| `PAYOUT_ENROLLMENT_RETURN_URL` | Passed to the payout orchestrator. It must be a valid URL and must use HTTPS when `NODE_ENV=production`. There is no default. It is useful only after a hosted-enrollment adapter exists. |
| `ENCRYPTION_KEY` | Must contain at least 32 characters. The payout repository uses it to encrypt/decrypt opaque provider recipient references; preserve it during upgrades and rotate only with a reviewed re-encryption plan. |
| `VITE_API_URL` | Primary web build-time backend base URL read by `web/src/services/api.ts`. |
| `VITE_API_BASE` | Fallback web build-time backend base URL when `VITE_API_URL` is absent. Do not rely on the hard-coded production fallback for a controlled release. |
| `CORS_ORIGINS` | Optional comma-separated backend allowlist extension. Set it when the deployed Payout Center origin is not already in `backend/src/config/cors.ts`. |

### Database options read by the same repository path

| Variable | Current code behavior |
| --- | --- |
| `DB_SSL` | Explicitly enables or disables PostgreSQL TLS; otherwise TLS is enabled when `DATABASE_URL` is present. |
| `DB_SSL_REJECT_UNAUTHORIZED` | Certificate verification is enabled only when its exact value is `true`. Production policy should normally require verified certificates. |
| `DB_POOL_MAX` | Positive integer; default `20`. |
| `DB_IDLE_TIMEOUT_MS` | Positive integer; default `30000`. |
| `DB_CONNECT_TIMEOUT_MS` | Positive integer; default `5000`. |
| `DB_QUERY_TIMEOUT_MS` | Positive integer; default `15000`. |
| `DB_STATEMENT_TIMEOUT_MS` | Positive integer; default `15000`. |

### Optional QuickBooks accounting sync

| Variable | Current code behavior |
| --- | --- |
| `QUICKBOOKS_CLIENT_ID` | Required to start or refresh a QuickBooks OAuth connection. |
| `QUICKBOOKS_CLIENT_SECRET` | Required for QuickBooks OAuth token operations. |
| `QUICKBOOKS_REDIRECT_URI` | Required OAuth callback URL. It must exactly match the Intuit application configuration. |
| `QUICKBOOKS_ENVIRONMENT` | Uses production endpoints only when the exact value is `production`; every other value selects sandbox. |
| `FRONTEND_URL` | Used by the existing integration flow when redirecting the browser after provider setup; its code default is `https://www.futurejobsproai.com`. |

`QUICKBOOKS_DEFAULT_ITEM_ID` is used by the existing QuickBooks sales-receipt flow, not by Payout Center execution.

There are currently **no payout-provider credential environment variables** in this foundation because there is no concrete adapter. Do not invent generic variables and treat the feature as configured. The selected provider adapter must define, validate, and document its own sandbox/live credentials, webhook secrets, account identifiers, and environment switch.

`backend/.env.example` documents both `ENCRYPTION_KEY` and `PAYOUT_ENROLLMENT_RETURN_URL`. It intentionally has no provider-adapter credentials because no concrete adapter is delivered. Add only the exact reviewed variables for a selected provider; the absence of generic credentials means execution remains unavailable.

## Provider, bank, and compliance certification requirements

Before enabling one country/currency pair, obtain written approval for that exact corridor and environment:

- a contract with a licensed payment provider, sponsor bank, or bank offering the applicable payout API;
- confirmation of the provider's supported use case for employer-funded payroll, currencies, countries, limits, cutoffs, settlement timing, and prefunding model;
- completed platform and employer KYB/KYC, sanctions/AML, beneficial-owner, and funding-account checks;
- provider-hosted beneficiary verification/tokenization so raw bank coordinates do not enter Future Jobs Pro AI;
- sandbox and production API certification, including idempotency, duplicate prevention, signed callbacks, retry policy, timeouts, and provider outage behavior;
- reconciliation for submitted, processing, settled, failed, returned, and reversed transfers, including operator escalation and customer-visible receipts;
- security, privacy, retention, breach-response, and data-residency review for every jurisdiction involved;
- treasury approval for funding controls, per-transfer/daily limits, segregation of duties, and exception handling; and
- legal/payroll review of local wage-payment timing, payslip, tax, holiday, deduction, recordkeeping, and employee-consent obligations.

Payment-rail certification does not certify payroll calculations or tax filings. Those are separate country-specific release gates.

## Deployment and migration sequence

1. **Keep execution closed.** Leave the adapter registry empty and retain both legacy `410` tombstones while staging is prepared.
2. **Back up PostgreSQL.** Create and restore-test a full backup in an isolated environment. Record the application commit and migration checksum.
3. **Review the migration.** Review `backend/migrations/20260926_native_payroll_payouts.sql` and its checksum against `PostgresPayoutRepository`. It is additive, leaves existing payroll provenance `NULL` and fail-closed, and enforces tenant ownership, unique idempotency, immutable certification/batch intent, guarded state changes, append-only audit events, and restrictive financial-record deletion.
4. **Apply the migration in staging.** Run it through `backend/scripts/command-release-db.cjs` and the normal approved migration workflow. Verify every payout table, provenance column, constraint, trigger, index, and foreign key. Do not let the application create these tables on startup.
5. **Verify the mounted API.** `/api/payouts` is mounted behind the existing subscription gate and before the protected-API fallback. Verify unauthenticated, expired-subscription, employee-role, and cross-tenant requests fail.
6. **Configure the platform variables.** Set the exact variables above, build the web client with the intended HTTPS API URL, and confirm `PAYOUT_ENROLLMENT_RETURN_URL` points to the deployed app.
7. **Implement one sandbox adapter.** Start with one country/currency pair. Add hosted tokenized enrollment and allowlisted hosts, secure callback/token processing, signed provider status handling, a durable submission outbox, reconciliation, returns/reversals, and operational alerts. Register it explicitly only in the sandbox deployment.
8. **Run automated and manual acceptance.** Complete every test in the next section, including concurrency, timeout, duplicate submission, and reconciliation drills.
9. **Certify and allow the first company.** Complete provider/bank, legal, security, treasury, and payroll approvals. Onboard one internal pilot company with conservative provider and application limits.
10. **Promote credentials separately.** Never reuse sandbox credentials in production. Re-run provider certification and smoke tests with production configuration while keeping customer execution disabled.
11. **Enable a controlled pilot.** Select the certified adapter and pair only for approved pilot companies. Monitor every state change and reconcile provider totals to the immutable batch snapshot and funding account.
12. **Expand one corridor at a time.** Repeat certification and acceptance for each new country/currency/provider combination. Catalog presence alone is never sufficient.

### Rollback

Disable or unregister the adapter first so new execution fails closed. Preserve batch and audit records, investigate any `submitting`, `submitted`, or `processing` batch directly with the provider, and reconcile it before application rollback. Restore the verified pre-migration database backup when schema rollback is required; do not manually delete financial rows or assume application rollback cancels a provider transfer.

## Test and verification plan

### Automated checks

From `backend`:

```bash
npm ci
npm run build
npm run test:native-payout
```

The native payout suite covers capability truthfulness, raw-bank rejection, certified payroll provenance, country/currency mismatch, company readiness, company limits, configuration changes, approval expiry, role and persistence guards, idempotency, tenant isolation, maker-checker, exact confirmation, adapter removal, snapshot tampering, uncertain outcomes, and safe replay. Treat a fresh successful run in the target artifact as required evidence; this document does not substitute for that run.

From `web`:

```bash
npm ci
npm run build
```

Run the broader backend release suite as well:

```bash
npm run test:release
```

`npm run test:release` now includes the core release suite, the native payout service suite, and `tests/native-payout-migration.test.cjs`. The migration test applies the payout migration twice and probes provenance immutability, tenant foreign keys, encrypted-token constraints, batch-state controls, item immutability, maker-checker, and append-only events. Remaining gaps include route-level HTTP integration tests against hosted PostgreSQL, Payout Center browser automation, and any real provider sandbox, callback, settlement, reconciliation, return, or reversal test.

### Required no-adapter acceptance

- `GET /api/payouts/capabilities` returns `executionEnabled: false` with no registered adapter.
- Payout Center shows “Payout execution unavailable”; create, approval, enrollment, and execution controls remain disabled.
- No country can be saved with a nonexistent adapter.
- Raw-bank request fields are rejected without echoing their values or writing them to logs, events, or tables.
- Every legacy `/api/direct-deposit` operation returns `410 LEGACY_DIRECT_DEPOSIT_RETIRED`.
- Legacy `/api/payroll/run` and `/api/payroll/process` return `410 LEGACY_PAYROLL_EXECUTION_RETIRED`.

### Required adapter-sandbox acceptance

- Hosted enrollment uses HTTPS, expires, rejects tampering, and stores only provider references plus safe display metadata.
- A payroll outside the company, an employee from another tenant, an employee role, and a self-approval attempt all fail.
- An uncertified payroll, a country/currency mismatch, a stale approval, a changed adapter configuration version, a company without provider onboarding, and any recipient/batch amount over its company limit all fail before provider submission.
- Concurrent creates, approvals, and executes resolve to one batch and no more than one provider submission.
- The exact employee count, currency, minor-unit total, and destination fingerprints are revalidated immediately before submission.
- A timeout leaves the batch outcome unknown and never claims success. Before live use, prove a reconciliation-and-retry procedure that preserves the same provider idempotency key without duplicating funds.
- Signed callbacks or polling cannot move a batch backward or overwrite immutable intent; duplicates and out-of-order events are harmless.
- Failed, returned, and reversed test transfers reconcile to provider records and produce operator-visible audit events.
- QuickBooks journal/accounting synchronization, when enabled, is tested separately and never controls whether money moved.
- Audit logs and support screens contain no credentials, provider tokens, raw account coordinates, or full bank identifiers.

## Known gaps that prevent live money movement

This foundation does not yet include a concrete live adapter, provider callback/token-ingestion endpoint, signed webhook or polling processor, durable submission outbox, settlement reconciliation, returns/reversals workflow, partial-result handling, employee self-service enrollment, recent-auth/MFA challenge, or daily/rolling velocity controls. A per-batch and per-recipient limit is not a substitute for daily treasury controls. These are release blockers, not optional enhancements.

The in-app experience therefore covers manager preparation, dual approval, exact confirmation, and audit review, while the adapter registry remains empty by default. No money moves until a licensed, regulated rail and a separately certified country-specific payroll calculation engine are implemented, contracted, configured, and accepted for the employer and corridor.

## Release statement

Safe wording for this build is:

> Future Jobs Pro AI includes a fail-closed, multi-country payout foundation and in-app approval experience. No payout rail is enabled by default. Live employee payments require a separately implemented, licensed, certified, and configured bank or payment-provider adapter for each country/currency corridor.

Do not shorten this to “global payroll is live” or “QuickBooks countries are supported for payment.”
