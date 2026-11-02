const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"),
  path = require("path"),
  vm = require("vm"),
  ts = require("typescript");
function load(name, requireFn) {
  const context = { exports: {}, require: requireFn, Intl, Date };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        path.join(__dirname, "../src/services", name + ".ts"),
        "utf8",
      ),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
    context,
  );
  return context.exports;
}
const { screenCopy } = load("screenTranslations");
const { t, calendarLabel, dateLabel } = load("i18n", () => ({ screenCopy }));
const files = [
  "ProjectsScreen",
  "ScheduleScreen",
  "TimesheetScreen",
  "TasksScreen",
  "CreateShiftScreen",
];
const tokens = (text) =>
  [...text.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]).sort();

test("all static work-screen text, placeholders and alert copy use complete Spanish/French entries", () => {
  const keys = new Set();
  function collect(n, source) {
    if (
      ts.isCallExpression(n) &&
      n.expression.getText(source) === "t" &&
      n.arguments[0]
    ) {
      function outputs(x) {
        if (ts.isStringLiteral(x)) keys.add(x.text);
        else if (ts.isConditionalExpression(x)) {
          outputs(x.whenTrue);
          outputs(x.whenFalse);
        }
      }
      outputs(n.arguments[0]);
    }
    if (ts.isJsxText(n))
      assert.ok(
        !/[A-Za-z]/.test(n.text),
        "Untranslated text: " + n.text.trim(),
      );
    if (
      ts.isJsxAttribute(n) &&
      ["placeholder", "title", "accessibilityLabel"].includes(
        n.name.getText(source),
      )
    )
      assert.ok(
        !n.initializer || !ts.isStringLiteral(n.initializer),
        "Untranslated attribute",
      );
    if (
      ts.isCallExpression(n) &&
      n.expression.getText(source) === "Alert.alert"
    )
      for (const arg of n.arguments.slice(0, 2))
        assert.ok(!ts.isStringLiteral(arg), "Untranslated alert");
    ts.forEachChild(n, (x) => collect(x, source));
  }
  for (const file of files) {
    const text = fs.readFileSync(
      path.join(__dirname, "../src/screens", file + ".tsx"),
      "utf8",
    );
    const source = ts.createSourceFile(
      file + ".tsx",
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    collect(source, source);
  }
  for (const key of ["Ready", "In progress", "Completed", ...keys])
    for (const lang of ["es", "fr"]) {
      assert.ok(screenCopy[key], `Missing ${lang}: ${key}`);
      assert.ok(t(key, lang).trim(), `Empty ${lang}: ${key}`);
      assert.deepEqual(
        tokens(t(key, lang)),
        tokens(key),
        `Parameters differ for ${lang}: ${key}`,
      );
    }
  assert.ok(keys.size > 100);
});

test("work-screen translations preserve names and replace repeated parameters once without recursive substitution", () => {
  const name = "Calendar / <client> {count}";
  assert.equal(
    t('Archive "{name}"?', "es", { name, count: "99" }),
    '¿Archivar "' + name + '"?',
  );
  assert.equal(
    t("{name} {name}", "fr", { name: "{count}", count: "99" }),
    "{count} {count}",
  );
  assert.equal(
    t("Employees selected: {count}", "fr", { count: "3" }),
    "Employés sélectionnés : 3",
  );
  assert.equal(
    t("Customer free text unchanged", "fr"),
    "Customer free text unchanged",
  );
});

test("calendar labels preserve the supplied date and clock displays honor company timezone", () => {
  assert.match(calendarLabel("2026-11-01", "es"), /dom/);
  assert.match(calendarLabel("2026-11-01", "fr"), /dim/);
  assert.equal(calendarLabel("2026-02-30", "fr"), "—");
  assert.equal(calendarLabel("not-a-date", "es"), "—");
  assert.match(
    dateLabel(new Date("2025-01-15T08:30:00Z"), "es", {
      timeZone: "America/Edmonton",
      hour: "numeric",
      minute: "2-digit",
      hour12: false,
    }),
    /0?1:30/,
  );
  assert.match(
    dateLabel(new Date("2025-01-15T08:30:00Z"), "es", {
      timeZone: "America/Toronto",
      hour: "numeric",
      minute: "2-digit",
      hour12: false,
    }),
    /0?3:30/,
  );
});

test("route identifiers, payload fields and user content remain literal source values", () => {
  const read = (name) =>
    fs.readFileSync(
      path.join(__dirname, "../src/screens", name + ".tsx"),
      "utf8",
    );
  assert.match(read("ScheduleScreen"), /navigate\('CreateShift'/);
  assert.match(read("ScheduleScreen"), /navigate\('Home'/);
  assert.match(read("TimesheetScreen"), /navigate\('GPSPlayback'/);
  for (const [name, value] of [
    ["ProjectsScreen", "item.name"],
    ["TasksScreen", "item.description"],
    ["ScheduleScreen", "selectedShift.notes"],
    ["CreateShiftScreen", "proj.name"],
  ]) {
    const source = ts.createSourceFile(
      name + ".tsx",
      read(name),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function walk(n) {
      if (ts.isCallExpression(n) && n.expression.getText(source) === "t")
        assert.ok(n.arguments[0]?.getText(source) !== value);
      ts.forEachChild(n, walk);
    }
    walk(source);
  }
  assert.match(read("CreateShiftScreen"), /date: calendarDate\(date\)/);
  assert.match(read("TasksScreen"), /status: next/);
});
