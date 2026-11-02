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
const manual = load("utils/manualPayroll"),
  helpers = load("utils/payrollAdministration", () => manual),
  plain = (v) => JSON.parse(JSON.stringify(v));
const settings = {
  payroll_schedule: "weekly",
  payroll_day: "5",
  payroll_time: "09:00",
  default_hourly_rate: "20.25",
  overtime_multiplier: "1.5",
  tax_rate: "15",
};
test("settings validate schedule-specific calendar boundaries, wall time and bounded decimal configuration", () => {
  const out = plain(helpers.settingsPayload(settings));
  assert.equal(out.payroll_day, 5);
  assert.equal(out.default_hourly_rate, 20.25);
  assert.equal(out.overtime_multiplier, 1.5);
  for (const patch of [
    { payroll_schedule: "daily" },
    { payroll_day: "7" },
    { payroll_day: "1.5" },
    { payroll_time: "24:00" },
    { payroll_time: "9:00" },
    { default_hourly_rate: "" },
    { default_hourly_rate: "0" },
    { overtime_multiplier: ".5" },
    { overtime_multiplier: "11" },
    { tax_rate: "101" },
    { tax_rate: "-1" },
  ])
    assert.throws(() => helpers.settingsPayload({ ...settings, ...patch }));
  assert.equal(
    helpers.settingsPayload({
      ...settings,
      payroll_schedule: "monthly",
      payroll_day: "31",
    }).payroll_day,
    31,
  );
  assert.throws(() =>
    helpers.settingsPayload({
      ...settings,
      payroll_schedule: "monthly",
      payroll_day: "0",
    }),
  );
  assert.equal(
    helpers.settingsPayload({ ...settings, payroll_day: "0", tax_rate: "0" })
      .payroll_day,
    0,
  );
});
test("absolute rates target exactly one selected in-company employee and retain the explicit effective date", () => {
  const request = plain(
    helpers.compensationPayload(
      ["a", "a"],
      ["a", "b"],
      "absolute",
      "23.45",
      "2026-11-01",
    ),
  );
  assert.deepEqual(request, {
    path: "/payroll/employees/rate",
    body: { employeeId: "a", hourlyRate: 23.45, effectiveDate: "2026-11-01" },
  });
  for (const ids of [[], ["foreign"], ["a", "b"]])
    assert.throws(() =>
      helpers.compensationPayload(
        ids,
        ["a", "b"],
        "absolute",
        "23",
        "2026-11-01",
      ),
    );
  for (const date of ["", "2026-02-30", "11/01/2026"])
    assert.throws(() =>
      helpers.compensationPayload(["a"], ["a"], "absolute", "23", date),
    );
});
test("bulk raises deduplicate company selections and cannot silently become exact rates or negative changes", () => {
  for (const kind of ["percentage", "fixed"]) {
    const request = plain(
      helpers.compensationPayload(
        ["a", "b", "a"],
        ["a", "b"],
        kind,
        "2.5",
        "2026-12-01",
      ),
    );
    assert.deepEqual(request.body.employeeIds, ["a", "b"]);
    assert.equal(request.body.raiseType, kind);
    assert.equal(request.body.raiseValue, 2.5);
    assert.equal(request.path, "/payroll/employees/compensation");
  }
  for (const value of ["", "-2", "0", "NaN", "1000001"])
    assert.throws(() =>
      helpers.compensationPayload(
        ["a"],
        ["a"],
        "percentage",
        value,
        "2026-12-01",
      ),
    );
  assert.throws(() =>
    helpers.compensationPayload(["a"], ["a"], "unsupported", "2", "2026-12-01"),
  );
});
test("cost scenarios stay explicitly scoped and hiring counts must be positive integers", () => {
  const result = plain(
    helpers.compensationScenario(["a", "a"], ["a"], "raise_fixed", "1.25"),
  );
  assert.deepEqual(result, {
    employeeIds: ["a"],
    scenarioType: "raise_fixed",
    scenarioValue: 1.25,
  });
  assert.equal(
    helpers.compensationScenario(["a"], ["a"], "hire_count", "2").scenarioValue,
    2,
  );
  for (const [ids, kind, value] of [
    [[], "raise_percent", "5"],
    [["foreign"], "raise_percent", "5"],
    [["a"], "hire_count", "1.5"],
    [["a"], "raise_fixed", "0"],
    [["a"], "unknown", "5"],
  ])
    assert.throws(() => helpers.compensationScenario(ids, ["a"], kind, value));
});
test("administration labels, confirmations and validation retain complete Spanish/French placeholders", () => {
  const { screenCopy } = load("services/screenTranslations"),
    keys = new Set([
      "Current 40-hour estimate",
      "Projected 40-hour estimate",
      "Estimated difference",
    ]);
  for (const file of [
    "screens/PayrollAdministrationScreen.tsx",
    "utils/payrollAdministration.ts",
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
    function values(n) {
      if (n && ts.isObjectLiteralExpression(n))
        for (const p of n.properties)
          if (ts.isPropertyAssignment(p)) add(p.initializer);
    }
    function walk(n) {
      if (ts.isCallExpression(n)) {
        const name = n.expression.getText(source);
        if (["t", "field", "button", "Error"].includes(name))
          add(n.arguments[0]);
        if (name === "ask") for (const i of [0, 3]) add(n.arguments[i]);
        if (name === "run") add(n.arguments[1]);
        if (name === "choices") values(n.arguments[0]);
      }
      if (
        ts.isVariableDeclaration(n) &&
        ["settingLabels", "changes", "scenarios"].includes(
          n.name.getText(source),
        )
      )
        values(n.initializer);
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
  assert.ok(keys.size > 50);
});
