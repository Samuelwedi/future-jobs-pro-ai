# Chat media authorization checkpoint

Based on e1495df (uncertain-COMMIT blob preservation). No migration is introduced.
The existing private-view migration and its `membership_instance_id` column are
required; absent policy/schema data fails closed.

## Scope

Attachment and group-photo requests capture verified actor/company/target scope
before provider work. After upload, a short transaction rechecks current actor,
company, subscription, password requirement, token validity, room membership and
photo creator eligibility before persistence. Support tickets retain the HTTP
`/api/chat` subscription gate and legacy ticket-owner/admin/support_agent or
same-company boss/manager policy, not socket support exceptions. Complimentary
access uses the configured current active boss/owner in the actor's company.

Downloads acquire the private provider stream with no policy locks held, guard
stream errors while awaiting validation, and recheck policy plus attachment
identity before handing bytes to the response. Failed checks destroy the stream.
Signed private attachment URLs remain server-side. Public group-avatar storage
is unchanged; converting it to private storage is not part of this checkpoint.

## Concurrency and limits

- Locks follow existing text ordering: actor/company SHARE, optional sponsor
  SHARE, room UPDATE, membership SHARE. Room UPDATE avoids concurrent upgrade
  deadlocks. Support ticket rows are also locked for the short validation/write.
- Other writers use different user ordering. This is not globally deadlock-free.
  Five-second lock and fifteen-second statement limits bound contention. Errors
  fail closed with no automatic upload retry. This checkpoint does not change
  global writer ordering.
- An exact membership instance rejects removal and rejoin during provider work.
  Actor/target company snapshots reject changed current tenant, but cannot detect
  completed A-to-B-to-A tenant changes without a dedicated scope epoch. Room xmin
  is deliberately not used: normal messages change room timestamps.
- Token and entitlement times are rechecked after lock acquisition, before write
  COMMIT and after read-transaction settlement. No continuous revocation of bytes
  already handed to a stream is promised.
- No locks or open policy transaction span provider upload/download acquisition.
  Ambiguous COMMIT or failed rollback retains potentially referenced bytes and
  discards the connection. Definite precommit rejection cleans up only after
  settled rollback. Failed cleanup can leave an orphan; reconciliation is not
  implemented here. Provider upload ambiguity before object identity is returned
  remains a separate limitation. There is no media outbox or automatic retry.

## Verification

Source-loaded tests use only synthetic data and stubbed providers:

    node --test tests/chat-media-authorization.test.cjs tests/chat-media-commit.test.cjs

The policy suite covers current permission changes, support roles, complimentary
sponsor checks, exact membership instance, time expiry, failed database lookups,
provider stream errors, attachment replacement, post-provider photo/attachment
revocation, uncertain COMMIT and rollback failures. The focused commit suite
checks client disposition and cleanup ordering. Type checking uses `tsc --noEmit`.
These checks do not establish live provider behavior or production lock timing.

Checkpoint results: 63 source-only policy/commit assertions passed, one in-process
PGlite policy SQL test passed, and all 16 existing synthetic loopback Socket.IO
regression tests passed with current policy/schema fixture wiring. Backend
`tsc --noEmit --incremental false` passed. Independent source review found no
remaining must-fix issue after adding the pending-stream error guard. No external
provider or production records were used. Real multi-connection PostgreSQL
concurrency/deadlock acceptance was not run; PGlite is not evidence of that gate.
