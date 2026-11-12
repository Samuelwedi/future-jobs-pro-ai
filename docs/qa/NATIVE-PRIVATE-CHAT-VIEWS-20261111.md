# Native private chat view state

## Scope and history

Base: `29b48c32c54746e5ee2b50e60e8ea923c7bd4dbb`. Inspected native inbox (`cb7f77b`/`5678eac`), history (`8aaa1d6`/`0d55392`), reconnect and foreground text outbox histories. No earlier native private viewed-state implementation was found. This is additive work, preserving history cursor recovery, socket precedence, foreground text receipts and media handling.

Read `mobile/AGENTS.md`, Expo SDK55 reference and Network documentation, React Native0.83 FlatList and AppState documentation before implementation. No SDK, package, native camera or dependency changes.

## Private contract

Uses the backend contract in `docs/private-chat-views.md`: `GET /chat/views` with expected actor/company, opted-in history `views=1`, and `POST /chat/room/:roomId/views` with immutable membership instance plus exact message IDs/view versions. The full acknowledgement scope and exact unique ID/version batch must match before refreshing counts. Ordinary direct/group conversations only. Own messages never qualify. No timestamp watermark, sender-visible read/device-delivery status, fabricated history backfill, persisted view queue, or background retries.

EN/ES/FR copy distinguishes messages *not marked read*, unknown counts, explicit capped99+ versus exact99, and the fact that prior views were never recorded. Inbox refreshes on focus and manual pull-to-refresh. Both inbox and room count responses are fenced against auth/scope/request changes and newer acknowledgements. Every completed view attempt invalidates/refetches active counts, including ignored or uncertain responses that might already have committed.

## Conservative native visibility

A FlatList callback reporting100% item visibility after layout is necessary, but insufficient. While foreground/route/session/company/role remain current, the hook samples native `measureInWindow` bounds for those rows every200ms. The entire bubble must fit inside the clipped chat viewport continuously for at least1000ms measured by monotonic `performance.now()`. Missing, throwing, nonfinite, negative or backward clock readings clear dwell and require renewed visibility; wall-clock changes never qualify. Scroll, viewport/content layout changes, background/inactive state, Android notification-drawer blur, modal/chooser coverage and network loss reset dwell. Oversized messages never automatically become marked read in this first slice. This is intentional: displaying part of a long bubble does not prove its full visibility.

Returning online, closing a modal or foregrounding clears cached visibility and requires a new native viewability observation. Invisible offline rows never replay. At most one request is in flight, bounded to100 versions. Failure is unknown and requires renewed visibility. A stale version removes only the rejected ID/version pairs before requesting current history, preserving newer socket replacements and unrelated loaded history. New membership context clears prior loaded room content and history anchors/cursors; context changes discovered while paging restart from latest history. The last known membership survives stale acknowledgements so a rejoin is still detected. Explicit access denial clears inaccessible room/history/outbox presentation and stops further view acknowledgements; generic transient history failures preserve history.

Native picker/media-viewer coverage has independent source keys, so dismissing one viewer cannot unpause a different modal or picker. Private history metadata and access failures run only after accepted generation/revision/row checks. History page and room-detail predicates also reach actual transport dispatch and401/402 interception, so obsolete requests cannot sign out or redirect the current screen. Background bookkeeping uses existing token/revision/owner/role dispatch fences and a quiet transport, without opening billing or signing out a replacement account on stale401 responses.

## Verification and limits

Production-source tests execute the native view controller, geometry checks, hook callbacks, scoped HTTP transport, inbox and existing history/media/outbox lifecycles with deterministic native stubs. The contract test loads the production backend parser without SQL or network; standalone client testing sets `CHAT_VIEWS_BACKEND_ROOT` to the backend worker checkout. On integration it defaults to this repository's backend.

These are source-level checks, not a device test or proof of rendering/occlusion behavior on iOS/Android. Required device acceptance remains: initial layout and automatic scroll, quick scroll away, keyboard resize, orientation/accessibility font sizes, long oversized bubbles, modal close animations, notification drawer, app switch, offline revisit, old-history browsing during socket arrival, and auth/logout/company changes. No native build, device run, live database, real message, upload, provider, install or deployment was performed.

Author gates after review fixes:629/629 mobile production-source tests passed, TypeScript noEmit passed, and `git diff --check` passed. Backend parser fixture was pinned to the reviewed private-chat-views checkout at `7c1a573215a03b01d0a8357eb47406423c25e457`. Independent reviewer probes remain separate from the production-source suite.
