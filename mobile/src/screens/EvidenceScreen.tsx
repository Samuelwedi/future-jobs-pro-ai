import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
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
import {
  shareEvidenceArtifact,
  shareEvidencePackage,
} from "../services/evidenceFiles";
import MediaAttachment from "../components/MediaAttachment";
type Category = "photos" | "voiceNotes" | "attachments";
export default function EvidenceScreen() {
  const { user } = useAuth(),
    { t, lang } = useLang(),
    nav = useNavigation(),
    insets = useSafeAreaInsets(),
    manager = ["boss", "owner", "manager", "admin"].includes(
      String(user?.role).toLowerCase(),
    );
  const identity = String(user?.companyId) + ":" + String(user?.id),
    [offset, setOffset] = useState(0),
    key = identity + ":" + offset,
    ref = useRef(key);
  ref.current = key;
  const [rows, setRows] = useState<any[]>([]),
    [details, setDetails] = useState<any>(null),
    [selected, setSelected] = useState<Record<string, boolean>>({}),
    [generated, setGenerated] = useState({
      includeGpsVideo: false,
      includeTimeEntryPdf: true,
      includeVoiceVideos: false,
    }),
    [hash, setHash] = useState("");
  const [loaded, setLoaded] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const active = useRef(false),
    seq = useRef(0),
    lock = useRef(false),
    current = () => active.current && ref.current === key,
    ready = manager && loaded === key && !busy && !loading;
  const verify = (r: any) => {
    if (r.actorId !== user?.id || r.companyId !== user?.companyId)
      throw Error(t("Evidence account could not be verified."));
  };
  const load = useCallback(async () => {
    if (!manager) return;
    const n = ++seq.current;
    setLoading(true);
    setLoaded("");
    setDetails(null);
    setHash("");
    setSelected({});
    try {
      const r = await api.get<any>(
        "/evidence-bundles/recent?limit=25&offset=" + offset,
      );
      if (!current() || seq.current !== n) return;
      verify(r);
      if (!Array.isArray(r.entries))
        throw Error(t("Evidence account could not be verified."));
      setRows(r.entries);
      setLoaded(key);
      setError("");
    } catch (e: any) {
      if (current()) setError(e.response?.data?.message || e.message);
    } finally {
      if (current() && seq.current === n) setLoading(false);
    }
  }, [key, manager, t]);
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      void load();
      return () => {
        active.current = false;
        seq.current++;
        setRows([]);
        setDetails(null);
        setSelected({});
        setLoaded("");
        setHash("");
      };
    }, [load]),
  );
  const run = async (fn: () => Promise<void>) => {
    if (!ready || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setHash("");
    try {
      if (!(await checkOnlineStatus()))
        throw Error(t("Reconnect before reviewing or exporting evidence."));
      if (current()) await fn();
    } catch (e: any) {
      if (current())
        setError(
          e.response?.data?.message ||
            t(e.message) ||
            t("Evidence action failed."),
        );
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  };
  const inspect = (id: string) =>
    void run(async () => {
      const r = await api.get<any>("/evidence-bundles/time-entry/" + id);
      if (!current()) return;
      verify(r);
      if (
        r.entry?.id !== id ||
        !["photos", "voiceNotes", "attachments", "gps"].every((k) =>
          Array.isArray(r[k]),
        )
      )
        throw Error(t("Evidence account could not be verified."));
      setDetails(r);
      setSelected({});
      setGenerated({
        includeGpsVideo: false,
        includeTimeEntryPdf: true,
        includeVoiceVideos: false,
      });
    });
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
  const toggle = (
    label: string,
    value: boolean,
    onValueChange: (b: boolean) => void,
  ) => (
    <View style={styles.row}>
      <Text style={[styles.text, { flex: 1 }]}>{t(label)}</Text>
      <Switch
        accessibilityLabel={t(label)}
        value={value}
        onValueChange={onValueChange}
        disabled={!ready}
      />
    </View>
  );
  const stamp = (value: any) =>
    value ? new Date(value).toLocaleString(lang) : t("In progress");
  const mime = (item: any, c: Category) =>
    c === "voiceNotes"
      ? "audio/mp4"
      : c === "attachments"
        ? item.file_type || "application/octet-stream"
        : item.file_type === "video"
          ? "video/mp4"
          : "image/jpeg";
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
      <Text style={styles.title}>{t("Evidence center")}</Text>
      <Text style={styles.text}>
        {t(
          "Packages summarize stored records. Hashes do not independently prove camera, location or event authenticity. Raw time and GPS metadata are included in every package.",
        )}
      </Text>
      {button("Refresh evidence", () => void load(), !busy)}
      {loading && <ActivityIndicator />}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {!details &&
        rows.map((r) => (
          <TouchableOpacity
            key={r.id}
            accessibilityRole="button"
            accessibilityLabel={r.employee_name + " · " + r.id}
            disabled={!ready}
            style={styles.card}
            onPress={() => inspect(r.id)}
          >
            <Text style={styles.text}>
              {r.employee_name} · {r.project_name || t("No project")}
            </Text>
            <Text style={styles.text}>
              {stamp(r.clock_in)} — {stamp(r.clock_out)}
            </Text>
            <Text style={styles.text}>
              {t("Media files")}: {r.media_count} · {t("Voice notes")}:{" "}
              {r.voice_count} · GPS: {r.gps_count}
            </Text>
          </TouchableOpacity>
        ))}
      {!details && (
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
      )}
      {loaded === key && details && (
        <View style={styles.card}>
          {button("Return to evidence list", () => {
            setDetails(null);
            setHash("");
          })}
          <Text style={styles.title}>{details.entry.employee_name}</Text>
          <Text style={styles.text}>
            {details.entry.project_name || t("No project")} · {details.entry.id}
          </Text>
          <Text style={styles.text}>
            {stamp(details.entry.clock_in)} — {stamp(details.entry.clock_out)}
          </Text>
          <Text style={styles.text}>GPS: {details.gps.length}</Text>
          {button(
            "Share time-entry PDF",
            () =>
              void run(() =>
                shareEvidenceArtifact(details.entry.id, "pdf", current),
              ),
          )}
          {button(
            "Share GPS reconstruction",
            () =>
              void run(() =>
                shareEvidenceArtifact(details.entry.id, "gps", current),
              ),
            ready && details.gps.length >= 2,
          )}
          <Text style={styles.title}>{t("Package contents")}</Text>
          <Text style={styles.text}>
            {t(
              "Select original files explicitly. Missing originals stop generation. Mobile packages are limited to 20 MB; use the web for larger packages.",
            )}
          </Text>
          {toggle(
            "Include time-entry PDF",
            generated.includeTimeEntryPdf,
            (b) => setGenerated((v) => ({ ...v, includeTimeEntryPdf: b })),
          )}
          {toggle(
            "Include GPS reconstruction",
            generated.includeGpsVideo,
            (b) => setGenerated((v) => ({ ...v, includeGpsVideo: b })),
          )}
          {toggle(
            "Include selected voice reconstructions",
            generated.includeVoiceVideos,
            (b) => setGenerated((v) => ({ ...v, includeVoiceVideos: b })),
          )}
          {(["photos", "voiceNotes", "attachments"] as Category[]).map((c) => (
            <View key={c}>
              <Text style={styles.title}>
                {t(
                  c === "photos"
                    ? "Photos and videos"
                    : c === "voiceNotes"
                      ? "Voice notes"
                      : "Attachments",
                )}
              </Text>
              {!details[c].length && (
                <Text style={styles.text}>
                  {t("No files in this category.")}
                </Text>
              )}
              {details[c].map((r: any) => {
                const label =
                    r.file_name ||
                    String(r.transcript || r.file_type || r.id).slice(0, 100),
                  id = c + ":" + r.id,
                  proxy = c === "voiceNotes" ? "voice-notes" : c;
                return (
                  <View key={id} style={styles.card}>
                    <Text style={styles.text}>{label}</Text>
                    <Switch
                      accessibilityLabel={t("Include original") + " " + label}
                      disabled={!ready}
                      value={!!selected[id]}
                      onValueChange={(b) =>
                        setSelected((v) => ({ ...v, [id]: b }))
                      }
                    />
                    {r.url ? (
                      <MediaAttachment
                        key={identity + ":" + id}
                        path={
                          "/evidence-bundles/" + proxy + "/" + r.id + "/content"
                        }
                        name={r.file_name || r.id}
                        mime={mime(r, c)}
                      />
                    ) : (
                      <Text style={styles.error}>
                        {t("Original file is missing.")}
                      </Text>
                    )}
                    {c === "voiceNotes" &&
                      button(
                        "Share voice reconstruction",
                        () =>
                          void run(() =>
                            shareEvidenceArtifact(r.id, "voice", current),
                          ),
                      )}
                  </View>
                );
              })}
            </View>
          ))}
          {button(
            "Generate and share ZIP",
            () =>
              void run(async () => {
                const id = details.entry.id,
                  selection = {
                    ...generated,
                    photoIds: details.photos
                      .filter((r: any) => selected["photos:" + r.id])
                      .map((r: any) => r.id),
                    voiceNoteIds: details.voiceNotes
                      .filter((r: any) => selected["voiceNotes:" + r.id])
                      .map((r: any) => r.id),
                    attachmentIds: details.attachments
                      .filter((r: any) => selected["attachments:" + r.id])
                      .map((r: any) => r.id),
                  };
                const digest = await shareEvidencePackage(
                  id,
                  selection,
                  String(user?.id),
                  String(user?.companyId),
                  current,
                );
                if (current() && digest) setHash(digest);
              }),
          )}
          {!!hash && (
            <Text selectable style={styles.text}>
              {t("Provided ZIP SHA-256")}: {hash}
            </Text>
          )}
        </View>
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
  card: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#172238",
    marginVertical: 8,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
});
