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
  companyStorage,
  formTypes,
  yearEndBoxLabels,
  yearEndCompanyFields,
  yearEndConfirmation,
  yearEndSelection,
} from "../utils/yearEnd";
type Person = { id: string; name: string };
type Snapshot = {
  employer?: Record<string, string>;
  employee?: { firstName: string; lastName: string; maskedSin: string | null };
  t4Manifest?: Record<string, string>;
  t4aManifest?: Record<string, string>;
  rl1Manifest?: Record<string, string>;
  employerMetrics?: Record<string, string>;
  source?: string;
};
type Slip = {
  id: string;
  employee_id: string;
  tax_year: number;
  form_type: string;
  employee_name: string;
  generated_at: string;
};
export default function YearEndScreen() {
  const { user } = useAuth(),
    { t } = useLang(),
    nav = useNavigation(),
    insets = useSafeAreaInsets(),
    manager = ["boss", "owner", "manager", "admin"].includes(
      String(user?.role).toLowerCase(),
    );
  const [people, setPeople] = useState<Person[]>([]),
    [company, setCompany] = useState<Record<string, string>>({}),
    [year, setYear] = useState(String(new Date().getFullYear())),
    [employee, setEmployee] = useState(""),
    [form, setForm] = useState("T4");
  const [slips, setSlips] = useState<Slip[]>([]),
    [preview, setPreview] = useState<Snapshot | null>(null),
    [stored, setStored] = useState<Snapshot | null>(null),
    [hash, setHash] = useState(""),
    [reference, setReference] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const [loaded, setLoaded] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const identity = String(user?.companyId) + ":" + String(user?.id),
    key = identity + ":" + year,
    ref = useRef(key);
  ref.current = key;
  const selection = key + ":" + employee + ":" + form,
    selectionRef = useRef(selection);
  selectionRef.current = selection;
  const active = useRef(false),
    seq = useRef(0),
    lock = useRef(false),
    current = () => active.current && ref.current === key;
  const ready = manager && loaded === key,
    disabled = !ready || loading || busy;
  useEffect(() => {
    setPreview(null);
    setHash("");
    setStored(null);
    setReference("");
    setConfirmed(false);
  }, [selection]);
  useEffect(() => {
    setEmployee("");
    setCompany({});
    setPeople([]);
    setNotice("");
    setError("");
  }, [identity]);
  const load = useCallback(async () => {
    const request = ++seq.current;
    setLoading(true);
    setLoaded("");
    setPreview(null);
    setHash("");
    setStored(null);
    setConfirmed(false);
    try {
      if (!manager) throw Error(t("Payroll manager access required."));
      yearEndSelection("00000000-0000-4000-a000-000000000001", year, "T4");
      const [options, employer, archive] = await Promise.all([
        api.get<{
          actorId: string;
          companyId: string;
          manager: boolean;
          people: Person[];
        }>("/year-end/employees"),
        api.get<{ company: Record<string, string> }>("/year-end/company"),
        api.get<{ actorId: string; companyId: string; slips: Slip[] }>(
          "/year-end/finalized?taxYear=" + year,
        ),
      ]);
      if (!active.current || ref.current !== key || seq.current !== request)
        return;
      if (
        options.actorId !== user?.id ||
        options.companyId !== user?.companyId ||
        options.manager !== true ||
        employer.company?.id !== user?.companyId ||
        archive.actorId !== user?.id ||
        archive.companyId !== user?.companyId ||
        !Array.isArray(archive.slips) ||
        !Array.isArray(options.people)
      )
        throw Error(t("Year-end records could not be verified."));
      setPeople(options.people);
      setCompany(
        Object.fromEntries(
          Object.keys(companyStorage).map((k) => [
            k,
            employer.company[companyStorage[k]] || "",
          ]),
        ),
      );
      setSlips(archive.slips);
      setLoaded(key);
      setError("");
      setEmployee((old) =>
        options.people.some((p) => p.id === old) ? old : "",
      );
    } catch (e: any) {
      if (active.current && ref.current === key && seq.current === request)
        setError(
          e.response?.data?.message ||
            e.message ||
            t("Year-end records could not be loaded."),
        );
    } finally {
      if (active.current && ref.current === key && seq.current === request)
        setLoading(false);
    }
  }, [key, year, manager, user?.id, user?.companyId, t]);
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      void load();
      return () => {
        active.current = false;
        seq.current++;
      };
    }, [load]),
  );
  const run = async (work: () => Promise<void>) => {
    if (lock.current || disabled || !current()) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!(await checkOnlineStatus()))
        throw Error(t("Payroll requires a connection. Nothing was submitted."));
      if (current()) await work();
    } catch (e: any) {
      if (current()) {
        setHash("");
        setPreview(null);
        setLoaded("");
        setError(
          (e.response?.data?.message ||
            e.message ||
            t("Year-end action failed.")) +
            " " +
            t("Refresh and check the current payroll before retrying."),
        );
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
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
        value={value}
        onChangeText={change}
        keyboardType={numeric ? "number-pad" : "default"}
        style={s.input}
      />
    </View>
  );
  const show = (snapshot: Snapshot) => (
    <View style={s.card}>
      <Text style={s.heading}>{snapshot.employer?.name}</Text>
      <Text style={s.text}>
        {snapshot.employee?.firstName} {snapshot.employee?.lastName} ·{" "}
        {snapshot.employee?.maskedSin || t("SIN not configured")}
      </Text>
      <Text style={s.text}>
        {snapshot.employer?.businessNumber} ·{" "}
        {snapshot.employer?.payrollAccountNumber}
      </Text>
      {Object.entries({
        ...snapshot.t4Manifest,
        ...snapshot.t4aManifest,
        ...snapshot.rl1Manifest,
        ...snapshot.employerMetrics,
      }).map(([k, v]) => (
        <Text style={s.text} key={k}>
          {t(yearEndBoxLabels[k] || k)}: {v} CAD
        </Text>
      ))}
      <Text style={s.warning}>
        {t(
          "Review summary only. No government filing or bank verification was performed.",
        )}
      </Text>
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
      <Text style={s.title}>{t("Year-end review and archive")}</Text>
      <Text style={s.warning}>
        {t(
          "Automatic mapping is limited to recorded, reviewed regular Alberta/CAD payments in 2026. Contractor, Quebec, worldwide and incomplete legacy records require the local filing process. Independently review every amount before storing a snapshot.",
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
      <Text style={s.text}>{t("Tax year")}</Text>
      <TextInput
        accessibilityLabel={t("Tax year")}
        editable={!busy}
        value={year}
        onChangeText={setYear}
        keyboardType="number-pad"
        style={s.input}
      />
      <TouchableOpacity
        accessibilityRole="button"
        disabled={busy || loading}
        onPress={() => void load()}
        style={s.button}
      >
        <Text style={s.link}>{t("Refresh")}</Text>
      </TouchableOpacity>
      {loading && <ActivityIndicator />}
      {ready && (
        <>
          <View style={s.card}>
            <Text style={s.heading}>{t("Employer identity")}</Text>
            {Object.entries(yearEndCompanyFields).map(([key, label]) =>
              field(label, company[key] || "", (v) => {
                setHash("");
                setPreview(null);
                setCompany((old) => ({ ...old, [key]: v }));
              }),
            )}
            {button("Save employer identity", () =>
              Alert.alert(
                t("Save employer identity?"),
                t("Changing employer details invalidates the current preview."),
                [
                  { text: t("Cancel"), style: "cancel" },
                  {
                    text: t("Confirm"),
                    onPress: () =>
                      void run(async () => {
                        await api.patch("/year-end/company", company);
                        if (current()) {
                          await load();
                          setNotice(t("Employer identity saved."));
                        }
                      }),
                  },
                ],
              ),
            )}
          </View>
          <View style={s.card}>
            <Text style={s.heading}>{t("Select employee")}</Text>
            {people.map((person) => (
              <TouchableOpacity
                key={person.id}
                accessibilityRole="button"
                accessibilityState={{ selected: employee === person.id }}
                disabled={disabled}
                onPress={() => setEmployee(person.id)}
                style={[s.button, employee === person.id && s.selected]}
              >
                <Text style={s.link}>{person.name}</Text>
              </TouchableOpacity>
            ))}
            <View style={s.choices}>
              {formTypes.map((type) => (
                <TouchableOpacity
                  accessibilityRole="button"
                  key={type}
                  accessibilityState={{ selected: form === type }}
                  disabled={disabled}
                  onPress={() => setForm(type)}
                  style={[s.button, form === type && s.selected]}
                >
                  <Text style={s.link}>{type}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {button(
              "Preview year-end totals",
              () =>
                void run(async () => {
                  const request = yearEndSelection(employee, year, form),
                    selected = selection;
                  const result = await api.get<{
                    preview: Snapshot;
                    previewHash: string;
                  }>(
                    "/year-end/preview?" +
                      "employeeId=" + encodeURIComponent(request.employeeId) + "&taxYear=" + request.taxYear + "&formType=" + encodeURIComponent(request.formType),
                  );
                  if (current() && selectionRef.current === selected) {
                    setPreview(result.preview);
                    setHash(result.previewHash);
                    setConfirmed(false);
                    setReference("");
                  }
                }),
              !people.some((p) => p.id === employee),
            )}
            {preview && show(preview)}
            {preview && (
              <>
                {field(
                  "Independent year-end review reference",
                  reference,
                  setReference,
                )}
                <Text style={s.text}>
                  {t(
                    "I independently reviewed the annual payments and every displayed form amount.",
                  )}
                </Text>
                <Switch
                  accessibilityLabel={t("Confirm independent year-end review")}
                  disabled={disabled}
                  value={confirmed}
                  onValueChange={setConfirmed}
                />
                {button(
                  "Store reviewed year-end snapshot",
                  () =>
                    Alert.alert(
                      t("Store reviewed snapshot?"),
                      t("Employee: {name}. Form: {form}. Tax year: {year}.", {
                        name:
                          people.find((p) => p.id === employee)?.name ||
                          employee,
                        form,
                        year,
                      }) +
                        " " +
                        t(
                          "The server will reject changed payroll or employer totals. This stores a review record and does not file a return.",
                        ),
                      [
                        { text: t("Cancel"), style: "cancel" },
                        {
                          text: t("Confirm"),
                          onPress: () =>
                            void run(async () => {
                              if (selectionRef.current !== selection) return;
                              const body = yearEndConfirmation(
                                yearEndSelection(employee, year, form),
                                hash,
                                reference,
                                confirmed,
                              );
                              await api.post("/year-end/finalize", body);
                              if (current()) {
                                await load();
                                setReference("");
                                setNotice(
                                  t(
                                    "Reviewed snapshot stored. No government filing was submitted.",
                                  ),
                                );
                              }
                            }),
                        },
                      ],
                    ),
                  !hash ||
                    !confirmed ||
                    reference.trim().length < 8 ||
                    reference.trim().length > 500,
                )}
              </>
            )}
          </View>
          <View style={s.card}>
            <Text style={s.heading}>{t("Reviewed year-end archive")}</Text>
            <Text style={s.warning}>
              {t(
                "Legacy slips without verified employer provenance are not shown. Reconcile those records separately.",
              )}
            </Text>
            {!slips.length && (
              <Text style={s.text}>
                {t("No reviewed snapshots for this year.")}
              </Text>
            )}
            {slips.map((slip) => (
              <View key={slip.form_type + slip.id}>
                <Text style={s.text}>
                  {slip.employee_name} · {slip.form_type} · {slip.tax_year}
                </Text>
                {button(
                  "Open stored snapshot",
                  () =>
                    void run(async () => {
                      const response = await api.get<{
                        slip: { snapshot: Snapshot };
                      }>(
                        "/year-end/finalized/" +
                          encodeURIComponent(slip.form_type) +
                          "/" +
                          encodeURIComponent(slip.id),
                      );
                      if (current()) setStored(response.slip.snapshot);
                    }),
                )}
              </View>
            ))}
            {stored && show(stored)}
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
  warning: { color: "#FFDB91", padding: 12, marginVertical: 8, lineHeight: 23 },
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
    color: "#FFF",
    backgroundColor: "#071321",
    borderColor: "#34506A",
    borderWidth: 1,
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
