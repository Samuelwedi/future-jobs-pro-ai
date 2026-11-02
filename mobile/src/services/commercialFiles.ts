import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { api, API_URL } from "./api";
export async function shareCommercialDocument(
  itemId: string,
  isCurrent: () => boolean,
  kind: "invoice" | "estimate",
) {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      itemId,
    )
  )
    throw Error("Document is unavailable.");
  if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync()))
    throw Error("Sharing is unavailable on this device");
  if (!isCurrent()) return;
  const token = await api.getToken();
  if (!token) throw Error("Sign in again before exporting.");
  if (!isCurrent()) return;
  const file =
    FileSystem.cacheDirectory + kind + "_" + itemId + "_" + Date.now() + ".pdf";
  try {
    const result = await FileSystem.downloadAsync(
      API_URL + ("/" + kind + "s/" + encodeURIComponent(itemId) + "/pdf"),
      file,
      { headers: { Authorization: "Bearer " + token } },
    );
    if (!isCurrent()) return;
    const type =
      Object.entries(result.headers || {}).find(
        ([k]) => k.toLowerCase() === "content-type",
      )?.[1] || "";
    if (result.status !== 200 || !/^application\/pdf(?:;|$)/i.test(type))
      throw Error("Document could not be downloaded.");
    const info = await FileSystem.getInfoAsync(file);
    if (!info.exists || !info.size || info.size > 20000000)
      throw Error("Document could not be downloaded.");
    if (isCurrent())
      await Sharing.shareAsync(file, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
      });
  } finally {
    await FileSystem.deleteAsync(file, { idempotent: true }).catch(() => {});
  }
}
