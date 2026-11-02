import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { reportSelection, shareReport } from "../services/reportFiles";
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const reportMetrics: Record<string, string> = {
  totalHours: "Elapsed hours",
  regularHours: "Regular hours",
  overtimeHours: "Overtime hours",
  grossWages: "Recorded wages (currency unspecified)",
  employees: "Employees",
  timeEntries: "Time entries",
  completedEntries: "Completed entries",
  approvedEntries: "Approved completed entries",
  mediaFiles: "Media files",
  verifiedMedia: "Marked media",
  analyzedPhotos: "Scored photos",
  averageComplianceScore: "Average photo score",
  compliantPhotos: "Photos scoring at least 70",
  voiceNotes: "Voice notes",
  gpsPoints: "GPS observations",
  attachments: "Attachments",
  anomalousEntries: "Anomalous entries",
  payrollHours: "Recorded payroll hours",
  hoursVariance: "Elapsed / payroll hours variance",
  completionRate: "Completion rate (%)",
  approvalRate: "Approval rate (%)",
  readinessScore: "Report readiness (%)",
};
export default function ReportsScreen() {
  const { user } = useAuth(),
    { t } = useLang(),
    nav = useNavigation(),
    insets = useSafeAreaInsets(),
    manager = ["boss", "owner", "admin", "manager"].includes(
      String(user?.role).toLowerCase(),
    );
  const identity = String(user?.companyId) + ":" + String(user?.id),
    ref = useRef(identity);
  ref.current = identity;
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]),
    [more, setMore] = useState(false),
    [project, setProject] = useState(""),
    [start, setStart] = useState(localDate().slice(0, 8) + "01"),
    [end, setEnd] = useState(localDate),
    [loaded, setLoaded] = useState(""),
    [report, setReport] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(0);
  const selection = identity + ":" + project + ":" + start + ":" + end,
    selectionRef = useRef(selection);
  selectionRef.current = selection;
  const active = useRef(false),
    seq = useRef(0),
    lock = useRef(false),
    current = () => active.current && ref.current === identity;
  const verify = (r: any) => {
    if (r.actorId !== user?.id || r.companyId !== user?.companyId)
      throw Error(t("Report account could not be verified."));
  };
  const load = useCallback(async () => {
    if (!manager) return;
    const n = ++seq.current;
    setLoading(true);
    setLoaded("");
    setReport(null);
    try {
      const r = await api.get<any>("/reports/workspace");
      if (!current() || seq.current !== n) return;
      verify(r);
      if (!Array.isArray(r.projects))
        throw Error(t("Report account could not be verified."));
      setProjects(r.projects);
      setMore(r.moreProjects);
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
        setLoaded("");
        setReport(null);
        setProjects([]);
        setProject("");
      };
    }, [load]),
  );
  useEffect(() => {
    setReport(null);
    setPage(0);
    setError("");
  }, [selection]);
  const ready = manager && loaded === identity && !loading && !busy;
  const run = async (fn: () => Promise<void>) => {
    if (!ready || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!(await checkOnlineStatus()))
        throw Error(t("Reconnect before loading or exporting reports."));
      if (!current() || selectionRef.current !== selection) return;
      await fn();
    } catch (e: any) {
      if (current() && selectionRef.current === selection)
        setError(
          e.response?.data?.message ||
            t(e.message) ||
            t("Report action failed."),
        );
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
  const field = (label: string, value: string, change: (s: string) => void) => (
    <View>
      <Text style={styles.text}>{t(label)}</Text>
      <TextInput
        accessibilityLabel={t(label)}
        value={value}
        onChangeText={change}
        editable={ready}
        style={styles.input}
      />
    </View>
  );
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
      <Text style={styles.title}>{t("Reports & exports")}</Text>
      <Text style={styles.text}>
        {t(
          "Recorded time-entry amounts have no stored currency. This is an operational report, not a reviewed payroll or payment statement.",
        )}
      </Text>
      {loading && <ActivityIndicator />}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {button("Refresh projects", () => void load(), !busy)}
      <Text style={styles.text}>{t("Project")}</Text>
      {projects.map((p) => (
        <React.Fragment key={p.id}>
          {button(
            (project === p.id ? "✓ " : "") + p.name,
            () => setProject(p.id),
            ready,
            false,
          )}
        </React.Fragment>
      ))}
      {more && (
        <Text style={styles.text}>
          {t(
            "Showing the first 200 projects. Enter another company project ID below.",
          )}
        </Text>
      )}
      {field("Project ID", project, setProject)}
      {field("Start date (YYYY-MM-DD)", start, setStart)}
      {field("End date (YYYY-MM-DD)", end, setEnd)}
      {button(
        "Generate summary",
        () =>
          void run(async () => {
            const q = reportSelection(project, start, end),
              r = await api.get<any>("/reports/summary?" + q);
            if (!current() || selectionRef.current !== selection) return;
            verify(r);
            if (!r.summary || !Array.isArray(r.workforce))
              throw Error(t("Report account could not be verified."));
            if (
              r.project.id !== project ||
              r.dateRange.start !== start ||
              r.dateRange.end !== end
            )
              throw Error(
                t("Report selection changed. Refresh before exporting."),
              );
            setReport({ ...r, key: selection });
            setPage(0);
          }),
      )}
      {report?.key === selection && loaded === identity && (
        <View style={styles.card}>
          <Text style={styles.title}>{report.project.name}</Text>
          <Text style={styles.text}>
            {t("Company timezone")}: {report.timezone}
          </Text>
          {Object.entries(reportMetrics).map(([k, label]) => (
            <Text key={k} style={styles.text}>
              {t(label)}:{" "}
              {report.summary[k] === null
                ? "—"
                : Number(report.summary[k]).toFixed(
                    Number.isInteger(Number(report.summary[k])) ? 0 : 2,
                  )}
            </Text>
          ))}
          {button(
            "Share report PDF",
            () =>
              void run(() =>
                shareReport(
                  project,
                  start,
                  end,
                  "pdf",
                  () => current() && selectionRef.current === selection,
                ),
              ),
          )}
          {button(
            "Share timesheet CSV",
            () =>
              void run(() =>
                shareReport(
                  project,
                  start,
                  end,
                  "csv",
                  () => current() && selectionRef.current === selection,
                ),
              ),
          )}
          <Text style={styles.title}>{t("Workforce records")}</Text>
          {report.workforce.slice(page * 25, (page + 1) * 25).map((r: any) => (
            <View key={r.id} style={styles.card}>
              <Text style={styles.text}>
                {r.employee_name} · {r.work_date}
              </Text>
              <Text style={styles.text}>
                {t("Regular hours")}: {r.regular_hours} · {t("Overtime hours")}:{" "}
                {r.overtime_hours}
              </Text>
              <Text style={styles.text}>
                {t("Recorded wages (currency unspecified)")}: {r.total_wage}
              </Text>
              <Text style={styles.text}>
                {r.clock_out ? t("Completed") : t("In progress")} ·{" "}
                {t(r.approval_status)}
              </Text>
            </View>
          ))}
          {button(
            "Previous",
            () => setPage((n) => Math.max(0, n - 1)),
            ready && page > 0,
          )}
          {button(
            "Next",
            () => setPage((n) => n + 1),
            ready && (page + 1) * 25 < report.workforce.length,
          )}
          {!report.workforce.length && (
            <Text style={styles.text}>
              {t("No workforce records in this reporting range.")}
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0B1220" },
  title: { fontSize: 24, fontWeight: "700", color: "#FFF", marginVertical: 12 },
  text: { color: "#E2E8F0", fontSize: 15, marginVertical: 5 },
  error: { color: "#FCA5A5", marginVertical: 10 },
  button: {
    backgroundColor: "#164E63",
    borderRadius: 8,
    padding: 12,
    marginVertical: 5,
    minHeight: 44,
  },
  input: {
    borderWidth: 1,
    borderColor: "#64748B",
    borderRadius: 8,
    padding: 12,
    color: "#FFF",
    minHeight: 46,
    marginVertical: 8,
  },
  card: {
    padding: 12,
    backgroundColor: "#172238",
    borderRadius: 12,
    marginVertical: 8,
  },
});
