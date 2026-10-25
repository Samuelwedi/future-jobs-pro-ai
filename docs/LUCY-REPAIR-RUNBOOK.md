# Lucy repair execution — prepared, not activated

This release adds the owner-only Fix with Lucy queue and a manual GitHub Actions workflow. Production execution remains OFF until credentials and acceptance checks below are completed. Existing IT recommendations remain separate and do not execute changes.

## Supported scope

- Mobile audio: recorder/session hooks and the two audio screens. A successful workflow publishes a separate `lucy-repair/mobile-*` candidate branch. It does not advance release branches, build a binary, publish an OTA update, or submit to either store. Native build, device acceptance and human release are still required.
- Support portal: monitoring UI and CSS only. After checks, publish with atomic branch leases, deploy Railway and Vercel, and verify backend health. Deployment failure attempts rollback; a failed rollback explicitly requires manual recovery.
- Authentication, tenant isolation, payroll, payments, migrations, dependencies and arbitrary backend changes are outside automatic repair scope.
- The worker sends a random request ID, scope and commit SHA to GitHub. It does not publish incident text, customer information or private logs. Consequently the model investigates the supported category in source; it does not receive full live incident evidence. If it finds no demonstrated defect, the attempt fails closed.

## Isolation and limits

The model runs in a restricted, network-disabled workspace with no deployment credentials. Its JSON output is checked against exact file and size allowlists. Baseline dependencies install before patch application. Generated code is tested in a container with no network or production credentials. The privileged publication job is a fresh runner and executes only the original deployment script, never generated code. Existing tests cannot be edited by the repair.

Owner authorization, active-incident uniqueness, a global two-attempt daily limit, dispatch reconciliation and a serial workflow limit duplicate work. Completed jobs never resolve an incident automatically. Tests and a health endpoint do not prove a behavioral repair or rule out every generated-code risk.

## Activation prerequisites

1. Register `.github/workflows/lucy-repair.yml` on the repository default branch. Dispatch uses `fix/tester-release-20261022`, which must contain the workflow and scripts.
2. With explicit approval for the new credential destination, set GitHub Actions secrets `LUCY_OPENAI_API_KEY`, `LUCY_RAILWAY_API_TOKEN`, `LUCY_VERCEL_TOKEN`. Reuse approved credentials; do not rotate keys. Use least-privilege credentials. Never put values in source, logs or chat.
3. Set repository variables: `LUCY_RAILWAY_SERVICE_ID`, `LUCY_RAILWAY_ENVIRONMENT_ID`, `LUCY_VERCEL_PROJECT_ID`, `LUCY_VERCEL_TEAM_ID`, and `LUCY_VERIFIED_PRODUCTION_SHA`. The last must be the exact verified commit currently deployed to both targets and at both release branch heads. It intentionally requires updating after each independently verified release; mismatches block deployment.
4. Confirm the backend's existing `GH_TOKEN` can dispatch/read this workflow. Do not broaden its access silently.
5. Run controlled acceptance against non-production targets first: generated patch policy rejection, real regression test failure, successful deployment, failed deployment/rollback, stale branch rejection, ambiguous dispatch recovery. The deployment script currently fixes the production health URL and branch names, so a reviewed staging variant is required for that exercise. Then verify one approved production run end to end.
6. Only after acceptance, set backend `LUCY_REPAIR_ENABLED=true` and redeploy. Set false to stop new dispatch/reconciliation; cancel an already-running GitHub workflow separately if required.

No secrets were transferred and no automatic repair was executed while preparing this release. Broad whole-system autonomous repair is not delivered by this bounded workflow.
