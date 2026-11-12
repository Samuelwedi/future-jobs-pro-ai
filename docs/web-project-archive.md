# Web project archive and restore

The web Projects page now exposes separate Unarchived projects and Archived
projects views. Status/search filters apply within each view, and cards keep the
original Active, On hold, or Completed status alongside an Archived indicator.
A completed project is not automatically archived.

Archive uses the existing idempotent DELETE /api/projects/:id contract; Restore
uses the existing POST /api/projects/:id/restore contract. Neither action deletes
records, resets completion, changes memberships, moves photos, or adds capacity.
The backend/native archive implementation and migration are unchanged.

Boss, manager, and admin retain write access. Owner, employee, worker, and other
roles can view their company’s permitted project lists/workspaces without seeing
write controls. This is deliberately not the Reports role allowlist. The backend
continues to recheck current company, active user and role inside its transaction.

## Interrupted requests

An archive/restore reply must identify the requested project and intended archive
state. Missing/malformed acknowledgements, 5xx, network errors and timeouts trigger
read-only reconciliation of both project lists. Reconciliation reports *current
state*, never retroactively claims which request committed. An unchanged, missing,
contradictory or unavailable result keeps writes blocked and offers Check current
state. No mutation is automatically replayed or changed to its opposite intent.

Create/edit uses the same scoped transport and synchronous mutation lock. Draft
fields typed after submission are preserved. A confirmed create binds any newer
edits to its returned project ID, so the next Save is an update. Dismissed-dialog
callbacks cannot act on a replacement draft. Refresh keeps existing cards mounted
under a loading indicator instead of collapsing the long-list geometry. An uncertain save keeps the draft in
the current view and blocks repeats. Its persistent guidance and View draft action
survive ordinary error dismissal, refresh, Close and BFCache restoration; the user
must inspect the list and retain any needed draft text before reopening Projects
to save again. This does not add durable/offline draft storage.

Credentials and current user/company/role are captured with the shared auth
revision. Reads, mutation acknowledgements, reconciliation and workspace navigation
are fenced by route visit, auth revision and mount epoch. Old 401/402 responses do
not log out or redirect a newer session/visit. BFCache restoration only refreshes
or reconciles reads, never replays a write. Newer refresh/view results win over old
requests. All state remains local to the authenticated page instance.

## Verification

Source-loaded component tests execute the production page, scoped transport and
auth-generation module with controlled React hooks, JSX and synthetic fetch. They
cover the original missing archive/restore UI, exact roles, empty/search/error
states, duplicate clicks, cancellation, offline state, late/ambiguous replies,
reconciliation, changed identities/company/role, ABA/logout, navigation, delayed
bodies, timeout, BFCache and effect replay. The old page can be selected with
WEB_PROJECTS_SOURCE_ROOT for the original-gap negative control.

These tests are **not browser acceptance**. They do not launch a browser, install
packages, build native apps, access live data/providers, run live migrations,
upload files or deploy. The web page
has no existing localization framework, so this patch retains its existing English
surface rather than inventing a translation mechanism.

### Local commands

```
node --test web/tests/project-archive.test.cjs
WEB_CHAT_INDEXEDDB_MODULE=/tmp/web-chat-test-deps/node_modules/fake-indexeddb NODE_PATH=web/node_modules node --test --test-concurrency=1 web/tests/*.test.cjs
web/node_modules/.bin/tsc --noEmit -p web/tsconfig.json
node --test backend/tests/project-archive.test.cjs
WEB_PROJECTS_SOURCE_ROOT=/path/to/44696fa-page node --test --test-name-pattern='archived view and confirmed restore' web/tests/project-archive.test.cjs
git diff --check
```

The negative control uses the unchanged Projects.tsx from
44696fa622538b171cb7929e8aa449deee631408 and fails because the archive-view control
does not exist. The synthetic IDB path selects the existing dependency explicitly;
no Chromium is launched and the browser-process-restart case remains skipped.
