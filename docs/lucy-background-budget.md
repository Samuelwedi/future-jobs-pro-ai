# Lucy background AI funding gate

Status: local candidate only. No grant, model switch, provider request, paid evaluation, or native build has been activated by this change.

This adds a conservative, deployment-wide **model-token reservation budget for saved AI research only**. Synchronous Lucy chat and other product AI paths retain their existing configuration and are not covered by this budget. It is not a provider-account invoice cap, prepaid credit, or a promise about taxes or unrelated traffic.

The explicit provider selector is documented in [self-hosted background inference](lucy-self-hosted-background.md). This document applies only to the separately selected `openai` mode. Self-hosted research does not need or consume a paid grant.

## Behavior

- The existing `LUCY_BACKGROUND_WORK_ENABLED=true` flag alone no longer enables saved AI research. `LUCY_BACKGROUND_PROVIDER=openai`, an OpenAI API key and a valid `LUCY_BACKGROUND_BUDGET_GRANT` are also required for this paid mode. The separately selected self-hosted mode uses its own endpoint and model configuration. Record searches and dated work briefings stay model-free and independently controlled.
- A grant is one-time, explicitly denominated in USD, and expires within seven days. There are no funded defaults or automatic daily/monthly replenishments. The installed rate card also expires on 2026-12-08 UTC. Recheck official prices before any funding and before updating that date.
- Required JSON fields: `id`, `model`, `maxUsd` (a two-decimal string), `approvedAt`, `expiresAt`. Dates must be explicit UTC ISO timestamps including milliseconds. Supported models are exactly `gpt-6.1-sol` and `gpt-6-astra`. There is no model fallback or alternative inference endpoint on this paid path.
- PostgreSQL persists the grant's immutable fingerprint and all reservations. Changing the amount, model, dates or rate card under an existing ID fails closed. A new ID represents a new approval, not a convenient reset. Restarting processes does not replenish funds.
- Every response reserves the full cost allowance **before token counting or model dispatch**. A single atomic database update prevents separate processes from allocating the same remaining funds. The adapter then counts the exact immutable context and rejects more than 20,000 input tokens. Output is capped at 4,096 tokens, including reasoning. It uses the official OpenAI endpoint, Standard/default tier, nonstreaming synchronous Responses, `store:false`, and zero automatic retries.
- Requests include only text, typed reasoning/message items and local function tools. Files, remote item references, hosted tools, browser/VM tools, server-side conversations and provider-managed background jobs are not accepted. Existing read-only tools were traced through their nested helpers: document search, record search, payroll-period summaries and profitability are local database/calculation operations, not additional model calls.
- Cancellation, lease/actor revocation, the feature kill switch, grant changes and grant expiry are checked again before dispatch. Durable grant revocation is also rechecked after token counting. An already-dispatched request may still be billed after cancellation or timeout.
- Reservations are **never refunded automatically**, even if the actual response is shorter, no inference was dispatched, a process crashes, or the result is uncertain. This deliberately stops early rather than risk double-spending ambiguous capacity. Observed token counts are audit data, not money returned to the grant.
- A timeout, unexpected model/tier/status, or invalid usage accounting blocks that grant and retains the reservation. Recovery needs operator investigation and, if more funds are needed, a new explicit approval. No customer endpoint can create, reset or inspect a grant. The ledger stores no prompts, record text, actor identifiers, credentials or provider error bodies.

## Reservation amounts and scope

Prices verified 2026-11-08 from official OpenAI model/pricing and prompt-cache documentation:

| Model | Ordinary input / 1M | Highest input reserve / 1M (12h cache write) | Output / 1M | Fixed reservation per call |
| --- | ---: | ---: | ---: | ---: |
| GPT-6.1 Sol | $2.00 | $5.00 | $10.00 | $0.155056 |
| GPT-6 Astra | $10.00 | $25.00 | $50.00 | $0.775280 |

Fixed reservation = `(20,000 × highest input rate + 4,096 × output rate) / 1,000,000 × 1.10`. The final 10% conservatively includes the documented regional premium. Integer nanodollar arithmetic avoids floating-point overspend. The input ceiling is below the 272,000-token long-context threshold. Fast/Ultrafast, hosted-tool/storage fees, taxes, other product traffic and account-specific billing are not covered. The token-count endpoint is used for preflight, not generation; no separate price was found in the reviewed public pricing documentation, so do not claim a verified all-in invoice guarantee.

A $5.00 Sol grant permits at most 32 response attempts. A $10.00 Astra grant permits at most 12. Each execution attempt can make up to six responses; lease-expiry recovery can restart a job up to its existing three-attempt ceiling. Every attempt draws from the same durable grant, and failed preflights still consume their reservations. These numbers do not promise a number of completed jobs or answer quality.

Sources:
- https://developers.openai.com/api/docs/models/gpt-6.1-sol
- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/guides/prompt-caching
- https://developers.openai.com/api/docs/guides/token-counting
- https://developers.openai.com/cookbook/articles/per_run_spending_controller_responses_api

## Release and activation requirements

1. Review and test the exact source revision, including separate-process PostgreSQL reservations, migration upgrade/rollback compatibility, authenticated and tenant tests, and existing shutdown behavior. This migration is additive and inserts no funded row.
2. Deploy with AI background still disabled. Confirm the new schema and health. Do not change the existing synchronous `OPENAI_LUCY_MODEL` as a side effect.
3. Obtain approval that identifies OpenAI, the chosen model, one-time USD limit, expiry and whether the budget covers a controlled evaluation or deployment-wide customer research. Clarify invoice/tax scope rather than promising an account-wide cap. Verify account eligibility, current pricing and any account-specific charges without disclosing credentials. Do not make an API request merely to see whether it works before cost approval.
4. Run a bounded quality evaluation on synthetic records before customer activation. Treat unsupported account/model availability, data controls or missing price details as a blocker, not a reason to fall back to another model. Record factual accuracy, evidence citations, tool-policy adherence, incomplete-output handling, latency and usage. No Meta Muse parity claim is supported by source/unit tests.
5. Only then explicitly select `LUCY_BACKGROUND_PROVIDER=openai` and configure the approved grant and flag on the intended Railway backend. Use a fresh grant ID only for a fresh approval. Never paste API keys into this JSON or logs.
6. **Rollback warning:** older application revisions do not implement this funding gate. Turn off `LUCY_BACKGROUND_WORK_ENABLED`, drain/verify stopped AI workers, and keep the flag off before rolling back code. Never roll back to an older binary with this flag true. Retain the additive budget tables and reservations; dropping them or restoring an older database can lose spend history. Reconcile the ledger against provider usage before any replacement grant after a restore.

The public/demo path remains synthetic and does not access this funding path. Android/iOS builds remain separately held. All inference must remain disabled until the required approval and release gates are met.
