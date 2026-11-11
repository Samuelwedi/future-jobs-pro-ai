# Durable voice receipts

The native VoiceNoteScreen now uses durable receipts for audio recordings. Legacy
voice queue entries are retained for review and cannot replay automatically. The
implementation is source-tested; native-device recording, transport and restart
validation remain required before release.

## Requests

`POST /voice/process` (multipart audio) and `POST /voice/process-transcript` (JSON)
accept an optional `requestKey`: 16–100 ASCII letters, digits, `_`, `.`, `:`, or `-`.
Clients must persist one stable key, the original payload, target, and mode before
submission. Actor and company come from the current database user, not body/token
company or role claims. The scope is `(company_id, actor_id, request_key)` across
both endpoints, so switching transports with the same key is a conflict.

The fingerprint binds exact audio bytes or transcript text, project, optional
owned time entry, and processing mode. Audio also binds the multipart filename
and MIME type. Modes are `audio-only`, `audio-transcribed`, and `transcript`.
Omitted `transcribe` remains equivalent to `true`, including for legacy clients.

A new claim commits before storage, model, or adaptive-event work begins. Matching
completed requests return the saved response without repeating that work. Changed
content/metadata/mode with the same key returns 409. Matching `processing` or
`uncertain` requests return 202 and cannot reclaim the claim, regardless of age.

## Status and acknowledgment

`GET /voice/requests/:requestKey` requires the same active actor and company.
It rechecks current company project access, optional time-entry ownership and
project, and completed note ownership/target before disclosing a saved response.
Actor, target, and completed note reads use transaction row locks. A deleted or
reassigned completed note returns 410; it is never recreated by replay.

A completed response retains the endpoint's usual result fields and adds:

- `requestKey`
- `state: "completed"`
- `retryAllowed: false`
- `receiptIdentity: { companyId, actorId, projectId, timeEntryId, mode }`

`timeEntryId` is explicitly null when absent. The response is the historical
processing acknowledgment, not a fresh projection after later transcript edits.
Use the existing transcript-read endpoint when reconciling an edited transcript.

Pending or uncertain status returns 202. Missing status returns 404 with
`state: "missing"`. None of pending, uncertain, missing, unavailable, or an HTTP
failure is permission to automatically generate a new key or resubmit provider
work. Clients must verify the stable key and all identity fields before
acknowledging/clearing the local recording. Noncompleted recordings need to stay
recoverable locally for later status lookup or manual reconciliation.

## Persistence and limits

The note insertion and receipt completion commit in one transaction after locked
actor, company project, and owned time-entry revalidation. A lost commit
acknowledgment cannot downgrade a completed receipt to uncertain. A lost claim
acknowledgment may leave `processing` without starting a provider; it is not
reclaimed automatically. Provider configuration is checked for new audio claims,
but cannot prevent completed replay when the provider is disabled.

External media uploads, model calls, and existing adaptive-event side effects are
not part of the note/receipt database transaction. Provider artifacts or adaptive
events can remain after later failure. This code neither deletes such artifacts
nor retries uncertain work; manual reconciliation is still required. Receipts
have no automatic expiry or recovery worker.

Apply `20261111_voice_receipts.sql` using the existing
`backend/scripts/runVoiceNoteMigration.js` release step. It is additive/repeatable
and the runner verifies receipt columns in the same migration transaction. The
runner exposes `migrate(client)` for isolated testing. No-key clients continue
without reading or writing the receipt table.

Local checks (source only, providers stubbed):

```
node --test --test-concurrency=1 backend/tests/voice-receipts.test.cjs backend/tests/voice-audio-only.test.cjs backend/tests/voice-transcript-edit.test.cjs
./backend/node_modules/.bin/tsc --noEmit -p backend/tsconfig.json
```

PGlite exercises real SQL and HTTP routes, failure/commit-ack injection, replay,
and overlapping requests while provider work is pending. It is not a substitute
for production PostgreSQL multi-connection lock testing. No build, live provider,
production migration, upload, or deployment is performed by these checks.

## Native audio integration

VoiceNoteScreen captures the authenticated session when recording starts, including
its auth revision. It retains the original project, optional shift, and audio-only
or transcription mode. Stopped audio is copied into an owner/company-scoped app
folder and indexed in AsyncStorage before any submission. The source recording is
never deleted by receipt cleanup. The native HIGH_QUALITY preset uses M4A on iOS
and Android; the retained multipart metadata is `voice.m4a` / `audio/mp4`.

The local `prepared` phase can be explicitly sent later. The `submitted` marker is
persisted before network dispatch. After that marker, recovery is status-only,
including when the app restarted, the local audio is missing, the server reports
missing/unavailable/uncertain, or an authentication/navigation check interrupted
dispatch before the server saw it. There is no background voice replay.

Successful acknowledgment must match the request key, all receiptIdentity fields,
completed state, `retryAllowed: false`, note ID, audio URL and mode-specific
transcription status. An empty transcript in a valid completed acknowledgment is
still saved evidence and never becomes a fresh upload. Local cleanup is limited
to the exact indexed app-owned file. Corrupt records and uncertain storage writes
are preserved rather than overwritten. Index reads serialize behind local writes,
so replacement screens cannot race a previous screen's preparation.

The original-source retry is cleared immediately after durable preparation,
before dispatch. A later cleanup/index-write acknowledgment loss cannot expose a
new-key reupload of completed audio. Session, auth-revision, project/shift, focus,
background and screen-generation checks prevent stale dispatch and stale success.
The screen blocks new recording while pending data is loading, unreadable, or
unresolved. Recovery does not require microphone permission.

Existing unkeyed voice queue items remain visible as review-only, with original
payloads and files preserved. They are not converted into new keyed submissions:
previous server execution cannot be inferred safely. Automatic migration or
manual reconciliation of those older entries is not implemented.

Native verification uses VM/source tests with filesystem, storage, auth, network
and native recording interfaces stubbed. Run:

```
node --test --test-concurrency=1 mobile/tests/*.test.cjs
./mobile/node_modules/.bin/tsc --noEmit -p mobile/tsconfig.json
```

Expo 55 APIs were checked against the versioned SDK index, audio documentation and
FileSystem legacy documentation:
- https://docs.expo.dev/versions/v55.0.0/
- https://docs.expo.dev/versions/v55.0.0/sdk/audio/
- https://docs.expo.dev/versions/v55.0.0/sdk/filesystem-legacy/

No device/simulator build, live recording upload, production write, or deployment
is part of the source-test verification. Manual reconciliation remains necessary
for conservative submitted-but-missing states. Expo-web voice behavior was not
validated by this native integration.
