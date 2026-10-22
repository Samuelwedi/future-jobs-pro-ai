# Tester fixes — October 21, 2026

## Changes

- Lucy stops speech, timers and recording on blur, background and unmount. Async completions from a previous screen session cannot restart speech or update that session's UI. Native speech errors are contained.
- Kiosk explains that PINs belong to employees, not projects, with a visible manager setup action and employee instructions. Existing PIN authorization remains unchanged.
- Home and Profile now translate their primary UI copy into Spanish and French. First launch uses the supported device locale (English fallback); saved choices take precedence. A delayed storage read cannot overwrite a new choice.
- Voice notes retain a failed recording for retry, display the server's explanation, preserve audio extensions in the offline queue and clean up recording resources.
- Offline uploads import the supported Expo legacy filesystem entrypoint; the installed SDK's root `copyAsync` export throws at runtime.
- Backend voice upload preserves the audio format, uses unique temporary files, cleans them up after failures, saves structured data/summary, checks shift ownership, and reports a failure stage and support reference.
- A repeatable migration reconciles the legacy S3-era voice table with the Cloudinary endpoint. The old `audio_s3_key NOT NULL` constraint and missing columns can cause inserts to fail. This is a code-level finding, not a confirmed diagnosis of the production incident.

## Automated verification

From repository root: `node --test tests/tester-regressions.cjs`.
From mobile: `npx tsc --noEmit`.
From backend: `npm run type-check`.

Release preparation also verifies `npm run build` in backend and an Android JavaScript/Hermes bundle with `npx expo export --platform android`. A bundle export is not a signed Android app or a physical-device test.

Regression tests mock native APIs, external providers and the database. They do not verify an Android device or the deployed database.

## Release requirements / manual acceptance

1. Inspect the production voice failure logs and schema. Back up the database; run `npm run migrate:voice-notes` from backend with the intended database configured before releasing the backend changes. The migration has **not** been applied by this task.
2. Confirm server transcription and Cloudinary configuration, deploy the backend, then build/release the mobile update through the existing release process. Nothing was pushed, deployed or submitted to Google Play by this task.
3. Android: leave Lucy during speech, a pending response and microphone startup; also background the app. Audio must stop, no error screen must appear, and re-entry must work.
4. Manager: create a PIN using the visible employee setup action, then clock in/out with it. Employee: verify the help text and that manager-only setup remains unavailable. Repeat on a small screen with scrolling.
5. Switch English/Spanish/French on Profile, return Home, restart the app, and verify persistence. Test a fresh installation under Spanish/French and an unsupported locale. Server-generated content is not translated by this change.
6. Record a note, verify saved transcript/summary in the database, simulate a server failure, then retry the saved recording. Verify offline queue processing and no duplicate manual retry for an already queued upload.

Remaining limits: no production logs, live database migration, Android UI/audio verification or release was performed. A retry after a lost successful response can still duplicate a note; server-side upload idempotency is separate follow-up work.

## Production integration — October 22

Reapplied on production commit 11b8790, preserving the expo-audio migration, payroll navigation and media changes. Mobile version 1.2.6. Backend compilation and 35 release tests pass; mobile TypeScript, seven tester regressions and Android export pass. Native device verification and signed store release remain pending. Railway deployment e91ac0d9 is queued; migration completion not yet observed.
