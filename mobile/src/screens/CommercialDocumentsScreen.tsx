import React, { useCallback, useRef, useState } from "react";
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
import { shareCommercialDocument } from "../services/commercialFiles";
type Kind = "invoice" | "estimate";
type Line = {
  description: string;
  quantity: string;
  unit_price: string;
  timeEntryIds: string[];
};
const newKey = () =>
  `native:${Date.now()}:${Math.random().toString(36).slice(2)}:${Math.random().toString(36).slice(2)}`;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const blank = () => ({
  currency: "CAD",
  projectId: "",
  clientId: "",
  issueDate: today(),
  dueDate: today(),
  expiryDate: today(),
  taxRate: "0",
  notes: "",
  clientNotes: "",
  requestKey: newKey(),
  expectedUpdatedAt: "",
  items: [
    {
      description: "",
      quantity: "1",
      unit_price: "0",
      timeEntryIds: [],
    } as Line,
  ],
  isRecurring: false,
  recurringFrequency: "monthly",
  recurringEndDate: "",
  milestone_name: "",
  milestone_percentage: "",
  parent_invoice_id: "",
});
export default function CommercialDocumentsScreen() {
  const { user } = useAuth(),
    { t } = useLang(),
    nav = useNavigation(),
    insets = useSafeAreaInsets();
  const manager = ["boss", "owner", "manager", "admin"].includes(
    String(user?.role).toLowerCase(),
  );
  const [kind, setKind] = useState<Kind>("invoice"),
    [rows, setRows] = useState<any[]>([]),
    [workspace, setWorkspace] = useState<any>(null),
    [selected, setSelected] = useState<any>(null),
    [editing, setEditing] = useState(false),
    [form, setForm] = useState(blank),
    [payments, setPayments] = useState<any[]>([]);
  const [status, setStatus] = useState(""),
    [offset, setOffset] = useState(0),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loaded, setLoaded] = useState("");
  const [reference, setReference] = useState(""),
    [amount, setAmount] = useState(""),
    [paymentDate, setPaymentDate] = useState(today),
    [dueDate, setDueDate] = useState(today),
    [unbilled, setUnbilled] = useState<any[]>([]),
    [hub, setHub] = useState<any>(null);
  const key =
      String(user?.companyId) +
      ":" +
      String(user?.id) +
      ":" +
      kind +
      ":" +
      status +
      ":" +
      offset,
    ref = useRef(key),
    active = useRef(false),
    seq = useRef(0),
    lock = useRef(false);
  ref.current = key;
  const current = () => active.current && ref.current === key,
    endpoint = "/" + kind + "s",
    ready = manager && loaded === key && !loading && !busy;
  const verify = (r: any) => {
    if (r.actorId !== user?.id || r.companyId !== user?.companyId)
      throw Error(t("Document account could not be verified."));
  };
  const load = useCallback(async () => {
    if (!manager) return;
    const n = ++seq.current;
    setLoading(true);
    setLoaded("");
    setSelected(null);
    setEditing(false);
    setPayments([]);
    setHub(null);
    setUnbilled([]);
    try {
      const [w, r] = await Promise.all([
        api.get<any>(endpoint + "/workspace"),
        api.get<any>(
          endpoint +
            "?limit=25&offset=" +
            offset +
            (status ? "&status=" + status : ""),
        ),
      ]);
      if (!active.current || ref.current !== key || n !== seq.current) return;
      verify(w);
      verify(r);
      if (!w.manager) throw Error(t("Manager access required"));
      setWorkspace(w);
      setRows(r[kind + "s"]);
      setLoaded(key);
      setError("");
    } catch (e: any) {
      if (current()) setError(e.response?.data?.message || e.message);
    } finally {
      if (current()) setLoading(false);
    }
  }, [key, manager, t]);
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      void load();
      return () => {
        active.current = false;
        seq.current++;
        setLoaded("");
        setSelected(null);
        setEditing(false);
        setForm(blank());
        setReference("");
        setAmount("");
        setWorkspace(null);
        setRows([]);
        setNotice("");
      };
    }, [load]),
  );
  const run = async (fn: () => Promise<void>) => {
    if (!ready || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!(await checkOnlineStatus()))
        throw Error(t("Reconnect before changing financial records."));
      if (!current()) return;
      await fn();
    } catch (e: any) {
      if (current()) {
        setError(
          e.response?.data?.message ||
            e.message ||
            t("Document action failed."),
        );
        if (!e.response) {
          setLoaded("");
          setEditing(false);
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
  const inspect = async (id: string) => {
    const r = await api.get<any>(endpoint + "/" + id);
    if (!current()) return;
    verify(r);
    setSelected({ ...r[kind], items: r.items });
    setPayments(r.payments || []);
    setReference("");
    setAmount("");
    setEditing(false);
  };
  const refreshAfter = async (id?: string) => {
    const r = await api.get<any>(
      endpoint +
        "?limit=25&offset=" +
        offset +
        (status ? "&status=" + status : ""),
    );
    if (!current()) return;
    verify(r);
    setRows(r[kind + "s"]);
    if (id) await inspect(id);
    else {
      setSelected(null);
      setEditing(false);
    }
    setNotice(t("Record saved. No email or money transfer was sent."));
  };
  const startEdit = async () => {
    if (!selected) return;
    await inspect(selected.id);
    if (!current()) return;
    const r = await api.get<any>(endpoint + "/" + selected.id);
    if (!current()) return;
    verify(r);
    const d = r[kind];
    if (d.status !== "draft") throw Error(t("Only drafts can be edited."));
    setForm({
      ...blank(),
      currency: d.currency || "",
      projectId: d.project_id || "",
      clientId: d.client_id || "",
      issueDate: String(d.issue_date).slice(0, 10),
      dueDate: String(d.due_date || "").slice(0, 10),
      expiryDate: String(d.expiry_date || "").slice(0, 10),
      taxRate: String(d.tax_rate),
      notes: d.notes || "",
      clientNotes: d.client_notes || "",
      expectedUpdatedAt: d.updated_at,
      isRecurring: !!d.is_recurring,
      recurringFrequency: d.recurring_frequency || "monthly",
      recurringEndDate: d.recurring_end_date || "",
      milestone_name: d.milestone_name || "",
      milestone_percentage: String(d.milestone_percentage || ""),
      parent_invoice_id: d.parent_invoice_id || "",
      items: r.items.map((l: any) => ({
        description: l.description,
        quantity: String(l.quantity),
        unit_price: String(l.unit_price),
        timeEntryIds: l.time_entry_ids || [],
      })),
    });
    setEditing(true);
  };
  const change = (field: string, value: any) =>
    setForm((f) => ({ ...f, [field]: value }));
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
      <Text style={styles.buttonText}>{translate ? t(label) : label}</Text>
    </TouchableOpacity>
  );
  const choice = (label: string, fn: () => void, enabled = ready) =>
    button(label, fn, enabled, false);
  const field = (
    label: string,
    value: string,
    onChange: (s: string) => void,
    numeric = false,
  ) => (
    <View style={styles.field}>
      <Text style={styles.text}>{t(label)}</Text>
      <TextInput
        accessibilityLabel={t(label)}
        editable={ready}
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType={numeric ? "decimal-pad" : "default"}
      />
    </View>
  );
  const money = (v: any, c: any) =>
    `${c || t("Unspecified currency")} ${Number(v).toFixed(2)}`;
  const confirm = (label: string, fn: () => Promise<void>) =>
    Alert.alert(
      t(label),
      t("This records an external event. No email or money transfer is sent."),
      [
        { text: t("Cancel"), style: "cancel" },
        { text: t("Confirm"), onPress: () => void run(fn) },
      ],
    );
  const save = () =>
    void run(async () => {
      const id = selected?.id,
        r = await (id
          ? api.put<any>(endpoint + "/" + id, form)
          : api.post<any>(endpoint, form));
      if (!current()) return;
      verify(r);
      await refreshAfter(r[kind].id);
    });
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
      <Text style={styles.title}>{t("Invoices & estimates")}</Text>
      <Text style={styles.text}>
        {t(
          "Share PDFs externally. Record customer acceptance and completed payments with their references. Automatic email, recurring generation and bank settlement are unavailable.",
        )}
      </Text>
      <View style={styles.row}>
        {(["invoice", "estimate"] as Kind[]).map((k) => (
          <React.Fragment key={k}>
            {button(
              k === "invoice" ? "Invoices" : "Estimates",
              () => {
                setKind(k);
                setStatus("");
                setOffset(0);
                setForm(blank());
              },
              !busy,
            )}
          </React.Fragment>
        ))}
      </View>
      <View style={styles.row}>
        {[
          "",
          "draft",
          "sent",
          ...(kind === "invoice"
            ? ["partial", "paid"]
            : ["accepted", "converted"]),
        ].map((s) => (
          <React.Fragment key={s}>
            {button(
              s || "All statuses",
              () => {
                setStatus(s);
                setOffset(0);
              },
              !busy,
            )}
          </React.Fragment>
        ))}
      </View>
      {button("Refresh", () => void load(), !busy)}
      {loading && <ActivityIndicator />}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {notice ? <Text style={styles.text}>{notice}</Text> : null}
      {button("New draft", () => {
        setSelected(null);
        setForm(blank());
        setEditing(true);
        setHub(null);
        setUnbilled([]);
      })}
      {!editing &&
        rows.map((d) => (
          <TouchableOpacity
            key={d.id}
            accessibilityRole="button"
            disabled={!ready}
            onPress={() => void run(() => inspect(d.id))}
            style={styles.card}
          >
            <Text style={styles.text}>
              {d.invoice_number || d.estimate_number} · {t(d.status)}
            </Text>
            <Text style={styles.text}>
              {d.client_name || t("No client")} ·{" "}
              {d.project_name || t("No project")}
            </Text>
            <Text style={styles.text}>
              {money(d.total, d.currency)}
              {kind === "invoice"
                ? " · " + t("Balance") + " " + money(d.balance, d.currency)
                : ""}
            </Text>
          </TouchableOpacity>
        ))}
      <View style={styles.row}>
        {button(
          "Previous",
          () => setOffset((n) => Math.max(0, n - 25)),
          ready && offset > 0,
        )}
        {button(
          "Next",
          () => setOffset((n) => n + 25),
          ready && rows.length === 25 && offset < 100000,
        )}
      </View>
      {loaded === key && selected && !editing && (
        <View style={styles.card}>
          <Text style={styles.title}>
            {selected.invoice_number || selected.estimate_number}
          </Text>
          <Text style={styles.text}>
            {t(selected.status)} · {money(selected.total, selected.currency)}
          </Text>
          <Text style={styles.text}>
            {t("Issue date")}: {String(selected.issue_date).slice(0, 10)}
          </Text>
          <Text style={styles.text}>
            {t("Notes")}: {selected.notes || "—"}
          </Text>
          {selected.items?.map((l: any) => (
            <Text key={l.id} style={styles.text}>
              {l.description} · {l.quantity} ×{" "}
              {money(l.unit_price, selected.currency)} ={" "}
              {money(l.total, selected.currency)}
            </Text>
          ))}
          {button(
            "Share PDF",
            () =>
              void run(() =>
                shareCommercialDocument(selected.id, current, kind),
              ),
          )}
          {selected.status === "draft" && (
            <>
              {button("Edit draft", () => void run(startEdit))}
              {button("Delete draft", () =>
                confirm("Delete draft", async () => {
                  await api.delete(endpoint + "/" + selected.id);
                  if (current()) await refreshAfter();
                }),
              )}
              {button("Record external sharing", () =>
                confirm("Record external sharing", async () => {
                  await api.post(endpoint + "/" + selected.id + "/send", {
                    confirmed: true,
                    expectedUpdatedAt: selected.updated_at,
                  });
                  if (current()) await refreshAfter(selected.id);
                }),
              )}
            </>
          )}
          {kind === "estimate" && selected.status === "sent" && (
            <>
              {field("Acceptance reference", reference, setReference)}
              {button(
                "Record acceptance",
                () =>
                  confirm("Record acceptance", async () => {
                    await api.post(endpoint + "/" + selected.id + "/accept", {
                      confirmed: true,
                      reference,
                    });
                    if (current()) await refreshAfter(selected.id);
                  }),
                ready && reference.trim().length >= 4,
              )}
            </>
          )}
          {kind === "estimate" && selected.status === "accepted" && (
            <>
              {field("Invoice due date (YYYY-MM-DD)", dueDate, setDueDate)}
              {button("Convert to invoice", () =>
                confirm("Convert to invoice", async () => {
                  const r = await api.post<any>(
                    endpoint + "/" + selected.id + "/convert",
                    { invoiceDate: today(), dueDate },
                  );
                  if (current()) {
                    await refreshAfter(selected.id);
                    setNotice(r.invoice.invoice_number);
                  }
                }),
              )}
            </>
          )}
          {kind === "invoice" &&
            ["sent", "viewed", "partial", "overdue"].includes(
              selected.status,
            ) && (
              <>
                {field("Payment amount", amount, setAmount, true)}
                {field(
                  "Payment date (YYYY-MM-DD)",
                  paymentDate,
                  setPaymentDate,
                )}
                {field("Receipt reference", reference, setReference)}
                {button(
                  "Record completed payment",
                  () =>
                    confirm("Record completed payment", async () => {
                      await api.post(
                        endpoint + "/" + selected.id + "/payments",
                        { confirmed: true, amount, paymentDate, reference },
                      );
                      if (current()) await refreshAfter(selected.id);
                    }),
                  ready && !!amount && reference.trim().length >= 4,
                )}
              </>
            )}
          {payments.map((p) => (
            <Text key={p.id} style={styles.text}>
              {String(p.payment_date).slice(0, 10)} ·{" "}
              {money(p.amount, selected.currency)} · {p.reference}
            </Text>
          ))}
          {kind === "invoice" &&
            selected.client_id &&
            button(
              "Client summary",
              () =>
                void run(async () => {
                  const r = await api.get<any>(
                    "/invoices/client/" + selected.client_id,
                  );
                  if (current()) setHub(r);
                }),
            )}
          {hub?.totalsByCurrency?.map((h: any) => (
            <Text key={h.currency || "unspecified"} style={styles.text}>
              {h.currency || t("Unspecified currency")} · {t("Billed")}:{" "}
              {money(h.total_billed, h.currency)} · {t("Recorded paid")}:{" "}
              {money(h.total_paid, h.currency)} · {t("Balance")}:{" "}
              {money(h.total_balance, h.currency)}
            </Text>
          ))}
        </View>
      )}
      {loaded === key && editing && (
        <View style={styles.card}>
          <Text style={styles.title}>{t("Draft")}</Text>
          <Text style={styles.text}>{t("Currency")}</Text>
          <View style={styles.row}>
            {["CAD", "USD"].map((c) => (
              <React.Fragment key={c}>
                {choice((form.currency === c ? "✓ " : "") + c, () =>
                  change("currency", c),
                )}
              </React.Fragment>
            ))}
          </View>
          <Text style={styles.text}>{t("Project")}</Text>
          {button("No project", () => {
            change("projectId", "");
            setUnbilled([]);
          })}
          {workspace?.projects?.map((p: any) => (
            <React.Fragment key={p.id}>
              {choice((form.projectId === p.id ? "✓ " : "") + p.name, () => {
                setForm((f) => ({
                  ...f,
                  projectId: p.id,
                  clientId: p.client_id || "",
                }));
                setUnbilled([]);
              })}
            </React.Fragment>
          ))}
          <Text style={styles.text}>{t("Client")}</Text>
          {button("No client", () => change("clientId", ""))}
          {workspace?.clients?.map((c: any) => (
            <React.Fragment key={c.id}>
              {choice((form.clientId === c.id ? "✓ " : "") + c.name, () =>
                change("clientId", c.id),
              )}
            </React.Fragment>
          ))}
          {field("Issue date (YYYY-MM-DD)", form.issueDate, (s) =>
            change("issueDate", s),
          )}
          {kind === "invoice"
            ? field("Due date (YYYY-MM-DD)", form.dueDate, (s) =>
                change("dueDate", s),
              )
            : field("Expiry date (YYYY-MM-DD)", form.expiryDate, (s) =>
                change("expiryDate", s),
              )}
          {field(
            "Tax rate (%)",
            form.taxRate,
            (s) => change("taxRate", s),
            true,
          )}
          {form.items.map((line, i) => (
            <View key={i} style={styles.card}>
              <Text style={styles.text}>
                {t("Line")} {i + 1}
              </Text>
              {(["description", "quantity", "unit_price"] as const).map((f) => (
                <React.Fragment key={f}>
                  {field(
                    f === "unit_price"
                      ? "Unit price"
                      : f === "quantity"
                        ? "Quantity"
                        : "Description",
                    line[f],
                    (s) =>
                      setForm((v) => ({
                        ...v,
                        items: v.items.map((l, n) =>
                          n === i ? { ...l, [f]: s } : l,
                        ),
                      })),
                    f !== "description",
                  )}
                </React.Fragment>
              ))}
              {line.timeEntryIds.length > 0 && (
                <Text style={styles.text}>
                  {t("Linked approved time entries")}:{" "}
                  {line.timeEntryIds.length}
                </Text>
              )}
              {button(
                "Remove line",
                () =>
                  setForm((f) => ({
                    ...f,
                    items: f.items.filter((_, n) => n !== i),
                  })),
                ready && form.items.length > 1,
              )}
            </View>
          ))}
          {button(
            "Add line",
            () =>
              setForm((f) => ({
                ...f,
                items: [
                  ...f.items,
                  {
                    description: "",
                    quantity: "1",
                    unit_price: "0",
                    timeEntryIds: [],
                  },
                ],
              })),
            ready && form.items.length < 100,
          )}
          {kind === "invoice" &&
            form.projectId &&
            button(
              "Load unbilled entries",
              () =>
                void run(async () => {
                  const r = await api.get<any>(
                    "/invoices/unbilled?projectId=" + form.projectId,
                  );
                  if (current()) setUnbilled(r.unbilled);
                }),
            )}
          {unbilled.map((e) => (
            <React.Fragment key={e.id}>
              {choice(
                e.employee_name + " · " + String(e.clock_in).slice(0, 10),
                () => {
                  setForm((f) => ({
                    ...f,
                    items: [
                      ...f.items.filter(
                        (l) => l.description || Number(l.unit_price) > 0,
                      ),
                      {
                        description:
                          e.employee_name +
                          " " +
                          String(e.clock_in).slice(0, 10),
                        quantity: "1",
                        unit_price: String(e.amount),
                        timeEntryIds: [e.id],
                      },
                    ],
                  }));
                  setUnbilled((v) => v.filter((x) => x.id !== e.id));
                },
                ready && form.items.length < 100,
              )}
            </React.Fragment>
          ))}
          {field("Internal notes", form.notes, (s) => change("notes", s))}
          {field("Customer notes", form.clientNotes, (s) =>
            change("clientNotes", s),
          )}
          {kind === "invoice" && (
            <>
              {button(
                form.isRecurring
                  ? "Disable recurrence metadata"
                  : "Add recurrence metadata",
                () => change("isRecurring", !form.isRecurring),
              )}
              {form.isRecurring && (
                <>
                  {field("Recurrence interval", form.recurringFrequency, (s) =>
                    change("recurringFrequency", s),
                  )}
                  {field(
                    "Recurrence end (YYYY-MM-DD)",
                    form.recurringEndDate,
                    (s) => change("recurringEndDate", s),
                  )}
                </>
              )}
              {field("Milestone name", form.milestone_name, (s) =>
                change("milestone_name", s),
              )}
              {form.milestone_name && (
                <>
                  {field(
                    "Milestone percentage",
                    form.milestone_percentage,
                    (s) => change("milestone_percentage", s),
                    true,
                  )}
                  {field(
                    "Parent invoice ID (optional)",
                    form.parent_invoice_id,
                    (s) => change("parent_invoice_id", s),
                  )}
                </>
              )}
            </>
          )}
          <Text style={styles.text}>
            {t("Totals are calculated and validated by the server when saved.")}
          </Text>
          {button("Save draft", save)}
          {button("Cancel", () => {
            setEditing(false);
            setForm(blank());
          })}
        </View>
      )}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0B1220" },
  title: { fontSize: 23, fontWeight: "700", color: "#FFF", marginVertical: 12 },
  text: { color: "#E2E8F0", fontSize: 15, marginVertical: 5 },
  error: { color: "#FCA5A5", marginVertical: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: {
    backgroundColor: "#172238",
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
  },
  field: { marginVertical: 6 },
  input: {
    borderColor: "#64748B",
    borderWidth: 1,
    borderRadius: 8,
    color: "#FFF",
    padding: 12,
    minHeight: 46,
  },
  button: {
    backgroundColor: "#164E63",
    borderRadius: 8,
    padding: 12,
    marginVertical: 5,
    minHeight: 44,
  },
  buttonText: { color: "#CFFAFE", fontWeight: "600" },
});
