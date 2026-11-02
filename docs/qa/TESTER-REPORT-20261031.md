# Tester QA report — 2026-10-31

Source: supplied `QA Bug Report & Defect Summary.docx`, covering the preceding test week. All 24 report groups are retained below. Source fixes require a new binary and device retesting; none are silently declared closed. The report does not identify a verified build for every reproduction.

| # | Report group | Source work / remaining acceptance |
|---|---|---|
| 1 | Android route/history native map crash | Prevent mounting Android native maps without a configured manifest key. Build config injects `GOOGLE_MAPS_API_KEY` through the maps plugin when supplied. Without it, show coordinates/history and an explicit map-unavailable message. Full map tiles and Android 16 retest remain open. |
| 2 | GPS service persists after sign-out | Native tracking teardown runs even when secure-session deletion fails. Expired-session sign-out also stops tracking. Verify foreground-service notification disappears on devices. |
| 3 | Lucy released shared audio object on exit | Active cancellation waits for native stop before release; no restart while teardown is pending. Added delayed-stop regression. Device navigation stress test remains. |
| 4 | Lucy keyboard covers input | Android keyboard avoidance enabled; verify Android 16 keyboard and large text. |
| 5 | Speech continues across navigation/camera | Existing blur/background stop retained; camera stops speech and suspends wake microphone during capture. Verify delayed speech and external camera transitions. |
| 6 | Lucy repeated messages, overflow, stuck loading | History loads once per user identity, replaces the initial snapshot, and does not merge over new interaction. Synchronous send lock prevents overlapping taps. Reverse newest-first server history for display. Verify loading/network recovery and layout. |
| 7 | Calendar date shifts by one day | Local date-only formatting and parsing replace UTC conversion; timezone-boundary regression added. API schedule dates emitted as date-only strings. |
| 8 | Calendar views/filters disappear | Calendar range follows day/three-day/week/month mode; list matches selected range. Ignore stale fetch responses. Verify all filters and adjacent-month dates. |
| 9 | Shift success but absent | Require a project before save, check success response, make row and assignments atomic. Employee-filter acceptance remains. |
| 10 | Shift edit/delete absent; past-date clock-in | Manager edit/delete controls added, existing attachments retained, failed attachment upload blocks save. Home rejects a selected schedule whose date is no longer today. Device time-entry acceptance remains open. |
| 11 | Video uploads return 500 | MIME handling distinguishes video, image, audio and documents. Camera sends explicit video metadata and does not show failed still-photo scoring for saved video. Verify long recordings and backend limits. |
| 12 | Black camera preview / first external capture crash | Use SDK 55 legacy filesystem API for capture validation; suspend competing wake audio during native capture. External camera remains the capture flow; device repro still needed. |
| 13 | Offline voice false success / every row shows pause | Clear prior processing result before a new request; fresh connectivity check before upload. Existing durable offline queue and retry retained. Playback state scoped to the selected audio URL. Test offline replay, blank transcription, and rapid audio switching. |
| 14 | Deleted project reappears | Backend deletion archives. Active project list excludes archived/completed rows and UI explicitly calls this Archive. History is preserved. |
| 15 | Empty projects but clock-in enabled | Home uses active projects consistently, clears obsolete selection, and disables clock-in without a project. Verify after archive and refresh. |
| 16 | Offline project form disappears | Persist new-project draft per signed-in user on this device. Offline submit preserves the form and explains reconnect/retry. Verify app restart and account isolation. |
| 17 | Temporary password bypass | Invite-created accounts require password change; login exposes the flag, mobile shows a required change screen, protected API gate rejects access until changed. Regression covers blocking, weak password rejection, and successful change. |
| 18 | Invite 400/silent domain failures | Normalize/validate email and names. SMTP failure after account creation is returned as delivery failure alongside successful account creation, avoiding misleading failed-invite retry. Live provider delivery remains open. |
| 19 | Weak passwords / visibility / email verification | Registration and authenticated password change reject numeric-only passwords and enforce 8–72 characters. Registration visibility control and Android keyboard avoidance added. Email-verification source shipped in PR #5; SMTP and device acceptance remain open, and existing accounts are not falsely marked verified. |
| 20 | Logo missing upload / SVG crash | Forward multipart request configuration, preserve selected filename/MIME, reject SVG before preview. Verify PNG/JPEG upload and persisted branding. |
| 21 | UTC/GMT timezone rejected / no picker | Normalize whitespace and UTC/GMT aliases. Searchable city/region time-zone picker added, using runtime IANA zones with a curated fallback. Device picker acceptance remains. |
| 22 | Language changes greeting only | Partial: Projects, Schedule, Timesheet, Tasks and Create/Edit Shift now translate static copy, actions and dates through the saved language context; all 40 mobile tests and seven React/DOM harness checks pass. This source follow-up is not in build 56 / Android 10. Remaining screens, complete web coverage and native translated acceptance remain open. |
| 23 | CSV export does nothing | Current source already writes and shares CSV using the SDK-compatible filesystem. No unverified rewrite; device export/share acceptance remains open. |
| 24 | Kiosk disabled with no enable control | Manager-only enable/disable control reads current status, saves through protected endpoint and reads back authoritative status. Verify role restrictions and PIN clocking. |

## Validation

Validation completed on 2026-10-31:

- Backend TypeScript build passed.
- All backend test files passed: 206 tests, 0 failures.
- Mobile TypeScript check passed.
- All mobile test files passed: 32 tests, 0 failures.
- Expo production JavaScript/Hermes exports passed for iOS and Android.
- Public Expo configuration resolves to the intended project `bcc71783-5078-4ef3-8760-56b83cc4508f`.
- `git diff --check` passed.

Automated checks do not substitute for physical-device acceptance or store review. No new signed QA binary has been uploaded by this source checkpoint. Full localization, account email verification, native map-key configuration, live SMTP delivery, and physical-device acceptance remain open.
