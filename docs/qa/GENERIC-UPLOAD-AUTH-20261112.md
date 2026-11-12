# Generic attachment upload authorization

Base: published d1d077e. This is a new narrow reconciliation, not an assertion that a missing historical patch was recovered.

## Scope

Authenticate an active database actor before invoking the existing multipart parser. Revalidate the same actor/company after parsing and after the provider await. Synchronously verify the token again in each caller continuation immediately before admission, provider invocation, and URL response. Existing successful response fields and all active company users' attachment access remain unchanged. No role, project membership, subscription or pricing policy is introduced.

An independent real Express/Multer fixture reproduced an expiry microtask between the awaited authorization helper and URL serialization (200 instead of 403). Caller-boundary checks correct that gap. Missing/expired/inactive callers receive 401 before malformed multipart parsing; mid-operation scope loss receives 403 without a URL. Provider upload may already have completed when access is lost. This route neither retries nor deletes an uncertain provider outcome.

## Verification

Source-loaded middleware regressions and actual Express/Multer loopback multipart tests use only synthetic identities/files and mocked database/provider operations. Outbound network transport is denied except literal loopback by the real-route fixture. The failing original regression log and corrected test log are preserved in the private checkpoint. Final independent review/typecheck are recorded in the sealed package, not implied by this draft document.

## Limits

JWT token validity/expiry and current database actor/company are checked. This does not add server-side logout-token revocation. Existing authenticated 50 MiB in-memory parsing and base64 provider encoding remain; this is not a resource-bound streaming redesign. No live messages, production records, Cloudinary requests, native builds or deployments were used. Focused checks do not establish whole-repository release readiness.

## Legacy activation compatibility follow-up

Before publication, release assessment found that the initial strict `is_active = TRUE` predicate would reject legacy NULL-active accounts accepted by existing login/current-account/password flows. The predicate now uses the same `COALESCE(is_active, TRUE) = TRUE` policy: explicit false remains denied; NULL does not invent a new access restriction. New source-loaded and actual multipart regressions cover NULL success and explicit deactivation during provider completion. Final independent proof is recorded in the follow-up package. No account row or production data is changed.
