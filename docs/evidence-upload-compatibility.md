# Evidence upload compatibility

`POST /photos/upload` accepts older installed clients that omit the multipart
`requestKey` field. These uploads retain legacy non-idempotent behavior: each
successful request creates a photo, and retrying may create duplicates. After
an interrupted or failed legacy upload, check saved evidence before retrying.
Legacy requests do not claim receipts and cannot use receipt status lookup.

Clients opt into durable receipts by supplying a stable `requestKey` (16–100
ASCII letters, digits, underscores, periods, colons or hyphens). An explicitly
provided invalid key, including an empty value, returns 400 rather than falling
back to legacy behavior. Keyed requests retain fingerprint conflict detection,
current authorization checks, pending/uncertain retry protection and atomic
photo/receipt completion. The same authentication, tenant/employee/shift
checks, commit-time authorization locks, upload limits and cleanup apply to
both paths.

The production Docker image must copy `backend/assets`, including the licensed
DejaVu font required by timesheet PDFs. `backend/tests/docker-assets.test.cjs`
checks the final-stage copy declaration and renders a PDF from current source
in a staged production directory layout. It is not a full Docker build.

Run the focused regressions from `backend`:

    npm run type-check
    npm run build
    node --test --test-concurrency=1 tests/photo-upload.test.cjs tests/evidence-receipts.test.cjs tests/evidence-upload-stream.test.cjs tests/timesheet-export.test.cjs tests/docker-assets.test.cjs
