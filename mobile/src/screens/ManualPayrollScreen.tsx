import { sharePayStatement } from "../services/payStatement";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
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
  newPayrollInput,
  payrollCalculationInput,
  payrollDate,
  payrollPeriod,
  PayrollInput,
  PayrollRules,
  regularFields,
} from "../utils/manualPayroll";

type Snapshot = {
  gross: string;
  net: string;
  currency: string;
  payDate: string;
  incomeTax: string;
  cpp?: string;
  cpp2?: string;
  ei?: string;
  classification: string;
  scope?: string;
  lines?: { id: string; label: string; amount: string; category: string }[];
};
type Run = {
  id: string;
  company_id: string;
  period_start: string;
  period_end: string;
  status: string;
  notes?: string;
};
type Item = {
  id: string;
  first_name: string;
  last_name: string;
  hours: string;
  hourly_rate: string;
  adjustments: string;
  cpp_deduction: string;
  ei_deduction: string;
  tax_deduction: string;
  calculation_snapshot?: Snapshot;
  payment_reference?: string;
  paid_on?: string;
};
type Detail = { payroll: Run; items: Item[] };
type Config = { current: { revision: number; rules: PayrollRules } | null };
const datePart = (s: string) => String(s || "").slice(0, 10);
const labels: Record<string, string> = {
  payDate: "Pay date",
  gross: "Gross wages",
  taxable: "Taxable wages",
  cppYtd: "CPP already deducted this year",
  cpp2Ytd: "CPP2 already deducted this year",
  eiYtd: "EI already deducted this year",
  pensionableYtd: "Pensionable earnings already paid this year",
  additionalTax: "Additional income tax",
  federalClaim: "Federal claim (blank uses rule default)",
  provincialClaim: "Provincial claim (blank uses rule default)",
  reviewReference: "Input review reference",
};
export default function ManualPayrollScreen() {
  const { user } = useAuth(),
    { t } = useLang(),
    nav = useNavigation(),
    insets = useSafeAreaInsets();
  const manager = ["boss", "owner", "manager", "admin"].includes(
    String(user?.role).toLowerCase(),
  );
  const [id, setId] = useState(""),
    [itemId, setItemId] = useState(""),
    [runs, setRuns] = useState<Run[]>([]),
    [detail, setDetail] = useState<Detail | null>(null),
    [config, setConfig] = useState<Config | null>(null),
    [input, setInput] = useState<PayrollInput>({});
  const [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [reference, setReference] = useState(""),
    [paidOn, setPaidOn] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const key = String(user?.companyId) + ":" + String(user?.id) + ":" + id,
    keyRef = useRef(key);
  keyRef.current = key;
  const active = useRef(false),
    sequence = useRef(0),
    lock = useRef(false);
  const current = () => active.current && keyRef.current === key;
  const ready = manager && loaded === key,
    disabled = !ready || loading || busy;
  const item = detail?.items.find((v) => v.id === itemId),
    rules = config?.current?.rules,
    revision = config?.current?.revision;
  const approved = ["approved", "paid"].includes(detail?.payroll.status || "");
  useEffect(() => {
    setItemId("");
    setInput({});
    setReference("");
    setPaidOn("");
    setConfirmed(false);
    setNotes("");
    setNotice("");
    setError("");
  }, [key]);
  useEffect(() => {
    setId("");
    setStart("");
    setEnd("");
  }, [user?.id, user?.companyId]);
  useEffect(() => {
    setItemId("");
    setInput({});
    setConfirmed(false);
    setReference("");
  }, [revision]);
  useEffect(() => {
    setPaidOn(item?.calculation_snapshot?.payDate || "");
  }, [item?.id, item?.calculation_snapshot?.payDate]);
  const load = useCallback(async () => {
    const seq = ++sequence.current;
    setLoaded("");
    setLoading(true);
    try {
      if (!manager) throw Error(t("Payroll manager access required."));
      const [list, rulesData, actor, record] = await Promise.all([
        api.get<{ payrolls: Run[] }>("/payroll"),
        api.get<Config>("/payroll-rules"),
        api.get<{ actorId: string; manager: boolean }>(
          "/operations/work-options",
        ),
        id
          ? api.get<Detail>("/manual-payroll/" + encodeURIComponent(id))
          : Promise.resolve(null),
      ]);
      if (!active.current || keyRef.current !== key || sequence.current !== seq)
        return;
      if (
        actor.actorId !== user?.id ||
        actor.manager !== true ||
        !Array.isArray(list.payrolls) ||
        list.payrolls.some((p) => p.company_id !== user?.companyId) ||
        (record &&
          (record.payroll.id !== id ||
            record.payroll.company_id !== user?.companyId ||
            !Array.isArray(record.items)))
      )
        throw Error(
          t(
            "Payroll records could not be verified. Refresh before continuing.",
          ),
        );
      setRuns(list.payrolls);
      setConfig(rulesData);
      setDetail(record);
      setLoaded(key);
      setError("");
      setNotes(record?.payroll.notes || "");
    } catch (e: any) {
      if (
        active.current &&
        keyRef.current === key &&
        sequence.current === seq
      ) {
        setLoaded("");
        setDetail(null);
        setError(
          e.response?.data?.message ||
            e.message ||
            t("Payroll could not be loaded."),
        );
      }
    } finally {
      if (active.current && keyRef.current === key && sequence.current === seq)
        setLoading(false);
    }
  }, [key, id, manager, user?.id, user?.companyId, t]);
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
  const run = async (work: () => Promise<void>, message: string) => {
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
      setConfirmed(false);
      setReference("");
      await load();
      if (current()) setNotice(t(message));
    } catch (e: any) {
      if (current()) {
        setLoaded("");
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
    value: string,
    change: (v: string) => void,
    numeric = false,
  ) => (
    <View key={label} style={s.field}>
      <Text style={s.text}>{t(label)}</Text>
      <TextInput
        accessibilityLabel={t(label)}
        editable={!disabled}
        style={s.input}
        value={value}
        onChangeText={change}
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
  const selectItem = (v: Item) => {
    setItemId(v.id);
    setReference("");
    setConfirmed(false);
    setPaidOn(v.calculation_snapshot?.payDate || "");
    if (rules) {
      const gross =
        v.calculation_snapshot?.gross ??
        String(
          Number(v.hours) * Number(v.hourly_rate) +
            Number(v.adjustments || 0) +
            Number(v.cpp_deduction || 0) +
            Number(v.ei_deduction || 0) +
            Number(v.tax_deduction || 0),
        );
      setInput(newPayrollInput(rules, gross));
    }
  };
  const validate = (work: () => void) => {
    try {
      work();
    } catch (e: any) {
      setError(t(e.message));
    }
  };
  const status = (v: string) =>
    t(
      (
        {
          draft: "Draft",
          approved: "Reviewed",
          paid: "External payments recorded",
        } as Record<string, string>
      )[v] || "Status unavailable",
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
      <Text style={s.title}>{t("Payroll & manual payments")}</Text>
      <Text style={s.warning}>
        {t(
          "Calculate and independently review payroll, pay employees through your bank, then record your confirmation. This app does not send money or verify bank settlement.",
        )}
      </Text>
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
          setConfirmed(false);
          void load();
        }}
        style={s.button}
      >
        <Text style={s.link}>{t("Refresh")}</Text>
      </TouchableOpacity>
      {loading && <ActivityIndicator />}
      {ready && (
        <>
          {button("Company payroll rules", () =>
            nav.navigate("PayrollRules" as never),
          )}
          {button('Payroll administration', () => nav.navigate('PayrollAdministration' as never))}
          <View style={s.card}>
            <Text style={s.heading}>{t("Prepare payroll draft")}</Text>
            <Text style={s.text}>
              {t(
                "Includes all approved, unlocked time entries in this company and period, using saved effective pay rates. Preparing a draft locks those entries. It does not approve or pay payroll.",
              )}
            </Text>
            {field("Period start (YYYY-MM-DD)", start, setStart)}
            {field("Period end (YYYY-MM-DD)", end, setEnd)}
            {button("Prepare draft", () =>
              validate(() => {
                const body = payrollPeriod(start, end);
                ask(
                  "Prepare payroll draft?",
                  t("Period: {start} to {end}", { start, end }),
                  async () => {
                    const result = await api.post<{ payrollId: string }>(
                      "/payroll/generate",
                      body,
                    );
                    if (current()) {
                      setId(result.payrollId);
                      setStart("");
                      setEnd("");
                    }
                  },
                  "Draft prepared. Select an employee to calculate payroll.",
                );
              }),
            )}
          </View>
          <Text style={s.heading}>{t("Payroll runs")}</Text>
          {!runs.length && <Text style={s.text}>{t("No payroll runs.")}</Text>}
          {runs.map((p) => (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ selected: p.id === id }}
              key={p.id}
              disabled={disabled}
              onPress={() => setId(p.id)}
              style={[s.button, p.id === id && s.selected]}
            >
              <Text style={s.link}>
                {datePart(p.period_start)} – {datePart(p.period_end)} ·{" "}
                {status(p.status)}
              </Text>
            </TouchableOpacity>
          ))}
          {detail && (
            <View style={s.card}>
              <Text style={s.heading}>{t("Payroll details")}</Text>
              <Text style={s.text}>
                {t("Saved rule revision: {revision}", {
                  revision: String(revision || 0),
                })}{" "}
                · {status(detail.payroll.status)}
              </Text>
              {!approved && (
                <>
                  {field("Payroll notes", notes, setNotes)}
                  {button(
                    "Save draft notes",
                    () =>
                      void run(async () => {
                        await api.put("/payroll/" + id, { notes });
                      }, "Draft notes saved."),
                  )}
                  {button("Delete draft", () =>
                    ask(
                      "Delete payroll draft?",
                      t(
                        "This deletes only the draft and unlocks its time entries.",
                      ),
                      async () => {
                        await api.delete("/payroll/" + id);
                        if (current()) setId("");
                      },
                      "Draft deleted.",
                    ),
                  )}
                </>
              )}
              <Text style={s.heading}>{t("Employees")}</Text>
              {detail.items.map((v) => (
                <TouchableOpacity
                  key={v.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: v.id === itemId }}
                  disabled={disabled}
                  onPress={() => selectItem(v)}
                  style={[s.button, v.id === itemId && s.selected]}
                >
                  <Text style={s.link}>
                    {v.first_name} {v.last_name} ·{" "}
                    {t(
                      v.payment_reference
                        ? "Payment recorded"
                        : v.calculation_snapshot
                          ? "Calculated — review required"
                          : "Uncalculated",
                    )}
                  </Text>
                </TouchableOpacity>
              ))}
              {item && !approved && rules && (
                <>
                  <Text style={s.warning}>
                    {t(
                      rules.engine === "company_rules_v1"
                        ? "Enter independently checked local gross, taxable wages, manual deductions and YTD contributions. Country selection does not certify tax coverage."
                        : "Regular Alberta/CAD wages in 2026 only. Confirm full-year CPP eligibility and standard EI. Excludes bonuses, Quebec transfers, noncash benefits, pension/RRSP deductions and special credits. YTD excludes this payment; enter zero only when no prior pay exists.",
                    )}
                  </Text>
                  {(rules.engine === "company_rules_v1"
                    ? ["payDate", "gross", "taxable", "reviewReference"]
                    : [
                        "payDate",
                        ...regularFields,
                        "federalClaim",
                        "provincialClaim",
                      ]
                  ).map((k) =>
                    field(
                      labels[k],
                      String(input[k] ?? ""),
                      (v) => setInput((old) => ({ ...old, [k]: v })),
                      !["payDate", "reviewReference"].includes(k),
                    ),
                  )}
                  {rules.engine === "company_rules_v1" &&
                    (rules.lines || [])
                      .filter((l) => l.method === "manual")
                      .map((l) => (
                        <View key={l.id}>
                          <Text style={s.text}>{l.label}</Text>
                          {field(
                            "Independently reviewed amount",
                            input.manualAmounts?.[l.id] || "",
                            (v) =>
                              setInput((old) => ({
                                ...old,
                                manualAmounts: {
                                  ...old.manualAmounts,
                                  [l.id]: v,
                                },
                              })),
                            true,
                          )}
                        </View>
                      ))}
                  {rules.engine === "company_rules_v1" &&
                    (rules.lines || [])
                      .filter((l) => l.annualCap !== null)
                      .map((l) => (
                        <View key={l.id}>
                          <Text style={s.text}>{l.label}</Text>
                          {field(
                            "Prior YTD contribution",
                            input.ytd?.[l.id] || "",
                            (v) =>
                              setInput((old) => ({
                                ...old,
                                ytd: { ...old.ytd, [l.id]: v },
                              })),
                            true,
                          )}
                        </View>
                      ))}
                  <Text style={s.text}>
                    {t(
                      "I independently checked the inputs and confirm the stated calculation scope.",
                    )}
                  </Text>
                  <Switch
                    accessibilityLabel={t("Confirm calculation scope")}
                    disabled={disabled}
                    value={
                      input[
                        rules.engine === "company_rules_v1"
                          ? "companyRulesConfirmed"
                          : "standardCaseConfirmed"
                      ] === true
                    }
                    onValueChange={(v) =>
                      setInput((old) => ({
                        ...old,
                        [rules.engine === "company_rules_v1"
                          ? "companyRulesConfirmed"
                          : "standardCaseConfirmed"]: v,
                      }))
                    }
                  />
                  {button(
                    "Calculate and save for review",
                    () =>
                      validate(() => {
                        const payload = {
                          itemId,
                          rulesRevision: revision,
                          input: payrollCalculationInput(rules, input),
                        };
                        ask(
                          "Save payroll calculation?",
                          t(
                            "This replaces this draft employee calculation using saved rule revision {revision}.",
                            { revision: String(revision || 0) },
                          ),
                          async () => {
                            await api.post(
                              "/manual-payroll/" + id + "/calculate",
                              payload,
                            );
                          },
                          "Calculation saved for independent review.",
                        );
                      }),
                    !revision,
                  )}
                </>
              )}
              {item?.calculation_snapshot && (
                <View style={s.card}>
                  <Text style={s.heading}>{t("Saved calculation")}</Text>
                  {[
                    ["Gross wages", item.calculation_snapshot.gross],
                    ["Income tax", item.calculation_snapshot.incomeTax],
                    ["Net pay", item.calculation_snapshot.net],
                  ].map(([label, value]) => (
                    <Text key={label} style={s.text}>
                      {t(label)}: {value} {item.calculation_snapshot?.currency}
                    </Text>
                  ))}
                  {!item.calculation_snapshot.lines &&
                    ["cpp", "cpp2", "ei"].map((k) => (
                      <Text key={k} style={s.text}>
                        {k.toUpperCase()}:{" "}
                        {item.calculation_snapshot?.[k as "cpp"]}{" "}
                        {item.calculation_snapshot?.currency}
                      </Text>
                    ))}
                  {item.calculation_snapshot.lines?.map((l) => (
                    <Text key={l.id} style={s.text}>
                      {l.label} ({l.category}): {l.amount}{" "}
                      {item.calculation_snapshot?.currency}
                    </Text>
                  ))}
                  <Text style={s.text}>
                    {t("Pay date")}: {item.calculation_snapshot.payDate}
                  </Text>
                  <Text style={s.warning}>
                    {t(
                      "Company review is required. A saved calculation does not establish government approval.",
                    )}
                  </Text>
                  {!!item.calculation_snapshot.scope && (
                    <Text style={s.text}>
                      {item.calculation_snapshot.scope}
                    </Text>
                  )}
                </View>
              )}
              {!approved && (
                <>
                  {field(
                    "Independent payroll review reference",
                    reference,
                    setReference,
                  )}
                  <Text style={s.text}>
                    {t(
                      "I checked every employee gross, YTD and deductions independently. This records company review, not government approval.",
                    )}
                  </Text>
                  <Switch
                    accessibilityLabel={t("Confirm independent payroll review")}
                    disabled={disabled}
                    value={confirmed}
                    onValueChange={setConfirmed}
                  />
                  {button(
                    "Approve reviewed payroll",
                    () =>
                      ask(
                        "Approve reviewed payroll?",
                        t("Review reference: {reference}", { reference }),
                        async () => {
                          await api.post("/manual-payroll/" + id + "/review", {
                            reference: reference.trim(),
                            confirmed,
                          });
                        },
                        "Payroll reviewed. Pay through your bank before recording payments.",
                      ),
                    !confirmed ||
                      reference.trim().length < 8 ||
                      reference.trim().length > 500 ||
                      !detail.items.length ||
                      detail.items.some((v) => !v.calculation_snapshot),
                  )}
                </>
              )}
              {approved &&
                item &&
                !item.payment_reference &&
                item.calculation_snapshot && (
                  <>
                    <Text style={s.warning}>
                      {t(
                        "Complete the exact net payment through your bank first. The payment date must match the reviewed pay date.",
                      )}
                    </Text>
                    {field(
                      "Actual payment date (YYYY-MM-DD)",
                      paidOn,
                      setPaidOn,
                    )}
                    {field(
                      "Bank payment reference (no account numbers)",
                      reference,
                      setReference,
                    )}
                    <Text style={s.text}>
                      {t(
                        "I completed this exact net payment through our bank.",
                      )}
                    </Text>
                    <Switch
                      accessibilityLabel={t("Confirm external bank payment")}
                      disabled={disabled}
                      value={confirmed}
                      onValueChange={setConfirmed}
                    />
                    {button(
                      "Record external payment",
                      () =>
                        validate(() => {
                          payrollDate(paidOn);
                          if (paidOn !== item.calculation_snapshot?.payDate)
                            throw Error(
                              "Payment date must match the reviewed pay date.",
                            );
                          const body = {
                            itemId,
                            paidOn,
                            reference: reference.trim(),
                            confirmed,
                            amount: item.calculation_snapshot.net,
                          };
                          ask(
                            "Record external payment?",
                            t(
                              "Amount: {amount} {currency}. Reference: {reference}",
                              {
                                amount: body.amount,
                                currency: item.calculation_snapshot.currency,
                                reference: body.reference,
                              },
                            ),
                            async () => {
                              await api.post(
                                "/manual-payroll/" + id + "/record-payment",
                                body,
                              );
                            },
                            "External payment recorded. Bank settlement was not verified.",
                          );
                        }),
                      !confirmed ||
                        reference.trim().length < 4 ||
                        reference.trim().length > 200,
                    )}
                  </>
                )}
              {approved &&
                item?.calculation_snapshot &&
                button(
                  "Export reviewed pay statement",
                  () =>
                    void run(async () => {
                      await sharePayStatement(item.id, current);
                    }, "Pay statement sharing closed."),
                )}
              {!!item?.payment_reference && (
                <Text style={s.success}>
                  {t("External payment recorded")}: {item.payment_reference} ·{" "}
                  {datePart(item.paid_on || "")}
                </Text>
              )}
            </View>
          )}
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
});
