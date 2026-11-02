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
test("native integration display copy has Spanish/French text with matching placeholders", () => {
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
  for (const file of ["screens/IntegrationsScreen.tsx"]) {
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
  assert.ok(keys.size > 15);
});
test("only exact provider HTTPS authorization endpoints and opaque states can open", () => {
  const ctx = { exports: {}, URL };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        path.join(__dirname, "../src/utils/integrationLinks.ts"),
        "utf8",
      ),
      { compilerOptions: { module: 1, target: 9 } },
    ).outputText,
    ctx,
  );
  const validate = ctx.exports.integrationAuthorizationUrl,
    state = "a".repeat(43),
    url =
      "https://connect.stripe.com/oauth/authorize?client_id=fixture&state=" +
      state;
  assert.equal(validate("stripe", url), url);
  assert.match(
    validate(
      "quickbooks",
      "https://appcenter.intuit.com/connect/oauth2?client_id=fixture&state=" +
        state,
    ),
    /^https:/,
  );
  for (const bad of [
    url.replace("https:", "http:"),
    url.replace("connect.stripe.com", "connect.stripe.com.evil.example"),
    url.replace("connect.stripe.com", "user@connect.stripe.com"),
    url.replace("/oauth/authorize", "/other"),
    url + "&access_token=PRIVATE",
    url.replace(state, "short"),
    url + "#fragment",
    url.replace("client_id=fixture", "client_id="),
  ])
    assert.throws(() => validate("stripe", bad));
  assert.throws(() => validate("quickbooks", url));
});
