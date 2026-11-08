# Lucy structured briefing acceptance

This candidate adds a deterministic, saved work briefing and shutdown protection. It does not establish general-agent or Meta Muse parity. The API, scope and limits are documented in `docs/lucy-background-work.md`.

## Capability

A signed-in user explicitly selects a task status and up to 31 inclusive calendar days. Lucy saves the request and returns filtered task counts, the six oldest matching tasks, stored-shift counts and the six earliest shifts in that range. Tasks are not date-filtered; open means pending or in_progress, and due dates are not evaluated. Calendar dates are preserved as calendar excerpts, not invented midnight-UTC instants. Recurrence rules are not expanded.

Each source uses one read-only statement snapshot and a five-second SQL limit for its counts and examples. Employee data is limited to assigned tasks and shifts; managers remain company-scoped. Unavailable sections have unknown counts, not zero. Missing details and truncation produce partial reports. No model, external integration, payroll, GPS, PTO, contact directory, company document or business-write tool is called.

The additive options migration preserves previous jobs and retry keys. Older explicit-mode workers exclude the new mode rather than silently executing the wrong search. A dedicated kill switch controls briefing submission, claims, recovery and publication independently from other modes. Membership, role, password and entitlement checks, quotas, fenced leases and attempt limits remain in place.

## Clients and reports

Web and native source provide explicit date/status controls and validated plain-text reports. Unknown modes cannot run actions or export; missing new capabilities mean unsupported. Uncertain request keys are retained by canonical identity across edits and reopening, with a 20-identity cap that never silently evicts an uncertain request. Confirmed acknowledgment frees only that identity. Session/source changes clear client state.

Native controls and report metadata support English, Spanish and French. Sharing uses the existing temporary private-file and OS destination chooser, without automatic transmission. No Android/iOS build, bundle export, device visual acceptance, store action or native distribution is part of this candidate.

The public web sample uses distinct fixed, synthetic record-search and briefing examples. Dates and statuses in the sample are displayed, not applied to real records. It uses no account credentials, API, inference or persistent storage.

## Shutdown contract

SIGTERM/SIGINT share one shutdown operation. New traffic and pollers stop, active tracked work drains, then Redis and PostgreSQL close in that order. Interrupted Lucy jobs keep their original lease and attempt count; recovery waits for expiry. Late results cannot publish after stopping. Duplicate signals do not repeat cleanup. A timeout or failed drain exits 1.

Express cannot prove when a handler finishes after its response aborts. Such an abort, even before SIGTERM, records only an uncertainty flag and releases the response object. A later shutdown conservatively holds dependencies until its deadline and exits 1; it does not falsely report a clean drain. This can happen even if the aborted handler actually finished. Normally completed responses do not latch the flag. Other detached work after an already-finished response remains outside this tracking scope.

## Verification

Frozen-source checks passed: backend TypeScript build and 401/401 full tests; customer web production build and 94/94 full tests; native TypeScript check and 145/145 source tests. No tests were skipped or cancelled. Production dependency audits reported zero backend and zero web findings; dependencies and lockfiles are unchanged. Two sequential fresh PostgreSQL 18.6 clusters each passed ten process/migration checks and twelve reported API tests (eleven nested cases and their parent), then shut down cleanly. Backend source and compiled hashes were unchanged across both runs. Focused tests include strict input and Gregorian ranges, canonical replay, tenant/employee scope, unavailable sources, bounded samples, hostile inert text, current access changes, kill switches, stale leases, cancellation and independent provider-import poison checks. Client tests cover unknown modes, malformed capability/acknowledgment/result data, A-to-B-to-A retries, identity caps, close/source/scope invalidation, byte bounds and explicit partial labels. Real child-process tests exercise the production entry point's signals, HTTP keep-alive, Socket.IO work, aborted requests, reconnecting Redis and forced deadlines with fake persistence/providers.

## Release gates

1. Freeze the candidate, run full backend/web/native-source checks and independent review. Verify exact published tree and preview checks. Do not push onto the currently deployed branch.
2. Test checkpoint-4 upgrade/rollback/idempotence on disposable PostgreSQL 18.6, plus genuine separate-process claims, SIGKILL recovery, stale leases, cancellation and SIGTERM lease preservation. Keep production data and inference out of fixtures.
3. Verify preview controls, interrupted flows, synthetic disclosure and an actual downloaded report.
4. Recheck existing production recovery/rollback and apply schema/backend before customer web. Existing AI activation stays off. Do not force-update divergent release branches or the owner dashboard.
5. Railway requires a direct Node start command and termination grace exceeding the 25-second default application deadline. The pre-release settings were npm start and zero draining seconds; source tests alone do not make graceful teardown effective in production. A 30-second grace briefly retains the old runtime during replacement. Confirm live settings and actual deployment SHA.
6. Do not claim native distribution, live-model quality/cost verification, complete recurring-calendar coverage or autonomous external-app capability from these tests.
