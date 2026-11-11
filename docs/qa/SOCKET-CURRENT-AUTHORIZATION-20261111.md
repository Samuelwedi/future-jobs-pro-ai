# Current chat socket authorization

## Scope

Started from production `538383abd68bfeb6082692723d10832dd74c959b` in an isolated branch. No schema, storage format, UI, message persistence, receipt, account-role or support-agent permission changes.

The old socket used a connection-time actor snapshot indefinitely. Deactivation, company changes, subscription/complimentary revocation, required password changes and JWT expiration could leave a connected socket able to join or send after equivalent HTTP access failed. Membership checks already denied removed members' subsequent joins/sends, but their retained room subscription still received broadcasts.

## Fix

- Keep verified, immutable identity, initial company binding and token deadlines as socket authorization metadata. Re-read the current database actor for each inbound join, send and dashboard request; ordinary chat also requires current entitlement and room membership.
- Recheck token deadlines after asynchronous authorization. Resolve the current sender name from the same actor lookup.
- Route all chat text/attachment and support message/media/presence/status/queue notifications through a shared recipient authorizer. Fetch recipients across the Socket.IO adapter, authorize each recipient independently and emit directly to that socket. Never fall back to broadcasting to the room.
- Strip the handshake bearer token after authentication: the Redis adapter serializes handshake fields as well as socket data during `fetchSockets`.
- Fail closed on recipient lookup, authorization or delivery errors without changing the success of an already-committed message. Release media transaction clients before recipient database queries. Existing tracked HTTP/socket work continues to drain before database shutdown.

## Preserved policy

Current chat members keep existing message payloads and text/media behavior. Customer access tokens still cannot become platform support-agent sockets or subscribe to a platform agent queue; both customer-agent role sets remain empty.

Active support-ticket owners retain the existing exception for unpaid/expired subscriptions and required temporary-password changes. User/company activity, initial company binding and token deadlines still apply to their socket access. This intentionally does not tighten the separate HTTP support authorization policy.

## Local verification

- `node --test backend/tests/socket-current-authorization.test.cjs` uses actual production TypeScript handlers, real loopback HTTP/Socket.IO and isolated PGlite, with synthetic users and storage. No emitted build or live database/provider is involved.
- Covers legitimate members/multiple sockets, tenant and role boundaries, all original actor/membership revocations, natural JWT/entitlement deadlines, complimentary revocation, retained-room recipients, text/media, support owner exception and support notification types, database/adapter failure, committed-response integrity and shutdown/reconnect behavior.
- Existing company history, chat media/profile, support media, owner authentication, graceful shutdown, real shutdown-process and Lucy worker shutdown suites also run against current TypeScript in memory. Their dist-oriented fixtures retain their original virtual module filenames. The history import allowlist and owner-auth import fixture were updated for the new helper without bypassing authorization.
- Backend TypeScript `--noEmit` and whitespace checks pass.
- Independent baseline/fixed regression verifies the original production failures and the fixed working-source snapshot. Independent two-server testing uses the actual Socket.IO Redis adapter protocol over synthetic pub/sub, including remote recipients, timeout fail-closed behavior, token minimization and adapter cleanup. This is not a real Redis service or live deployment test.

## Guarantees and limits

Authorization is rechecked on each inbound action and each recipient delivery, eliminating authority cached at handshake. A concurrent database change can still race an already in-flight check/persistence/emit. This is not a transactional guarantee of zero delivery after the exact revocation commit instant.

The existing access-token model has no password-bound token version. Ordinary password changes do not invalidate issued JWTs. This change enforces existing token expiration and current `must_change_password` policy; it does not invent a new password-revocation scheme.

Recipient checks add database work and adapter round trips; delivery authorization runs in batches of at most 20 sockets. During a mixed-version deployment, sockets from an older replica lack the new metadata and are denied notification delivery by the new helper. However, old replicas still broadcast directly to shared rooms and can bypass the new recipient checks, including for sockets on upgraded replicas. Mixed-version overlap is not secured: revocation protection requires every broadcaster replica to be upgraded. Update and verify all replicas through the authorized release process; normal history/reconnect remains the recovery path for missed notifications. Release integration, exact deployed commit verification and any live acceptance remain separate gates.
