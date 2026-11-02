import React, { useCallback, useRef, useState } from "react";
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
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const blank = (e: any = {}) => ({
  firstName: e.firstName || "",
  lastName: e.lastName || "",
  email: e.email || "",
  role: e.role || "employee",
  isActive: e.isActive !== false,
  hourlyRate: String(e.hourlyRate ?? ""),
  effectiveDate: today(),
  sin: "",
  dateOfBirth: e.dateOfBirth || "",
  temporaryPassword: "",
});
export const adminActionLabels: Record<string, string> = {
  "employee.invited": "Employee invited",
  "employee.profile_updated": "Profile updated",
  "employee.compensation_updated": "Compensation updated",
  "employee.tax_updated": "Tax information updated",
  "employee.password_reset": "Temporary password reset",
  "employee.role_updated": "Role updated",
  "employee.deactivated": "Employee deactivated",
  "company.ownership_transferred": "Ownership transferred",
};
export default function CompanyAdministrationScreen() {
  const { user } = useAuth(),
    { t, lang } = useLang(),
    nav = useNavigation(),
    insets = useSafeAreaInsets(),
    manager = ["boss", "owner", "manager", "admin"].includes(
      String(user?.role).toLowerCase(),
    );
  const identity = String(user?.companyId) + ":" + String(user?.id),
    ref = useRef(identity);
  ref.current = identity;
  const [data, setData] = useState<any>(null),
    [selected, setSelected] = useState<any>(null),
    [form, setForm] = useState(blank),
    [search, setSearch] = useState(""),
    [events, setEvents] = useState<any[] | null>(null),
    [auditOffset, setAuditOffset] = useState(0),
    [tab, setTab] = useState("profile");
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const active = useRef(false),
    seq = useRef(0),
    lock = useRef(false),
    current = () => active.current && ref.current === identity;
  const verify = (r: any) => {
    if (r.actorId !== user?.id || r.companyId !== user?.companyId)
      throw Error(t("Administration account could not be verified."));
  };
  const load = useCallback(async () => {
    if (!manager) return;
    const n = ++seq.current;
    setLoading(true);
    setLoaded("");
    setSelected(null);
    setForm(blank());
    setEvents(null);
    try {
      const r = await api.get<any>("/company-admin/overview");
      if (!current() || seq.current !== n) return;
      verify(r);
      if (
        !Array.isArray(r.employees) ||
        !r.employees.every(
          (e: any) =>
            /^[a-f0-9]{64}$/.test(e.recordVersion || "") &&
            typeof e.canManage === "boolean",
        ) ||
        !r.stats ||
        !r.permissions ||
        !(r.revenueByCurrency === null || Array.isArray(r.revenueByCurrency))
      )
        throw Error(t("Administration account could not be verified."));
      setData(r);
      setLoaded(identity);
      setError("");
    } catch (e: any) {
      if (current()) setError(e.response?.data?.message || e.message);
    } finally {
      if (current() && seq.current === n) setLoading(false);
    }
  }, [identity, manager, t]);
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      void load();
      return () => {
        active.current = false;
        seq.current++;
        setData(null);
        setSelected(null);
        setForm(blank());
        setEvents(null);
        setLoaded("");
        setSearch("");
        setNotice("");
      };
    }, [load]),
  );
  const ready = manager && loaded === identity && !loading && !busy;
  const run = async (fn: () => Promise<void>) => {
    if (!ready || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!(await checkOnlineStatus()))
        throw Error(t("Reconnect before changing company administration."));
      if (current()) await fn();
    } catch (e: any) {
      if (current()) {
        setError(e.response?.data?.message || t(e.message));
        if (!e.response) {
          setLoaded("");
          setSelected(null);
          setForm(blank());
          setNotice(
            t(
              "Response uncertain. Refresh and inspect records before retrying.",
            ),
          );
        }
      }
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  };
  const button = (
    label: string,
    fn: () => void,
    enabled = ready,
    translate = true,
  ) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={translate ? t(label) : label}
      disabled={!enabled}
      onPress={fn}
      style={[styles.button, !enabled && { opacity: 0.4 }]}
    >
      <Text style={styles.text}>{translate ? t(label) : label}</Text>
    </TouchableOpacity>
  );
  const field = (
    label: string,
    key: keyof ReturnType<typeof blank>,
    secret = false,
    numeric = false,
  ) => (
    <View>
      <Text style={styles.text}>{t(label)}</Text>
      <TextInput
        accessibilityLabel={t(label)}
        value={String(form[key] ?? "")}
        onChangeText={(s) => setForm((f) => ({ ...f, [key]: s }))}
        editable={ready}
        secureTextEntry={secret}
        autoCapitalize="none"
        keyboardType={numeric ? "decimal-pad" : "default"}
        style={styles.input}
      />
    </View>
  );
  const save = () => {
    if (!selected?.canManage || selected.id === user?.id) return;
    Alert.alert(
      t("Save employee changes?"),
      t(
        "This changes the selected employee account. No email or payment is sent.",
      ),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: t("Confirm"),
          onPress: () =>
            void run(async () => {
              const section =
                  tab === "pay"
                    ? "compensation"
                    : tab === "security"
                      ? "reset-password"
                      : tab,
                payload =
                  tab === "profile"
                    ? {
                        firstName: form.firstName,
                        lastName: form.lastName,
                        email: form.email,
                        role: form.role,
                        isActive: form.isActive,
                      }
                    : tab === "pay"
                      ? {
                          hourlyRate: form.hourlyRate,
                          effectiveDate: form.effectiveDate,
                        }
                      : tab === "tax"
                        ? { sin: form.sin, dateOfBirth: form.dateOfBirth }
                        : { temporaryPassword: form.temporaryPassword },
                url = "/company-admin/employees/" + selected.id + "/" + section;
              const r = await (tab === "profile" || tab === "tax"
                ? api.patch<any>(url, {
                    ...payload,
                    expectedVersion: selected.recordVersion,
                  })
                : api.post<any>(url, {
                    ...payload,
                    expectedVersion: selected.recordVersion,
                  }));
              if (!current()) return;
              verify(r);
              if (r.employee?.id !== selected.id)
                throw Error(t("Administration account could not be verified."));
              setForm(blank());
              await load();
              if (current())
                setNotice(
                  t(
                    "Employee changes saved. Refresh active sessions when roles or passwords change.",
                  ),
                );
            }),
        },
      ],
    );
  };
  const audit = (offset: number) =>
    void run(async () => {
      const r = await api.get<any>(
        "/company-admin/audit?limit=25&offset=" + offset,
      );
      if (!current()) return;
      verify(r);
      if (!Array.isArray(r.events))
        throw Error(t("Administration account could not be verified."));
      setEvents(r.events);
      setAuditOffset(offset);
    });
  const amount = (v: any) =>
    v == null ? t("Unavailable") : Number(v).toFixed(2);
  if (!manager)
    return (
      <View style={[styles.page, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.text}>{t("Manager access required")}</Text>
      </View>
    );
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={{
        padding: 16,
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 32,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {button("Back", () => nav.goBack(), !busy)}
      <Text style={styles.title}>{t("Company administration")}</Text>
      <Text style={styles.text}>
        {t(
          "Protected owners and administrators use dedicated account and ownership workflows. Managers cannot edit peers or promote employees. Changes are audited; payouts remain disabled.",
        )}
      </Text>
      {button("Refresh administration", () => void load(), !busy)}
      {loading && <ActivityIndicator />}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {notice ? <Text style={styles.text}>{notice}</Text> : null}
      {loaded === identity && data && (
        <>
          <Text style={styles.text}>
            {t("Company timezone")}: {data.timezone} · {data.asOfDate}
          </Text>
          <Text style={styles.text}>
            {t("Employees")}: {data.stats.totalEmployees ?? t("Unavailable")} ·{" "}
            {t("Active projects")}: {data.stats.activeJobs ?? t("Unavailable")}
          </Text>
          <Text style={styles.text}>
            {t("Recorded payroll (currency unspecified)")}:{" "}
            {amount(data.stats.totalPayrollThisMonth)}
          </Text>
          <Text style={styles.text}>
            {t("Recorded labour today (currency unspecified)")}:{" "}
            {amount(data.stats.labourCostToday)}
          </Text>
          <Text style={styles.text}>
            {t(
              "Margin requires currency and cost reconciliation. Recorded payments are not verified bank settlement.",
            )}
          </Text>
          {data.revenueByCurrency === null ? (
            <Text style={styles.error}>
              {t("Payment totals are unavailable.")}
            </Text>
          ) : (
            data.revenueByCurrency.map((r: any) => (
              <Text key={r.currency || "unspecified"} style={styles.text}>
                {r.currency || t("Unspecified currency")} ·{" "}
                {t("Recorded payments this month")}: {r.month_amount} ·{" "}
                {t("Today")}: {r.today_amount}
              </Text>
            ))
          )}
          <View style={styles.row}>
            {button("Team invitations", () => nav.navigate("Team" as never))}
            {button("Payroll administration", () =>
              nav.navigate("PayrollAdministration" as never),
            )}
            {button("Payout status", () =>
              nav.navigate("PayoutStatus" as never),
            )}
          </View>
          <Text style={styles.text}>{t("Search employees")}</Text>
          <TextInput
            accessibilityLabel={t("Search employees")}
            editable={ready}
            value={search}
            onChangeText={setSearch}
            style={styles.input}
          />
          {data.employees
            .filter((e: any) =>
              (e.fullName + " " + e.email + " " + e.role)
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((e: any) => (
              <View key={e.id} style={styles.card}>
                <Text style={styles.title}>{e.fullName}</Text>
                <Text style={styles.text}>
                  {e.email} · {t(e.role)} ·{" "}
                  {t(e.isActive ? "Active" : "Inactive")}
                </Text>
                <Text style={styles.text}>
                  {t("Current hourly rate")}: {amount(e.hourlyRate)} ·{" "}
                  {e.rateEffectiveDate || "—"}
                </Text>
                <Text style={styles.text}>
                  {t("Tax identifier")}:{" "}
                  {e.tax.maskedSin || t("Not configured")}
                </Text>
                {button(
                  t("Manage employee") + " " + e.fullName,
                  () => {
                    setSelected(e);
                    setForm({ ...blank(e), effectiveDate: data.asOfDate });
                    setTab("profile");
                    setError("");
                    setNotice("");
                  },
                  ready && e.canManage,
                  false,
                )}
              </View>
            ))}
          {selected && (
            <View style={styles.card}>
              <Text style={styles.title}>{selected.fullName}</Text>
              <View style={styles.row}>
                {(["profile", "pay", "tax", "security"] as const).map(
                  (section) => (
                    <React.Fragment key={section}>
                      {button(
                        section === "profile"
                          ? "Profile"
                          : section === "pay"
                            ? "Compensation"
                            : section === "tax"
                              ? "Tax information"
                              : "Security",
                        () => {
                          setTab(section);
                          setForm({
                            ...blank(selected),
                            effectiveDate: data.asOfDate,
                          });
                        },
                      )}
                    </React.Fragment>
                  ),
                )}
              </View>
              {tab === "profile" && (
                <>
                  {field("First name", "firstName")}
                  {field("Last name", "lastName")}
                  {field("Email", "email")}
                  <Text style={styles.text}>
                    {t("Role")}: {t(form.role)}
                  </Text>
                  {button("Employee role", () =>
                    setForm((f) => ({ ...f, role: "employee" })),
                  )}
                  {button(
                    "Manager role",
                    () => setForm((f) => ({ ...f, role: "manager" })),
                    ready && data.permissions.canAssignManager,
                  )}
                  <View style={styles.row}>
                    <Text style={styles.text}>{t("Active account")}</Text>
                    <Switch
                      accessibilityLabel={t("Active account")}
                      disabled={!ready}
                      value={form.isActive}
                      onValueChange={(b) =>
                        setForm((f) => ({ ...f, isActive: b }))
                      }
                    />
                  </View>
                </>
              )}
              {tab === "pay" && (
                <>
                  <Text style={styles.text}>
                    {t("New effective rates do not rewrite finalized payroll.")}
                  </Text>
                  {field("Hourly rate", "hourlyRate", false, true)}
                  {field("Effective date (YYYY-MM-DD)", "effectiveDate")}
                </>
              )}
              {tab === "tax" && (
                <>
                  <Text style={styles.text}>
                    {t(
                      "Only masked tax identifiers are returned. Blank fields preserve existing values. Format checks do not certify tax identity.",
                    )}
                  </Text>
                  {field("New SIN (optional)", "sin", true)}
                  {field("Date of birth (YYYY-MM-DD)", "dateOfBirth")}
                </>
              )}
              {tab === "security" && (
                <>
                  <Text style={styles.text}>
                    {t(
                      "Use at least 12 characters and at most 72 UTF-8 bytes. Share credentials securely; the employee must change this password on sign-in.",
                    )}
                  </Text>
                  {field("Temporary password", "temporaryPassword", true)}
                </>
              )}
              {button("Save employee changes", save)}
              {button("Close employee editor", () => {
                setSelected(null);
                setForm(blank());
              })}
            </View>
          )}
          {button("Read administration audit", () => audit(0))}
          {events && (
            <View style={styles.card}>
              <Text style={styles.title}>{t("Administration audit")}</Text>
              {events.map((e) => (
                <View key={e.id}>
                  <Text style={styles.text}>
                    {t(adminActionLabels[e.action] || "Administration event")} ·{" "}
                    {new Date(e.created_at).toLocaleString(lang)}
                  </Text>
                  <Text style={styles.text}>
                    {t("Employee ID")}: {e.employee_id}
                  </Text>
                </View>
              ))}
              {!events.length && (
                <Text style={styles.text}>
                  {t("No administration events on this page.")}
                </Text>
              )}
              {button(
                "Previous",
                () => audit(Math.max(0, auditOffset - 25)),
                ready && auditOffset > 0,
              )}
              {button(
                "Next",
                () => audit(auditOffset + 25),
                ready && events.length === 25 && auditOffset < 100000,
              )}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0B1220" },
  title: { fontSize: 23, fontWeight: "700", color: "#FFF", marginVertical: 12 },
  text: { fontSize: 15, color: "#E2E8F0", marginVertical: 5 },
  error: { color: "#FCA5A5", marginVertical: 10 },
  button: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#164E63",
    minHeight: 44,
    marginVertical: 5,
  },
  input: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#64748B",
    borderRadius: 8,
    color: "#FFF",
    minHeight: 46,
    marginVertical: 8,
  },
  card: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#172238",
    marginVertical: 8,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
});
