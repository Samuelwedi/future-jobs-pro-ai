import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { api, API_URL } from "./api";
const uuid = (id: string) => {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
  )
    throw Error("Choose a valid evidence record.");
  return id;
};
export async function shareEvidenceArtifact(
  id: string,
  kind: "pdf" | "gps" | "voice",
  current: () => boolean,
) {
  uuid(id);
  if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync()))
    throw Error("Sharing is unavailable on this device");
  const route =
      kind === "pdf"
        ? "/time-entry/" + id + "/time-entry-pdf"
        : kind === "gps"
          ? "/time-entry/" + id + "/gps-video"
          : "/voice-note/" + id + "/caption-video",
    mime = kind === "pdf" ? "application/pdf" : "video/mp4",
    file =
      FileSystem.cacheDirectory +
      "evidence_" +
      id +
      "_" +
      Date.now() +
      (kind === "pdf" ? ".pdf" : ".mp4");
  const token = await api.getToken();
  if (!token) throw Error("Sign in again before exporting.");
  if (!current()) return;
  try {
    const r = await FileSystem.downloadAsync(
      API_URL + "/evidence-bundles" + route,
      file,
      { headers: { Authorization: "Bearer " + token } },
    );
    if (!current()) return;
    const type =
      Object.entries(r.headers || {}).find(
        ([k]) => k.toLowerCase() === "content-type",
      )?.[1] || "";
    if (r.status !== 200 || type.split(";")[0].toLowerCase() !== mime)
      throw Error("Evidence could not be downloaded.");
    const info = await FileSystem.getInfoAsync(file);
    if (!info.exists || !info.size || info.size > 50 * 1024 * 1024)
      throw Error("Evidence could not be downloaded.");
    if (current())
      await Sharing.shareAsync(file, {
        mimeType: mime,
        UTI: kind === "pdf" ? "com.adobe.pdf" : "public.mpeg-4",
      });
  } finally {
    await FileSystem.deleteAsync(file, { idempotent: true }).catch(() => {});
  }
}
export function evidencePackageResponse(
  r: any,
  id: string,
  actorId: string,
  companyId: string,
) {
  const base64 = String(r.base64 || ""),
    size =
      (base64.length / 4) * 3 -
      (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
  if (
    r.actorId !== actorId ||
    r.companyId !== companyId ||
    r.timeEntryId !== id ||
    r.mimeType !== "application/zip" ||
    !/^UEsDB[A-Za-z0-9+/]*={0,2}$/.test(base64) ||
    base64.length % 4 ||
    size !== r.size ||
    size <= 0 ||
    size > 20 * 1024 * 1024 ||
    !/^[a-f0-9]{64}$/.test(r.zipSha256 || "") ||
    !/^[a-f0-9]{64}$/.test(r.canonicalHash || "")
  )
    throw Error("Evidence package could not be verified.");
  return { base64, hash: String(r.zipSha256), size };
}
export async function shareEvidencePackage(
  id: string,
  selection: any,
  actorId: string,
  companyId: string,
  current: () => boolean,
) {
  uuid(id);
  if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync()))
    throw Error("Sharing is unavailable on this device");
  if (!current()) return;
  const r = await api.post<any>(
    "/evidence-bundles/time-entry/" + id + "/download?encoding=base64",
    selection,
  );
  if (!current()) return;
  const data = evidencePackageResponse(r, id, actorId, companyId),
    file =
      FileSystem.cacheDirectory + "evidence_" + id + "_" + Date.now() + ".zip";
  try {
    await FileSystem.writeAsStringAsync(file, data.base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!current()) return;
    const info = await FileSystem.getInfoAsync(file);
    if (!info.exists || info.size !== data.size)
      throw Error("Evidence package could not be saved.");
    if (current())
      await Sharing.shareAsync(file, {
        mimeType: "application/zip",
        UTI: "public.zip-archive",
      });
    return data.hash;
  } finally {
    await FileSystem.deleteAsync(file, { idempotent: true }).catch(() => {});
  }
}
