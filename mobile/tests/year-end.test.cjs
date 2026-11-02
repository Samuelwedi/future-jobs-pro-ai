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
const { yearEndSelection, yearEndConfirmation } = load("utils/yearEnd"),
  id = "00000000-0000-4000-a000-000000000001";
test("year-end selection validates UUID, integral year bounds and fixed form IDs", () => {
  assert.equal(yearEndSelection(id, "2026", "T4").taxYear, 2026);
  for (const args of [
    ["x", "2026", "T4"],
    [id, "1999", "T4"],
    [id, "2026.5", "T4"],
    [id, "2026", "OTHER"],
  ])
    assert.throws(() => yearEndSelection(...args));
});
test("stored snapshot payload requires the exact preview hash and explicit independent review", () => {
  const selection = yearEndSelection(id, "2026", "T4"),
    hash = "a".repeat(64);
  const body = yearEndConfirmation(
    selection,
    hash,
    " independent fixture ",
    true,
  );
  assert.equal(body.reviewReference, "independent fixture");
  assert.equal(body.previewHash, hash);
  assert.equal(body.employeeId, id);
  for (const args of [
    [selection, "", "reference-long", true],
    [selection, hash, "short", true],
    [selection, hash, "reference-long", false],
  ])
    assert.throws(() => yearEndConfirmation(...args));
});
test("year-end decisions are never queued or replayed offline", async () => {
  let requests = 0,
    queued = 0;
  const helper = load("utils/manualPayroll"),
    client = {
      interceptors: { request: { use() {} }, response: { use() {} } },
      request: async () => requests++,
    };
  const context = {
    exports: {},
    __DEV__: false,
    process: { env: {} },
    require: (name) =>
      name === "axios"
        ? { default: { create: () => client } }
        : name.endsWith("manualPayroll")
          ? helper
          : name.endsWith("offlineService")
            ? {
                getOnlineStatus: () => false,
                queueAction: async () => queued++,
              }
            : {},
  };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(path.join(__dirname, "../src/services/api.ts"), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    context,
  );
  for (const method of ["post", "patch", "put", "delete"])
    await assert.rejects(
      context.exports.api[method]("/year-end/finalize", {}),
      /online connection/,
    );
  await assert.rejects(
    context.exports.api.replayQueued({
      url: "/year-end/finalize",
      method: "POST",
    }),
    /cannot be replayed/,
  );
  assert.equal(queued, 0);
  assert.equal(requests, 0);
});
test("new year-end and payout display copy has Spanish/French text with matching placeholders", () => {
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
  for (const file of [
    "screens/YearEndScreen.tsx",
    "screens/PayoutStatusScreen.tsx",
    "utils/yearEnd.ts",
  ]) {
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
        ["yearEndCompanyFields", "yearEndBoxLabels", "statusLabels"].includes(
          n.name.getText(source),
        ) &&
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
  assert.ok(keys.size > 60);
});
