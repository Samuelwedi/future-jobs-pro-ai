# Future Jobs Pro AI 1.2.1 — coordinated closed-test release

This is a complete source replacement for the supplied RC4 snapshot. Extract into a NEW folder; do not overlay an old release or copy its compiled output. The version in backend, web, mobile and Expo is 1.2.1. Android local versionCode is 3 and iOS local buildNumber is 48; EAS remote counters are authoritative and auto-increment. Never reset a remote counter below any store-uploaded build.

## Included fixes

- Google Play server verification against subscriptionsv2, account-bound purchases, encrypted purchase tokens, acknowledgement, authenticated renewal/refund notifications, cancellation/expiry handling and cross-company replay rejection.
- Apple signed transactions plus current App Store Server API status checks. Old receipts cannot reinstate refunded/revoked subscriptions. Sandbox access is limited to explicit test-company IDs. Delayed notifications cannot replace a subscription from another provider.
- Store purchase buttons require configured billing, an owner/admin role and an actual store product. Prices come from the store, with restore and manage-subscription controls and policy links.
- New capped Team 10–110 catalog and database-enforced active-account limits. Fresh launch: only Team 10–110 plans are offered for purchase. Historical product identifiers remain readable for test-purchase restore only; no paid-subscriber migration is required. Downgrades block additions above the new limit; they do not delete staff.
- Password visibility, Worker Tools calculator pages, slab/slope and calculator console changes from the supplied source are retained.
- Same-origin web/API Docker deployment, release version correction, production backup/migration ledger and serial tests. Android Kotlin version now follows Expo/React Native instead of the old 2.0.21 override.
- Patched dependency locks. Direct-deposit mutations and adapter registration are disabled. Company-reviewed payroll is paid externally and recorded manually.

## Start from PowerShell

Run from the extracted folder (the script also resolves its own root):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Release-1.2.1.ps1 -Stage Validate
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Release-1.2.1.ps1 -Stage Check
```

Requires Node 24 (or the existing portable runtime), npm, authenticated Railway CLI and Docker Desktop for backups. Credentials stay in Railway/EAS/your store accounts. Check displays only missing-setting names; it does not prove that provider keys have correct account permissions.

## Configure the accounts once

**Railway:** target project pure-nature / production / future-jobs-pro-ai. Set service Root Directory to repository root and use the root Dockerfile. Remove old backend-only build/start overrides. Preserve DATABASE_URL, JWT_SECRET and ENCRYPTION_KEY; do not rotate encryption keys during this release. Configure REDIS_URL from a Railway Redis service, FRONTEND_URL=https://future-jobs-pro-ai-production.up.railway.app, NODE_ENV=production, SMTP, Cloudinary and OpenAI credentials. Keep PAYOUT_LOCAL_SANDBOX unset. The new source archive deliberately contains no .env or private credentials.

**Stripe:** `CatalogPreview` shows the proposed catalog. `CatalogCreate` creates separate live monthly CAD prices only; it writes non-secret `billing-price-mappings.txt`. Add those mappings to the app service in Railway. There are no existing paying subscribers. Legacy STRIPE_PRICE_BASIC_MONTHLY / PRO / ENTERPRISE variables are not required for this launch. Offer only the seven Team plans; disable old plans for new purchases in the provider dashboards after confirming the new catalog. Configure the existing signed Stripe subscription webhook at `/api/stripe/webhook` and its STRIPE_WEBHOOK_SECRET. Enable only the intended new plans in the Stripe billing portal. New pricing does not guarantee profitability; monitor actual AI, media, payment and infrastructure costs.

| Active accounts, including owners | CAD monthly web price | Apple / Google product ID |
|---:|---:|---|
| 10 | 79 | com.samuel33.futurejobspro.team_10_monthly |
| 35 | 199 | com.samuel33.futurejobspro.team_35_monthly |
| 50 | 299 | com.samuel33.futurejobspro.team_50_monthly |
| 65 | 399 | com.samuel33.futurejobspro.team_65_monthly |
| 80 | 499 | com.samuel33.futurejobspro.team_80_monthly |
| 95 | 599 | com.samuel33.futurejobspro.team_95_monthly |
| 110 | 699 | com.samuel33.futurejobspro.team_110_monthly |

Create/activate these monthly subscriptions in both stores. Put Apple products in one subscription group; configure monthly auto-renewing base plans on Google. Review each storefront's permitted price points, currency conversions and taxes; the mobile app displays the actual localized price. The code does not create store products. Do not promote old Basic/Professional/Enterprise products. Historical identifiers remain recognized to avoid breaking old tester restore records. Keep the tester company in the explicit Apple and Google sandbox allowlists; this does not grant free access to other companies.

**Google Play:** enable Android Publisher API and grant the backend service account appropriate subscription/order permissions for com.samuel33.futurejobspro. Put its JSON in GOOGLE_PLAY_SERVICE_ACCOUNT_JSON in Railway. Configure real-time developer notifications in Play Console to Pub/Sub. Use an authenticated push subscription to `https://future-jobs-pro-ai-production.up.railway.app/api/subscriptions/google/notifications`; set GOOGLE_PLAY_RTDN_AUDIENCE to that exact URL and GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT to the push identity's email. Configure Google's Pub/Sub token-creation permissions. Use license testers, GOOGLE_PLAY_ALLOW_TEST_PURCHASES=true and GOOGLE_PLAY_TEST_COMPANY_IDS with only the test companies' UUIDs for billing tests. Do not put credentials in EXPO_PUBLIC_* variables.

**Apple:** set APPLE_APP_ID to the numeric App Store Connect app ID, APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID and APPLE_IAP_PRIVATE_KEY to an authorized App Store Server API key. Add Apple's official G2/G3 root certificate DER contents as base64 in APPLE_ROOT_CA_G2_BASE64 / APPLE_ROOT_CA_G3_BASE64. Configure App Store Server Notifications V2 to `/api/subscriptions/apple/notifications` for production and sandbox. For TestFlight purchase tests, set APPLE_IAP_ALLOW_SANDBOX=true and APPLE_IAP_SANDBOX_COMPANY_IDS to explicit tester-company UUIDs. Keep online certificate checks enabled. Do not share keys in chat.

**Expo:** use the existing Samuel33 project bcc71783-5078-4ef3-8760-56b83cc4508f and the existing app signing identities. Configure EAS submit credentials for Play and Apple. Confirm EAS production EXPO_PUBLIC_API_URL is the production origin plus `/api`, never localhost. The committed fallback already uses production. Confirm remote version counters against the highest uploaded store builds before BuildMobile. app version 1.0.2 is a display version, not Android's integer versionCode.

## Ordered release commands

Run each stage with `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Release-1.2.1.ps1 -Stage STAGE`.

1. Validate — locked installs, 102 tests, web build, mobile typecheck, Android/iOS JavaScript exports; records a source fingerprint.
2. CatalogPreview, then CatalogCreate — create separate new Stripe prices; apply generated mappings and finish the store configuration above.
3. Check — all required configuration present, secrets hidden.
4. Backup — full fresh production PostgreSQL 18 custom archive, checksum and archive-list verification. Keep it private. This is not a restore rehearsal.
5. DryRun — all 20 ordered SQL migrations inside a rolled-back transaction; must pass on the actual production schema.
6. Migrate — repeats the dry run, requires matching backup under 24 hours old, then commits. Records migration hashes and checks company/user counts. Do not run the old blanket JavaScript migration scripts.
7. DeployWeb — requires the migration ledger and validated source fingerprint, deploys the root Dockerfile, then checks live version 1.2.1. It does not change the GitHub branch. Archive/commit this exact release to your repository before re-enabling Git-triggered deployments of another branch.
8. BuildMobile — starts signed EAS Android and iOS production-profile builds. Native compilation/signing must finish successfully. JavaScript export is not a substitute for these builds.
9. SubmitAndroid -BuildId BUILD_UUID — uploads the selected Android build to the existing alpha closed track as a draft. Confirm this is your existing closed-test track before submission; edit eas.json if it has another ID. Complete review and roll out to your existing tester group in Play Console.
10. SubmitIos -BuildId BUILD_UUID — uploads the selected iOS build to App Store Connect/TestFlight. Assign testers and complete any required beta review. This does not publish to the public App Store automatically.

Do not run all stages blindly in one paste: account configuration and signed build results must be checked between the groups. The runner uses fixed project/service selection and stops on failed commands. Its PowerShell execution still needs verification on your Windows machine; development validation here ran on Linux.

## Before inviting testers

On installed store builds, verify login, registration and account recovery email; password toggles; Worker Tools list-to-calculator navigation and slab/slope results; clock-in/out, camera uploads and location permission behavior; subscription purchase/restore, cancellation, refund and renewal notifications with test purchases; and that employees cannot administer billing. Verify a second company cannot see the first company's records. Keep test transactions restricted to test workspaces.

The test harness uses embedded PostgreSQL and mocked store API boundaries. It does not demonstrate real Apple/Google payment settlement, store permission setup, real-device GPS, a Docker image build, or compatibility with your current production data. Those remaining checks require the stages and devices above.

Google's additional closed-testing period still applies. Keep the required opted-in testers engaged for the period shown in your console; uploading a new build alone does not satisfy it. Direct deposit remains disabled in this release. Use the manual-payroll workflow documented below.

Official references: https://docs.expo.dev/eas/cli/ · https://docs.expo.dev/submit/android/ · https://docs.expo.dev/submit/ios/ · https://docs.railway.com/cli/up · https://developer.android.com/google/play/billing/lifecycle/subscriptions · https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions

## Editable payroll rules

Company rule editing is available on web and mobile, with immutable revisions and calculation snapshots. The web manual-payroll workflow calculates, records independent review and records employer-confirmed external payments. Read [Payroll rules and manual payments](release-docs/PAYROLL-RULES-AND-MANUAL-PAYMENTS.md) before enabling it. Only the limited Alberta/CAD regular-wage 2026 engine is implemented; worldwide verification is not complete. Custom settings do not establish statutory compliance.

## Worldwide company-configured mode

[Worldwide payroll guide](release-docs/WORLDWIDE-COMPANY-PAYROLL.md): editable formulas and reviewed manual inputs for 249 country/territory codes, with currency precision from the current SIX ISO list. This adds worldwide configuration and recordkeeping, not verified statutory engines for every country. Read the calculation, reporting and currency limitations before use.

## Fresh-launch pricing update — September 30, 2026

The owner confirms there are no paying subscribers. Launch all seven Team tiers at the CAD monthly amounts above; Apple/Google storefront amounts must be configured using their available price points and checked against the purchase screen. No grandfathering or paid-customer migration is needed. The source catalog is configured; Stripe, Apple and Google account changes are not claimed as completed.

Run CatalogPreview, then CatalogCreate. Import the seven separate lines from billing-price-mappings.txt into Railway. The mapping writer now uses real newline characters. Configure the same product IDs in both stores and perform sandbox purchase/restore tests with the owner’s allowlisted company before release. This update does not delete test accounts, waive receipt verification or enable bank payments.

## Permanent owner tester access

Authorized tester: `samuel@test.com` (email matching is case-insensitive). After installing backend dependencies, run from the release root:

```powershell
railway run --service Postgres --environment production node .\backend\scripts\resolve-tester-access.cjs
```

This read-only command resolves one existing active owner/admin and prints `COMPLIMENTARY_TESTER_IDENTITY=userUUID:companyUUID`. Set that exact variable on the **future-jobs-pro-ai application service**, then deploy. If the account is missing or ambiguous, it stops; it never creates or guesses an account. Do not use a local database identity for production.

Only that authenticated user in that company has non-expiring free subscription-gate access. Subscription status reports complimentary active access; mobile purchase capability is disabled for that identity. Ordinary authorization, company isolation, operational usage limits, and provider configuration still apply. This is not unlimited AI/storage, store sandbox configuration, payroll certification or free third-party services. Other employees do not inherit free access. Removing the variable revokes the complimentary entitlement. No production entitlement is activated by downloading this archive.
