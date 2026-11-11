# Schedule overlap advisory: isolated candidate

Date: 2026-11-11. Base: `9c134b47379b0f59997cd49c1e1df078c0a70856`.
Branch: `feedback/schedule-overlap-warnings-20261111`.
Status: local source checkpoint only, not deployed. Frozen release `6125f57` was not changed.

## Implemented scope

Create/Edit Shift now automatically previews overlaps for the current date, times, project and explicitly selected employees. It is an advisory panel with a refresh button, never a reservation, save gate, confirmation dialog or scheduling/payroll constraint. Saving continues through the existing create/update path.

The read-only `POST /api/schedule/conflicts` verifies the current active database actor is a boss, manager or admin. It verifies the project and every selected employee belong to that company, and verifies an excluded edited shift is in the company. It returns aggregate counts only, with no employee names, shift details or foreign-company rows. The request is bounded to one date and 1–100 employee IDs. Existing shifts on other projects in the same company are included.

Only explicit persisted `shift_assignments` are checked. A positive same-day SQL `time` interval overlaps when its start is before the requested end and its end is after the requested start. Touching endpoints do not overlap. Seconds and fractions are preserved; no timezone conversion is applied. Generated recurring instances with explicit saved assignments are included. Raw recurring rules, overnight interpretations and cross-day ranges are not expanded or inferred. Equal, reversed or missing saved times are reported as unchecked. A reversed/equal candidate interval is marked not applicable. These limits are visible in English, Spanish and French, including on a zero-result check.

The edit draft no longer infers an employee from `shifts.user_id`, which is also used to store the creator. Absent/null/empty explicit assignment arrays require the user to select employees, using the existing required-selection rule.

Preview responses are tied to the exact date/time/project/employee/edit-ID inputs, user/company/role, focus lifecycle and API token revision. Changes invalidate old results before effect cleanup. Edits are debounced; refresh, blur/refocus, failed checks and stale replies are tested. The API transport is online-only and never queues a preview. Failed/malformed checks show unavailable, not a clean schedule. No preview result authorizes or controls saving a payload.

## Verification

All execution was local against source, mocks or PGlite; no live providers, builds, uploads, release changes or production writes.

- `node --test backend/tests/schedule-conflict-preview.test.cjs`: 9/9, repeated successfully with `TZ=Pacific/Kiritimati`.
- `node --test mobile/tests/schedule-conflicts*.test.cjs`: 13/13.
- `node --test --test-concurrency=1 mobile/tests/*.test.cjs`: 336/336.
- Existing `backend/tests/tester-schedule.test.cjs`: 3/3 using an ephemeral require shim from `../dist/*` to `../src/*` with ts-node/transpile-only. This validates the existing create/edit/delete/transaction path without emitting a build.
- Backend and mobile TypeScript `--noEmit`: passed.
- `git diff --check`: passed.
- Additional legacy root `tests/tester-regressions.cjs`: 0/7 on both this candidate and unchanged base `9c134b4` (with backend/mobile NODE_PATH). Failures are inherited stale mocks/loader expectations: `isEvidenceUpload` absent, `.tsx` module loaded as `.ts`, old locale expectation, missing native localization mock and missing `router.patch` mock. This old root harness is not represented as a passing aggregate.
- Independent review checked backend scope, mobile lifecycle/session fences and the creator fallback removal; focused tests and both noEmit checks passed independently.

The new backend tests cover overlapping/contained/equal intervals, fractional seconds, adjacent endpoints, different dates and employees, same-company project changes, materialized recurring assignments, creator-only records, cross-company corruption, mixed-company selections, edit exclusions/reassignment, malformed dates/IDs/times, request limits, stale token claims, actor role/company/activity changes and unavailable databases. Preview tests assert no write statements occur.

## Remaining acceptance and integration notes

- Native iOS/Android rendering, accessibility, interrupted UI flows and real authenticated backend smoke tests are not run. Source/mocked checks are not device acceptance.
- The advisory is a snapshot and does not prevent concurrent bookings or enforce schedule policy. No hard block or final-save recheck was introduced.
- Unmaterialized recurring rules, cross-midnight intent, missing end dates and timezone scheduling remain outside this candidate. No universal “no conflicts” claim is made.
- The unchanged `/my-shifts` query can aggregate only the selected worker when loading a multi-employee shift, because its assignment filter is applied before aggregation. A later edit can therefore replace unreturned assignments. This separate inherited read-path defect was reported for follow-up; it is not fixed here.
- Integration overlaps are small: route registration in `scheduleRoutes.ts`, one fenced transport method in `api.ts`, new entries in `screenTranslations.ts`, and the CreateShift panel/explicit-assignment initialization. Re-run checks after merging with other API/translation/shift work.
- A local source commit was authorized after independent review. No migration, dependency update, push, deployment or store/native build is included.
