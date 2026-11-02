const { test, before, after } = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
process.env.JWT_SECRET = "isolated-evidence-fixture";
process.env.CLOUDINARY_CLOUD_NAME = "fixture-cloud";
const { PGlite } = require("@electric-sql/pglite"),
  express = require("express"),
  jwt = require("jsonwebtoken"),
  { pool } = require("../dist/config/database");
const {
  evidenceMediaUrl,
  downloadEvidenceMedia,
  evidenceFilename,
} = require("../dist/services/evidenceDownload");
const db = new PGlite(),
  uid = (n) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`,
  realFetch = global.fetch,
  mediaCalls = [];
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jMZkAAAAASUVORK5CYII=",
  "base64",
);
const query = async (sql, args) => {
  const r = await db.query(sql, args);
  return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
};
let server, base;
async function request(route, b, user = 12) {
  const r = await realFetch(base + route, {
    method: b ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(user
        ? {
            Authorization:
              "Bearer " +
              jwt.sign(
                { id: uid(user), companyId: uid(999) },
                process.env.JWT_SECRET,
              ),
          }
        : {}),
    },
    ...(b ? { body: JSON.stringify(b) } : {}),
  });
  const type = r.headers.get("content-type") || "";
  return {
    status: r.status,
    headers: r.headers,
    data: type.includes("application/json")
      ? await r.json()
      : Buffer.from(await r.arrayBuffer()),
  };
}
const selection = {
  photoIds: [uid(41)],
  voiceNoteIds: [],
  attachmentIds: [uid(51)],
  includeTimeEntryPdf: true,
  includeGpsVideo: false,
  includeVoiceVideos: false,
};
function unzip(bytes) {
  const files = {};
  let p = 0;
  while (bytes.readUInt32LE(p) === 0x04034b50) {
    const size = bytes.readUInt32LE(p + 18),
      n = bytes.readUInt16LE(p + 26),
      extra = bytes.readUInt16LE(p + 28),
      name = bytes.subarray(p + 30, p + 30 + n).toString(),
      start = p + 30 + n + extra;
    files[name] = bytes.subarray(start, start + size);
    p = start + size;
  }
  return files;
}
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
before(async () => {
  await db.exec(
    `CREATE TABLE companies(id uuid PRIMARY KEY,name text);CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,is_active boolean,first_name text,last_name text);CREATE TABLE projects(id uuid PRIMARY KEY,company_id uuid,name text,address text);CREATE TABLE time_entries(id uuid PRIMARY KEY,user_id uuid,project_id uuid,clock_in timestamptz,clock_out timestamptz,regular_hours numeric,overtime_hours numeric,total_wage numeric,approval_status text,extra_private text);CREATE TABLE photos(id uuid PRIMARY KEY,time_entry_id uuid,company_id uuid,s3_key text,file_type text,taken_at timestamptz,verification_hash text);CREATE TABLE voice_notes(id uuid PRIMARY KEY,time_entry_id uuid,company_id uuid,user_id uuid,project_id uuid,audio_url text,transcript text,client_summary text,duration_seconds numeric,taken_at timestamptz);CREATE TABLE attachments(id uuid PRIMARY KEY,time_entry_id uuid,company_id uuid,file_name text,file_url text,file_type text,file_size int,created_at timestamptz);CREATE TABLE gps_tracking(time_entry_id uuid,latitude numeric,longitude numeric,timestamp timestamptz,accuracy numeric,speed numeric);`,
  );
  for (const n of [1, 2])
    await query("INSERT INTO companies VALUES($1,$2)", [
      uid(n),
      "Company " + n,
    ]);
  for (const [n, c, role, active] of [
    [11, 1, "employee", true],
    [12, 1, "owner", true],
    [13, 1, "manager", true],
    [14, 2, "owner", true],
    [15, 1, "owner", false],
  ])
    await query("INSERT INTO users VALUES($1,$2,$3,$4,'Fixture','Employee')", [
      uid(n),
      uid(c),
      role,
      active,
    ]);
  for (const [n, c, name] of [
    [21, 1, "Current project"],
    [22, 2, "FOREIGN PROJECT SECRET"],
  ])
    await query("INSERT INTO projects VALUES($1,$2,$3,'Fixture site')", [
      uid(n),
      uid(c),
      name,
    ]);
  for (const [n, u, p] of [
    [31, 11, 21],
    [32, 14, 22],
    [33, 11, 22],
  ])
    await query(
      "INSERT INTO time_entries VALUES($1,$2,$3,'2026-11-01T10:00:00Z','2026-11-01T11:00:00Z',1,0,10,'approved','PRIVATE_UNUSED_COLUMN')",
      [uid(n), uid(u), uid(p)],
    );
  for (const [n, c] of [
    [41, 1],
    [42, 2],
  ])
    await query(
      "INSERT INTO photos VALUES($1,$2,$3,'https://res.cloudinary.com/fixture-cloud/image/upload/v1/photo.png','photo',NOW(),'source-hash')",
      [uid(n), uid(31), uid(c)],
    );
  await query(
    "INSERT INTO attachments VALUES($1,$2,$3,'../../escape.txt','https://res.cloudinary.com/fixture-cloud/raw/upload/v1/original.txt','text/plain',4,NOW())",
    [uid(51), uid(31), uid(1)],
  );
  await query(
    "INSERT INTO gps_tracking VALUES($1,51.01,-114.01,'2026-11-01T10:00:00Z',5,0)",
    [uid(31)],
  );
  global.fetch = async (url, options) => {
    mediaCalls.push({ url: String(url), options });
    if (String(url).endsWith("photo.png"))
      return new Response(png, { headers: { "content-type": "image/png" } });
    return new Response("text", { headers: { "content-type": "text/plain" } });
  };
  pool.query = query;
  pool.connect = async () => ({ query, release() {} });
  const app = express();
  app.use(express.json());
  app.use("/evidence", require("../dist/routes/evidenceBundleRoutes").default);
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  global.fetch = realFetch;
  if (server) await new Promise((r) => server.close(r));
  await db.close();
  await pool.end();
});
test("every evidence endpoint requires current active company manager membership, including owner access", async () => {
  for (const [path, body] of [
    ["/recent", null],
    ["/time-entry/" + uid(31), null],
    ["/time-entry/" + uid(31) + "/time-entry-pdf", null],
    ["/time-entry/" + uid(31) + "/gps-video", null],
    ["/voice-note/" + uid(91) + "/caption-video", null],
    ["/photos/" + uid(41) + "/content", null],
    ["/time-entry/" + uid(31) + "/download", selection],
  ])
    for (const [user, status] of [
      [11, 403],
      [15, 401],
      [null, 401],
    ])
      assert.equal(
        (await request("/evidence" + path, body, user)).status,
        status,
      );
  for (const user of [12, 13])
    assert.equal((await request("/evidence/recent", null, user)).status, 200);
  assert.equal(mediaCalls.length, 0);
});
test("list/details scope counts and project labels without exposing unrelated entry columns", async () => {
  let r = await request("/evidence/recent?limit=1&offset=1");
  assert.equal(r.status, 200);
  assert.equal(r.data.entries.length, 1);
  assert.equal(r.data.actorId, uid(12));
  assert.equal(r.data.companyId, uid(1));
  r = await request("/evidence/time-entry/" + uid(31));
  assert.equal(r.data.photos.length, 1);
  assert.ok(!JSON.stringify(r.data).includes("PRIVATE_UNUSED_COLUMN"));
  r = await request("/evidence/time-entry/" + uid(33));
  assert.equal(r.data.entry.project_name, null);
  assert.ok(!JSON.stringify(r.data).includes("FOREIGN PROJECT SECRET"));
  assert.equal(
    (await request("/evidence/time-entry/" + uid(31), null, 14)).status,
    404,
  );
  assert.equal((await request("/evidence/recent?offset=-1")).status, 400);
  assert.equal((await request("/evidence/time-entry/invalid")).status, 400);
});
test("source selection rejects foreign/stale/malformed references instead of silently omitting them", async () => {
  for (const [extra, status] of [
    [{ photoIds: [uid(42)] }, 409],
    [{ photoIds: "all" }, 400],
    [{ photoIds: ["bad-id"] }, 400],
    [{ includeGpsVideo: "false" }, 400],
  ])
    assert.equal(
      (
        await request("/evidence/time-entry/" + uid(31) + "/download", {
          ...selection,
          ...extra,
        })
      ).status,
      status,
    );
  assert.equal(mediaCalls.length, 0);
});
test("real ZIP includes chosen originals, safe names, time PDF, GPS and independently checkable artifact hashes", async () => {
  const r = await request(
    "/evidence/time-entry/" + uid(31) + "/download",
    selection,
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.subarray(0, 4).toString("hex"), "504b0304");
  assert.equal(r.headers.get("x-evidence-zip-sha256"), sha(r.data));
  const files = unzip(r.data),
    manifest = JSON.parse(files["manifest.json"]),
    index = JSON.parse(files["artifact-index.json"]),
    seal = JSON.parse(files["package-seal.json"]);
  assert.equal(manifest.photos.length, 1);
  assert.equal(manifest.gps.length, 1);
  assert.ok(
    Object.keys(files).some(
      (k) =>
        k.startsWith("generated/time-entry-") &&
        files[k].subarray(0, 5).toString() === "%PDF-",
    ),
  );
  assert.ok(
    Object.keys(files).every(
      (k) => !k.split("/").includes("..") && !k.startsWith("/"),
    ),
  );
  for (const artifact of index.artifacts)
    assert.equal(sha(files[artifact.name]), artifact.sha256);
  assert.equal(seal.artifactIndexHash, sha(files["artifact-index.json"]));
  assert.equal(r.headers.get("x-evidence-sha256"), manifest.verificationHash);
  for (const call of mediaCalls) {
    assert.equal(call.options.redirect, "error");
    assert.equal(call.options.headers, undefined);
  }
});
test("mobile package encoding carries exact byte size, actor/company and actual ZIP digest", async () => {
  const r = await request(
    "/evidence/time-entry/" + uid(31) + "/download?encoding=base64",
    { ...selection, photoIds: [], attachmentIds: [] },
  );
  assert.equal(r.status, 200);
  const bytes = Buffer.from(r.data.base64, "base64");
  assert.equal(r.data.actorId, uid(12));
  assert.equal(r.data.companyId, uid(1));
  assert.equal(r.data.timeEntryId, uid(31));
  assert.equal(r.data.size, bytes.length);
  assert.equal(r.data.zipSha256, sha(bytes));
  assert.ok(unzip(bytes)["gps-trail.csv"]);
});
test("private original viewer proxy scopes company and detects actual photo MIME", async () => {
  let r = await request("/evidence/photos/" + uid(41) + "/content");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/png");
  assert.deepEqual(r.data, png);
  assert.match(r.headers.get("cache-control"), /no-store/);
  assert.equal(
    (await request("/evidence/photos/" + uid(41) + "/content", null, 14))
      .status,
    404,
  );
  assert.equal(
    (await request("/evidence/not-a-kind/" + uid(41) + "/content")).status,
    400,
  );
});
test("media URLs cannot request private hosts, another cloud, redirects or cloud fetch transformations", async () => {
  const count = mediaCalls.length;
  for (const url of [
    "http://127.0.0.1/private",
    "https://169.254.169.254/latest/meta-data",
    "https://res.cloudinary.com/other-cloud/image/upload/a.png",
    "https://res.cloudinary.com/fixture-cloud/image/fetch/https://evil.test/a",
    "https://user:secret@res.cloudinary.com/fixture-cloud/image/upload/a.png",
  ]) {
    assert.throws(() => evidenceMediaUrl(url));
    await assert.rejects(downloadEvidenceMedia(url));
  }
  assert.equal(mediaCalls.length, count);
  assert.ok(!evidenceFilename("../../escape.txt").includes("/"));
});
test("streamed originals are bounded before buffering an entire oversized response", async () => {
  const saved = global.fetch;
  let cancelled = 0;
  global.fetch = async () =>
    new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(8));
          c.enqueue(new Uint8Array(8));
        },
        cancel() {
          cancelled++;
        },
      }),
      { headers: { "content-type": "application/octet-stream" } },
    );
  await assert.rejects(
    downloadEvidenceMedia(
      "https://res.cloudinary.com/fixture-cloud/raw/upload/a.bin",
      10,
    ),
    /limit/,
  );
  assert.equal(cancelled, 1);
  global.fetch = saved;
});
test("missing originals and unsupported storage fail explicitly without network access", async () => {
  const before = mediaCalls.length;
  await query("UPDATE attachments SET file_url=NULL WHERE id=$1", [uid(51)]);
  let r = await request("/evidence/time-entry/" + uid(31) + "/download", {
    ...selection,
    photoIds: [],
    includeTimeEntryPdf: false,
  });
  assert.equal(r.status, 409);
  assert.equal(mediaCalls.length, before);
  await query(
    "UPDATE attachments SET file_url='https://private.example.test/original.txt' WHERE id=$1",
    [uid(51)],
  );
  r = await request("/evidence/time-entry/" + uid(31) + "/download", {
    ...selection,
    photoIds: [],
    includeTimeEntryPdf: false,
  });
  assert.equal(r.status, 409);
  assert.equal(mediaCalls.length, before);
});
