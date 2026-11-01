const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  ts = require("typescript");
function load(file, requireFn) {
  const context = { exports: {}, require: requireFn };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(path.join(__dirname, "../src", file + ".ts"), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
    context,
  );
  return context.exports;
}
const { availabilityInput, zonedTimestamp, coverApprovalKey } = load(
  "utils/workPreferences",
);
const { screenCopy } = load("services/screenTranslations"),
  { t } = load("services/i18n", () => ({ screenCopy }));
test("availability input retains the explicit offset and emits ordered UTC instants", () => {
  assert.equal(
    zonedTimestamp("2026-12-01T08:00:00-07:00"),
    "2026-12-01T15:00:00.000Z",
  );
  assert.equal(
    zonedTimestamp("2026-12-01T08:00+14:00"),
    "2026-11-30T18:00:00.000Z",
  );
  assert.equal(
    zonedTimestamp("2024-02-29T01:02:03.4Z"),
    "2024-02-29T01:02:03.400Z",
  );
  const result = availabilityInput(
    "2026-12-01T08:00-07:00",
    "2026-12-01T17:00-07:00",
  );
  assert.equal(result.startsAt, "2026-12-01T15:00:00.000Z");
  assert.equal(result.endsAt, "2026-12-02T00:00:00.000Z");
});
test("ambiguous timestamps, impossible wall times, invalid offsets and excessive ranges fail before posting", () => {
  for (const value of [
    "2026-12-01T08:00",
    "12/01/2026 08:00",
    "2026-02-30T08:00Z",
    "2026-12-01T24:00Z",
    "2026-12-01T08:60Z",
    "2026-12-01T08:00:60Z",
    "2026-12-01T08:00+14:01",
    "2026-12-01T08:00-15:00",
  ])
    assert.throws(() => zonedTimestamp(value));
  assert.throws(() =>
    availabilityInput("2026-01-01T00:00Z", "2026-01-01T00:00Z"),
  );
  assert.throws(() =>
    availabilityInput("2026-01-01T00:00Z", "2025-12-31T23:00Z"),
  );
  assert.throws(() =>
    availabilityInput("2026-01-01T00:00Z", "2027-01-03T00:00Z"),
  );
  assert.equal(
    availabilityInput("2026-01-01T00:00Z", "2027-01-02T00:00Z").endsAt,
    "2027-01-02T00:00:00.000Z",
  );
});
test("approval retries use one stable record-scoped receipt key rather than generating a second action", () => {
  const id = "00000000-0000-4000-a000-000000000001";
  assert.equal(coverApprovalKey(id), coverApprovalKey(id));
  assert.ok(coverApprovalKey(id).length < 100);
  assert.notEqual(
    coverApprovalKey(id),
    coverApprovalKey(id.slice(0, -1) + "2"),
  );
  assert.throws(() => coverApprovalKey("../other"));
});
test("new screen copy is translated and route, status and actor boundaries remain source values", () => {
  const keys = new Set([
    "Awaiting colleague",
    "Awaiting manager approval",
    "Declined",
    "Replacement approved",
    "Status unavailable",
  ]);
  for (const file of [
    "screens/WorkPreferencesScreen.tsx",
    "utils/workPreferences.ts",
  ]) {
    const text = fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      source = ts.createSourceFile(
        file,
        text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
    function walk(n) {
      if (
        ts.isCallExpression(n) &&
        ["t", "actionButton", "Error"].includes(n.expression.getText(source)) &&
        n.arguments[0] &&
        ts.isStringLiteral(n.arguments[0])
      )
        keys.add(n.arguments[0].text);
      if (
        ts.isReturnStatement(n) &&
        n.expression &&
        ts.isStringLiteral(n.expression)
      )
        keys.add(n.expression.text);
      if (ts.isJsxText(n)) assert.ok(!/[A-Za-z]/.test(n.text));
      ts.forEachChild(n, walk);
    }
    walk(source);
  }
  for (const key of keys)
    for (const lang of ["es", "fr"]) {
      assert.ok(screenCopy[key], key);
      const tokens = (v) =>
        [...v.matchAll(/\{([^{}]+)\}/g)].map((x) => x[1]).sort();
      assert.deepEqual(tokens(t(key, lang)), tokens(key));
    }
  const app = fs.readFileSync(path.join(__dirname, "../App.tsx"), "utf8");
  assert.match(
    app,
    /<Stack.Screen name="WorkPreferences" component=\{WorkPreferencesScreen\}/,
  );
  const screen = fs
    .readFileSync(
      path.join(__dirname, "../src/screens/WorkPreferencesScreen.tsx"),
      "utf8",
    )
    .replace(/\s/g, "");
  assert.match(screen, /swap.to_user===data.actorId/);
  assert.match(screen, /data.manager===true/);
  assert.match(screen, /status:["']accepted["']/);
  assert.match(screen, /status:["']rejected["']/);
  assert.match(screen, /coverApprovalKey\(swap.id\)/);
  assert.match(screen, /identityRef.current!==identity/);
});
