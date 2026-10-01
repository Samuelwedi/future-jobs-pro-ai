# Future Jobs Pro AI 1.2.0-rc.4 — product and sales guide

## Positioning

**Tagline:** Your workforce. Your projects. Your next move.

**30-second pitch:** Future Jobs Pro AI gives field-service companies one workspace for people, schedules, time, projects, job evidence, expenses, payroll preparation, invoice drafts, and operational follow-up. Managers can start in Command Center, ask Lucy for company-scoped answers, and move supported work through explicit review and approval instead of re-entering the same information across disconnected tools.

Best-fit prospects are growing construction, cleaning, installation, maintenance, property service, and other field-work companies that coordinate people across multiple jobs. Validate every prospect's regulatory and provider requirements before promising fit.

## Business outcomes to demonstrate

- A manager sees active work, exceptions, tasks, PTO, expenses, and pay-period attention in one place.
- Approved field records flow into timesheet exports, payroll drafts, Payout Center preparation, project cost visibility, and labor invoice drafts.
- Workers use schedules, tasks, availability, shift cover, clocking, evidence, expenses, chat, and mobile workflows.
- Lucy retrieves tenant-scoped facts and prepares supported actions with receipts, explicit confirmation, permissions, idempotency, and audit history.
- Owners can measure observed task time saved instead of relying on invented ROI claims.

## Capability catalog

| Product area | Customer-facing capability | Sales boundary |
| --- | --- | --- |
| Command Center | Workforce snapshot, attention queues, pay-period summary, navigation palette, Lucy panel | Snapshot, not real-time autonomous dispatch |
| Lucy assistant | Briefings, time/payroll summaries, spreadsheet export, payroll-draft proposal, company knowledge, profitability, invoice preview, structured receipts | Supported tools only; model answers need review; no money movement |
| Time and attendance | Clocking, crew clock, kiosk, timesheets, corrections, approvals, reports | Device and policy evidence, not guaranteed legal compliance |
| Scheduling | Shifts, assignments, recurring scheduling, tasks, skills/availability matching, cover consent and approval | Per-shift rules, not global AI optimization |
| GPS and evidence | Active-shift location, crew map, GPS playback, project media, voice notes, evidence bundles | Device-reported accuracy; no off-duty tracking guarantee |
| Expenses | Claims, receipt attachments, review, duplicate checks, optional AI field extraction | Human verification required; no reimbursement payout |
| Payroll | Pay-calendar resolution, exception review, export, idempotent draft preparation, pay-stub/year-end surfaces | Draft only; no certified tax filing or automatic payment claim |
| Payout Center | Future Jobs-branded, in-app company settings, destination readiness, certified-payroll batch preparation, dual approval, exact execution confirmation, and event history | Foundation only: no live adapter or money movement by default; a licensed rail and certified country-specific payroll engine are required |
| Projects and finance | Projects, estimates, invoices, labor drafts, profitability and cost-to-complete | Forecast uses entered progress; invoice remains a reviewed draft |
| Operations | Knowledge, report schedules, CSV invitations, usage limits, value observations, project globe, scoped undo/history | Providers and some legacy paths need staging validation |
| Communications | Individual/group chat, notifications, support tickets, employee portal | Delivery depends on configured services/connectivity |
| Integrations | QuickBooks OAuth/sync, Stripe and app-store subscription code, storage, email, AI providers | Each account must pass sandbox acceptance |
| Mobile | Android/iOS Expo 55 source, offline queue safeguards, background location, audio/video, Lucy wake integration | Signed store builds and physical-device acceptance are separate |

## Differentiators

1. **Field-to-office continuity:** the same company records support scheduling, evidence, approvals, payroll preparation, cost visibility, and invoice drafts.
2. **Guarded assistance:** Lucy cannot silently execute unrestricted financial actions; sensitive workflows require roles, explicit confirmation, freshness checks, and idempotency.
3. **Operational evidence:** GPS, media, notes, receipts, action receipts, and approvals keep context beside the work.
4. **Transparent automation:** unavailable data and provider failures are shown rather than converted into misleading zeros or fabricated results.
5. **Tenant and entitlement controls:** protected APIs, PDFs, sockets, kiosks, and manager actions enforce company context and fail closed.

## Ten-minute demo

1. Ask how the prospect collects hours, handles missing receipts, fills schedule gaps, and prepares payroll/invoices.
2. Open Command Center in an isolated demo company; explain snapshot time and attention queues.
3. Show a schedule gap, candidate ranking, worker cover consent, and manager approval.
4. Ask Lucy for the pay-period summary; download the spreadsheet and show exceptions.
5. Prepare and explicitly confirm one payroll draft; state clearly that no money or tax filing occurred.
6. Open Payout Center and show the fail-closed capability status, maker-checker design, exact confirmation, and audit history. Do not simulate or claim a transfer unless a licensed adapter sandbox is actually connected.
7. Submit an expense and demonstrate receipt extraction only with a sandbox provider; verify fields manually.
8. Show project profitability, invoice preview/draft, company knowledge search with cited source text, and action history/undo.
9. Show GPS/evidence with synthetic device data, then agree on a controlled pilot and success measures.

Never use production customer data or payment accounts in a demo. Label synthetic data and screenshots.

## Discovery and pilot design

Ask about employee count, manager roles, sites, payroll calendar/timezone, approval rules, connectivity, supported phones, accounting/payment providers, data retention, location consent, union/overtime requirements, and who owns onboarding/support.

Recommended pilot: one company, one representative crew, one complete pay period, sandbox providers, named owner and manager, documented backup/rollback, and written success criteria. Measure missing punches, approval time, schedule coverage time, receipt completeness, invoice-preparation time, support tickets, adoption, provider usage, and observed task time. Do not promise a percentage saving before measurement.

## Common questions

**Can Lucy run the business automatically?** No. Lucy retrieves authorized company information and performs only registered, guarded actions. Unsupported or sensitive work remains a human decision.

**Can customers pay employees without leaving the app?** The Payout Center now provides the branded in-app workflow for preparation, a second-manager approval, exact execution confirmation, and status review. Sensitive bank-destination setup must still use an allowlisted provider-hosted tokenization experience so raw banking coordinates never enter a Future Jobs form. This build does not move money: no live bank/payment adapter, provider callback, reconciliation, or return workflow is enabled. A licensed regulated rail must operate behind the app, and each employer/country/currency corridor must be onboarded and certified.

**Does it calculate certified payroll or file taxes?** No. A payout batch will accept only payroll carrying explicit immutable calculation provenance, but this release does not supply the certified country-specific payroll engine that creates that provenance. Tax calculation, filing, remittance, and legal compliance require separately validated systems and professionals.

**Does it work offline?** Selected mobile actions can queue per signed-in account. AI, live queries, financial approvals, and uploads require connectivity; failure/retry behavior must be device-tested.

**Is it on iPhone and Android?** RC3 includes Expo 55 Android/iOS source and validated bundles. Signed builds, store review, and distribution require the authorized EAS/store accounts.

**How many users can it handle?** No broad capacity claim is approved. Set plan allowances and prove intended concurrency with hosted load/soak tests.

**Is it compliant or certified?** RC3 includes access-control and workflow protections, not a legal, payroll, security, privacy, accessibility, or uptime certification.

## Sales-claim guardrails

Use “helps,” “prepares,” “records,” and “supports.” Describe Payout Center as an in-app, fail-closed foundation—not as live direct deposit, a bank, a money transmitter, or universal country coverage. Do not claim guaranteed savings, autonomous scheduling, exact continuous location, unlimited AI/storage, tax accuracy, certified payroll, universal undo, 100,000-user capacity, or production readiness until matching acceptance evidence exists. Price proposals must state seats, AI/storage allowances, regulated-provider fees, corridor availability, support scope, and pilot assumptions.

## Release status

RC3 remains an isolated staging candidate until Windows installation, physical devices, real provider sandboxes, load/concurrency, security/accessibility, backup restore, monitoring, and deployment/rollback acceptance are signed off. Payout execution has additional blockers: a live adapter, callback/token ingestion, signed status updates, durable outbox, reconciliation, returns/reversals, employee self-service, MFA/recent-auth, daily velocity controls, regulated-rail approval, and certified payroll engines. Use the release guide, payout runbook, and verification report alongside this document.
