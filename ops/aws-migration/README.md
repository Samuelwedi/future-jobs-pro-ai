# AWS migration preparation — 2026-10-24

Status: preparation only. No AWS resources provisioned, data copied, keys rotated,
DNS changed, or Railway services stopped. API key rotation is explicitly paused.
Source reviewed: 2f2ba56abb3da73df1294bf85f13aef4cf7140a1.

## Proposed target (requires account, region and cost review)

- Reuse root Dockerfile: backend and built Vite web in one image, listening on 8080.
- ECR image repository; ECS Fargate behind an HTTPS Application Load Balancer.
- Start with one application task; do not enable autoscaling until scheduled-job
  ownership and Socket.IO polling affinity are verified. Retain Redis adapter.
- Private RDS PostgreSQL with encrypted storage, backups and deletion protection.
- Private Redis-compatible cache, TLS and authentication. Inspect existing Redis
  key types/TTLs and durable queues before deciding which state can be discarded.
- Secrets Manager references, scoped execution/task roles and CloudWatch logs.
- Retain Cloudinary media initially; moving hosting does not require moving media.
- Use an owned stable API hostname with ACM certificate. Railway's generated
  up.railway.app hostname cannot be moved by changing your own DNS.

## Inventory before provisioning

Inventory all production services, scheduled work, custom domains, webhooks,
storage objects, volumes, variable NAMES, PostgreSQL version/extensions/roles,
database size and Redis durability requirements. Never write secret values to
this repository, build arguments, migration notes or logs.

The reviewed app references OpenAI, Cloudinary, SMTP, Stripe, QuickBooks, Apple,
Google Play, OpenWeather, database/cache credentials, JWT/admin secrets and an
ENCRYPTION_KEY. Confirm which are actually configured; code references alone do
not prove live usage. Do not revoke or replace API keys during preparation.

ENCRYPTION_KEY currently decrypts integration tokens, Google Play purchase tokens
and payout records. Preserve it securely for migration. Changing it without an
independently tested re-encryption process can make these records unreadable.

## Configuration changes to prepare after AWS details are known

- DATABASE_URL must target the new database, not the Railway source.
- DB_SSL=true and DB_SSL_REJECT_UNAUTHORIZED=true; package the current RDS trust
  bundle and use NODE_EXTRA_CA_CERTS for Node. Test verified TLS before cutover.
- REDIS_URL must target the private TLS endpoint; preserve required state.
- Review BASE_URL, CLIENT_URL, FRONTEND_URL, APP_HOST, CORS_ORIGINS and all OAuth,
  payout-return and webhook URLs. Verify actual proxy chain before setting
  TRUST_PROXY_HOPS; never trust arbitrary forwarded client headers.
- mobile/src/services/api.ts defaults both dev and production to Railway.
  Build/verify mobile with EXPO_PUBLIC_API_URL=https://<owned-api-host>/api.
  Installed old clients need a transition path; retain Railway routing until
  supported releases are adopted, or explicitly implement a tested proxy.
- Match enabled worker settings; prevent two environments executing reports,
  billing, schedules or outbound notifications during restore rehearsal.
- Copy existing provider credentials only through approved secure channels at
  execution time. Do not expose them here. Keep rotation as a separate paused task.

## Rehearsal gates

1. Capture an encrypted backup and schema inventory; retain source untouched.
2. Restore into isolated private RDS using compatible pg_dump/pg_restore versions.
   Use custom-format dumps; review role/ownership and extension compatibility.
3. Compare schema, constraints, sequence positions, per-table row counts and
   representative financial/time-entry totals. Test decryption without logging
   plaintext. Validate attachments against existing Cloudinary references.
4. Build immutable image, scan it and record its digest. Configure target secrets.
5. Run reviewed migrations as one-off tasks before starting the application;
   do not blindly rerun all historical migrations. Current Railway predeploy is
   `node scripts/migrate-chat-media.cjs && node scripts/runVoiceNoteMigration.js`.
6. Confirm /api/health, login, authorization, GPS/timesheets, payroll, chat and
   attachments, Lucy, voice transcription, exports and English/Spanish/French.
   Use test identities and sandbox payment flows; prevent real charges/messages.
7. Test Socket.IO reconnect, upload limits, ALB timeouts, mobile background/resume,
   database failover behavior and backups. Record results, not assumed passes.

## Cutover procedure (not authorized for execution by this preparation)

- Agree maintenance window, recovery objectives and measured AWS operating cost.
- Stop/drain all source writers, workers and webhook delivery; take final backup
  or complete validated replication catch-up. Never let two DBs accept writes.
- Restore/verify final state, run migrations, enable AWS app and then workers.
- Switch owned hostname; update provider callback/webhook URLs and validate.
- Handle old mobile clients before removing Railway. Monitor errors, latency,
  DB pool saturation, queues and business outcomes.
- Retain recoverable source backups; retire Railway only after acceptance.

Rollback before AWS writes: route back to Railway and resume source writers.
Rollback after AWS writes: first stop target writers and reconcile new data into
source under a reviewed recovery process. Simply switching DNS would lose writes.

## Open decisions / blockers

AWS account and sign-in access, region, owned hostname/DNS access, spending limit,
RPO/RTO, maintenance window, current DB/Redis inventory and old-client transition.
AWS console was unavailable in the agent browser; no target deployment verified.
Railway browser showed deployment e91ac0d9 active/successful on October 24.

## AWS reference material

- https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html
  Injected secret updates require new ECS tasks/deployment.
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Procedural.Importing.html
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html

The task-definition.example.json is a deliberately incomplete reference, not a
runnable deployment. Replace every REPLACE marker, add the verified TLS trust
bundle configuration, and inventory/add required provider secrets before use.
CPU/memory are starting estimates to load-test, not a capacity guarantee. Provision
networking, roles, log group, ALB health checks and RDS separately. No automation
in this directory deploys or changes production.
