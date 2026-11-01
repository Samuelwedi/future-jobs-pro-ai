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
import { dateLabel } from "../services/i18n";
import { availabilityInput, coverApprovalKey } from "../utils/workPreferences";

type Person = { id: string; name: string };
type Shift = {
  id: string;
  name: string;
  date: string;
  start_time: string;
  end_time: string;
};
type Options = {
  actorId: string;
  manager: boolean;
  timezone: string;
  people: Person[];
  shifts: Shift[];
};
type Availability = {
  id: string;
  user_id: string;
  starts_at: string;
  ends_at: string;
};
type Swap = {
  id: string;
  shift_id: string;
  from_user: string;
  to_user: string;
  status: string;
  shift_name?: string;
  shift_date?: string;
  start_time?: string;
  end_time?: string;
};
const base = "/operations";

export default function WorkPreferencesScreen() {
  const { user } = useAuth(),
    { t, lang } = useLang(),
    navigation = useNavigation(),
    insets = useSafeAreaInsets();
  const identity = String(user?.companyId) + ":" + String(user?.id),
    identityRef = useRef(identity);
  identityRef.current = identity;
  const [data, setData] = useState<Options | null>(null),
    [rows, setRows] = useState<Availability[]>([]),
    [swaps, setSwaps] = useState<Swap[]>([]),
    [loadedKey, setLoadedKey] = useState("");
  const [from, setFrom] = useState(""),
    [until, setUntil] = useState(""),
    [shiftId, setShiftId] = useState(""),
    [colleague, setColleague] = useState("");
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const active = useRef(false),
    sequence = useRef(0),
    lock = useRef(false);
  const valid = loadedKey === identity && data?.actorId === String(user?.id),
    disabled = busy || loading || !valid;
  const current = () => active.current && identityRef.current === identity;
  useEffect(() => {
    setFrom("");
    setUntil("");
    setShiftId("");
    setColleague("");
    setNotice("");
    setError("");
  }, [identity]);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    setLoadedKey("");
    try {
      const [options, availability, requests] = await Promise.all([
        api.get<Options>(base + "/work-options"),
        api.get<Availability[]>(base + "/availability"),
        api.get<Swap[]>(base + "/swaps"),
      ]);
      if (
        !active.current ||
        identityRef.current !== identity ||
        sequence.current !== request
      )
        return;
      if (
        String(options.actorId) !== String(user?.id) ||
        !Array.isArray(options.people) ||
        !Array.isArray(options.shifts) ||
        !Array.isArray(availability) ||
        !Array.isArray(requests)
      )
        throw Error(
          t("Work preferences are unavailable. Refresh and try again."),
        );
      setData(options);
      setRows(availability);
      setSwaps(requests);
      setLoadedKey(identity);
      setError("");
      setShiftId((old) =>
        options.shifts.some((s) => s.id === old) ? old : "",
      );
      setColleague((old) =>
        options.people.some((p) => p.id === old && p.id !== options.actorId)
          ? old
          : "",
      );
    } catch (cause: any) {
      if (
        active.current &&
        identityRef.current === identity &&
        sequence.current === request
      ) {
        setLoadedKey("");
        setError(cause.message || t("Work preferences could not be loaded."));
      }
    } finally {
      if (
        active.current &&
        identityRef.current === identity &&
        sequence.current === request
      )
        setLoading(false);
    }
  }, [identity, user?.id, t]);
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
  const run = async (work: () => Promise<string>) => {
    if (lock.current || !current() || !valid) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!(await checkOnlineStatus()))
        throw Error(
          t(
            "Reconnect before making changes. Your form has not been submitted.",
          ),
        );
      if (!current()) return;
      const message = await work();
      if (!current()) return;
      setNotice(t(message));
      await load();
    } catch (cause: any) {
      if (current()) {
        setLoadedKey("");
        setError(
          (cause.message || t("Work preference action failed.")) +
            " " +
            t("Refresh and check the current records before retrying."),
        );
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const instant = (value: string) =>
    dateLabel(new Date(value), lang, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  const name = (id: string) =>
    data?.people.find((p) => p.id === id)?.name || t("Unavailable member");
  function saveAvailability() {
    try {
      const body = availabilityInput(from, until);
      if (
        rows.some(
          (r) =>
            r.user_id === data?.actorId &&
            Date.parse(r.starts_at) === Date.parse(body.startsAt) &&
            Date.parse(r.ends_at) === Date.parse(body.endsAt),
        )
      )
        throw Error("This unavailability is already recorded.");
      Alert.alert(
        t("Save unavailability?"),
        t("From {from}\nUntil {until}", {
          from: instant(body.startsAt),
          until: instant(body.endsAt),
        }),
        [
          { text: t("Cancel"), style: "cancel" },
          {
            text: t("Save"),
            onPress: () =>
              void run(async () => {
                await api.post(base + "/availability", body);
                if (current()) {
                  setFrom("");
                  setUntil("");
                }
                return "Unavailability saved.";
              }),
          },
        ],
      );
    } catch (cause: any) {
      setError(t(cause.message));
    }
  }
  function requestCover() {
    if (!shiftId || !colleague) return;
    if (
      swaps.some(
        (s) =>
          s.shift_id === shiftId &&
          s.from_user === data?.actorId &&
          s.to_user === colleague &&
          ["pending", "accepted"].includes(s.status),
      )
    ) {
      setError(t("A cover request to this colleague is already pending."));
      return;
    }
    const shift = data?.shifts.find((s) => s.id === shiftId);
    if (!shift) return;
    Alert.alert(
      t("Request cover?"),
      t("Ask {name} to cover {shift}?", {
        name: name(colleague),
        shift: shift.name,
      }),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: t("Request cover"),
          onPress: () =>
            void run(async () => {
              await api.post(base + "/swaps", { shiftId, toUser: colleague });
              if (current()) {
                setShiftId("");
                setColleague("");
              }
              return "Cover request sent. Your assignment stays until manager approval.";
            }),
        },
      ],
    );
  }
  const swapStatus = (status: string) =>
    t(
      (
        {
          pending: "Awaiting colleague",
          accepted: "Awaiting manager approval",
          rejected: "Declined",
          approved: "Replacement approved",
        } as Record<string, string>
      )[status] || "Status unavailable",
    );
  const actionButton = (label: string, handler: () => void, key?: string) => (
    <TouchableOpacity
      key={key || label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={handler}
      style={[s.button, disabled && s.disabled]}
    >
      <Text style={s.link}>{t(label)}</Text>
    </TouchableOpacity>
  );
  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="on-drag"
      style={s.root}
      contentContainerStyle={[
        s.content,
        { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => navigation.goBack()}
        style={s.button}
      >
        <Text style={s.link}>{t("Back")}</Text>
      </TouchableOpacity>
      <Text style={s.title}>{t("Availability & shift cover")}</Text>
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {!!notice && (
        <Text accessibilityRole="alert" style={s.notice}>
          {notice}
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
      {loading && <ActivityIndicator color="#67E8F9" />}
      {valid && data && (
        <>
          <View style={s.card}>
            <Text style={s.heading}>{t("When you cannot work")}</Text>
            <Text style={s.body}>
              {t(
                "Enter dates with a timezone, for example 2026-12-01T08:00:00-07:00. Dates below use this device timezone. Changes require a connection.",
              )}
            </Text>
            <Text style={s.label}>
              {t("From (ISO date/time with timezone)")}
            </Text>
            <TextInput
              accessibilityLabel={t("From (ISO date/time with timezone)")}
              style={s.input}
              editable={!disabled}
              value={from}
              onChangeText={setFrom}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={s.label}>
              {t("Until (ISO date/time with timezone)")}
            </Text>
            <TextInput
              accessibilityLabel={t("Until (ISO date/time with timezone)")}
              style={s.input}
              editable={!disabled}
              value={until}
              onChangeText={setUntil}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {actionButton("Save unavailability", saveAvailability)}
            {!rows.length && (
              <Text style={s.body}>{t("No unavailability recorded.")}</Text>
            )}
            {rows.map((row) => (
              <View key={row.id} style={s.record}>
                <Text style={s.body}>
                  {name(row.user_id)} · {instant(row.starts_at)} –{" "}
                  {instant(row.ends_at)}
                </Text>
                {(row.user_id === data.actorId || data.manager === true) &&
                  actionButton(
                    "Remove unavailability",
                    () =>
                      Alert.alert(
                        t("Remove unavailability?"),
                        t("From {from}\nUntil {until}", {
                          from: instant(row.starts_at),
                          until: instant(row.ends_at),
                        }),
                        [
                          { text: t("Cancel"), style: "cancel" },
                          {
                            text: t("Remove"),
                            style: "destructive",
                            onPress: () =>
                              void run(async () => {
                                await api.delete(
                                  base +
                                    "/availability/" +
                                    encodeURIComponent(row.id),
                                );
                                return "Unavailability removed.";
                              }),
                          },
                        ],
                      ),
                    row.id,
                  )}
              </View>
            ))}
          </View>
          <View style={s.card}>
            <Text style={s.heading}>{t("Request a replacement")}</Text>
            <Text style={s.body}>
              {t(
                "Your colleague must accept, then a manager approves after checking availability and conflicts. Accepting alone does not change the assignment.",
              )}
            </Text>
            <Text style={s.body}>
              {t("Shift times use company timezone: {timezone}", {
                timezone: data.timezone || "UTC",
              })}
            </Text>
            <Text style={s.label}>{t("Your upcoming shift")}</Text>
            {!data.shifts.length && (
              <Text style={s.body}>{t("No assigned upcoming shifts.")}</Text>
            )}
            {data.shifts.map((shift) => (
              <TouchableOpacity
                key={shift.id}
                accessibilityRole="button"
                accessibilityState={{ selected: shiftId === shift.id }}
                disabled={disabled}
                onPress={() => setShiftId(shift.id)}
                style={[s.button, shiftId === shift.id && s.selected]}
              >
                <Text style={s.link}>
                  {shift.name} · {String(shift.date).slice(0, 10)} ·{" "}
                  {shift.start_time?.slice(0, 5)} –{" "}
                  {shift.end_time?.slice(0, 5)}
                </Text>
              </TouchableOpacity>
            ))}
            <Text style={s.label}>{t("Ask this colleague")}</Text>
            {data.people
              .filter((p) => p.id !== data.actorId)
              .map((p) => (
                <TouchableOpacity
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: colleague === p.id }}
                  disabled={disabled}
                  onPress={() => setColleague(p.id)}
                  style={[s.button, colleague === p.id && s.selected]}
                >
                  <Text style={s.link}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            <TouchableOpacity
              accessibilityRole="button"
              disabled={disabled || !shiftId || !colleague}
              onPress={requestCover}
              style={s.button}
            >
              <Text style={s.link}>{t("Request cover")}</Text>
            </TouchableOpacity>
          </View>
          <View style={s.card}>
            <Text style={s.heading}>{t("Cover requests")}</Text>
            {!swaps.length && (
              <Text style={s.body}>{t("No cover requests.")}</Text>
            )}
            {swaps.map((swap) => (
              <View key={swap.id} style={s.record}>
                <Text style={s.heading}>
                  {swap.shift_name || t("Scheduled shift")}
                </Text>
                <Text style={s.body}>
                  {String(swap.shift_date || "").slice(0, 10)} ·{" "}
                  {swap.start_time?.slice(0, 5)} – {swap.end_time?.slice(0, 5)}
                </Text>
                <Text style={s.body}>
                  {name(swap.from_user)} → {name(swap.to_user)} ·{" "}
                  {swapStatus(swap.status)}
                </Text>
                {swap.status === "pending" && swap.to_user === data.actorId && (
                  <View style={s.actions}>
                    {actionButton(
                      "Accept",
                      () =>
                        void run(async () => {
                          await api.post(
                            base +
                              "/swaps/" +
                              encodeURIComponent(swap.id) +
                              "/respond",
                            { status: "accepted" },
                          );
                          return "Cover accepted. Manager approval is still required.";
                        }),
                    )}
                    {actionButton(
                      "Decline",
                      () =>
                        void run(async () => {
                          await api.post(
                            base +
                              "/swaps/" +
                              encodeURIComponent(swap.id) +
                              "/respond",
                            { status: "rejected" },
                          );
                          return "Cover request declined.";
                        }),
                    )}
                  </View>
                )}
                {swap.status === "accepted" &&
                  data.manager === true &&
                  actionButton("Approve replacement", () =>
                    Alert.alert(
                      t("Approve replacement?"),
                      t(
                        "Approval changes the assignment after current availability and conflict checks.",
                      ),
                      [
                        { text: t("Cancel"), style: "cancel" },
                        {
                          text: t("Approve"),
                          onPress: () =>
                            void run(async () => {
                              await api.post(
                                base +
                                  "/swaps/" +
                                  encodeURIComponent(swap.id) +
                                  "/approve",
                                { requestKey: coverApprovalKey(swap.id) },
                              );
                              return "Replacement approved.";
                            }),
                        },
                      ],
                    ),
                  )}
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#06101D" },
  content: { padding: 18 },
  title: { color: "#FFF", fontSize: 26, fontWeight: "800" },
  heading: { color: "#FFF", fontSize: 18, fontWeight: "700" },
  label: { color: "#BFDAE7", marginTop: 14, marginBottom: 6 },
  body: { color: "#B0C5D4", marginVertical: 8, flexShrink: 1 },
  card: {
    backgroundColor: "#102035",
    borderRadius: 16,
    padding: 16,
    marginVertical: 10,
  },
  record: {
    borderTopWidth: 1,
    borderTopColor: "#34506A",
    marginTop: 12,
    paddingTop: 12,
  },
  input: {
    backgroundColor: "#06101D",
    borderWidth: 1,
    borderColor: "#34506A",
    borderRadius: 8,
    padding: 12,
    color: "#FFF",
    minHeight: 48,
  },
  button: { padding: 14, minHeight: 48, borderRadius: 8, marginVertical: 4 },
  link: { color: "#67E8F9", fontWeight: "700", flexShrink: 1 },
  selected: { backgroundColor: "#164D63" },
  disabled: { opacity: 0.5 },
  actions: { flexDirection: "row", flexWrap: "wrap" },
  error: { color: "#FF91A4", paddingVertical: 12 },
  notice: { color: "#A7F3D0", paddingVertical: 12 },
});
