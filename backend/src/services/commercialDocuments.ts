import Big from "big.js";
import { createHash } from "crypto";
import { pool } from "../config/database";
export type DocumentKind = "invoice" | "estimate";
export const commercialError = (message: string, status = 400) =>
  Object.assign(new Error(message), { status });
export const requireValue = (ok: unknown, message: string, status = 400) => {
  if (!ok) throw commercialError(message, status);
};
export function documentDate(value: unknown) {
  const s = String(value || "");
  requireValue(
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
      Number.isFinite(Date.parse(s + "T00:00:00Z")) &&
      new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s,
    "Use a valid date (YYYY-MM-DD).",
  );
  return s;
}
export function documentId(value: unknown) {
  const s = String(value || "");
  requireValue(
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s),
    "Invalid document identifier.",
  );
  return s.toLowerCase();
}
export function decimal(value: unknown, max = 1000000, positive = false) {
  const s = String(value ?? "").trim();
  requireValue(
    /^\d+(?:\.\d{1,2})?$/.test(s),
    "Enter a nonnegative decimal with at most two decimal places.",
  );
  const b = new Big(s);
  requireValue(
    b.lte(max) && (!positive || b.gt(0)),
    "Amount or quantity is outside the supported range.",
  );
  return b.toFixed(2);
}
export function note(value: unknown, max = 2000) {
  if (value == null) return "";
  requireValue(
    typeof value === "string" && value.length <= max,
    "Text is too long or has an invalid type.",
  );
  return String(value).trim();
}
export const documentTables = (kind: DocumentKind) =>
  kind === "invoice"
    ? { table: "invoices", items: "invoice_items", fk: "invoice_id" }
    : { table: "estimates", items: "estimate_items", fk: "estimate_id" };
export function documentPayload(body: any, kind: DocumentKind) {
  requireValue(
    body && typeof body === "object" && !Array.isArray(body),
    "A document body is required.",
  );
  requireValue(
    body.status === undefined,
    "Use the explicit document action to change status.",
  );
  const issueDate = documentDate(body.issueDate),
    end =
      kind === "invoice"
        ? documentDate(body.dueDate)
        : body.expiryDate
          ? documentDate(body.expiryDate)
          : null;
  requireValue(
    !end || end >= issueDate,
    "The due or expiry date must not precede the issue date.",
  );
  requireValue(
    ["CAD", "USD"].includes(body.currency),
    "Choose CAD or USD explicitly. Other currency precision is not implemented.",
  );
  requireValue(
    Array.isArray(body.items) &&
      body.items.length > 0 &&
      body.items.length <= 100,
    "Provide between 1 and 100 line items.",
  );
  const linked = new Set<string>();
  const items = body.items.map((item: any) => {
    const description = note(item.description, 1000);
    requireValue(description, "Every line needs a description.");
    const quantity = decimal(item.quantity ?? 1, 100000, true),
      unit_price = decimal(item.unit_price),
      ids = (item.timeEntryIds || []) as string[];
    requireValue(
      Array.isArray(ids) && ids.length <= 100,
      "Invalid time-entry links.",
    );
    if (kind === "estimate")
      requireValue(
        ids.length === 0,
        "Time entries can only be billed on invoices.",
      );
    for (const value of ids) {
      const id = documentId(value);
      requireValue(
        !linked.has(id),
        "A time entry cannot occur on multiple lines.",
      );
      linked.add(id);
    }
    return {
      description,
      quantity,
      unit_price,
      timeEntryIds: ids.map(documentId),
      total: new Big(quantity)
        .times(unit_price)
        .round(2, Big.roundHalfUp)
        .toFixed(2),
    };
  });
  const subtotal = items.reduce(
      (sum: any, item: any) => sum.plus(item.total),
      new Big(0),
    ),
    taxRate = decimal(body.taxRate ?? 0, 100),
    tax = subtotal.times(taxRate).div(100).round(2, Big.roundHalfUp),
    total = subtotal.plus(tax);
  requireValue(
    total.gt(0) && total.lte("99999999.99"),
    "Document total exceeds the supported accounting range.",
  );
  const recurring = kind === "invoice" && body.isRecurring === true,
    frequency = recurring ? String(body.recurringFrequency || "") : null,
    recurringEnd = recurring ? documentDate(body.recurringEndDate) : null;
  requireValue(
    !recurring ||
      ["weekly", "biweekly", "monthly", "quarterly", "yearly"].includes(
        frequency!,
      ),
    "Choose a supported recurrence interval.",
  );
  requireValue(
    !recurringEnd || recurringEnd >= issueDate,
    "Recurrence end must not precede the issue date.",
  );
  const milestone = note(body.milestone_name, 255),
    percentage = milestone
      ? decimal(body.milestone_percentage, 100, true)
      : null;
  return {
    projectId: body.projectId ? documentId(body.projectId) : null,
    clientId: body.clientId ? documentId(body.clientId) : null,
    issueDate,
    end,
    currency: String(body.currency),
    taxRate,
    subtotal: subtotal.toFixed(2),
    total: total.toFixed(2),
    notes: note(body.notes),
    clientNotes: note(body.clientNotes),
    items,
    isRecurring: recurring,
    frequency,
    recurringEnd,
    milestone: milestone || null,
    percentage,
    parentId: body.parent_invoice_id
      ? documentId(body.parent_invoice_id)
      : null,
  };
}
export async function transaction<T>(work: (client: any) => Promise<T>) {
  let client: any;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client?.release();
  }
}
export function requestKey(value: unknown) {
  const key = String(value || "");
  requireValue(
    /^[a-zA-Z0-9:_-]{8,120}$/.test(key),
    "Provide a stable request key for this save.",
  );
  return key;
}
export async function commercialAction(
  client: any,
  actor: any,
  key: string,
  payload: any,
  work: () => Promise<any>,
) {
  const hash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    actor.company_id + ":" + key,
  ]);
  const old = await client.query(
    "SELECT fingerprint,result FROM commercial_actions WHERE company_id=$1 AND action_key=$2",
    [actor.company_id, key],
  );
  if (old.rows[0]) {
    requireValue(
      old.rows[0].fingerprint === hash,
      "This request or receipt reference was already used with different details.",
      409,
    );
    return { ...old.rows[0].result, replayed: true };
  }
  const result = await work();
  await client.query(
    "INSERT INTO commercial_actions(company_id,action_key,fingerprint,result,created_by) VALUES($1,$2,$3,$4,$5)",
    [actor.company_id, key, hash, JSON.stringify(result), actor.id],
  );
  return result;
}
export async function ownedDocument(
  client: any,
  actor: any,
  kind: DocumentKind,
  id: string,
  lock = false,
) {
  const { table } = documentTables(kind);
  const r = await client.query(
    `SELECT * FROM ${table} WHERE id=$1 AND company_id=$2${lock ? " FOR UPDATE" : ""}`,
    [id, actor.company_id],
  );
  requireValue(r.rows[0], "Document not found.", 404);
  return r.rows[0];
}
export function checkVersion(row: any, value: unknown) {
  requireValue(
    value &&
      Number.isFinite(Date.parse(String(value))) &&
      new Date(row.updated_at).toISOString() ===
        new Date(String(value)).toISOString(),
    "The document changed. Reload it before saving.",
    409,
  );
}
export async function validateRelations(
  client: any,
  actor: any,
  payload: any,
  editingId?: string,
) {
  if (payload.projectId) {
    const r = await client.query(
      "SELECT id,client_id FROM projects WHERE id=$1 AND company_id=$2",
      [payload.projectId, actor.company_id],
    );
    requireValue(r.rows[0], "Project not found in your company.", 404);
    if (!payload.clientId) payload.clientId = r.rows[0].client_id;
  }
  if (payload.clientId) {
    const r = await client.query(
      "SELECT id FROM users WHERE id=$1 AND company_id=$2",
      [payload.clientId, actor.company_id],
    );
    requireValue(r.rows[0], "Client not found in your company.", 404);
  }
  if (payload.parentId) {
    const parent = await ownedDocument(
      client,
      actor,
      "invoice",
      payload.parentId,
    );
    requireValue(
      parent.id !== editingId &&
        parent.currency === payload.currency &&
        parent.project_id === payload.projectId &&
        parent.client_id === payload.clientId,
      "Parent invoice must match this project, client and currency.",
    );
  }
  for (const item of payload.items)
    for (const id of item.timeEntryIds) {
      requireValue(
        payload.projectId,
        "Choose a project before linking time entries.",
      );
      const r = await client.query(
        `SELECT t.id FROM time_entries t JOIN users u ON u.id=t.user_id WHERE t.id=$1 AND u.company_id=$2 AND t.project_id=$3 AND t.status='completed' AND t.approval_status='approved' FOR UPDATE OF t`,
        [id, actor.company_id, payload.projectId],
      );
      requireValue(
        r.rows[0],
        "Only approved completed entries in this company/project can be billed.",
        409,
      );
      const used = await client.query(
        "SELECT id FROM invoice_items WHERE time_entry_ids @> ARRAY[$1::uuid] AND ($2::uuid IS NULL OR invoice_id<>$2) LIMIT 1",
        [id, editingId || null],
      );
      requireValue(!used.rows.length, "A time entry is already billed.", 409);
    }
}
export async function saveDocument(
  client: any,
  actor: any,
  kind: DocumentKind,
  p: any,
  id?: string,
) {
  const { table, items, fk } = documentTables(kind);
  await validateRelations(client, actor, p, id);
  let result: any;
  if (id) {
    const row = await ownedDocument(client, actor, kind, id, true);
    requireValue(row.status === "draft", "Only drafts can be edited.", 409);
    requireValue(
      !new Big(row.paid_amount || 0).gt(0),
      "Paid records cannot be edited.",
      409,
    );
    checkVersion(row, p.expectedUpdatedAt);
    result = await client.query(
      `UPDATE ${table} SET project_id=$1,client_id=$2,issue_date=$3,${kind === "invoice" ? "due_date" : "expiry_date"}=$4,tax_rate=$5,subtotal=$6,notes=$7,client_notes=$8,currency=$9,updated_at=NOW() WHERE id=$10 AND company_id=$11 RETURNING *`,
      [
        p.projectId,
        p.clientId,
        p.issueDate,
        p.end,
        p.taxRate,
        p.subtotal,
        p.notes,
        p.clientNotes,
        p.currency,
        id,
        actor.company_id,
      ],
    );
    await client.query(`DELETE FROM ${items} WHERE ${fk}=$1`, [id]);
  } else {
    result = await client.query(
      `INSERT INTO ${table}(company_id,project_id,client_id,issue_date,${kind === "invoice" ? "due_date" : "expiry_date"},tax_rate,subtotal,notes,client_notes,currency,created_by,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft') RETURNING *`,
      [
        actor.company_id,
        p.projectId,
        p.clientId,
        p.issueDate,
        p.end,
        p.taxRate,
        p.subtotal,
        p.notes,
        p.clientNotes,
        p.currency,
        actor.id,
      ],
    );
    id = result.rows[0].id;
  }
  if (kind === "invoice")
    await client.query(
      "UPDATE invoices SET is_recurring=$1,recurring_frequency=$2,recurring_end_date=$3,milestone_name=$4,milestone_percentage=$5,parent_invoice_id=$6 WHERE id=$7",
      [
        p.isRecurring,
        p.frequency,
        p.recurringEnd,
        p.milestone,
        p.percentage,
        p.parentId,
        id,
      ],
    );
  for (const [position, item] of p.items.entries())
    await client.query(
      `INSERT INTO ${items}(${fk},description,quantity,unit_price,position${kind === "invoice" ? ",time_entry_ids" : ""}) VALUES($1,$2,$3,$4,$5${kind === "invoice" ? ",$6" : ""})`,
      kind === "invoice"
        ? [
            id,
            item.description,
            item.quantity,
            item.unit_price,
            position,
            item.timeEntryIds,
          ]
        : [id, item.description, item.quantity, item.unit_price, position],
    );
  return { documentId: id, kind };
}
export const receiptKey = (invoiceId: string, reference: string) =>
  "payment:" +
  invoiceId +
  ":" +
  createHash("sha256").update(reference).digest("hex");
