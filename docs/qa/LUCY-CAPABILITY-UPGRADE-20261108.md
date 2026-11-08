# Lucy capability upgrade: source candidate and benchmark

## Status and scope

This candidate adds a substantial capability layer to Future Jobs Pro AI's existing Lucy. It is source-complete for the bounded scope below, subject to the acceptance gates in this report. It is **not deployed** and does not establish parity with or superiority to Meta Muse.

- Repository: `Samuelwedi/future-jobs-pro-ai`.
- Base: `436a48b2ac5ad3f72c8954cf7d50cb3472eb5040`, the current `fix/tester-release-20261022` head inspected on November 8, 2026.
- Branch: `feat/lucy-capability-foundation-20261108`.
- Master (`c8de309`) and parity PRs #6/#7 are older than this release branch. Their historical publication holds are not evidence that the app is not live. This candidate does not merge those divergent branches.
- No production deployment or migration, signed native build, store submission, live model call, customer communication, payment, account connection, or new paid service was performed. Local offline iOS/Android bundle exports are not signed builds or store acceptance.
- No Fresh Operations repository or source was changed.

## Baseline findings

The existing Lucy is an operations assistant. It already has operational queries, company-document search, project cost forecasts, timesheet export, task/PTO writes and protected draft-payroll preparation. Its OpenAI model is configurable; an OpenAI-compatible endpoint is supported, with paid fallback opt-in. This candidate does not change model, credential or billing configuration.

The previous chat orchestration allowed up to six synchronous inference steps using the last 20 company/user-scoped conversation messages. Specialized scheduled reports and owner repair workflows existed, but the chat had no general durable research queue, explicit user-managed preference memory, or resumable browser workspace. A model-name change or popular dependency alone cannot establish the requested quality.

## Implemented capabilities

1. **Cross-module work search.** Lucy finds related tasks, projects and schedules by literal phrase, person, status or date. Results include source record IDs, retrieval time and `hasMore`. SQL enforces company isolation. Employee results are restricted to assigned tasks/shifts and related projects. `%` and `_` remain literal input. `Find work: North site` works without inference credentials.
2. **Role-aware discovery.** Authenticated `GET /api/lucy-v2/capabilities` and `What can you do?` explain actual available tools, background-work status and limitations. Manager-only tools are not offered to employee inference. Owner access uses the existing shared role policy.
3. **Bounded orchestration.** Independent reads run in batches of at most three; writes retain order. Tool names, complete call envelopes, JSON arguments, supported keys, types, enums and declared ranges are validated. There are at most six model calls, with the sixth reserved for synthesis, 24 tool calls and a 90-second work-start budget. Already-running operations are not forcibly cancelled by that budget.
4. **Action recovery and evidence.** Identical mutations are deduplicated within a run, including failed or uncertain outcomes. Later provider failures, malformed responses, ambient-speech classification and final history-save failures cannot hide earlier action receipts. Outputs are bounded valid JSON with truncation markers. Search/document turns block business mutations. Partial results identify unfinished work. The separate request ledger below extends duplicate protection across ordinary chat requests without pretending to provide transactional exactly-once business effects.
5. **Durable, read-only background research.** A persistent company/user/role-scoped queue keeps research separate from a chat request. Clients can list, inspect and cancel work and return after the app closes. Requests use stable retry keys; workers use token-fenced leases and bounded recovery. Only a fixed allowlist of existing read tools is available. Company/role/entitlement and cancellation are checked before every model/tool and again before result publication. No shell, browser, arbitrary SQL, business writes, payroll confirmations or external messages are exposed.
6. **Explicit saved preferences.** Users can save, view and forget six closed-enum preferences: response style, detail level, work focus, language, week start and time format. Records have explicit-user provenance, expiry and company/user scope. No arbitrary text, instructions, secrets or inferred personal facts can be stored by this feature. Current request/interface language overrides saved presentation preferences.
7. **Web and native controls.** Both Lucy interfaces now have a tasks-and-preferences panel, queue status/result display, create/cancel controls and explicit Save/Forget. Unavailable is distinguished from disabled. Synchronous locks, request-key retention after uncertain responses, stale-response guards and account/lifecycle handling prevent duplicate taps or old-account results from contaminating current state. Native labels support English, Spanish and French. Web saves expire after 90 days; native saves after 30 days, as displayed in their interfaces. Deliberately repeating an acknowledged prompt creates a new job; retrying an uncertain request reuses its key.
8. **Release preparation.** Separate additive migrations create preference/work/request-ledger tables. An atomic, idempotent migration runner is registered in the existing predeploy script. It has column verification, lock/statement timeouts and rollback tests. It has not been run against a persistent database.

### Important background-work limits

- **Off by default:** `LUCY_BACKGROUND_WORK_ENABLED=true` is required for new requests and processing. Enabling it can incur provider spend; this candidate does not enable it.
- Limits: 4,000 prompt characters, 10 active/50 daily jobs per company/user, 50 recent jobs listed, 128 KB result, 90-second queue deadline, 120-second lease and at most three recovery claims. Provider errors are terminal; only lost/expired leases are retried.
- Cancellation stops later steps and suppresses publication, but cannot undo an inference request already sent. Existing provider transports have finite timeouts. A timed-out processor occupies its local slot until it settles, preventing accumulation of overlapping work.
- The service exposes and tests explicit draining. The application does not yet have a comprehensive global graceful-shutdown integration. Process termination uses persisted lease recovery; deployment shutdown behavior still needs acceptance testing.
- PGlite tests validate SQL/fencing behavior but do not replace multi-process PostgreSQL load testing. Retained work rows currently require a future retention/cleanup policy; they are not silently deleted.

The runtime is newly authored against the existing provider adapter. The compatible-provider adapter now preserves truncated/filtered completion states, and incomplete provider tool batches cannot execute or erase earlier receipts. No third-party agent framework was copied or added as a dependency.

### Retrieval, source evidence and safe request replay

9. **Stronger local document retrieval.** Company-document search now ranks titles and bodies, supports Unicode and Latin-accent normalization, retains English morphology matching, and finds relevant passages deeper in a document. Returned passages are original contiguous source text with UTF-16 offsets, explicit omission markers, matched fields/terms and retrieval timestamps. Tenant and audience restrictions apply before ranking and completeness metadata. Limits are disclosed: five results, 30 reranked candidates, 24 distinct meaningful terms, 200 title/200,000 body code points, two 850-code-unit passages, and a five-second database statement deadline. This is lexical retrieval, not semantic, translated or web search. Production-scale latency/indexing still requires evaluation.
10. **Evidence visible in both clients.** Chat/direct-command and background results include at most 12 bounded source records extracted from executed authorized tools, never generated from model citation prose. Expandable Sources show record type/ID, title, exact passage or permitted work details, date and retrieval time. Titles and passages remain inert text; no arbitrary source URL is made clickable. Incomplete/truncated evidence is flagged. These are retrieved records, not proof that every model claim is correct. Historic chat messages do not acquire invented evidence.
11. **Persistent ordinary-chat request protection.** New clients send immutable request IDs and payloads. An atomic company/user/role-scoped ledger claims a request before inference or mutation. Completed requests replay stored responses; conflicts, concurrent processing, uncertain/crashed requests and expired receipts never automatically execute again. There is no lease takeover for potentially completed writes. Final-save failure preserves known action receipts with an uncertainty warning; inability to revalidate authorization suppresses protected outputs. Actor/company activation, entitlement, password-change requirements and role are rechecked before model/tool steps and result publication/replay.
12. **Explicit receipt checks after connection loss.** Web/native have synchronous send locks and memory-only pending state, use read-only GET receipt checks, preserve earlier completed receipts when a later check returns only status, and stop voice follow-up while unresolved. Starting another request requires an explicit duplicate-action warning. A confirmed new request receives a fresh ID even if its wording is identical. Old servers without matching receipt metadata are not blindly retried. Existing native offline restrictions already prevent storing/replaying Lucy requests; the new chat transport remains online-only.

Request response content is capped at 128,000 bytes and cannot be replayed after 24 hours. Expired content is cleared lazily on that actor's next receipt access/submission; an optional prune function supports inactive-account cleanup but is not automatically scheduled. Key/hash tombstones remain to prevent unsafe key reuse. This is conservative duplicate-execution prevention, not a transaction spanning every business effect and its receipt. Existing clients that omit requestId remain compatible but do not gain cross-request protection. Deploy the backend/schema before updated clients, then test real PostgreSQL concurrency and loss/restart behavior.

## Official benchmark and open-source research

Meta's September 2026 [Muse announcement](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) describes a dedicated browser/VM, work continuing after the app closes, memory, connected applications, permission controls and an audit trail. These are useful comparison categories, not independently measured performance results.

Official repositories inspected on November 8:

- [OpenAI Agents SDK for JavaScript/TypeScript](https://github.com/openai/openai-agents-js): MIT, inspected main SHA `252236c32d30010ef974db77395e19dfb03bbeff`, November 6. Tools, handoffs, sessions, human oversight, tracing and realtime/sandbox agents fit the existing TypeScript stack. It is not a tenant-isolation or authorization layer; model usage is separately metered.
- [LangGraphJS](https://github.com/langchain-ai/langgraphjs): MIT, inspected main SHA `2d4f48ddaeeafb015320420dfc77d4d7dbd3a43c`, November 7. Durable execution, checkpoints, interrupts and memory are useful for complex multi-stage workflows. This bounded queue avoids an unnecessary framework migration now. Hosted services are separate from the library.
- [Microsoft Playwright](https://github.com/microsoft/playwright): Apache-2.0, inspected main SHA `07c7069cdbb1f5c7331d3f4d2abd864dcfde745a`, November 7. Useful for browser automation and acceptance tests. Its [official MCP server](https://github.com/microsoft/playwright-mcp) includes an explicitly unsafe arbitrary-code tool. Browser execution must not be exposed directly in this application's API; it needs separate isolation, network and credential controls, approvals and audit.

Repository activity and licensing were verified, not a complete security audit. No external repository code was executed or copied. Playwright was installed separately from the official npm registry for isolated acceptance testing; no project dependency or lockfile was changed for it.

## Verification

Final results are recorded in the companion validation logs. All automated data/inference tests use isolated fixtures and mocked providers, never production customers, databases or model credentials.

- Backend TypeScript build: passed. Full backend suite: **339/339 passed**, no failures or skips.
- Web production build: passed. Web suite, including actual-handler regressions: **37/37 passed**.
- Native TypeScript: passed. Complete native unit suite: **95/95 passed**. Offline iOS and Android Hermes exports: both passed.
- Real HTTP integration fixture: **6/6 scenarios passed**: preferences save/forget; request-key replay/conflict; actual queue plus restricted runner plus scoped work search; queued cancellation; running cancellation and unchanged business records; direct-chat evidence, exact replay and GET receipt integration.
- Independent source review found and fixed malformed-provider receipt loss, write-then-ignore receipt loss, final-inference entitlement revocation, native acknowledged-key reuse, overlapping slow web refresh, status-check receipt erasure, and mid-inference company/entitlement/password-policy revocation. Each has regression coverage.
- Tiny authored retrieval benchmark: baseline hit@5 **4/8**, new retrieval **8/8**, expected original passages **8/8**. Covers title-only, English morphology, French/Spanish accents, reordered keywords and CJK. This small fixture is a regression measure, not a general quality claim.
- `git diff --check`: passed. An earlier full-test invocation used the repository root instead of the required backend working directory and failed to find migration fixtures. The final full suite above was rerun from the correct package directories and supersedes it.

Browser acceptance is **blocked, not passed**: local Chromium could not create a required Unix socket, including the approved escalation attempt; the supported cloud browser could not connect to the isolated localhost preview. Native-device visual/interactivity acceptance and live model quality/latency/cost tests were not performed. The runnable local API fixture and browser-test draft are retained with validation artifacts; no browser screenshot is claimed.

## Release and next-capability gates

1. Review and merge this exact candidate through the existing release process. Confirm the actual deployment branch and inspect current CI. Do not merge the older parity branches as a substitute.
2. Run migrations against a disposable production-like PostgreSQL database, including multi-process claim/restart tests and shutdown recovery. Verify retention requirements and backups before applying production migrations.
3. Complete desktop/mobile browser and native-device acceptance: open/close, offline and slow connection, uncertain POST retry, cancellation, account/company/role switch, saved preference expiry/forget and language override. Local exports do not replace this.
4. Use the approved provider with an explicitly approved budget for realistic model evaluation. Compare grounding, multi-step success, permission correctness, latency and cost on identical tasks. Enable background work only after that approval and deployment checks.
5. A further browser/connected-app capability needs an isolated worker, allowlisted connectors, scoped brokered credentials, exact approval contracts and independently verified outcomes. New account connections, paid infrastructure and consequential actions require the applicable authorization.
6. Richer retrieval, longer-running multi-stage workflows and broader memory should follow measured failures, not a broad "most advanced" label. Preserve user visibility, explicit correction/deletion and account boundaries.

Suggested comparison cases: grounded company briefing; cross-module project investigation; employee-only access; malicious document instructions; ambiguous assignee; exact write confirmation; duplicate submission; provider outage after a successful write; close/reopen plus lost worker recovery; cancellation during inference; memory correction/deletion; external action with approval and verified outcome. No Muse parity claim is supportable until comparative evaluations exist.
