import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import { api } from "../services/api";
type Capability = {
  country: string;
  currency: string;
  countryName: string;
  available: boolean;
  reason: string | null;
};
type Account = {
  employeeId: string;
  employeeName: string;
  country: string;
  currency: string;
  status: string;
  destination: {
    configured: boolean;
    last4: string | null;
    label: string | null;
  };
};
type Batch = {
  id: string;
  payrollId: string;
  status: string;
  country: string;
  currency: string;
  employeeCount: number;
  totalFormatted: string;
  failureCode?: string;
  providerReference?: string;
};
type Payroll = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  country: string;
  currency: string;
  employeeCount: number;
  totalFormatted: string;
  eligible: boolean;
  reason: string | null;
};
type Event = { id: string; type: string; createdAt: string };
const statusLabels: Record<string, string> = {
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  submitting: "Submitting",
  submitted: "Submitted",
  processing: "Processing",
  settled: "Settled",
  failed: "Failed",
  cancelled: "Cancelled",
  ready: "Ready",
  missing_destination: "Destination not configured",
  inactive: "Inactive",
  unsupported_country: "Unsupported country",
};
export default function PayoutStatusScreen() {
  const { user } = useAuth(),
    { t } = useLang(),
    nav = useNavigation(),
    insets = useSafeAreaInsets();
  const identity = String(user?.companyId) + ":" + String(user?.id),
    ref = useRef(identity);
  ref.current = identity;
  const manager = ["boss", "owner", "manager", "admin"].includes(
    String(user?.role).toLowerCase(),
  );
  const [capabilities, setCapabilities] = useState<Capability[]>([]),
    [accounts, setAccounts] = useState<Account[]>([]),
    [payrolls, setPayrolls] = useState<Payroll[]>([]),
    [batches, setBatches] = useState<Batch[]>([]),
    [settings, setSettings] = useState<{
      country: string;
      currency: string;
    } | null>(null),
    [detail, setDetail] = useState<{ batch: Batch; events: Event[] } | null>(
      null,
    );
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(""),
    [error, setError] = useState("");
  const active = useRef(false),
    seq = useRef(0),
    lock = useRef(false),
    current = () => active.current && ref.current === identity,
    ready = manager && loaded === identity;
  const load = useCallback(async () => {
    const request = ++seq.current;
    setLoading(true);
    setLoaded("");
    setDetail(null);
    try {
      if (!manager) throw Error(t("Payroll manager access required."));
      const [actor, caps, config, people, runs, history] = await Promise.all([
        api.get<{ actorId: string; companyId: string; manager: boolean }>(
          "/operations/work-options",
        ),
        api.get<{ capabilities: Capability[] }>("/payouts/capabilities"),
        api.get<{ settings: { country: string; currency: string } | null }>(
          "/payouts/settings",
        ),
        api.get<{ accounts: Account[] }>("/payouts/accounts"),
        api.get<{ payrolls: Payroll[] }>("/payouts/payrolls"),
        api.get<{ batches: Batch[] }>("/payouts/batches"),
      ]);
      if (
        !active.current ||
        ref.current !== identity ||
        seq.current !== request
      )
        return;
      if (
        actor.actorId !== user?.id ||
        actor.companyId !== user?.companyId ||
        actor.manager !== true ||
        !Array.isArray(caps.capabilities) ||
        !Array.isArray(people.accounts) ||
        !Array.isArray(runs.payrolls) ||
        !Array.isArray(history.batches)
      )
        throw Error(t("Payout records could not be verified."));
      setCapabilities(caps.capabilities);
      setSettings(config.settings);
      setAccounts(people.accounts);
      setPayrolls(runs.payrolls);
      setBatches(history.batches);
      setLoaded(identity);
      setError("");
    } catch (e: any) {
      if (active.current && ref.current === identity && seq.current === request)
        setError(
          e.response?.data?.message ||
            e.message ||
            t("Payout records could not be loaded."),
        );
    } finally {
      if (active.current && ref.current === identity && seq.current === request)
        setLoading(false);
    }
  }, [identity, manager, user?.id, user?.companyId, t]);
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
  const open = async (id: string) => {
    if (lock.current || !ready || !current()) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api.get<{ batch: Batch; events: Event[] }>(
        "/payouts/batches/" + encodeURIComponent(id),
      );
      if (current()) {
        if (result.batch.id !== id || !Array.isArray(result.events))
          throw Error(t("Payout records could not be verified."));
        setDetail(result);
      }
    } catch (e: any) {
      if (current()) {
        setDetail(null);
        setError(
          e.response?.data?.message ||
            e.message ||
            t("Payout records could not be loaded."),
        );
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const status = (value: string) =>
    t(statusLabels[value] || "Status unavailable");
  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{
        padding: 18,
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 40,
      }}
    >
      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => nav.goBack()}
        style={s.button}
      >
        <Text style={s.link}>{t("Back")}</Text>
      </TouchableOpacity>
      <Text style={s.title}>{t("Banking and payout status")}</Text>
      <Text style={s.warning}>
        {t(
          "Direct deposit is disabled. This page only inspects saved status and history. Make bank payments separately and record them through Payroll & manual payments. No bank details are collected here.",
        )}
      </Text>
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      <TouchableOpacity
        accessibilityRole="button"
        disabled={loading || busy}
        onPress={() => void load()}
        style={s.button}
      >
        <Text style={s.link}>{t("Refresh")}</Text>
      </TouchableOpacity>
      {(loading || busy) && <ActivityIndicator />}
      {ready && (
        <>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={busy}
            onPress={() => nav.navigate("ManualPayroll" as never)}
            style={s.button}
          >
            <Text style={s.link}>{t("Payroll & manual payments")}</Text>
          </TouchableOpacity>
          <View style={s.card}>
            <Text style={s.heading}>{t("Saved payout configuration")}</Text>
            <Text style={s.text}>
              {settings
                ? settings.country + " · " + settings.currency
                : t("No payout configuration saved.")}
            </Text>
            <Text style={s.warning}>
              {t(
                "A configured destination or historical settled status does not enable new payouts.",
              )}
            </Text>
          </View>
          <View style={s.card}>
            <Text style={s.heading}>
              {t("Country and currency capabilities")}
            </Text>
            {capabilities.map((c) => (
              <View key={c.country + c.currency}>
                <Text style={s.text}>
                  {c.countryName} · {c.currency}
                </Text>
                {!!c.reason && <Text style={s.text}>{c.reason}</Text>}
              </View>
            ))}
          </View>
          <View style={s.card}>
            <Text style={s.heading}>{t("Employee destination status")}</Text>
            {!accounts.length && (
              <Text style={s.text}>{t("No destination records.")}</Text>
            )}
            {accounts.map((a) => (
              <View key={a.employeeId}>
                <Text style={s.text}>
                  {a.employeeName} · {status(a.status)} · {a.country}{" "}
                  {a.currency}
                </Text>
                <Text style={s.text}>
                  {a.destination.configured
                    ? t("Destination configured")
                    : t("Destination not configured")}
                  {a.destination.last4 ? " · •••• " + String(a.destination.last4).slice(-4) : ""}
                </Text>
              </View>
            ))}
          </View>
          <View style={s.card}>
            <Text style={s.heading}>
              {t("Saved payroll payout eligibility")}
            </Text>
            {!payrolls.length && (
              <Text style={s.text}>{t("No payout payroll records.")}</Text>
            )}
            {payrolls.map((p) => (
              <View key={p.id}>
                <Text style={s.text}>
                  {String(p.periodStart).slice(0, 10)} –{" "}
                  {String(p.periodEnd).slice(0, 10)} · {p.totalFormatted}{" "}
                  {p.currency}
                </Text>
                {!!p.reason && <Text style={s.text}>{p.reason}</Text>}
              </View>
            ))}
          </View>
          <View style={s.card}>
            <Text style={s.heading}>{t("Historical payout batches")}</Text>
            {!batches.length && (
              <Text style={s.text}>{t("No payout batches.")}</Text>
            )}
            {batches.map((b) => (
              <View key={b.id}>
                <Text style={s.text}>
                  {status(b.status)} · {b.totalFormatted} {b.currency}
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void open(b.id)}
                  style={s.button}
                >
                  <Text style={s.link}>{t("Inspect batch history")}</Text>
                </TouchableOpacity>
              </View>
            ))}
            {detail && (
              <View>
                <Text style={s.heading}>{status(detail.batch.status)}</Text>
                {!!detail.batch.failureCode && (
                  <Text style={s.text}>{detail.batch.failureCode}</Text>
                )}
                {detail.events.map((e) => (
                  <Text key={e.id} style={s.text}>
                    {e.type} · {e.createdAt}
                  </Text>
                ))}
              </View>
            )}
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
  card: {
    backgroundColor: "#102035",
    padding: 14,
    borderRadius: 14,
    marginVertical: 12,
  },
  button: { padding: 14, minHeight: 48, marginVertical: 4, borderRadius: 7 },
  link: { color: "#67E8F9", fontWeight: "700" },
});
