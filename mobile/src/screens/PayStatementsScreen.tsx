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
import { sharePayStatement } from "../services/payStatement";
import { checkOnlineStatus } from "../services/offlineService";
type Statement = {
  id: string;
  employee_id: string;
  payroll_id: string;
  period_start: string;
  period_end: string;
  gross: string;
  net: string;
  currency: string;
  pay_date: string;
  income_tax: string;
  payment_recorded: boolean;
};
export default function PayStatementsScreen() {
  const { user } = useAuth(),
    { t } = useLang(),
    nav = useNavigation(),
    insets = useSafeAreaInsets();
  const identity = String(user?.companyId) + ":" + String(user?.id),
    identityRef = useRef(identity);
  identityRef.current = identity;
  const [rows, setRows] = useState<Statement[]>([]),
    [loaded, setLoaded] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const active = useRef(false),
    sequence = useRef(0),
    lock = useRef(false),
    current = () => active.current && identityRef.current === identity;
  const load = useCallback(async () => {
    const seq = ++sequence.current;
    setLoading(true);
    setLoaded("");
    setRows([]);
    setError("");
    try {
      const result = await api.get<{
        actorId: string;
        companyId: string;
        statements: Statement[];
      }>("/pay-stubs/reviewed");
      if (
        !active.current ||
        identityRef.current !== identity ||
        sequence.current !== seq
      )
        return;
      if (
        result.actorId !== user?.id ||
        result.companyId !== user?.companyId ||
        !Array.isArray(result.statements) ||
        result.statements.some((row) => row.employee_id !== user?.id)
      )
        throw Error(t("Your pay statements could not be verified."));
      setRows(result.statements);
      setLoaded(identity);
    } catch (e: any) {
      if (
        active.current &&
        identityRef.current === identity &&
        sequence.current === seq
      )
        setError(
          e.response?.data?.message ||
            e.message ||
            t("Pay statements could not be loaded."),
        );
    } finally {
      if (
        active.current &&
        identityRef.current === identity &&
        sequence.current === seq
      )
        setLoading(false);
    }
  }, [identity, user?.id, user?.companyId, t]);
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
  const share = async (row: Statement) => {
    if (lock.current || loaded !== identity || !current()) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!(await checkOnlineStatus()))
        throw Error(t("Reconnect before downloading a pay statement."));
      if (current()) await sharePayStatement(row.id, current, "employee");
    } catch (e: any) {
      if (current()) setError(e.message || t("Pay statement is unavailable."));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
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
      <Text style={s.title}>{t("My pay statements")}</Text>
      <Text style={s.warning}>
        {t(
          "These statements show independently reviewed company payroll calculations. A recorded external payment is not bank-verified settlement. Contact your payroll manager about discrepancies.",
        )}
      </Text>
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      <TouchableOpacity
        accessibilityRole="button"
        disabled={busy || loading}
        onPress={() => void load()}
        style={s.button}
      >
        <Text style={s.link}>{t("Refresh")}</Text>
      </TouchableOpacity>
      {loading && <ActivityIndicator />}
      {loaded === identity && (
        <>
          {!rows.length && (
            <Text style={s.text}>
              {t("No reviewed pay statements are available yet.")}
            </Text>
          )}
          {rows.map((row) => (
            <View key={row.id} style={s.card}>
              <Text style={s.heading}>
                {String(row.period_start).slice(0, 10)} –{" "}
                {String(row.period_end).slice(0, 10)}
              </Text>
              <Text style={s.text}>
                {t("Pay date")}: {row.pay_date}
              </Text>
              <Text style={s.text}>
                {t("Gross wages")}: {row.gross} {row.currency}
              </Text>
              <Text style={s.text}>
                {t("Income tax")}: {row.income_tax} {row.currency}
              </Text>
              <Text style={s.text}>
                {t("Net pay")}: {row.net} {row.currency}
              </Text>
              <Text style={s.warning}>
                {t(
                  row.payment_recorded
                    ? "External payment recorded"
                    : "Reviewed — external payment not recorded",
                )}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={busy || loading}
                onPress={() => void share(row)}
                style={s.button}
              >
                <Text style={s.link}>{t("Export reviewed pay statement")}</Text>
              </TouchableOpacity>
            </View>
          ))}
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
