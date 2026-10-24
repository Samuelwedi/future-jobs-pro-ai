# Private Lucy operations reviews

This release adds an owner-only workspace in the existing webdash staff portal. It is an internal review system, not an autonomous business operator.

## Included
- Lucy coordinator, Sales, Support, and IT review roles using the existing OPENAI_API_KEY and OPENAI_LUCY_MODEL.
- Aggregate subscription, support workload, and incident evidence. No raw customer messages or employee records sent to the model.
- Persistent tasks, status transitions, token usage, daily schedules, and review history.
- Server-enforced platform owner access. Customer JWTs and non-owner staff cannot use these routes.
- Cross-replica PostgreSQL lock, bounded requests, no automatic provider retries, 12 requests per rolling 24 hours.
- No email, CRM mutation, payroll action, shell command, deployment or credential tool is exposed to the model.
- Accepting a report acknowledges it; it does not authorize or execute its proposed actions.

## Rollout
1. Apply backend/migrations/20261024_owner_operations.sql using node scripts/run-owner-operations-migration.js. Existing platform_support_agents, companies, support_tickets and system_incidents schemas must exist.
2. Deploy backend and webdash from the same reviewed release.
3. Keep the existing OPENAI_API_KEY and OPENAI_LUCY_MODEL. Set OWNER_OPERATIONS_WORKER=true to enable the polling worker. No keys need rotation.
4. Log into the staff portal with an existing active platform_support_agents account whose role is owner. Do not promote customer accounts automatically.
5. Verify a manual review, completion, usage display, and recorded acceptance. Enable daily schedules individually. Disable OWNER_OPERATIONS_WORKER to stop processing; queued tasks remain stored.

## Remaining production work
Live rollout and owner acceptance testing are required. Sales prospect management/CRM, outbound messages, ticket-specific retrieval and approved replies, code remediation and deployment connectors are not implemented in this release. They require explicit tool contracts, destination configuration and per-action authorization. This release does not claim those capabilities or display simulated successes.
