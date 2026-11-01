import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import { api } from "../services/api";
import { checkOnlineStatus } from "../services/offlineService";
import {
  compensationPayload,
  compensationScenario,
  PayrollSettings,
  settingsPayload,
} from "../utils/payrollAdministration";
type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  current_rate: string | null;
  history: { effective_date: string; hourly_rate: string }[] | null;
};
type Scenario = { currentTotal: number; projectedTotal: number; delta: number };
const settingLabels: Record<keyof PayrollSettings, string> = {
  payroll_schedule: "Payroll schedule",
  payroll_day: "Payroll day",
  payroll_time: "Payroll time (HH:mm)",
  default_hourly_rate: "Default hourly rate",
  overtime_multiplier: "Overtime multiplier",
  tax_rate: "Legacy tax rate (%)",
};
const changes = {
  absolute: "Exact hourly rate",
  percentage: "Percentage raise",
  fixed: "Fixed hourly raise",
};
const scenarios = {
  raise_percent: "Percentage raise scenario",
  raise_fixed: "Fixed hourly raise scenario",
  hire_count: "Additional employee count scenario",
};
export default function PayrollAdministrationScreen() {
  const { user } = useAuth(),
    { t } = useLang(),
    nav = useNavigation(),
    insets = useSafeAreaInsets();
  const identity = String(user?.companyId) + ":" + String(user?.id),
    identityRef = useRef(identity);
  identityRef.current = identity;
  const manager = ["boss", "owner", "manager", "admin"].includes(
    String(user?.role).toLowerCase(),
  );
  const [employees, setEmployees] = useState<Employee[]>([]),
    [settings, setSettings] = useState<PayrollSettings | null>(null),
    [currency, setCurrency] = useState(""),
    [timezone, setTimezone] = useState("");
  const [selected, setSelected] = useState<string[]>([]),
    [kind, setKind] = useState("absolute"),
    [value, setValue] = useState(""),
    [date, setDate] = useState(""),
    [scenarioType, setScenarioType] = useState("raise_percent"),
    [scenarioValue, setScenarioValue] = useState(""),
    [scenario, setScenario] = useState<Scenario | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(""),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const active = useRef(false),
    sequence = useRef(0),
    lock = useRef(false);
  const current = () => active.current && identityRef.current === identity;
  const ready = manager && loaded === identity,
    disabled = !ready || loading || busy;
  useEffect(() => {
    setSelected([]);
    setValue("");
    setDate("");
    setScenario(null);
    setScenarioValue("");
    setSettings(null);
    setEmployees([]);
    setNotice("");
    setError("");
  }, [identity]);
  const load = useCallback(async () => {
    const seq = ++sequence.current;
    setLoading(true);
    setLoaded("");
    try {
      if (!manager) throw Error(t("Payroll manager access required."));
      const [people, config, actor, rules] = await Promise.all([
        api.get<{ employees: Employee[] }>("/payroll/employees/compensation"),
        api.get<{ settings: Record<string, unknown> }>("/payroll/settings"),
        api.get<{
          actorId: string;
          companyId: string;
          manager: boolean;
          timezone: string;
        }>("/operations/work-options"),
        api.get<{ current: { rules: { currency: string } } | null }>(
          "/payroll-rules",
        ),
      ]);
      if (
        !active.current ||
        identityRef.current !== identity ||
        sequence.current !== seq
      )
        return;
      if (
        actor.actorId !== user?.id ||
        actor.companyId !== user?.companyId ||
        actor.manager !== true ||
        !Array.isArray(people.employees) ||
        !config.settings
      )
        throw Error(
          t(
            "Payroll records could not be verified. Refresh before continuing.",
          ),
        );
      setEmployees(people.employees);
      setSelected((old) =>
        old.filter((id) => people.employees.some((p) => p.id === id)),
      );
      setSettings(
        Object.fromEntries(
          Object.keys(settingLabels).map((k) => [
            k,
            String(config.settings[k] ?? ""),
          ]),
        ) as PayrollSettings,
      );
      setCurrency(rules.current?.rules.currency || "");
      setTimezone(actor.timezone || "UTC");
      setLoaded(identity);
      setError("");
    } catch (e: any) {
      if (
        active.current &&
        identityRef.current === identity &&
        sequence.current === seq
      ) {
        setLoaded("");
        setError(
          e.response?.data?.message ||
            e.message ||
            t("Payroll could not be loaded."),
        );
      }
    } finally {
      if (
        active.current &&
        identityRef.current === identity &&
        sequence.current === seq
      )
        setLoading(false);
    }
  }, [identity, manager, user?.id, t]);
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      void load();
      return () => {
        active.current = false;
        sequence.current++;
      };
    }, [load]),
  );
  const run = async (
    work: () => Promise<void>,
    message: string,
    refresh = true,
  ) => {
    if (lock.current || disabled || !current()) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!(await checkOnlineStatus()))
        throw Error(t("Payroll requires a connection. Nothing was submitted."));
      if (!current()) return;
      await work();
      if (!current()) return;
      if (refresh) {
        setScenario(null);
        setValue("");
        setDate("");
        await load();
      }
      if (current()) setNotice(t(message));
    } catch (e: any) {
      if (current()) {
        setLoaded("");
        setScenario(null);
        setError(
          (e.response?.data?.message ||
            e.message ||
            t("Payroll action failed.")) +
            " " +
            t("Refresh and check the current payroll before retrying."),
        );
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const validate = (work: () => void) => {
    try {
      work();
    } catch (e: any) {
      setError(t(e.message));
    }
  };
  const ask = (
    title: string,
    body: string,
    work: () => Promise<void>,
    message: string,
  ) =>
    Alert.alert(t(title), body, [
      { text: t("Cancel"), style: "cancel" },
      { text: t("Confirm"), onPress: () => void run(work, message) },
    ]);
  const field = (
    label: string,
    v: string,
    change: (next: string) => void,
    numeric = false,
  ) => (
    <View key={label} style={s.field}>
      <Text style={s.text}>{t(label)}</Text>
      <TextInput
        accessibilityLabel={t(label)}
        editable={!disabled}
        value={v}
        onChangeText={change}
        style={s.input}
        autoCapitalize="none"
        keyboardType={numeric ? "decimal-pad" : "default"}
      />
    </View>
  );
  const button = (label: string, press: () => void, extra = false) => (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={disabled || extra}
      onPress={press}
      style={[s.button, (disabled || extra) && s.disabled]}
    >
      <Text style={s.link}>{t(label)}</Text>
    </TouchableOpacity>
  );
  const choices = (
    options: Record<string, string>,
    v: string,
    change: (next: string) => void,
  ) => (
    <View style={s.choices}>
      {Object.entries(options).map(([id, label]) => (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ selected: id === v }}
          disabled={disabled}
          key={id}
          onPress={() => change(id)}
          style={[s.button, id === v && s.selected]}
        >
          <Text style={s.link}>{t(label)}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{
        padding: 18,
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 40,
      }}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => nav.goBack()}
        style={s.button}
      >
        <Text style={s.link}>{t("Back")}</Text>
      </TouchableOpacity>
      <Text style={s.title}>{t("Payroll administration")}</Text>
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {!!notice && (
        <Text accessibilityRole="alert" style={s.success}>
          {notice}
        </Text>
      )}
      <TouchableOpacity
        accessibilityRole="button"
        disabled={busy || loading}
        onPress={() => {
          setScenario(null);
          setValue("");
          setDate("");
          void load();
        }}
        style={s.button}
      >
        <Text style={s.link}>{t("Refresh")}</Text>
      </TouchableOpacity>
      {loading && <ActivityIndicator />}
      {ready && settings && (
        <>
          <Text style={s.text}>
            {t("Company timezone: {timezone}", { timezone })} ·{" "}
            {currency || t("Currency not configured")}
          </Text>
          <View style={s.card}>
            <Text style={s.heading}>{t("Company payroll settings")}</Text>
            <Text style={s.warning}>
              {t(
                "These are saved company settings. Saving does not activate automatic payroll or make a payment. Reviewed payroll keeps its saved calculation. The legacy tax percentage does not replace independently reviewed deduction rules.",
              )}
            </Text>
            {choices(
              {
                weekly: "Weekly",
                biweekly: "Every two weeks",
                monthly: "Monthly",
              },
              settings.payroll_schedule,
              (v) =>
                setSettings({
                  ...settings,
                  payroll_schedule: v,
                  payroll_day: "",
                }),
            )}
            <Text style={s.text}>
              {t(
                settings.payroll_schedule === "monthly"
                  ? "Monthly day: 1–31. Check short months when planning payroll."
                  : "Weekly day: 0 = Sunday through 6 = Saturday. Biweekly periods also need a company anchor date.",
              )}
            </Text>
            {(Object.keys(settingLabels) as (keyof PayrollSettings)[])
              .filter((k) => k !== "payroll_schedule")
              .map((k) =>
                field(
                  settingLabels[k],
                  settings[k],
                  (v) => setSettings({ ...settings, [k]: v }),
                  k !== "payroll_time",
                ),
              )}
            {button("Save payroll settings", () =>
              validate(() => {
                const body = settingsPayload(settings);
                ask(
                  "Save company payroll settings?",
                  t(
                    "Review the schedule, rates and overtime multiplier before confirming.",
                  ),
                  async () => {
                    await api.put("/payroll/settings", body);
                  },
                  "Payroll settings saved.",
                );
              }),
            )}
          </View>
          <View style={s.card}>
            <Text style={s.heading}>{t("Employee compensation")}</Text>
            <Text style={s.warning}>
              {t(
                "Effective-dated rates apply to draft preparation. Review existing draft and historical payroll separately. Saving a raise does not recalculate reviewed payroll or pay an employee.",
              )}
            </Text>
            {!employees.length && (
              <Text style={s.text}>
                {t("No employees available for compensation changes.")}
              </Text>
            )}
            {employees.map((p) => (
              <View key={p.id} style={s.record}>
                <TouchableOpacity
                  accessibilityRole="checkbox"
                  accessibilityLabel={p.first_name + " " + p.last_name}
                  accessibilityState={{ checked: selected.includes(p.id) }}
                  disabled={disabled}
                  onPress={() => {
                    setScenario(null);
                    setSelected((old) =>
                      old.includes(p.id)
                        ? old.filter((id) => id !== p.id)
                        : [...old, p.id],
                    );
                  }}
                  style={[s.button, selected.includes(p.id) && s.selected]}
                >
                  <Text style={s.link}>
                    {p.first_name} {p.last_name} ·{" "}
                    {p.current_rate ?? t("No saved rate")} {currency}
                  </Text>
                </TouchableOpacity>
                {selected.includes(p.id) && (
                  <>
                    <Text style={s.heading}>{t("Rate history")}</Text>
                    {(p.history || []).map((h, i) => (
                      <Text key={i} style={s.text}>
                        {String(h.effective_date).slice(0, 10)} ·{" "}
                        {h.hourly_rate} {currency}
                      </Text>
                    ))}
                  </>
                )}
              </View>
            ))}
            <Text style={s.text}>
              {t("Selected employees: {count}", {
                count: String(selected.length),
              })}
            </Text>
            {choices(changes, kind, (v) => {
              setKind(v);
              setValue("");
            })}
            {field("Compensation value", value, setValue, true)}
            {field("Effective date (YYYY-MM-DD)", date, setDate)}
            {button(
              "Save compensation change",
              () =>
                validate(() => {
                  const request = compensationPayload(
                    selected,
                    employees.map((p) => p.id),
                    kind,
                    value,
                    date,
                  );
                  const names = selected
                    .map((id) => {
                      const p = employees.find((v) => v.id === id)!;
                      return p.first_name + " " + p.last_name;
                    })
                    .join(", ");
                  ask(
                    "Save compensation change?",
                    t(
                      "Employees: {names}. Change: {kind} {value}. Effective: {date}.",
                      {
                        names,
                        kind: t(changes[kind as keyof typeof changes]),
                        value,
                        date,
                      },
                    ),
                    async () => {
                      await api.post(request.path, request.body);
                    },
                    "Compensation change saved.",
                  );
                }),
              !selected.length,
            )}
          </View>
          <View style={s.card}>
            <Text style={s.heading}>{t("Compensation cost scenario")}</Text>
            <Text style={s.warning}>
              {t(
                "Read-only estimate using 40 hours per employee and current rates. Excludes deductions, overtime, benefits and employer costs. A scenario does not change rates or payroll. Future effective-dated changes are not simulated.",
              )}
            </Text>
            {choices(scenarios, scenarioType, (v) => {
              setScenarioType(v);
              setScenario(null);
            })}
            {field(
              "Scenario value",
              scenarioValue,
              (v) => {
                setScenarioValue(v);
                setScenario(null);
              },
              true,
            )}
            {button(
              "Preview cost scenario",
              () =>
                validate(() => {
                  const body = compensationScenario(
                    selected,
                    employees.map((p) => p.id),
                    scenarioType,
                    scenarioValue,
                  );
                  void run(
                    async () => {
                      const result = await api.post<Scenario>(
                        "/payroll/what-if",
                        body,
                      );
                      if (
                        !Number.isFinite(result.currentTotal) ||
                        !Number.isFinite(result.projectedTotal) ||
                        !Number.isFinite(result.delta)
                      )
                        throw Error(t("The cost scenario is unavailable."));
                      if (current()) setScenario(result);
                    },
                    "Cost scenario calculated. No wages changed.",
                    false,
                  );
                }),
              !selected.length,
            )}
            {scenario &&
              [
                ["Current 40-hour estimate", scenario.currentTotal],
                ["Projected 40-hour estimate", scenario.projectedTotal],
                ["Estimated difference", scenario.delta],
              ].map(([label, amount]) => (
                <Text key={label} style={s.text}>
                  {t(String(label))}: {amount} {currency}
                </Text>
              ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#071321" },
  title: { fontSize: 25, color: "#FFF", fontWeight: "800" },
  heading: {
    fontSize: 19,
    color: "#FFF",
    fontWeight: "700",
    marginVertical: 10,
  },
  text: { color: "#DAE5EE", lineHeight: 23 },
  warning: {
    color: "#FFDB91",
    backgroundColor: "#322B1B",
    padding: 12,
    marginVertical: 10,
    lineHeight: 23,
  },
  error: { color: "#FF91A4", padding: 12 },
  success: { color: "#A7F3D0", padding: 12 },
  card: {
    backgroundColor: "#102035",
    padding: 14,
    borderRadius: 14,
    marginVertical: 12,
  },
  record: { borderTopWidth: 1, borderColor: "#34506A" },
  field: { marginVertical: 9 },
  input: {
    backgroundColor: "#071321",
    borderWidth: 1,
    borderColor: "#34506A",
    color: "#FFF",
    padding: 12,
    borderRadius: 7,
    minHeight: 48,
  },
  button: { padding: 14, minHeight: 48, marginVertical: 4, borderRadius: 7 },
  link: { color: "#67E8F9", fontWeight: "700" },
  selected: { backgroundColor: "#164D63" },
  disabled: { opacity: 0.4 },
  choices: { flexDirection: "row", flexWrap: "wrap" },
});
