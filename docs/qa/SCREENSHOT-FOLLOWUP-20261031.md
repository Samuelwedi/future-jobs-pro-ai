# Screenshot follow-up: media, AI inference and billing

The original remaining-work/paused register and the 24-group tester report are retained. This follow-up records the additional screenshots and requests from 2026-10-31.

## Evidence reviewed

- `IMG_1800(1).PNG`: chat photo is represented only as a file/share action. Added an authenticated in-app viewer with photo display, video controls, audio play/pause/seek and explicit open/save for documents. Mobile direct/group chat and support use the same viewer. Customer web chat/support and the agent portal have equivalent browser media viewers.
- `1000205580.jpg` and `1000205581.jpg`: products unavailable, purchase query failure, trial displayed as “No active plan” and “Renews.” Backend returned `plan` while mobile expected `tier`. Both names are now supported. Trial dates say trial ends/ended. Store failures no longer prevent capabilities loading; missing products can be retried and cannot start a purchase without price/offer data.
- Google Play Console was checked in the signed-in account. The subscription catalog was empty. New Team product IDs in the source also exceeded Play's 40-character limit. Android now uses `futurejobs_team_10_monthly` etc.; Apple IDs and legacy receipt recognition remain intact. Backend verifies both namespaces against the same plan allowances.
- One Google Play subscription draft, **Future Jobs Pro AI Team 10** (`futurejobs_team_10_monthly`), was created. A monthly auto-renewing base-plan form was prepared but not saved or activated. Price submission was automatically rejected pending explicit approval of CAD 79. No price was submitted. Navigation away was also blocked to preserve the unsaved draft; the form was retained.
- `IMG_1857(1).PNG` / `IMG_1859(1).PNG`: repeated language report. Native locale detection now uses Expo Localization, saved user language still takes precedence, and the subscription navigation route is never translated. Existing home/profile translation copy is covered by a regression test. Complete translation of every screen remains open.
- `IMG_1858(1).PNG`: generic error boundary / kiosk screenshot. The earlier kiosk enable/control work remains in the QA branch; this screenshot alone does not identify a new stack trace or prove device acceptance.
- `IMG_1861(1).PNG`: voice-processing HTTP 500. Earlier recording lifetime, MIME and blank-transcript fixes are retained. Production has an existing OpenAI key configured, but this screenshot does not establish its quota or the exact failing stage. Live transcription acceptance remains open.
- `IMG_1860(1).PNG`: vendor outreach about learning from photo-analysis outcomes, not a reproducible defect or permission to contact that vendor.
- `IMG_1971.PNG`, `IMG_1968.PNG`, `IMG_1970.PNG`: Textus, Cindy and Orca are editor/agent applications; their open-source licenses do not supply inference credits.
- `IMG_1980.PNG`: FreeLLMAPI. Its README requires upstream provider keys and describes the project as personal experimentation rather than production infrastructure. No advertised aggregate quota was treated as a guaranteed or shared pool of free tokens.

## Subscription recovery

Expired trials continue to sign in and can reach subscription status, purchase verification, Stripe checkout, billing permissions and support. Paid workspace routes still require entitlement. Mobile routes an HTTP 402 to Subscription without clearing the session. Web billing/pricing/support screens are excluded from repeated payment-required redirects. Provider capacity/credential errors are not treated as customer authentication failures.

Company owners and explicitly authorized managers can purchase for their company; employees are not prompted to buy personal plans. Restores still require verified store receipts. No fabricated receipt, entitlement, provider credit or trial extension is granted.

## Existing project prices — approved on 2026-10-31

| Team size | Android product ID | CAD per month |
|---|---|---:|
| 10 | futurejobs_team_10_monthly | 79.00 |
| 35 | futurejobs_team_35_monthly | 199.00 |
| 50 | futurejobs_team_50_monthly | 299.00 |
| 65 | futurejobs_team_65_monthly | 399.00 |
| 80 | futurejobs_team_80_monthly | 499.00 |
| 95 | futurejobs_team_95_monthly | 599.00 |
| 110 | futurejobs_team_110_monthly | 699.00 |

These values are the existing `backend/src/config/billingPlans.ts` catalog. The user approved all seven amounts and Google-converted regional prices. Team 10, 35, 50, 65 and 80 now each have one active monthly base plan. Exact Canadian prices were checked as CAD 79.00, 199.00, 299.00, 399.00 and 499.00. Google initially charms converted Canadian prices to .99; these were overridden before final acceptance. Team 95 and 110 are now also active. The generic save error was traced to South Korea: the converted KRW price exceeded the displayed maximum of KRW 600,000. South Korea is excluded from these two plans; approved Canadian prices remain CAD 599.00 and 699.00. All seven products each show one active base plan in Play Console. Do not claim real purchase acceptance until a signed build using the new Android product IDs is installed from Play.

## Support media implementation

Apply `20261031_support_media.sql` through the normal release migration runner. Attachments are private storage objects linked to support messages. Authentication/ticket ownership is checked before parsing uploads; agents must accept a ticket before attaching a reply. Reads require customer ownership or platform-agent ticket access. Size and MIME validation reuse chat policy. Closed tickets reject new uploads. Media responses are private/no-store; clients do not receive reusable storage URLs.

## Lucy compatible inference

Optional server-side settings:

- `LUCY_LLM_BASE_URL`: trusted OpenAI-compatible `/v1` endpoint. Remote endpoints require HTTPS; local loopback and Railway internal HTTP are supported.
- `LUCY_LLM_MODEL`: an actually hosted model supporting chat completions and function/tool calls.
- `LUCY_LLM_API_KEY`: optional only for an endpoint that genuinely permits keyless local access. Provider credentials stay on the server.
- `LUCY_ALLOW_PAID_FALLBACK=true`: optional explicit opt-in to the existing OpenAI provider on capacity/server errors. Off by default.

Lucy and customer-support suggestions preserve the existing tool receipts and company/role enforcement. Existing OpenAI behavior is retained when no compatible endpoint is configured. No alternate endpoint was configured in production, and no new free credits were created. Transcription and photo analysis still need a provider supporting those capabilities; a text model is not substituted for either.

References checked: https://github.com/tashfeenahmed/freellmapi ; https://github.com/makecindy/cindy ; https://github.com/stablyai/orca ; https://github.com/CatVinci-Studio/Textus ; Expo SDK 55 audio, video and localization documentation.

## Validation and remaining acceptance

Validation: backend TypeScript build and 212 backend tests passed; mobile TypeScript and 34 mobile tests passed; customer web and agent portal builds passed; all 13 portal tests passed; Expo production exports passed for Android and iOS; git diff --check passed. Signed native builds, Play/App Store purchases and restores, production migration/deployment and physical-device playback remain separately verifiable steps. Do not mark them complete from JavaScript exports or mocked provider tests.

## Release follow-up

PR #4 was merged into `fix/tester-release-20261022` as `79fc245b8f4564dee89d46847bc1a6a315e9dba3`. Railway deployment `481dc079-d376-43fa-b1b0-f85e9142a4f3` was triggered with Deploy latest commit. Railway now shows Active and Deployment successful. Deploy logs report all release migrations completed, and the public /api/health endpoint returned healthy after startup. The rollback baseline is `47562984dbae9fb15adcd85b815ff4d18374aebc`.

Expo confirms iOS 1.2.8 build 55 was previously submitted successfully; it predates these fixes. A new production iOS build form is prepared for the merge commit with automatic submission. Expo reports 100% of included build credits used and pay-as-you-go charges for further builds; no new paid build was started. Local EAS CLI is not authenticated, while the browser session is signed in. Existing paused/remaining lists are retained; this exact catalog price approval supersedes only the price-approval pause.

Customer web production deployment `dpl_EprYJCjhCvPyjUWQUHZn2kcE1xbH` is READY for merge commit `79fc245b`, with `futurejobsproai.com` and `www.futurejobsproai.com` assigned. The separate Vercel `future-jobs-pro-ai-z32m` production deployment was blocked by automatic approval review because its production scope was not established; no deployment was created there. Railway includes the portal build in its own deployed image.

2026-10-31 continuation: all seven Play plans confirmed active. Expo lists medium iOS builds at USD 2 and medium Android builds at USD 1; paid build initiation still awaits an explicit spending limit. The separate portal production deployment remains blocked by automatic review pending explicit target confirmation. No new signed builds or receipt acceptance are claimed.
