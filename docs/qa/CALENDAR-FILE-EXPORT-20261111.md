# Calendar-file export candidate, November 11, 2026

## Prior-work inspection and scope

Base: `9c134b4`, isolated branch `feat/calendar-file-export-20261111`. Searches of source and reachable history found no existing native iCalendar serializer/export implementation. The closed-testing register's calendar-file acceptance item was still open.

The Schedule screen now offers **Export loaded range (.ics)**. An explicit confirmation names the selected employee, count and exact loaded date range. It includes all loaded rows, even when search or the selected day hides some rows; month view includes its leading/trailing week padding. This is a one-time file, not sync. The feature exports only rows already returned by the existing authenticated `/schedule/my-shifts` request. It adds no backend endpoint, broader fetch, recurrence expansion, provider integration, OAuth grant, calendar write, permission, dependency or entitlement.

The native chooser is opened only after the user confirms. Choosing a destination, saving, importing or cancelling is up to the user; chooser completion is not reported as proof of import or delivery. Web local-file sharing is explicitly unsupported rather than uploading private schedule data as a workaround.

## Time semantics and limits

The existing schedule contract returns a canonical `YYYY-MM-DD` date and separate SQL wall-clock times, without a schedule timezone, UTC offset or end date. Company payroll timezone does not establish schedule timezone. Existing recurring-shift code does not establish an overnight end-date policy.

Therefore DTSTART/DTEND are RFC 5545 floating date-times: no `Z`, `TZID`, invented UTC conversion or `VTIMEZONE`. Seconds and valid midnight starts are preserved. A prominent confirmation warning, also included in each event description, tells the user to check the destination calendar timezone and imported times, especially around daylight-saving changes. No timezone or DST/overnight correctness guarantee is made. Absolute-instant, DST-gap/fold and multi-day/overnight export require an explicit schedule data contract before implementation.

The entire export fails closed if any row has an invalid or out-of-range calendar date, unsupported time representation, missing/duplicate identifier, invalid text field, or an equal/reversed end time. No partial file is shared, no row is silently skipped, and no 24-hour duration or next-day end is inferred. Repeated imports may still create duplicates in receiving apps despite stable event UIDs; this is not a calendar update protocol.

## Safety and file lifecycle

- Load snapshots retain the request sequence, actor/company/role/employee/date/view scope and synchronous API token/revision guard. Blur, unmount, changed selection/account, newer load and failed refresh prevent an earlier snapshot from being exported. The guard is checked again after asynchronous preparation and file writing.
- One synchronous lock spans confirmation, native sharing and completion. Cancel/dismiss releases it. Stale confirmations cannot share. Old errors are suppressed after scope changes.
- Exported fields are limited to shift title, project name, notes, address, date/time and an encoded company/shift UID. No attachment URL, attendee, organizer, alarm, executable property or remote URL is generated. Text escapes backslash, commas, semicolons and newlines; control characters are neutralized. UTF-8 lines fold at 75 octets without splitting code points. Files use CRLF.
- Files live in the app's private `cacheDirectory/calendar-exports/`. Partial writes and stale-before-handoff files are removed immediately, best effort. After a native handoff is attempted, even if its outcome is uncertain, files are retained for the recipient. Later export attempts prune only this exporter's generated filenames older than 24 hours. This is opportunistic cleanup, not a guarantee that files disappear at exactly 24 hours; the OS can also evict cache.
- Rationale: installed Expo Sharing 55.0.24's Android module resolves its promise on chooser activity result, without acknowledging recipient consumption. Immediate deletion can invalidate a receiving app's FileProvider URI. The verified installed `gitHead` was `856b99321eeb04bd528b33f90c0e7fa2859a1fcb`; source location: `packages/expo-sharing/android/src/main/java/expo/modules/sharing/SharingModule.kt`, lines 39–52 and 80–84. [Corresponding source reference](https://github.com/expo/expo/blob/856b99321eeb04bd528b33f90c0e7fa2859a1fcb/packages/expo-sharing/android/src/main/java/expo/modules/sharing/SharingModule.kt#L80-L84).

## Verification

The exact Expo 55 versioned FileSystem (legacy) and Sharing documentation was read before implementation:
- https://docs.expo.dev/versions/v55.0.0/sdk/filesystem-legacy/
- https://docs.expo.dev/versions/v55.0.0/sdk/sharing/

Focused source fixtures cover serialization, Unicode/injection/folding, deterministic UIDs, date validation, DST-date independence across process timezones, invalid and overnight rows, native API options, cleanup retention/pruning, cancellation, duplicate taps, stale auth/navigation/range, failed refresh, actual month padding, translations and existing schedule-search behavior. These are source/fixture tests, not native runtime or Google Calendar acceptance.

Final local checks: mobile TypeScript (`tsc --noEmit`) passed; the full mobile source suite passed 343 tests with no failures or skips (`node --test --test-concurrency=1 tests/*.test.cjs`). The focused calendar/search/localization suite passed 34 tests, including 20 new calendar tests. `git diff --check` passed. Independent review also verified the serializer against adversarial date/time/text/UID cases and re-reviewed the cache-lifetime fix with no remaining substantive finding. No build, provider call, upload, production change, purchase, deployment or store submission is part of this candidate.

## Device acceptance still required

1. Android/iOS share, save and reopen/import in a compatible calendar app; Google Calendar file import with expected destination timezone. Verify the receiving app can still read the handed-off URI after chooser completion.
2. Cancel the confirmation and chooser, tap repeatedly, change employee/range, refresh with failure, navigate away and change account at each asynchronous boundary. No stale file or duplicated chooser should appear.
3. Check month padding, empty ranges, long/accented text, screens/scrolling with keyboard open, and Spanish/French confirmation copy.
4. Verify floating times near DST transitions and while the device/destination calendar timezone differs. Unsupported overnight/equal times must show a blocker with no partial export.
5. Inspect private-cache retention and eventual pruning. Native foreground/background/kill behavior and receiving-app import semantics remain unverified.

The closed-testing calendar-export acceptance item remains open until these checks pass; the implementation is not evidence of store/release readiness.
