# Legacy Reports access boundary

## Scope and behavior

The legacy Reports workspace is management-only, consistent with its existing navigation policy and the shared `isManagerRole` predicate: boss, owner, manager, and admin (case-insensitive). Every legacy report request now checks the current active database user and role before project lookup, report queries, or PDF rendering. A stale JWT role does not grant access.

Protected handlers under the existing `/api/reports` mount:

- `GET /summary`, including the implicit HEAD route.
- `GET /timesheet.csv`, including the implicit HEAD route.
- `POST /comprehensive`.

A non-management user receives 403. Existing subscription, complimentary-company, password-change, active-company, tenant, project, and date-validation behavior remains in place. The web Layout also blocks direct Reports page mounting for non-managers using React Router's matching, including encoded, mixed-case, and trailing-slash paths. The backend is the authorization boundary; browser state alone never grants report access.

No project membership rules or other route policies changed. Platform support/owner sessions use their existing separate agent authentication and routes; no special Reports bypass or new system role was introduced.

## History and route inventory

The fix is based directly on deployed source commit `000aac271f46c4e9cf5d5a723180443765e8e30d`. The relevant report history contains seven commits: initial comprehensive reporting (`d739b11`), renderer/data corrections (`0074e3b`, `7bf8ddf`, `1a3f43f`), the current reporting workspace (`c9031e7`), and media/summary corrections (`a82338b`, `93a59a2`). The management-only web navigation was introduced in `dfb8324`; `0ff4e56` includes the owner role.

The current backend has one `reportRoutes` mount and one caller of `generateComprehensiveReport`, covering the three handlers above. Related photo evidence reports, operations snapshots/schedules, dispute PDFs, evidence artifacts, pay-stub downloads, and personal timesheet exports are separate flows, not aliases of these handlers. Their existing policies were inspected to establish scope; this patch does not change or certify those separate flows.

## Verification

Committed regression suites:

- From `backend`: `node --test --test-concurrency=1 tests/reports-role-access.test.cjs` (10 tests).
- From `web`: `node --test --test-concurrency=1 tests/reports-route-access.test.cjs` (3 tests).
- Backend and web TypeScript checks: `node node_modules/typescript/bin/tsc --noEmit` from each package.

The backend suite executes production JWT verification, subscription middleware, complimentary-company SQL, role predicate, and the complete report router against synthetic PGlite data. Only the database and PDF renderer are substitutes. It proves employee/unknown/system-only roles cannot query report data or invoke rendering; all four management roles retain legitimate outputs; role changes, tenant/project restrictions, account status, entitlement and complimentary access remain effective. It also tests HEAD, mixed-case and trailing-slash aliases and verifies the complete legacy route inventory.

The web suite executes the actual Layout with inert UI/hook substitutes and the real React Router matcher. It checks initial/missing users, employee/system-only roles, management roles, role refreshes, encoded URLs, and unchanged non-Reports routes. It is not a browser smoke test.

An independent reviewer reran both suites and both no-emit checks, reviewed the frozen runtime diff, and used additional synthetic probes for malformed inputs before project SQL, deleted/companyless users, expired trials, legacy company-less JWTs, and role revocation/deactivation between the subscription gate and report handler. All passed. An independent negative control on the deployed baseline confirmed employee access to coworker names/hours/wages in JSON and CSV, and voice/GPS rows reaching the stub PDF renderer. This does not establish that raw coordinates or transcripts appeared in the generated PDF.

No production database, provider, upload, build, deployment, or live-data test was performed for this patch. Release publication and live validation are separate steps.
