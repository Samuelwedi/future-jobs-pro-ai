const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  ts = require("typescript");
const load = (file) => {
  const context = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(path.join(__dirname, "../src", file + ".ts"), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    context,
  );
  return context.exports;
};
test("native report display copy has Spanish/French text with matching placeholders", () => {
  const { screenCopy } = load("services/screenTranslations"),
    keys = new Set();
  function add(n) {
    if (!n) return;
    if (ts.isStringLiteral(n)) keys.add(n.text);
    if (ts.isConditionalExpression(n)) {
      add(n.whenTrue);
      add(n.whenFalse);
    }
  }
  for (const file of ["screens/ReportsScreen.tsx"]) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function walk(n) {
      if (
        ts.isCallExpression(n) &&
        ["t", "field", "button", "Error"].includes(n.expression.getText(source))
      )
        add(n.arguments[0]);
      if (
        ts.isVariableDeclaration(n) &&
        [
          "yearEndCompanyFields",
          "yearEndBoxLabels",
          "statusLabels",
          "reportMetrics",
        ].includes(n.name.getText(source)) &&
        n.initializer &&
        ts.isObjectLiteralExpression(n.initializer)
      )
        for (const p of n.initializer.properties)
          if (ts.isPropertyAssignment(p)) add(p.initializer);
      ts.forEachChild(n, walk);
    }
    walk(source);
  }
  for (const key of keys) {
    assert.ok(screenCopy[key], key);
    for (const value of screenCopy[key]) {
      assert.ok(value);
      const tokens = (s) =>
        [...s.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]).sort();
      assert.deepEqual(tokens(value), tokens(key));
    }
  }
  assert.ok(keys.size > 15);
});
function fileHelper(state) {
  const exports = {},
    ctx = {
      exports,
      Date,
      encodeURIComponent,
      require: (name) =>
        name.includes("expo-file-system")
          ? {
              cacheDirectory: "file:///fixture/",
              downloadAsync: async (url, file) => {
                state.url = url;
                state.downloads++;
                return {
                  status: state.status ?? 200,
                  headers: { "Content-Type": state.type || "application/pdf" },
                };
              },
              getInfoAsync: async () => ({ exists: true, size: 100 }),
              deleteAsync: async () => {
                state.deleted++;
              },
            }
          : name === "expo-sharing"
            ? {
                isAvailableAsync: async () => true,
                shareAsync: async () => {
                  state.shared++;
                },
              }
            : {
                api: {
                  getToken: async () =>
                    state.token === false ? null : "synthetic-fixture-token",
                },
                API_URL: "https://fixture.example.test/api",
              },
    };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        path.join(__dirname, "../src/services/reportFiles.ts"),
        "utf8",
      ),
      { compilerOptions: { module: 1, target: 9 } },
    ).outputText,
    ctx,
  );
  return ctx.exports;
}
test("report selection validates calendar dates and fixed company project IDs before download", () => {
  const h = fileHelper({});
  const id = "00000000-0000-4000-a000-000000000021";
  assert.match(
    h.reportSelection(id, "2026-11-01", "2026-11-01"),
    /startDate=2026-11-01/,
  );
  for (const args of [
    ["x", "2026-11-01", "2026-11-01"],
    [id, "2026-02-30", "2026-11-01"],
    [id, "2026-11-02", "2026-11-01"],
    [id, "2024-01-01", "2026-11-01"],
  ])
    assert.throws(() => h.reportSelection(...args));
});
test("export authentication, MIME validation, current account and private file cleanup are enforced", async () => {
  const id = "00000000-0000-4000-a000-000000000021";
  for (const cfg of [
    {},
    { status: 401 },
    { type: "text/html" },
    { token: false },
    { stale: true },
  ]) {
    const state = { downloads: 0, deleted: 0, shared: 0, ...cfg },
      h = fileHelper(state),
      op = h.shareReport(
        id,
        "2026-11-01",
        "2026-11-01",
        "pdf",
        () => !state.stale,
      );
    if (cfg.status || cfg.type || cfg.token === false) await assert.rejects(op);
    else await op;
    assert.equal(state.shared, Object.keys(cfg).length === 0 ? 1 : 0);
    assert.equal(state.deleted, state.downloads);
    if (state.downloads)
      assert.match(
        state.url,
        /^https:\/\/fixture\.example\.test\/api\/reports\/comprehensive\.pdf\?projectId=/,
      );
  }
});
