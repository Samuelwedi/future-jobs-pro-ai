# Production web-gallery privacy hotfix

Base: 4b5269c00e2baed3dbd4f6d24ca0043fe5a8b937, verified Vercel custom-domain production. This is not the newer e3c311e preview/Railway release.

Scope: gallery request/render/selection/audio/download lifetime fencing; synchronous auth generation and all six existing credential writers (Login, Register, Settings, Layout, PaymentRequired, API service). Preserve existing production routing, timestamp/checksum labels, API contracts and billing behavior; ignore stale auth responses rather than clearing a replacement login. No backend, database, dependencies, deployment settings or native changes. No unpublished provenance, reports-route change, or other recovered features.

Validation on the candidate runtime:
- 138/138 nonbrowser web tests passed serially with outbound network disabled, including 15 new auth generation/API regressions and existing lifecycle/auth-writer tests.
- `node web/node_modules/typescript/bin/tsc --noEmit -p web/tsconfig.json`: passed.
- Local `VITE_API_URL=https://future-jobs-pro-ai-production.up.railway.app npm run build --prefix web`: passed; existing production public API origin, not a credential.
- `git diff --check`: passed.
- Independent security/source compatibility review requested separately.

Limitations: synthetic source/DOM/audio tests do not establish actual browser/device acceptance. No browser restriction bypass. No real account/media records used. No deployment, native build, store submission or full tester-list completion claimed.

Proposed release: publish only this isolated commit, then create a Vercel production deployment for existing Vite project future-jobs-pro-ai, team future-jobs-pro-ai, pinned to its SHA using production configuration. Do not promote e3c311e preview; do not move Railway source or unrelated Vercel projects. Exact publication/deployment requires separate approval. Rollback target is the currently serving deployment dpl_GTncK6MzhF4gwrJApXkVL9dbKmDs (4b5269c). Confirm current state again immediately before action.
