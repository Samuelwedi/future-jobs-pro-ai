# Support repair automation readiness

Source assessment: 2026-11-08. This document describes support-portal Fix with
Lucy, not customer-facing Lucy, self-hosted inference, background research, or
Fresh Operations. No live provider probe, credential change, paid inference,
workflow dispatch, deployment, native build or store submission was performed
for this assessment.

## What the source actually does

1. A currently active `platform_support_agents` account with role `owner` queues
   an unresolved platform incident through `/api/owner-operations/repairs`.
   Customer tenant owners do not acquire this role or global repair authority.
2. When enabled, the backend worker ticks every 30 seconds and processes up to
   ten active records per tick under a database advisory lock. This is queue
   reconciliation, not autonomous detection-to-repair admission. New incidents
   are not automatically queued for repair.
3. It sends a random request ID, exact base SHA, fixed scope and fixed technical
   category to the official GitHub workflow. Customer text, attachments, user
   identities and raw logs are not sent to the repair generator.
4. An exact-source admission gate precedes provider/model work. The workflow
   runs the Codex action with a separately configured OpenAI API key and explicit
   repair model, not a ChatGPT browser session or customer Lucy credentials.
5. Proposals are bounded to five replacement files, 250 KB total and 100 KB per
   file. Existing tests must be preserved. Credential screening and policy
   validation occur before artifact transfer and again at verification.
6. Backend, customer-web, mobile and portal checks run on isolated generated
   code. The publisher runs original scripts in a fresh privileged job. The
   deployment script compares both release refs and live backend/portal baselines
   with the requested source, then uses atomic branch leases.
7. Only the approved portal stylesheet is eligible for unattended deployment.
   Other portal executable source, backend, customer-web, cross-application and
   sensitive changes become review candidates. Mobile changes become candidate
   branches and may also require sensitive-change review. No code path builds
   or submits native apps.
8. An eligible web publication deploys Railway and the support-portal Vercel
   project, then checks backend health. Failure attempts both-provider rollback
   without overwriting newer branch heads. Failed/unverified rollback requires
   recovery, and a green health endpoint is not affected-workflow acceptance.
   Customer-web candidates must never deploy to the portal Vercel project.
9. A completed workflow never resolves the incident automatically. Portal
   verification remains separate. Polling pauses and browser navigation do not
   stop a dispatched workflow.

The current configuration and operation of the live backend, GitHub Actions,
Railway, Vercel, OpenAI, Expo, Apple and Google accounts were not verified here.
The implementation does not establish 24/7 availability or production readiness.

## Authority and data boundaries

Customer users should submit reports and run their own permitted tenant actions
without asking the platform owner each time. Existing tenant/role checks remain
in force for those actions. This is separate from changing shared source and
releasing software to every customer.

A future automatic repair admission policy can turn a customer report into a
bounded technical candidate without a per-report platform-owner approval, under
an explicitly approved platform repair contract. That contract must define:

- permitted components and paths, immutable test/release controls and exact
  source identity;
- allowed sanitized evidence fields, tenant-scoped incident lookup and a
  destination-specific data-sharing policy;
- deduplication/cooldown, queue bounds, measured cost reservation and a verified
  spending ceiling, retry/unknown-outcome handling and an emergency stop;
- applicable staging, security, affected-workflow and native-device checks;
- which tested classes may publish automatically and which remain blocked for
  an exceptional security, access, legal or financial decision.

A report or attachment is untrusted evidence, never permission to execute its
commands, read credentials, access another tenant, modify release controls, or
expand its own repair contract. Public demo credentials and a customer's claimed
`owner` role must never authenticate as a platform support agent. Isolated demo
samples should not share provider credentials, dispatch endpoints or live data.
The source has no separately implemented public-demo repair admission path.

The present change preserves the platform support owner request boundary rather
than granting global code deployment to every tenant. It does not add a new
requirement for the platform owner to approve normal customer app actions.

## Provider, spending and operation prerequisites

- Verify an OpenAI account/project, existing credential destination, model access
  and Codex compatibility for this support workflow. Set `LUCY_REPAIR_MODEL`
  explicitly; do not assume a customer Lucy or legacy worker model is suitable.
  The read-only `/v1/models/{model}` preflight tests access only. It neither runs
  inference nor verifies model pricing, quota or Codex compatibility.
- Obtain distinct support-repair spend approval. `LUCY_REPAIR_SPEND_APPROVED`
  records authorization, not metering. There is no model-dollar ledger or hard
  cap in this path. Codex inference, GitHub runners, hosting and native builds
  may be charged separately. No background-research budget is reused.
- Existing bounds are serial workflow concurrency, job timeouts (2-minute
  admission, 3-minute preflight, 20-minute proposal, 25-minute verification,
  60-minute publication), incident uniqueness and patch limits. These are not
  monetary ceilings or guarantees of cancellation before billing.
- Before unattended operation, use a verified hard-limit provider or metering
  gateway with atomic reservations and conservative accounting for unknown
  outcomes, or keep runs within individually approved, bounded spend. Do not
  describe a warning budget or the approval flag as a hard cap.
- Verify least-privilege GitHub dispatch/read access and approved deployment
  credentials. New credentials, destinations or persistent access are separate
  security decisions. Secrets must not be put in source, chat or test fixtures.
- Run the updated idempotent database migration before activating the worker.
  Then test exact-head stale requests, unauthorized identities, malformed and
  injected reports, duplicate clicks, cancellation races, missing/duplicate
  workflow results and interrupted polling against sealed/staging targets.
- Add an independent liveness monitor for queue age, worker heartbeat, failed
  preflight, provider timeouts, deployment/rollback status and error recurrence.
  Alert on missing heartbeat; an enabled flag is not proof of a running worker.
- The present release script fixes production hostnames and release refs. A
  reviewed staging variant is required to exercise real provider failure and
  rollback before widening unattended publication. Current unit mocks do not
  substitute for staging acceptance or an approved live run.

## Native build and store path

Future Jobs native builds and submissions may be automated under the operator's
standing authorization. That does not grant unapproved payments or new persistent
access, and no repeated permission question is necessary for an already
covered build/submission. Platform review and technical readiness still apply.

Verified source configuration:

- Expo app: `Future Jobs Pro AI`, slug `future-jobs-pro-ai`.
- Android package and iOS bundle ID: `com.samuel33.futurejobspro`.
- EAS production profiles produce Android app bundles and iOS store builds with
  remote version management and automatic build-number increments.
- iOS production submit configuration names App Store Connect app `6776965870`.
- Android's only explicit submit configuration is `closed-test`, alpha track,
  `releaseStatus: draft`. This is not a production rollout configuration.
- `.github/workflows/lucy-repair.yml` contains no EAS build/submit or store-release
  commands. Native candidate creation is the current endpoint of automation.

Before adding native execution, verify the exact Expo project and accounts,
Android signing ownership, iOS signing/provisioning, existing store service
permissions, build quota and monetary limits, current remote build numbers,
pending submissions and store policy declarations. Do not read, copy or generate
signing secrets as an incidental diagnostic step. App identifiers in files do
not prove account access, signing readiness or remaining free quota.

Implement distinct persisted stages: verified candidate, source accepted,
build requested, build running, build ready, device/acceptance checks passed,
submission requested, store processing, store review, approved, released or
rejected. Persist provider IDs before retries and reconcile unknown outcomes
rather than creating duplicate builds/submissions. Bind each build and store
artifact to its source SHA, package/bundle ID, version, signing identity and
intended track. A second incident may reuse an already verified matching build.

Build success is not device acceptance. Upload success is not submission for
review. Submission is not approval or public availability. Apple/Google can
reject, delay, or require policy information. Use explicit staged release and
monitor crash/incident recurrence; stopping a rollout is not reinstalling an old
binary on users' devices. Backend changes must remain compatible with already
installed mobile versions. Customer data migrations and destructive rollbacks
need their existing safeguards.

## Next rollout order

1. Review these source changes and run the complete affected checks on the final
   commit. No push, merge or deploy is implied by a local passing test.
2. Verify separately approved provider access/cost limits and staging targets.
3. Apply the schema and perform controlled end-to-end staging acceptance,
   including ambiguous dispatch, failure, rollback and operator recovery.
4. Observe a bounded eligible portal repair under an approved run, recording the
   exact source, deployed artifacts, workflow behavior and recurrence checks.
5. Expand automatic report admission only with the bounded contract above. Keep
   dangerous or cross-tenant changes outside automatic publication.
6. Add and prove native build/submission stages with available quota and existing
   signing access. Verify actual store outcomes before reporting publication.
