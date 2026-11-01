const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  ts = require("typescript");
test("employee statement copy has complete Spanish/French text and unchanged interpolation tokens", () => {
  const context = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        path.join(__dirname, "../src/services/screenTranslations.ts"),
        "utf8",
      ),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
    context,
  );
  const copy = context.exports.screenCopy;
  const file = "PayStatementsScreen.tsx",
    source = ts.createSourceFile(
      file,
      fs.readFileSync(path.join(__dirname, "../src/screens", file), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    ),
    keys = new Set();
  function add(n) {
    if (!n) return;
    if (ts.isStringLiteral(n)) keys.add(n.text);
    if (ts.isConditionalExpression(n)) {
      add(n.whenTrue);
      add(n.whenFalse);
    }
  }
  function walk(n) {
    if (ts.isCallExpression(n) && n.expression.getText(source) === "t")
      add(n.arguments[0]);
    ts.forEachChild(n, walk);
  }
  walk(source);
  for (const key of keys) {
    assert.ok(copy[key], key);
    for (const text of copy[key]) {
      assert.ok(text);
      const tokens = (s) =>
        [...s.matchAll(/\{([^{}]+)\}/g)].map((x) => x[1]).sort();
      assert.deepEqual(tokens(text), tokens(key));
    }
  }
  assert.ok(keys.size > 10);
});
