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
test("commercial mutations and old queued invoices/estimates never replay offline", async () => {
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
  for (const route of ["/invoices", "/estimates"])
    for (const method of ["post", "patch", "put", "delete"])
      await assert.rejects(
        context.exports.api[method](route, {}),
        /online connection/,
      );
  await assert.rejects(
    context.exports.api.replayQueued({
      url: "/invoices/fixture/payments",
      method: "POST",
    }),
    /cannot be replayed/,
  );
  assert.equal(queued, 0);
  assert.equal(requests, 0);
});
test("native commercial document display copy has Spanish/French text with matching placeholders", () => {
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
  for (const file of ["screens/CommercialDocumentsScreen.tsx"]) {
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
  assert.ok(keys.size > 35);
});
