export const commercialKey = () =>
  `save:${Date.now()}:${Math.random().toString(36).slice(2)}:${Math.random().toString(36).slice(2)}`;
export const money = (value: unknown, currency?: string | null) =>
  `${currency || "Unspecified currency"} ${Number(value).toFixed(2)}`;
export function conversionDates() {
  const invoiceDate = window.prompt(
    "Invoice issue date (YYYY-MM-DD):",
    new Date().toISOString().slice(0, 10),
  );
  if (!invoiceDate) return null;
  const dueDate = window.prompt("Invoice due date (YYYY-MM-DD):", invoiceDate);
  return dueDate ? { invoiceDate, dueDate } : null;
}
export async function downloadCommercialPDF(
  base: string,
  kind: "invoice" | "estimate",
  id: string,
  token: string,
) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw Error("Invalid document.");
  const r = await fetch(`${base}/api/${kind}s/${id}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    const data = await r.json();
    throw Error(data.message || "PDF unavailable.");
  }
  if (!/^application\/pdf(?:;|$)/i.test(r.headers.get("content-type") || ""))
    throw Error("Invalid PDF response.");
  const blob = await r.blob();
  if (blob.size === 0 || blob.size > 20000000) throw Error("Invalid PDF size.");
  if (localStorage.getItem("token") !== token) return;
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `${kind}_${id}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
