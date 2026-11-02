import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
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
import { checkOnlineStatus } from "../services/offlineService";
import { integrationAuthorizationUrl } from "../utils/integrationLinks";
type Provider = "quickbooks" | "stripe";
export default function IntegrationsScreen() {
  const { user } = useAuth(),
    { t } = useLang(),
    nav = useNavigation(),
    insets = useSafeAreaInsets(),
    manager = ["owner", "boss", "manager", "admin"].includes(
      String(user?.role).toLowerCase(),
    );
  const identity = String(user?.companyId) + ":" + String(user?.id),
    ref = useRef(identity);
  ref.current = identity;
  const [status, setStatus] = useState<any>(null),
    [loaded, setLoaded] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [company, setCompany] = useState<any>(null),
    [items, setItems] = useState<any[]>([]);
  const active = useRef(false),
    seq = useRef(0),
    lock = useRef(false),
    current = () => active.current && ref.current === identity;
  const load = useCallback(async () => {
    if (!manager) return;
    const n = ++seq.current;
    setLoading(true);
    setLoaded("");
    setCompany(null);
    setItems([]);
    try {
      const r = await api.get<any>("/integrations/status");
      if (!current() || seq.current !== n) return;
      if (
        r.actorId !== user?.id ||
        r.companyId !== user?.companyId ||
        !r.quickbooks ||
        !r.stripe
      )
        throw Error(t("Integration account could not be verified."));
      setStatus(r);
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
        setStatus(null);
        setCompany(null);
        setItems([]);
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
    try {
      if (!(await checkOnlineStatus()))
        throw Error(t("Reconnect before changing integrations."));
      if (current()) await fn();
    } catch (e: any) {
      if (current()) {
        setError(e.response?.data?.message || t(e.message));
        if (!e.response) setLoaded("");
      }
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  };
  const button = (label: string, fn: () => void, enabled = ready) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={t(label)}
      disabled={!enabled}
      onPress={fn}
      style={[styles.button, !enabled && { opacity: 0.4 }]}
    >
      <Text style={styles.text}>{t(label)}</Text>
    </TouchableOpacity>
  );
  const connect = (p: Provider) =>
    void run(async () => {
      const r = await api.get<any>("/integrations/" + p + "/auth");
      if (!current()) return;
      const url = integrationAuthorizationUrl(p, r.url);
      await Linking.openURL(url);
      if (current())
        setNotice(
          t(
            "Complete authorization in the browser, return here and refresh connections.",
          ),
        );
    });
  const disconnect = (p: Provider) =>
    Alert.alert(
      t("Disconnect integration?"),
      t(
        "This revokes the selected company connection. Existing financial records are retained.",
      ),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: t("Confirm"),
          onPress: () =>
            void run(async () => {
              await api.post("/integrations/" + p + "/disconnect", {});
              if (current()) {
                await load();
                setNotice(t("Connection removed."));
              }
            }),
        },
      ],
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
    >
      {button("Back", () => nav.goBack(), !busy)}
      <Text style={styles.title}>{t("Accounting integrations")}</Text>
      <Text style={styles.text}>
        {t(
          "These are company accounting connections. They do not enable employee payouts or change your software subscription.",
        )}
      </Text>
      {loading && <ActivityIndicator />}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {notice ? <Text style={styles.text}>{notice}</Text> : null}
      {button("Refresh connections", () => void load(), !busy)}
      {loaded === identity &&
        (["quickbooks", "stripe"] as Provider[]).map((p) => (
          <View style={styles.card} key={p}>
            <Text style={styles.title}>
              {p === "stripe" ? "Stripe" : "QuickBooks"}
            </Text>
            <Text style={styles.text}>
              {t(
                status[p].connected
                  ? "Connected"
                  : status[p].reconnectRequired
                    ? "Reconnect required"
                    : "Not connected",
              )}
            </Text>
            <Text style={styles.text}>
              {t("Environment")}: {status[p].environment || t("Not configured")}
            </Text>
            <Text style={styles.text}>
              {t("Account ID")}: {status[p].accountId || "—"}
            </Text>
            {button(
              p === "stripe" ? "Connect Stripe" : "Connect QuickBooks",
              () => connect(p),
            )}
            {(status[p].connected || status[p].reconnectRequired) &&
              button(
                p === "stripe" ? "Disconnect Stripe" : "Disconnect QuickBooks",
                () => disconnect(p),
              )}
            {p === "quickbooks" && status[p].connected && (
              <>
                {button(
                  "Inspect QuickBooks company",
                  () =>
                    void run(async () => {
                      const r = await api.get<any>(
                        "/integrations/quickbooks/company-info",
                      );
                      if (current()) setCompany(r.company);
                    }),
                )}
                {button(
                  "List QuickBooks items",
                  () =>
                    void run(async () => {
                      const r = await api.get<any>(
                        "/integrations/quickbooks/items",
                      );
                      if (current()) setItems(r.items);
                    }),
                )}
              </>
            )}
          </View>
        ))}
      {loaded === identity && company && (
        <View style={styles.card}>
          <Text style={styles.text}>{company.companyName}</Text>
          <Text style={styles.text}>
            {company.legalName || "—"} · {company.country || "—"}
          </Text>
          <Text style={styles.text}>{company.email || "—"}</Text>
        </View>
      )}
      {loaded === identity &&
        items.map((i) => (
          <Text style={styles.text} key={i.id}>
            {i.name} · {i.type} · {i.id}
          </Text>
        ))}
      <Text style={styles.text}>
        {t(
          "Accounting synchronization needs separate reconciliation review. Connecting an account does not verify settlement or activate automatic synchronization.",
        )}
      </Text>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0B1220" },
  title: { fontSize: 24, fontWeight: "700", color: "#FFF", marginVertical: 12 },
  text: { fontSize: 15, color: "#E2E8F0", marginVertical: 5 },
  error: { color: "#FCA5A5", marginVertical: 10 },
  button: {
    backgroundColor: "#164E63",
    borderRadius: 8,
    padding: 12,
    marginVertical: 5,
    minHeight: 44,
  },
  card: {
    backgroundColor: "#172238",
    padding: 12,
    borderRadius: 12,
    marginVertical: 8,
  },
});
