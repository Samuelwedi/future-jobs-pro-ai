# Future Jobs Pro AI 1.2.0-rc.4 — release and installation guide

**Release decision: production candidate for isolated staging. Production deployment still requires the checklist in the verification report.**

RC3 combines the Command Center and Operations expansion with company-level subscription enforcement, tenant-bound authorization fixes, transactional migrations, a fail-closed in-app Payout Center foundation, safer provider integrations, Windows lifecycle scripts, and an Expo SDK 55 mobile upgrade. It does not deploy itself, change live prices, move money, submit tax filings, or produce signed mobile store binaries.

## Delivered scope

| Area | Delivered in RC3 | Boundary |
| --- | --- | --- |
| Command Center and Lucy | Workforce/pay-period briefing, timesheet export, explicit payroll-draft proposal and confirmation, structured receipts, company document search, profitability and invoice-preview tools | Payroll remains a human-reviewed draft; no tax filing or money movement |
| Staffing and cover | Skills, availability, leave/overlap/hour checks, ranked candidates, assignment, worker replacement consent and manager approval | Rule-based one-shift recommendations, not a global optimizer |
| Operations | Project profitability, knowledge library, labor invoice drafts, recurring report snapshots, CSV invitations, usage/value records, project globe, scoped action history and undo | Some provider delivery and legacy workflows still require credentialed staging tests |
| Expenses | Claims, tenant-safe review, self-approval prevention, duplicate checks, optional AI receipt extraction with human review | Extraction requires a configured vision provider; no reimbursement payout |
| Payout Center | `/api/payouts` plus a branded in-app workflow for company settings, destination readiness, certified-payroll batches, maker-checker approval, exact execution confirmation, and audit history | No adapter is registered by default and no money moves; live use requires a licensed rail, employer/corridor onboarding, and certified payroll calculations |
| Security and tenancy | Company-scoped authorization, removal of test-header bypass, protected PDFs and WebSockets, kiosk PIN rate limiting, fail-closed company subscription gate | A security review and hosted penetration test are still required before certification claims |
| Subscription lifecycle | Registration creates company, owner, and internal trial atomically; protected APIs and sockets check company entitlement | Existing commercial catalog and app-store product reconciliation remain an operator task |
| QuickBooks | Native, fixed-host OAuth/token/revoke/API client replaces the vulnerable SDK | Requires Intuit sandbox/live credentials and callback validation |
| Mobile | Expo SDK 55 / React Native 0.83 / React 19.2, `expo-audio` and `expo-video`, background location configuration, account-partitioned offline queue, Lucy wake module autolinking | Source and bundles validated; no signed device build or physical GPS/battery test |

## Prerequisites

- Windows 10/11 PowerShell, Node.js 22.12+ (Node 24 LTS recommended), npm, and at least 3 GB free space.
- A separate PostgreSQL 18 staging database restored from a verified backup and Redis 8.
- A configured `backend\.env`. Never put credentials in chat, source control, or the release ZIP.
- A high-entropy `ENCRYPTION_KEY` preserved securely across upgrades. It protects opaque payout-recipient tokens and existing integration credentials; changing it without re-encryption makes stored ciphertext unreadable.
- For an upgrade, a verified full database rollback backup. Do not begin with production.

**Required credential action:** a legacy diagnostic file contained a hard-coded JWT secret and RC3 removes it. Treat the historical value as compromised. Before any deployment, generate a new high-entropy `JWT_SECRET`, update the target environment securely, restart all app instances, and require users to sign in again. Do not reuse the prior value.

## Extract and verify

Place `Future-Jobs-Pro-AI-1.2.0-RC3.zip` and its `.sha256` file in Downloads, then run:

```powershell
$Zip = Join-Path $env:USERPROFILE 'Downloads\Future-Jobs-Pro-AI-1.2.0-RC3.zip'
$Expected = (Get-Content "$Zip.sha256").Split(' ')[0].Trim()
$Actual = (Get-FileHash -LiteralPath $Zip -Algorithm SHA256).Hash
if ($Actual -ne $Expected) { throw "Checksum mismatch: $Actual" }
$Destination = Join-Path $env:USERPROFILE ('Projects\FutureJobs-1.2-RC3-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
Expand-Archive -LiteralPath $Zip -DestinationPath $Destination
Set-Location -LiteralPath (Join-Path $Destination 'Future-Jobs-Pro-AI-1.2.0-rc.4')
```

Do not run scripts from inside the compressed ZIP.

## Isolated installation

1. Keep the verified local PostgreSQL 18 and Redis 8 services running. Confirm `backend\.env` points to `127.0.0.1:55433` and `127.0.0.1:56380`, not Railway or another remote host.
2. Run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Install-App.ps1 -ApplyMigration -IncludeMobile
```

The installer uses lockfiles, validates/applies release migrations, runs the complete backend release suite (including payout service and payout migration checks), builds backend and web, and starts the app loopback-only on port 8181. It refuses a remote migration unless `-AllowRemoteDatabaseMigration` is explicitly supplied. Do not use that switch during local validation.

3. Run the public smoke test:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-App.ps1
```

An anonymous unknown `/api` path must return **401 or 403**, not 404. This is intentional: authentication and subscription checks fail closed before protected route existence is disclosed. The script also verifies health/version, login, and SPA fallback.

4. Open `http://localhost:8181/login`, sign in with an existing account in the restored schema, and follow the verification checklist. There is no default login. With no adapter installed, Payout Center must visibly report execution unavailable and must not offer a successful payout path.
5. Stop only the RC3 backend when finished:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Stop-App.ps1
```

This leaves PostgreSQL and Redis running and does not alter the database.

## Optional provider configuration

- Receipt extraction: `OPENAI_API_KEY` and an available vision-capable `RECEIPT_VISION_MODEL`.
- Email: SMTP variables for invitations and password reset.
- Media: configured attachment/storage provider.
- QuickBooks: Intuit client ID, secret, callback URL, and sandbox company.
- Recurring reports: set `OPERATIONS_REPORT_WORKER=true` and restart.

No payout-provider credentials belong in this section because this release contains no concrete payout adapter. `PAYOUT_ENROLLMENT_RETURN_URL` and `ENCRYPTION_KEY` are documented in `backend\.env.example`, but setting them does not enable transfers. Do not invent provider variables or treat QuickBooks as the payout rail.

Configure reviewed per-company Operations limits from `backend`:

```powershell
node .\scripts\configure-operations-limits.cjs COMPANY_UUID 35 500 10485760
```

The sample means 35 active/invited seats, 500 receipt-AI attempts per UTC month, and 10 MiB of knowledge text. It is not a pricing recommendation.

## Native payout foundation and live-release boundary

The payout migration adds immutable payroll certification provenance and tenant-scoped settings, accounts, batches, batch items, events, and idempotency records. It enforces encrypted opaque recipient references, provider verification before account activation, guarded batch transitions, maker-checker separation, immutable approved intent, and append-only events. The service additionally requires per-company adapter readiness, a matching adapter configuration version, per-recipient/per-batch limits, a fresh approval (24 hours by default), and the exact confirmation `EXECUTE <batch-id>`.

These controls do not create a payment network. Before any employer can pay through the app, deliver and accept a licensed adapter, provider callback/token persistence, signed webhook or polling status path, durable submission outbox, reconciliation, returns/reversals and partial-result handling, employee self-service enrollment, recent-auth/MFA, and daily/rolling velocity limits. The payroll source must also be a certified calculation engine for that exact country/currency corridor. Follow `release-docs/Native-Multi-Country-Payouts-Release-Runbook.md`; no money moves by default.

## Mobile build handoff

The source targets Expo SDK 55. A store release still requires the authorized EAS account, signing credentials, privacy declarations, physical Android/iOS tests, and staged submission. Configure `EXPO_PUBLIC_API_URL` to HTTPS staging, then run from `mobile`:

```powershell
npm ci
npx tsc --noEmit
npx expo install --check
npx eas build --profile preview --platform android
```

Use the production EAS profile only after device acceptance. Preserve the existing EAS project ID and bundle identifiers.

## Rollback and production gate

Stop RC3, preserve records created during acceptance, restore the verified pre-migration dump into an isolated database, point the previous release at that restored database, and run its health checks. Do not manually drop RC3 tables or delete payout audit records in production. Old code does not undo invoices, assignments, invitations, expenses, payout submissions, or offline actions already committed. Any `submitting`, `submitted`, or `processing` payout must be reconciled with its provider before rollback.

Production requires Windows RC3 install/smoke acceptance, manual critical flows, credentialed provider sandboxes, physical mobile acceptance, backup-restore rehearsal, concurrent-worker and realistic load tests, security/accessibility review, monitoring/alerts, and approved deployment/rollback. Payouts remain disabled until every additional gate in the payout runbook is signed for a named employer and corridor. See the verification report for exact evidence.
