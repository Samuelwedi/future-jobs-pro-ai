# Lucy activity history

The customer Lucy navigation now includes Activity history. Its authenticated, no-store endpoint returns at most 50 recent metadata records for the requesting user in their current company: action-log receipts, background tasks and chat-request ledger states. It never unions global platform data into a customer feed. Actor/tenant/role predicates, current entitlement and password checks apply; access is checked again after reading. Client responses are discarded across account changes, closing/reopening and cancellation. The history does not invoke a model or change business records.

The platform-owner Lucy Operations screen has a visible history bar and filterable history section for its existing owner-scoped diagnoses, repairs and audit events. Customer company owners do not gain platform-owner access. Credential changes clear the view and stale network results cannot restore an old owner's history. Workflow evidence links are restricted to this repository's GitHub Actions runs.

## What the records prove

- A chat ledger response means a response was recorded, not that a business operation succeeded. Processing/uncertain/expired states retain their uncertainty.
- Legacy action logging is best effort, not an atomic business receipt. Old actions may be missing. Titles are a closed vocabulary; prompts, raw summaries, names, model errors and chat bodies are not exposed. Legacy managerial actions are hidden from employees because those rows do not contain an authorization-role snapshot.
- Background tasks show their stored status and real requested/updated/completed timestamps. The Tasks and preferences panel provides authorized results and evidence.
- Platform diagnosis acceptance means a report was accepted, not that code was changed or published. Repair status is the stored workflow reconciliation result. The workflow link is where detailed tests and release evidence must be checked.
- Native source preparation is not an app build, submission or store publication. This increment does not create native release records, infer successful publication or claim uninterrupted diagnostics. Those outcomes require verified execution and dedicated receipts before they can appear as completed history events.
- Reads are bounded snapshots, not a complete export, immutable audit ledger or historical transition stream. No action, permission or approval can be granted by reading this history.

No migration is added: the three customer source tables and owner operations tables already exist in the released schema. If a source is unavailable, the API fails unavailable instead of inventing an empty history. There is no demo fallback to live data and no storage of history in browser localStorage.

## Validation

The new backend tests exercise real SQL with isolated PGlite: authentication, forbidden scope parameters, tenant/actor separation, role demotion, entitlement/password changes, revocation during reads, secret minimization, unknown statuses, source failure and the global 50-record limit. Customer web lifecycle tests cover single-flight reads, account switching, late responses, close/reopen, missing authentication and redacted errors. Portal tests cover honest native/diagnosis labels, safe evidence links, filters/order/limits, credential changes and Strict Mode/unmount request fencing. Final integrated tests and independent review remain required before release.
