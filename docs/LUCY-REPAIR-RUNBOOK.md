# Lucy repair execution

## Release review corrections

The expanded workflow can diagnose backend, customer-web, mobile, portal-app
and application scopes. Backend, application and customer-web repairs publish
review candidates. Customer-web candidates must use the customer website
project when explicitly released; the automatic publisher below targets only
the support portal. Mobile candidates still require a native build and device
acceptance. Sensitive changes remain review candidates. Portal CSS changes
remain eligible for the bounded portal publisher; JavaScript/TypeScript app
entry points require review.

The current deployment tests use the actual review policy so the tests cannot
mask a mismatch between scope routing and the production publisher.

Fix with Lucy uses a platform-support-owner queue and a GitHub Actions Codex/OpenAI workflow. A platform support owner is not a customer tenant owner. Existing IT recommendations and customer-facing Lucy remain separate. The activation state of a live deployment must be checked independently; source inspection is not proof that it is running.

## Supported scope

- Mobile audio: recorder/session hooks and the two audio screens. A successful workflow publishes a separate `lucy-repair/mobile-*` candidate branch. It does not advance release branches, build a binary, publish an OTA update, or submit to either store. Native build, device acceptance and store release are still required; this workflow does not implement those stages.
- Support portal: only `webdash/src/App.css` (plus the allowed regression test) is eligible for automatic publication. Monitoring JavaScript and other portal application source publish review candidates. For eligible CSS repairs, publish with atomic branch leases, deploy Railway and Vercel, and verify backend health. Deployment failure attempts rollback; a failed rollback explicitly requires manual recovery.
- Authentication, tenant isolation, payroll, payments, migrations, dependencies and arbitrary backend changes are outside automatic repair scope.
- The worker sends a random request ID, scope and commit SHA to GitHub. It does not publish incident text, customer information or private logs. Consequently the model investigates the supported category in source; it does not receive full live incident evidence. If it finds no demonstrated defect, the attempt fails closed.

## Isolation and limits

The model runs in a restricted, network-disabled workspace with no deployment credentials. Its JSON file is screened for the credentials available to the proposal job, encoded credential forms, provider-token patterns and masked output using a fresh trusted checkout before artifact transfer. Its replacement files are checked against exact file and size allowlists on both sides of the transfer. Baseline dependencies install before patch application. Generated code is tested in a container with no network or production credentials. The privileged publication job is a fresh runner and executes only the original deployment script, never generated code. Existing tests cannot be edited by the repair.

Platform-support-owner authorization, active-incident uniqueness, dispatch reconciliation and a serial workflow limit duplicate work. There is no daily attempt quota or enforceable monetary cap in this queue. An authorization flag and job timeouts are not spend limits. Completed jobs never resolve an incident automatically. Tests and a health endpoint do not prove a behavioral repair or rule out every generated-code risk.

## Activation prerequisites

1. Register `.github/workflows/lucy-repair.yml` on the repository default branch. Dispatch uses `fix/tester-release-20261022`, which must contain the workflow and scripts. Admission checks the official repository, dispatch event, release ref, workflow event SHA, current source head and fixed inputs before any caller-selected checkout or provider credentials. A stale request fails before model work.
2. With explicit approval for the new credential destination, set GitHub Actions secrets `LUCY_OPENAI_API_KEY`, `LUCY_RAILWAY_API_TOKEN`, `LUCY_VERCEL_TOKEN`. Reuse approved credentials; do not rotate keys. Use least-privilege credentials. Never put values in source, logs or chat.
3. Separately approve support repair inference and GitHub runner spending, including a bounded financial plan. The saved background-research grant does not cover support repairs. Set an explicitly verified Codex-compatible model in repository variable `LUCY_REPAIR_MODEL` and, only after that approval, `LUCY_REPAIR_SPEND_APPROVED=true`. These are not set by this change. Every scope now requires a read-only model-metadata access check before generation. This does not prove available credit, Codex compatibility, pricing, or a hard cap. Configure an independently enforceable provider/broker limit if a hard monetary limit is required; the current Codex action does not implement one. Never inherit a model name from customer Lucy or the legacy IT worker.
4. Set repository variables: `LUCY_RAILWAY_SERVICE_ID`, `LUCY_RAILWAY_ENVIRONMENT_ID`, `LUCY_VERCEL_PROJECT_ID`, `LUCY_VERCEL_TEAM_ID`. Before every web repair, the deployment script independently verifies Railway’s latest successful deployment commit, the live Vercel alias commit and project, backend health, and both release branch heads against the requested base. A mismatch, pending deployment or unhealthy response blocks publication. No repository-variable write token or manual baseline advancement is required.
5. Set a dedicated backend `LUCY_GITHUB_TOKEN` with repository-scoped Actions read/write and Contents read permissions, and confirm it can dispatch/read this workflow. Existing `GH_TOKEN` is a compatibility fallback; leave it unchanged. Temporary Secrets/Variables write permissions used during approved setup can be removed after provisioning.
6. Run controlled acceptance against non-production targets first: generated patch policy rejection, real regression test failure, successful deployment, failed deployment/rollback, stale branch rejection, ambiguous dispatch recovery. The deployment script currently fixes the production health URL and branch names, so a reviewed staging variant is required for that exercise. Then verify one approved production run end to end, with checks attached to the exact final source commit. Do not cancel publication while rollback may still be needed.
7. Rerun `node backend/scripts/run-owner-operations-migration.js` under the approved database deployment process before starting the updated worker. It adds `dispatch_started_at` and the `cancelled` status idempotently; it does not change tenant access. No production migration was run in this source change.
8. Only after acceptance, set backend `LUCY_REPAIR_ENABLED=true` and redeploy. Set false to stop new dispatch/reconciliation; cancel an already-running GitHub workflow separately if required.

No secrets were transferred and no automatic repair was executed while preparing this release. Broad whole-system autonomous repair is not delivered by this bounded workflow.

## Deployment control regression checks

Run `node --experimental-vm-modules --test scripts/lucy-repair/deploy.test.mjs scripts/lucy-repair/policy.test.mjs`.
These exercise the actual deployment script with simulated provider responses: missing credentials, baseline mismatch, stale source, atomic publication, provider failure rollback, rollback lease conflicts, unhealthy rollback, and mobile candidate-only publication. Rollback is reported successful only after the backend health check succeeds. These tests run before model invocation in the repair workflow. They do not replace real staging/provider acceptance or native device testing.

## File-handoff acceptance, 2026-10-25

Run 40271667086 completed proposal screening, isolated mobile and portal checks, and mobile candidate publication successfully. Candidate: `a0ef307c1466b629a0263ef6e1fa87ed13de4e73`. This is code-level acceptance; it is not physical-device acceptance or a store release. The handoff no longer relies on large GitHub job outputs.

## Live verification, 2026-11-05 UTC

Run 41963582088 completed generation, isolated verification and publication of
candidate b674d30de06fec2c2e196b1bdb2973d5b52bff8f. The owner portal reconciled
its terminal review state and re-enabled Fix with Lucy. The reviewed candidate
clears the old maximum-recording timer after recorder polling fails, preventing
that timer from interrupting a later recording. It was merged into the release
source; it is not contained in the already-submitted Android 12 / iOS 58 binaries.
43 mobile tests and mobile TypeScript passed locally. Device acceptance remains
open; the observed incident has not been marked resolved.

The portal now explains its active-run duplicate lock, links directly to that
run, avoids claiming deployment while checks are running, and explains the
native-release requirement for mobile candidates. Portal regression checks cover
these states. Review and native release controls remain enabled.


## Queue lifecycle hardening, 2026-11-08

- The owner can cancel their own queued repair. Cancellation and worker dispatch
  race through a conditional `queued` update; only one can win. A repeat cancel
  is idempotent and does not add another audit record. Another owner's repair
  cannot be cancelled or inspected through this endpoint.
- Once dispatch intent exists, local cancellation is refused. The UI points to
  the verified GitHub run. Pausing polling never stops the job. Cancelling an
  active deployment in GitHub can interrupt recovery, so inspect its stage first.
- Dispatch intent has its own timestamp. A long queue wait no longer consumes
  the reconciliation timeout. A missing run, multiple matches, or mismatched
  identity leaves the active incident lock in place with an explicit warning.
  Absence from the first 100 runs is not proof of non-execution.
- A known or discovered run must match request title, repository, workflow path,
  dispatch event, release branch and source SHA before status or links are
  trusted. Successful checks without publication still cannot mean deployed.
- If an ambiguous run cannot be reconciled, investigate provider history and
  access before any manual recovery. There is deliberately no automatic retry
  or UI unlock for an unconfirmed paid dispatch.
- The portal cancels an older poll before refreshing after an action. Late
  responses cannot restore an old queued status. Leaving while diagnostics are
  pending does not dispatch a repair after the view has been removed.

See [Support automation readiness](LUCY-SUPPORT-AUTOMATION-PLAN.md) for the
continuous-repair and native-store roadmap, authorization boundaries, costs and
unverified live prerequisites. These source changes are not evidence of a live
workflow run, deployment, native build, submission, or store publication.
