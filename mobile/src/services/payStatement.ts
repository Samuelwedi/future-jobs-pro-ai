import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { api, API_URL } from "./api";
export async function sharePayStatement(
  itemId: string,
  isCurrent: () => boolean,
  source: "manager" | "employee" = "manager",
) {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      itemId,
    )
  )
    throw Error("Pay statement is unavailable.");
  if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync()))
    throw Error("Sharing is unavailable on this device");
  if (!isCurrent()) return;
  const token = await api.getToken();
  if (!token) throw Error("Sign in again before exporting payroll.");
  if (!isCurrent()) return;
  const file =
    FileSystem.cacheDirectory + "paystub_" + itemId + "_" + Date.now() + ".pdf";
  try {
    const result = await FileSystem.downloadAsync(
      API_URL +
        (source === "employee"
          ? "/pay-stubs/reviewed/" + encodeURIComponent(itemId) + "/download"
          : "/payroll/paystub/" + encodeURIComponent(itemId)),
      file,
      { headers: { Authorization: "Bearer " + token } },
    );
    if (!isCurrent()) return;
    const type =
      Object.entries(result.headers || {}).find(
        ([k]) => k.toLowerCase() === "content-type",
      )?.[1] || "";
    if (result.status !== 200 || !/^application\/pdf(?:;|$)/i.test(type))
      throw Error("The reviewed pay statement could not be downloaded.");
    const info = await FileSystem.getInfoAsync(file);
    if (!info.exists || !info.size || info.size > 20000000)
      throw Error("The reviewed pay statement could not be downloaded.");
    if (isCurrent())
      await Sharing.shareAsync(file, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
      });
  } finally {
    await FileSystem.deleteAsync(file, { idempotent: true }).catch(() => {});
  }
}
