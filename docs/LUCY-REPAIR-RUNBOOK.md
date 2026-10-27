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

This release adds the owner-only Fix with Lucy queue and a manual GitHub Actions workflow. Production execution remains OFF until credentials and acceptance checks below are completed. Existing IT recommendations remain separate and do not execute changes.

## Supported scope

- Mobile audio: recorder/session hooks and the two audio screens. A successful workflow publishes a separate `lucy-repair/mobile-*` candidate branch. It does not advance release branches, build a binary, publish an OTA update, or submit to either store. Native build, device acceptance and human release are still required.
- Support portal: monitoring UI and CSS only. After checks, publish with atomic branch leases, deploy Railway and Vercel, and verify backend health. Deployment failure attempts rollback; a failed rollback explicitly requires manual recovery.
- Authentication, tenant isolation, payroll, payments, migrations, dependencies and arbitrary backend changes are outside automatic repair scope.
- The worker sends a random request ID, scope and commit SHA to GitHub. It does not publish incident text, customer information or private logs. Consequently the model investigates the supported category in source; it does not receive full live incident evidence. If it finds no demonstrated defect, the attempt fails closed.

## Isolation and limits

The model runs in a restricted, network-disabled workspace with no deployment credentials. Its JSON file is screened for the credentials available to the proposal job, encoded credential forms, provider-token patterns and masked output using a fresh trusted checkout before artifact transfer. Its replacement files are checked against exact file and size allowlists on both sides of the transfer. Baseline dependencies install before patch application. Generated code is tested in a container with no network or production credentials. The privileged publication job is a fresh runner and executes only the original deployment script, never generated code. Existing tests cannot be edited by the repair.

Owner authorization, active-incident uniqueness, a global two-attempt daily limit, dispatch reconciliation and a serial workflow limit duplicate work. Completed jobs never resolve an incident automatically. Tests and a health endpoint do not prove a behavioral repair or rule out every generated-code risk.

## Activation prerequisites

1. Register `.github/workflows/lucy-repair.yml` on the repository default branch. Dispatch uses `fix/tester-release-20261022`, which must contain the workflow and scripts.
2. With explicit approval for the new credential destination, set GitHub Actions secrets `LUCY_OPENAI_API_KEY`, `LUCY_RAILWAY_API_TOKEN`, `LUCY_VERCEL_TOKEN`. Reuse approved credentials; do not rotate keys. Use least-privilege credentials. Never put values in source, logs or chat.
3. Set repository variables: `LUCY_RAILWAY_SERVICE_ID`, `LUCY_RAILWAY_ENVIRONMENT_ID`, `LUCY_VERCEL_PROJECT_ID`, `LUCY_VERCEL_TEAM_ID`. Before every web repair, the deployment script independently verifies Railway’s latest successful deployment commit, the live Vercel alias commit and project, backend health, and both release branch heads against the requested base. A mismatch, pending deployment or unhealthy response blocks publication. No repository-variable write token or manual baseline advancement is required.
4. Set a dedicated backend `LUCY_GITHUB_TOKEN` with repository-scoped Actions read/write and Contents read permissions, and confirm it can dispatch/read this workflow. Existing `GH_TOKEN` is a compatibility fallback; leave it unchanged. Temporary Secrets/Variables write permissions used during approved setup can be removed after provisioning.
5. Run controlled acceptance against non-production targets first: generated patch policy rejection, real regression test failure, successful deployment, failed deployment/rollback, stale branch rejection, ambiguous dispatch recovery. The deployment script currently fixes the production health URL and branch names, so a reviewed staging variant is required for that exercise. Then verify one approved production run end to end.
6. Only after acceptance, set backend `LUCY_REPAIR_ENABLED=true` and redeploy. Set false to stop new dispatch/reconciliation; cancel an already-running GitHub workflow separately if required.

No secrets were transferred and no automatic repair was executed while preparing this release. Broad whole-system autonomous repair is not delivered by this bounded workflow.

## Deployment control regression checks

Run `node --experimental-vm-modules --test scripts/lucy-repair/deploy.test.mjs scripts/lucy-repair/policy.test.mjs`.
These exercise the actual deployment script with simulated provider responses: missing credentials, baseline mismatch, stale source, atomic publication, provider failure rollback, rollback lease conflicts, unhealthy rollback, and mobile candidate-only publication. Rollback is reported successful only after the backend health check succeeds. These tests run before model invocation in the repair workflow. They do not replace real staging/provider acceptance or native device testing.

## File-handoff acceptance, 2026-10-25

Run 40271667086 completed proposal screening, isolated mobile and portal checks, and mobile candidate publication successfully. Candidate: `a0ef307c1466b629a0263ef6e1fa87ed13de4e73`. This is code-level acceptance; it is not physical-device acceptance or a store release. The handoff no longer relies on large GitHub job outputs.
