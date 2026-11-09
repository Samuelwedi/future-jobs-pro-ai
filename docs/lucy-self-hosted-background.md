# Explicit Lucy background inference

Status: local source candidate. No provider request, live model evaluation, model download, cloud setting, persistent access, native build or deployment was performed. The feature stays disabled until an operator completes the approval and release steps below.

## Scope and provider selection

Only saved read-only `ai_research` work uses this selector. Record searches and work briefings remain independently controlled, model-free modes. Synchronous Lucy chat retains its existing compatible/OpenAI behavior, including its legacy optional fallback. The older `/api/lucy` route and voice, transcription, photo/receipt, adaptive and owner AI paths also retain their existing providers. This change does not make the whole application independent of OpenAI.

Two explicit choices exist. There is no default and no automatic paid fallback:

- `LUCY_BACKGROUND_WORK_ENABLED=true` plus `LUCY_BACKGROUND_PROVIDER=self_hosted`: requires `LUCY_BACKGROUND_LLM_BASE_URL` and `LUCY_BACKGROUND_LLM_MODEL`. The endpoint must implement OpenAI-compatible nonstreaming Chat Completions with function tools. `LUCY_BACKGROUND_LLM_API_KEY` is optional for a deliberately unauthenticated local/private endpoint; omit it rather than setting an empty value. If omitted, the adapter sends the conventional `local-no-key` placeholder, never `OPENAI_API_KEY`.
- `LUCY_BACKGROUND_WORK_ENABLED=true` plus `LUCY_BACKGROUND_PROVIDER=openai`: requires an explicit, unexpired `LUCY_BACKGROUND_BUDGET_GRANT` and an OpenAI API key. The existing durable budget policy, model allowlist, rate expiry, token-count preflight and fixed reservations apply. See [the budget runbook](lucy-background-budget.md). An existing API key or budget alone cannot select OpenAI.
- Missing, unknown, partial or malformed selection is disabled. `LUCY_LLM_*`, `OPENAI_BASE_URL` and `LUCY_ALLOW_PAID_FALLBACK` cannot select or redirect background inference. A failed self-hosted endpoint never invokes OpenAI, its counter or its budget ledger, even when paid credentials, a grant and the legacy fallback flag are present.

The background endpoint must use HTTPS except loopback or `*.railway.internal` HTTP. URLs with credentials, query strings, fragments or control characters are rejected. Direct OpenAI domains cannot be labeled self-hosted. Redirects are rejected before following them, including same-host redirects: configure the exact API base rather than relying on a redirect. The transport sends only its selected authorization and JSON content headers; global OpenAI custom headers, organization/project IDs and debug request logging are not inherited. Keys belong only in approved secret configuration, never URLs, prompts, capability responses, source control or grant JSON.

`GET /api/lucy-v2/capabilities` and the work listing add `backgroundInference: {configured, provider, automaticPaidFallback:false}`. `provider` is `self_hosted`, `openai` or null. This reports local configuration validity, not reachability, available funds, hardware, local execution, zero cost or model quality. No endpoint, model string, credential or fingerprint is exposed. Existing mode booleans remain compatible.

## Execution and safety boundaries

The worker captures one immutable selection before its claim/access awaits, passes it to the research processor, and keeps it for every model/tool turn in that execution. Changes to provider, endpoint, model, key, paid grant or kill switch fence later dispatch and publication. An SDK transport fence rechecks the selection immediately before the actual HTTP send. There is no provider reselection after a tool result. HTTP redirects cannot silently send prompts to a different destination.

Configuration is deployment-level, not a per-customer route to an arbitrary URL. No customer API can set these values. Queued jobs are not pinned in the database to an old provider; they use the selection at worker claim. Therefore disable and drain all workers, and explicitly cancel or approve remaining queued work, before changing provider or rolling out new configuration. All replicas must receive the same approved configuration. An already-sent request cannot be recalled and may continue using compute or incur charges after cancellation. Cancellation and revocation suppress subsequent calls and publication; they do not promise instantaneous provider-side abortion.

The request snapshot permits only text, local function definitions and completed tool context. Self-hosted requests reject OpenAI encrypted reasoning rather than forwarding it to another provider. Assistant text and function calls are combined in one Chat Completions assistant message and tool-result IDs are preserved. Responses must report the exact configured model; providers using a different alias must be configured and evaluated under that returned alias. Unsupported or malformed replies fail safely rather than changing models.

Bounds per provider call:

- Immutable serialized context and actual HTTP request: at most 256,000 bytes. Self-hosted context has a byte bound, not a locally verified tokenizer/context-window bound. Ensure the selected model's actual context window can handle the workload; an oversized context fails rather than falling back.
- HTTP response: at most 256,000 bytes, including tool arguments, before SDK JSON parsing. Maximum requested generation: 4,096 tokens. A compatible server is not trusted to enforce that parameter; the client additionally enforces response bytes, 24 tool calls, 12,000 characters per argument object and the existing runtime checks.
- Zero SDK automatic retries. Finite 45-second transport/body deadline; paid counting retains its 20-second SDK timeout. Nonstreaming only. Length-limited and filtered replies remain incomplete and their tool calls are not executed.
- Existing limits remain: six model calls, 24 tool calls, 90-second work deadline, 120-second fenced lease and at most three claims after lease loss. Processor errors are terminal; expired-lease recovery is not an automatic provider fallback. A single local execution slot stays occupied until the prior processor settles.

Tenant, current role, entitlement, password-change, cancellation, lease and shutdown checks remain active before reads, inference and publication. The background tool allowlist remains read-only. This work does not enable new customer actions or change tenant/action policy. OpenAI grants still reserve before any provider request and never refund automatically. Provider failure or uncertain paid accounting retains reservations and can block the grant. Endpoint errors are sanitized; raw provider bodies are not returned or saved in job errors.

## Self-hosted activation checklist (not executed)

1. Review this source revision and run its build, sealed tests, full backend/tenant/worker tests and required real-PostgreSQL gates. Publish only through an authorized release. Deploy initially with `LUCY_BACKGROUND_WORK_ENABLED=false` and no provider selection.
2. Choose approved compute and an approved data destination. The previously reported Windows Ollama `qwen3:8b` and Lucy server `127.0.0.1:8765` are historical, not verified active. The currently available environment catalog contains only dot's cloud computer. Railway's `127.0.0.1` is the Railway container, not the user's Windows computer. No tunnel, model pull or new network access is included or authorized by this source change.
3. On an authorized machine, verify the installed model identity/digest, available memory, context configuration, compatible `/v1/chat/completions` tool support and returned model name. Do not download/pull a model or start billable hosting without the appropriate approval. `qwen3:8b` is a candidate to evaluate, not evidence of frontier-model parity.
4. Verify where inference actually executes. A local Ollama URL can proxy a cloud model; localhost is not proof of local execution or zero cost. For a deliberately local-only Ollama setup, confirm the installed model and use the documented `OLLAMA_NO_CLOUD=1` or `disable_ollama_cloud` configuration through approved setup, then verify cloud features are disabled. This candidate has not changed that setting. Review endpoint privacy, authentication and any upstream/cloud routing. “Compatible” describes a protocol, not a cost or privacy guarantee.
5. If the backend is Railway, use an approved, reachable deployment architecture: for example model and backend on the same authorized machine, or an approved private inference service. A secure authenticated HTTPS integration to a separate machine needs its own approval and operational review. Do not expose an unauthenticated Ollama service to the public internet or create a tunnel merely to bypass this blocker.
6. Explicitly approve any compute costs, model downloads, destination/data handling, persistent access and activation separately. Configure background-only variables for that exact service. Preserve synchronous settings. Leave the paid background provider unselected and do not install a paid grant for self-hosted mode.
7. Run a bounded evaluation using synthetic records only after its execution is authorized. Measure correct tool selection, argument validity, tenant/role isolation, multi-turn synthesis, evidence IDs, refusal of retrieved instructions, truncation/failure behavior, latency and resource use. Source tests establish routing and safeguards, not answer quality. Accept the model only against these results.
8. Enable the flag only after all checks pass. Verify capabilities without treating them as a live inference health test. If inference is unavailable, preserve model-free reports and surface the failure. Any later OpenAI use needs a separate explicit grant/approval; it is never a recovery fallback.

## OpenAI activation or provider switch

Follow the paid-budget runbook, including current prices, account eligibility, exact one-time USD approval, expiry and intended data/workload. Explicitly set `LUCY_BACKGROUND_PROVIDER=openai` only after that approval. No inference or token-count request is permitted merely to test account availability before approval. Budget permissions are separate from customer tenant/role permission to submit read-only work.

Turn the background flag off on every replica before a switch. Drain active workers and handle queued/expired work explicitly. Deploy consistent provider configuration, verify the source/schema revision, then activate only the newly approved mode. Retain budget tables/history. On rollback to any revision lacking this selector or budget guard, keep AI background disabled and verify every older worker is stopped before accepting AI jobs. Synchronous and other direct OpenAI paths require their own audit if full-app independence is desired.

## Offline verification

With existing dependencies only:

```sh
cd backend
npm run build
node --test --test-concurrency=1 tests/lucy-background-provider.test.cjs tests/lucy-selfhost-sdk.test.cjs tests/lucy-selfhost-http.test.cjs tests/lucy-inference.test.cjs tests/lucy-budget-config.test.cjs tests/lucy-budgeted-inference.test.cjs tests/lucy-budget-sdk.test.cjs
node --test --test-concurrency=1 tests/*.test.cjs
```

The self-hosted SDK fixture intercepts all fetch calls and asserts the exact approved synthetic URL. The HTTP fixture permits only its bound loopback URL and confirms a redirect cannot reach its trap path. These are mock/loopback tests, not real model calls. The heavier suites use isolated PGlite fixtures, not production. Retain separate-process PostgreSQL budget/lease gates from the existing release process; do not treat a single-session PGlite pass as equivalent concurrency evidence.
