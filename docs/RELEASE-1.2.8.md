# 1.2.8 reliability corrections

- Mobile reports include installed native version/build, platform, OS and bounded stacks. About displays the installed binary rather than a hardcoded version.
- Timesheets use company work dates returned by the API, net paid hours and server overtime. Regular no longer includes overtime. Late responses cannot replace a newly selected employee/week.
- CSV export uses the SDK 55 legacy filesystem entry point and awaited writes/sharing, so failures reach the error handler.
- Owner investigations are linked to incidents and receive the recorded technical context. Duplicate pending incident investigations are rejected. The UI exposes build/stack details and prevents duplicate actions.
- The existing 1.2.7 recorder lifetime fix is retained. This release does not establish real-device acceptance of native audio.

Deployment applies the idempotent owner migration (adds nullable incident_id). No existing payroll or incident status is changed. New mobile evidence requires installation of a new binary; existing reports cannot be retroactively assigned a version.

Checks: backend build and 31 focused backend tests; mobile TypeScript, 11 recorder/timesheet tests and Android bundle export; portal production build and 9 tests.

Not completed by these changes: arbitrary AI code repair, isolated test execution, automated deployment/rollback, or app-store submission. Lucy reviews remain recommendations. Android store submission remains a separate manual action.
