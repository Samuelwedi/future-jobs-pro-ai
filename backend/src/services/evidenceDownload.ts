import { commercialError, requireValue } from "./commercialDocuments";
export function evidenceMediaUrl(value: unknown) {
  let u: URL;
  try {
    u = new URL(String(value));
  } catch {
    throw commercialError("The original media location is unavailable.", 409);
  }
  const cloud = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  requireValue(
    !!cloud &&
      /^[A-Za-z0-9_-]+$/.test(cloud) &&
      u.protocol === "https:" &&
      u.hostname === "res.cloudinary.com" &&
      !u.port &&
      !u.username &&
      !u.password &&
      !u.hash &&
      new RegExp(
        "^/" + cloud + "/(image|video|raw)/(upload|authenticated|private)/",
      ).test(u.pathname),
    "The original media location is not an approved storage path.",
    409,
  );
  return u.toString();
}
export async function downloadEvidenceMedia(
  value: unknown,
  maxBytes = 75 * 1024 * 1024,
) {
  const url = evidenceMediaUrl(value),
    response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw commercialError("Original media could not be downloaded.", 409);
  }
  const type = response.headers.get("content-type") || "";
  if (/text\/html|application\/xhtml/i.test(type)) {
    await response.body.cancel();
    throw commercialError("Original media returned an invalid response.", 409);
  }
  const advertised = Number(response.headers.get("content-length") || 0);
  if (advertised > maxBytes) {
    await response.body!.cancel();
    throw commercialError("Selected media exceeds the download limit.", 413);
  }
  const reader = response.body!.getReader(),
    chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw commercialError(
          "Selected media exceeds the download limit.",
          413,
        );
      }
      chunks.push(Buffer.from(part.value));
    }
  } finally {
    reader.releaseLock();
  }
  requireValue(size > 0, "The original media file is empty.", 409);
  return Buffer.concat(chunks, size);
}
export function evidenceFilename(value: unknown) {
  return (
    String(value || "file")
      .replace(/[^a-zA-Z0-9._ -]/g, "_")
      .replace(/^\.+/, "_")
      .slice(0, 160) || "file"
  );
}
