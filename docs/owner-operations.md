# Private owner operations

The platform staff portal is bundled into the production Docker image at `/owner/`.
Only existing active platform owners can access Lucy Operations; customer/company accounts do not qualify.

## Workflows
- Lucy, Sales, Support, and IT queue internal reviews against current platform evidence.
- Daily schedules are opt-in in the owner UI. The worker is enabled with OWNER_OPERATIONS_WORKER=true.
- Sales has a private lead pipeline, stages and follow-up dates. Aggregate counts inform AI reviews; contact details are not included in model evidence.
- Support can queue a ticket-specific AI reply draft. The worker reads up to 12 recent messages, limited to 2,000 characters each. The owner opens the draft in the actual ticket, reviews/edits, accepts the ticket if needed, and explicitly sends using the existing support workflow. Creating or accepting a report never sends a reply.
- IT reviews collect actual runtime/database diagnostics. The existing System health workspace handles incident acknowledgement and resolution.
- Persistent jobs and audit events record queueing, review, schedules and lead changes. Model usage is stored on each completed task.

## Rollout
Railway config runs the existing media and voice migrations followed by the idempotent owner migration before deploying. The new migration only adds tables/columns; it does not change account roles or credentials. It reuses the application's database configuration.
Deploy the existing production branch, enable OWNER_OPERATIONS_WORKER=true, sign into /owner/ with an existing owner account, queue one review and verify a completed report. Enable the desired daily reviews in that account.

## Controls and boundaries
12 model starts per rolling 24 hours globally; failed starts count. A per-owner queue cap of 12 prevents unbounded manual queues. One database advisory lock serializes worker replicas. Failed/interrupted requests require a new task; no automatic provider retries. The existing OpenAI key and model configuration are reused, with store=false.
Model output cannot execute shell commands, deploy code, alter billing, reset passwords, rotate keys or send messages. Those require separately scoped integrations and explicit approval workflows; they are not implemented here. Lead follow-ups are tracked, not automatically emailed. HubSpot, Salesforce, Calendly and external ticket systems are not connected.

Verification must include backend/staff builds, worker and authorization tests, live health, login and a real completed model review. Mocked tests do not establish live operation.
