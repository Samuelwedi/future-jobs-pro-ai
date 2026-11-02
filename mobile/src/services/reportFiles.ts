import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { api, API_URL } from "./api";
export function reportSelection(
  projectId: string,
  startDate: string,
  endDate: string,
) {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      projectId,
    )
  )
    throw Error("Choose a project");
  for (const date of [startDate, endDate])
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date
    )
      throw Error("Choose valid reporting dates.");
  if (
    startDate > endDate ||
    (Date.parse(endDate) - Date.parse(startDate)) / 86400000 > 366
  )
    throw Error("Choose a reporting range of at most 367 calendar days.");
  return (
    "projectId=" +
    encodeURIComponent(projectId) +
    "&startDate=" +
    startDate +
    "&endDate=" +
    endDate
  );
}
export async function shareReport(
  projectId: string,
  start: string,
  end: string,
  format: "pdf" | "csv",
  isCurrent: () => boolean,
) {
  const query = reportSelection(projectId, start, end);
  if (!["pdf", "csv"].includes(format))
    throw Error("Report format is unavailable.");
  if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync()))
    throw Error("Sharing is unavailable on this device");
  const token = await api.getToken();
  if (!token) throw Error("Sign in again before exporting.");
  if (!isCurrent()) return;
  const file =
      FileSystem.cacheDirectory +
      "report_" +
      projectId +
      "_" +
      Date.now() +
      "." +
      format,
    mime = format === "pdf" ? "application/pdf" : "text/csv";
  try {
    const result = await FileSystem.downloadAsync(
      API_URL +
        "/reports/" +
        (format === "pdf" ? "comprehensive.pdf" : "timesheet.csv") +
        "?" +
        query,
      file,
      { headers: { Authorization: "Bearer " + token } },
    );
    if (!isCurrent()) return;
    const type =
      Object.entries(result.headers || {}).find(
        ([k]) => k.toLowerCase() === "content-type",
      )?.[1] || "";
    if (result.status !== 200 || type.split(";")[0].toLowerCase() !== mime)
      throw Error("Report could not be downloaded.");
    const info = await FileSystem.getInfoAsync(file);
    if (!info.exists || !info.size || info.size > 20000000)
      throw Error("Report could not be downloaded.");
    if (isCurrent())
      await Sharing.shareAsync(file, {
        mimeType: mime,
        UTI:
          format === "pdf"
            ? "com.adobe.pdf"
            : "public.comma-separated-values-text",
      });
  } finally {
    await FileSystem.deleteAsync(file, { idempotent: true }).catch(() => {});
  }
}
