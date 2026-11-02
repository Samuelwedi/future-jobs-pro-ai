const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  ts = require("typescript");
function load(file, requireFn, extras = {}) {
  const context = { exports: {}, require: requireFn, ...extras };
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
}
const helpers = load("utils/manualPayroll");
const plain = (v) => JSON.parse(JSON.stringify(v));
const local = { country: "CA", subdivision: "AB", currency: "CAD" },
  world = {
    ...local,
    engine: "company_rules_v1",
    lines: [
      { id: "tax", method: "manual", annualCap: null },
      { id: "pension", method: "percentage", annualCap: 1000 },
    ],
  };
test("calendar periods reject rollover dates and reversed days without shifting timezone", () => {
  for (const value of [
    "2026-02-30",
    "2026-13-01",
    "2026-11-1",
    "2026-11-01T00:00Z",
    "",
  ])
    assert.throws(() => helpers.payrollDate(value));
  assert.equal(helpers.payrollDate("2024-02-29"), "2024-02-29");
  assert.throws(() => helpers.payrollPeriod("2026-11-02", "2026-11-01"));
  assert.deepEqual(plain(helpers.payrollPeriod("2026-11-01", "2026-11-01")), {
    periodStart: "2026-11-01",
    periodEnd: "2026-11-01",
  });
});
test("amounts require explicit values; blank YTD is never assumed zero", () => {
  for (const value of [
    "",
    null,
    undefined,
    "-1",
    "1e3",
    "Infinity",
    "1,000",
    "abc",
    1e10,
  ])
    assert.throws(() => helpers.payrollAmount(value));
  assert.equal(helpers.payrollAmount("0"), 0);
  assert.equal(helpers.payrollAmount("2000.125"), 2000.125);
  const initial = helpers.newPayrollInput(local, "2000");
  assert.equal(initial.cppYtd, "");
  assert.equal(initial.payDate, "");
  assert.equal(initial.standardCaseConfirmed, false);
  assert.throws(() =>
    helpers.payrollCalculationInput(local, {
      ...initial,
      payDate: "2026-11-01",
      standardCaseConfirmed: true,
    }),
  );
  const input = {
    ...initial,
    payDate: "2026-11-01",
    cppYtd: "0",
    cpp2Ytd: "0",
    eiYtd: "0",
    pensionableYtd: "0",
    additionalTax: "0",
    standardCaseConfirmed: true,
  };
  const body = helpers.payrollCalculationInput(local, input);
  assert.equal(body.cppYtd, 0);
  assert.equal(body.gross, 2000);
  assert.equal(body.federalClaim, undefined);
  assert.equal(
    helpers.payrollCalculationInput(local, { ...input, federalClaim: "0" })
      .federalClaim,
    0,
  );
});
test("worldwide calculation submits only selected manual and capped lines after explicit review", () => {
  const initial = helpers.newPayrollInput(world, "1500");
  assert.equal(initial.manualAmounts.tax, "");
  assert.equal(initial.ytd.pension, "");
  const input = {
    ...initial,
    payDate: "2026-11-01",
    taxable: "1400",
    reviewReference: "review-001",
    companyRulesConfirmed: true,
    manualAmounts: { tax: "50", injected: "99" },
    ytd: { pension: "100", injected: "99" },
  };
  const out = plain(helpers.payrollCalculationInput(world, input));
  assert.deepEqual(out.manualAmounts, { tax: 50 });
  assert.deepEqual(out.ytd, { pension: 100 });
  assert.equal(out.taxable, 1400);
  assert.throws(() =>
    helpers.payrollCalculationInput(world, {
      ...input,
      companyRulesConfirmed: false,
    }),
  );
  assert.throws(() =>
    helpers.payrollCalculationInput(world, {
      ...input,
      reviewReference: "short",
    }),
  );
});
test("every payroll API write and queued replay fails closed offline without persisting or dispatching", async () => {
  let queued = 0,
    requests = 0;
  const client = {
    interceptors: { request: { use() {} }, response: { use() {} } },
    post: async () => {
      requests++;
      return { data: {} };
    },
    put: async () => {
      requests++;
      return { data: {} };
    },
    patch: async () => {
      requests++;
      return { data: {} };
    },
    delete: async () => {
      requests++;
      return { data: {} };
    },
    request: async () => {
      requests++;
      return { data: {} };
    },
  };
  const api = load(
    "services/api",
    (name) => {
      if (name === "axios") return { default: { create: () => client } };
      if (name.endsWith("manualPayroll")) return helpers;
      if (name.endsWith("offlineService"))
        return {
          getOnlineStatus: () => false,
          queueAction: async () => queued++,
        };
      return {};
    },
    { __DEV__: false, process: { env: {} } },
  ).api;
  for (const url of [
    "/payroll/generate",
    "/payroll/run",
    "/payroll-rules",
    "/manual-payroll/run/record-payment",
  ]) {
    for (const method of ["post", "put", "patch", "delete"])
      await assert.rejects(api[method](url, {}), /online connection/);
    await assert.rejects(
      api.replayQueued({ url, method: "POST", data: {} }),
      /cannot be replayed/,
    );
  }
  assert.equal(queued, 0);
  assert.equal(requests, 0);
  await assert.rejects(api.post("/tasks", {}), /queued for later/);
  assert.equal(queued, 1);
  assert.equal(helpers.isPayrollMutation("/payroll-reports"), false);
});
test("native payroll display copy and placeholders have Spanish and French translations", () => {
  const { screenCopy } = load("services/screenTranslations");
  const keys = new Set([
    "Draft",
    "Reviewed",
    "External payments recorded",
    "Payment recorded",
    "Calculated — review required",
    "Uncalculated",
    "Income tax",
    "Net pay",
    "Gross wages",
  ]);
  for (const file of [
    "screens/ManualPayrollScreen.tsx",
    "utils/manualPayroll.ts",
  ]) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function add(n) {
      if (!n) return;
      if (ts.isStringLiteral(n)) keys.add(n.text);
      else if (ts.isConditionalExpression(n)) {
        add(n.whenTrue);
        add(n.whenFalse);
      }
    }
    function walk(n) {
      if (ts.isCallExpression(n)) {
        const name = n.expression.getText(source);
        if (["t", "field", "button", "Error"].includes(name))
          add(n.arguments[0]);
        if (name === "ask") for (const i of [0, 3]) add(n.arguments[i]);
        if (name === "run") add(n.arguments[1]);
      }
      if (
        ts.isVariableDeclaration(n) &&
        n.name.getText(source) === "labels" &&
        n.initializer &&
        ts.isObjectLiteralExpression(n.initializer)
      )
        for (const property of n.initializer.properties)
          if (ts.isPropertyAssignment(property)) add(property.initializer);
      ts.forEachChild(n, walk);
    }
    walk(source);
  }
  for (const key of keys) {
    assert.ok(screenCopy[key], key);
    for (const translation of screenCopy[key]) {
      assert.ok(translation);
      const tokens = (s) =>
        [...s.matchAll(/\{([^{}]+)\}/g)].map((x) => x[1]).sort();
      assert.deepEqual(tokens(translation), tokens(key), key);
    }
  }
  assert.ok(keys.size > 65);
});
function statementFixture({
  status = 200,
  type = "application/pdf",
  size = 1024,
  current = true,
  changeDuringDownload = false,
  downloadError = false,
  sharing = true,
} = {}) {
  const seen = { downloads: [], shares: [], deleted: [], available: 0 };
  let active = current;
  const files = {
    cacheDirectory: "file:///private-cache/",
    downloadAsync: async (...args) => {
      seen.downloads.push(args);
      if (changeDuringDownload) active = false;
      if (downloadError) throw Error("network");
      return { status, headers: { "Content-Type": type } };
    },
    getInfoAsync: async () => ({ exists: true, size }),
    deleteAsync: async (...args) => seen.deleted.push(args),
  };
  const module = load("services/payStatement", (name) => {
    if (name === "expo-file-system/legacy") return files;
    if (name === "expo-sharing")
      return {
        isAvailableAsync: async () => {
          seen.available++;
          return sharing;
        },
        shareAsync: async (...args) => seen.shares.push(args),
      };
    if (name === "./api")
      return {
        API_URL: "https://api.example.test/api",
        api: { getToken: async () => "fixture-token" },
      };
    throw Error(name);
  });
  return {
    seen,
    share: () =>
      module.sharePayStatement(
        "11111111-1111-4111-8111-111111111111",
        () => active,
      ),
  };
}
test("reviewed PDF exports use authenticated fixed API paths and remove the private temporary file after sharing", async () => {
  const f = statementFixture();
  await f.share();
  assert.equal(f.seen.downloads.length, 1);
  const [url, file, options] = f.seen.downloads[0];
  assert.equal(
    url,
    "https://api.example.test/api/payroll/paystub/11111111-1111-4111-8111-111111111111",
  );
  assert.equal(options.headers.Authorization, "Bearer fixture-token");
  assert.match(file, /^file:\/\/\/private-cache\/paystub_/);
  assert.equal(f.seen.shares.length, 1);
  assert.equal(f.seen.shares[0][0], file);
  assert.equal(f.seen.deleted[0][0], file);
});
test("PDF export never shares error pages, empty files, oversized files or a response for a changed account", async () => {
  for (const options of [
    { status: 409 },
    { type: "text/html" },
    { size: 0 },
    { size: 20000001 },
    { downloadError: true },
  ]) {
    const f = statementFixture(options);
    await assert.rejects(f.share());
    assert.equal(f.seen.shares.length, 0);
    assert.equal(f.seen.deleted.length, 1);
  }
  const stale = statementFixture({ changeDuringDownload: true });
  await stale.share();
  assert.equal(stale.seen.shares.length, 0);
  assert.equal(stale.seen.deleted.length, 1);
  for (const options of [{ current: false }, { sharing: false }]) {
    const f = statementFixture(options);
    await f.share().catch(() => {});
    assert.equal(f.seen.downloads.length, 0);
    assert.equal(f.seen.shares.length, 0);
  }
});
