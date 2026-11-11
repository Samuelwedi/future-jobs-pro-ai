# Selected-employee schedule assignment integrity

Date: 2026-11-11. Isolated base: `9781aabdf33e2be2939e1954867663395f091c40`.
Branch: `fix/schedule-assignee-integrity-20261111`.
Status: local source candidate, not integrated or deployed. Frozen release `6125f57` and recovered checkout `9c134b4` were not changed.

## Reproduced defect and history

The old `/schedule/my-shifts` query used its `shift_assignments` join both to select shifts for the requested employee and to aggregate the assignee list. When that employee was not the creator, the WHERE clause removed all other assignees before `array_agg`. The mobile edit draft therefore received an incomplete list; the existing transactional PUT correctly replaced assignments with that incomplete list.

Before the route edit, the new regression performed a real HTTP create with two assignees, read the shift for one employee, ran the actual mobile edit initializer and save handler, and sent its HTTP PUT to the source router backed by PGlite. The PUT returned 200, but the final database assertion failed: the coworker's assignment had been deleted. With the fix, the identical flow retains both employees.

History confirms that `shifts.user_id` is also the creator (`9f6ef8b`), not evidence of assignment. The separate base change in `9781aab` removed the mobile creator-to-assignee fallback; this candidate preserves that change. Commit `300c306` switched company ownership to project joins. Current edit/delete, company listing and conflict-preview routes use that project/company boundary.

## Scope and deliberate compatibility boundaries

- Only the `/my-shifts` implementation changes. Eligibility remains the selected employee's creator link OR explicit assignment, within the original inclusive start/end calendar-date range. Independent EXISTS selection prevents the aggregate from truncating the complete list.
- Actor identity, company, activity and role come from the database, not JWT company/role claims. Inactive/missing actors or actors without a company are denied. Invalid access tokens return 401. Boss, manager and admin roles retain same-company other-employee access; ordinary employees retain only self access.
- Managers receive every explicit assignee whose current user record belongs to that company. Inactive same-company assignees and inactive same-company targets remain available to managers, consistent with existing edit validation. They must not disappear during an unrelated edit. Missing, foreign or moved-out assignee IDs are excluded. The existing full-replacement PUT still replaces the list supplied by the editor; it does not preserve stale foreign/missing assignment rows that were excluded from the authorized read.
- Ordinary employees receive only their own explicit assignment IDs. This does not broaden coworker disclosure and intentionally narrows the old creator-row behavior, which could expose coworkers. A creator-only row can still be visible, but its assignment list is empty/null; no creator is synthesized as an assignee.
- The shift must have an existing same-company project. Null-project, missing-project and foreign-project rows are now omitted, including rows with stale creator or assignment links. This is an intentional narrower legacy read boundary, not a claim that behavior is unchanged. Although the backend POST still accepts a null project, the current mobile form requires a project and edit/delete already deny projectless rows. A creator-company fallback was rejected because creators can move companies and it would introduce a different ownership rule. No data migration or new project-membership policy is introduced.
- The old schedule integration fixture now includes the production `users.is_active` column with a true default. No mobile production code, dependency, migration, write route, calendar endpoint, release metadata or integration branch changes are included.

## Verification

All execution was local against source, mocked native services or PGlite. No builds, emitted dist files, live providers, uploads, production writes, payments, pushes or release actions were performed.

- `node --test backend/tests/schedule-assignee-integrity.test.cjs backend/tests/schedule-conflict-preview.test.cjs`: **19/19 passed** (10 new integrity tests plus 9 existing preview tests).
- The same 19 tests with `TZ=Pacific/Kiritimati` and `--test-concurrency=1`: **19/19 passed**.
- Existing `backend/tests/tester-schedule.test.cjs`: **3/3 passed**, using an ephemeral require shim mapping this checkout's `../dist/*` imports to `../src/*` with ts-node/transpile-only. Transaction rollback, exact-date visibility and manager create/edit/delete remain tested without a build.
- `node --test --test-concurrency=1 mobile/tests/*.test.cjs`: **336/336 passed**, including native receipt/lifecycle tests and schedule search, conflict preview and no-creator-fallback tests.
- Backend and mobile TypeScript `--noEmit`: **passed**.
- `git diff --check`: **passed**.

The new tests use real route HTTP and SQL for full read/edit retention, all management roles, creator selection versus assignment semantics, self-only employee disclosure, employee edit denial, target and date restrictions, same-company alternate projects, inactive retained assignees, moved/foreign/missing assignees, foreign-project privacy, null/missing-project handling, and stale role/company/activity/token claims. Manager read tests also assert that the route issues no writes. The mobile initializer/save handler is extracted from the current source rather than duplicated in the test.

## Limits

Native iOS/Android rendering and a live authenticated backend smoke test were not run. Running the actual mobile handler with local HTTP is not device acceptance. Concurrent manager edits still use the existing full-replacement write behavior; this change is not optimistic concurrency control. Other schedule read/write endpoints were not broadened or hardened as part of this targeted candidate. The root legacy tester harness was not rerun here; the base advisory candidate documents its inherited 0/7 failures separately. Re-run applicable checks after integration.
