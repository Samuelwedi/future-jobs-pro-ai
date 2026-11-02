import express from "express";
import Big from "big.js";
import { pool } from "../config/database";
import { companyActor, manages } from "../middleware/companyActor";
import {
  commercialAction,
  commercialError,
  checkVersion,
  decimal,
  DocumentKind,
  documentDate,
  documentId,
  documentPayload,
  documentTables,
  note,
  ownedDocument,
  receiptKey,
  requestKey,
  requireValue,
  saveDocument,
  transaction,
} from "../services/commercialDocuments";
import { generateInvoicePDFBuffer } from "../services/pdfService";
export function createCommercialRouter(kind: DocumentKind) {
  const router = express.Router(),
    { table, items, fk } = documentTables(kind),
    plural = kind === "invoice" ? "invoices" : "estimates";
  router.use(companyActor, (_req, res, next) =>
    manages(res.locals.actor)
      ? next()
      : res
          .status(403)
          .json({ success: false, message: "Manager access required" }),
  );
  const route = (fn: any) => (req: any, res: any, next: any) =>
    Promise.resolve(fn(req, res)).catch(next);
  const actor = (res: any) => res.locals.actor;
  const joined = `SELECT d.*,to_char(d.issue_date,'YYYY-MM-DD') issue_date,to_char(d.${kind === "invoice" ? "due_date" : "expiry_date"},'YYYY-MM-DD') ${kind === "invoice" ? "due_date" : "expiry_date"},p.name project_name,COALESCE(u.full_name,u.first_name||' '||u.last_name,u.email) client_name FROM ${table} d LEFT JOIN projects p ON p.id=d.project_id AND p.company_id=d.company_id LEFT JOIN users u ON u.id=d.client_id AND u.company_id=d.company_id`;
  const detail = async (a: any, id: string) => {
    const d = await pool.query(joined + " WHERE d.id=$1 AND d.company_id=$2", [
      id,
      a.company_id,
    ]);
    requireValue(d.rows[0], "Document not found.", 404);
    const lines = await pool.query(
      `SELECT * FROM ${items} WHERE ${fk}=$1 ORDER BY position NULLS LAST,id`,
      [id],
    );
    const payments =
      kind === "invoice"
        ? (
            await pool.query(
              "SELECT * FROM payments WHERE invoice_id=$1 ORDER BY payment_date DESC,id",
              [id],
            )
          ).rows
        : [];
    return {
      success: true,
      actorId: a.id,
      companyId: a.company_id,
      [kind]: d.rows[0],
      items: lines.rows,
      payments,
      emailSent: false,
      recurringExecutionEnabled: false,
    };
  };
  router.get(
    "/workspace",
    route(async (_req: any, res: any) => {
      const a = actor(res);
      const [projects, clients] = await Promise.all([
        pool.query(
          "SELECT id,name,client_id FROM projects WHERE company_id=$1 ORDER BY name,id LIMIT 200",
          [a.company_id],
        ),
        pool.query(
          "SELECT id,COALESCE(full_name,first_name||' '||last_name,email) name FROM users WHERE company_id=$1 AND COALESCE(is_active,true) ORDER BY name,id LIMIT 200",
          [a.company_id],
        ),
      ]);
      res.json({
        success: true,
        actorId: a.id,
        companyId: a.company_id,
        manager: true,
        projects: projects.rows,
        clients: clients.rows,
        currencies: ["CAD", "USD"],
        recurringExecutionEnabled: false,
      });
    }),
  );
  router.get(
    "/",
    route(async (req: any, res: any) => {
      const a = actor(res),
        limit = Number(req.query.limit ?? 50),
        offset = Number(req.query.offset ?? 0);
      requireValue(
        Number.isInteger(limit) &&
          limit > 0 &&
          limit <= 200 &&
          Number.isInteger(offset) &&
          offset >= 0 &&
          offset <= 100000,
        "Use a valid list page.",
      );
      const values: any[] = [a.company_id];
      let where = " WHERE d.company_id=$1";
      for (const [key, column] of Object.entries({
        status: "status",
        clientId: "client_id",
        projectId: "project_id",
      })) {
        if (req.query[key]) {
          if (key !== "status") documentId(req.query[key]);
          else
            requireValue(
              [
                "draft",
                "sent",
                "accepted",
                "rejected",
                "converted",
                "viewed",
                "partial",
                "paid",
                "cancelled",
                "overdue",
              ].includes(String(req.query[key])),
              "Invalid document status.",
            );
          values.push(req.query[key]);
          where += ` AND d.${column}=$${values.length}`;
        }
      }
      if (req.query.start) {
        values.push(documentDate(req.query.start));
        where += ` AND d.issue_date >= $${values.length}`;
      }
      if (req.query.end) {
        values.push(documentDate(req.query.end));
        where += ` AND d.issue_date <= $${values.length}`;
      }
      if (req.query.start && req.query.end)
        requireValue(
          req.query.start <= req.query.end,
          "Date range is reversed.",
        );
      values.push(limit, offset);
      const rows = await pool.query(
        joined +
          where +
          ` ORDER BY d.issue_date DESC,d.id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      );
      res.json({
        success: true,
        actorId: a.id,
        companyId: a.company_id,
        [plural]: rows.rows,
        limit,
        offset,
      });
    }),
  );
  if (kind === "invoice") {
    router.get(
      "/unbilled",
      route(async (req: any, res: any) => {
        const a = actor(res),
          projectId = documentId(req.query.projectId),
          project = await pool.query(
            "SELECT id FROM projects WHERE id=$1 AND company_id=$2",
            [projectId, a.company_id],
          );
        requireValue(project.rows[0], "Project not found.", 404);
        const rows = await pool.query(
          `SELECT te.id,te.project_id,te.user_id,COALESCE(u.full_name,u.first_name||' '||u.last_name,u.email) employee_name,te.clock_in,te.clock_out,te.regular_hours,te.overtime_hours,(te.regular_hours+te.overtime_hours) total_hours,te.total_wage amount FROM time_entries te JOIN users u ON u.id=te.user_id WHERE te.project_id=$1 AND u.company_id=$2 AND te.status='completed' AND te.approval_status='approved' AND NOT EXISTS(SELECT 1 FROM invoice_items ii WHERE ii.time_entry_ids @> ARRAY[te.id]) ORDER BY te.clock_in,te.id LIMIT 500`,
          [projectId, a.company_id],
        );
        res.json({ success: true, unbilled: rows.rows });
      }),
    );
    router.get(
      "/client/:clientId",
      route(async (req: any, res: any) => {
        const a = actor(res),
          id = documentId(req.params.clientId),
          client = await pool.query(
            "SELECT id,first_name,last_name,email,phone FROM users WHERE id=$1 AND company_id=$2",
            [id, a.company_id],
          );
        requireValue(client.rows[0], "Client not found.", 404);
        const [invoices, projects, totals] = await Promise.all([
          pool.query(
            "SELECT id,invoice_number,issue_date,due_date,status,total,paid_amount,balance,currency FROM invoices WHERE client_id=$1 AND company_id=$2 ORDER BY issue_date DESC LIMIT 50",
            [id, a.company_id],
          ),
          pool.query(
            "SELECT id,name,status,created_at FROM projects WHERE client_id=$1 AND company_id=$2 ORDER BY created_at DESC LIMIT 50",
            [id, a.company_id],
          ),
          pool.query(
            "SELECT currency,COUNT(*) total_invoices,COALESCE(SUM(total),0) total_billed,COALESCE(SUM(paid_amount),0) total_paid,COALESCE(SUM(balance),0) total_balance FROM invoices WHERE client_id=$1 AND company_id=$2 GROUP BY currency",
            [id, a.company_id],
          ),
        ]);
        res.json({
          success: true,
          client: client.rows[0],
          invoices: invoices.rows,
          projects: projects.rows,
          totalsByCurrency: totals.rows,
          totals: totals.rows.length === 1 ? totals.rows[0] : null,
        });
      }),
    );
  }
  router.get(
    "/:id/pdf",
    route(async (req: any, res: any) => {
      const a = actor(res),
        id = documentId(req.params.id),
        d: any = await detail(a, id),
        record = d[kind];
      requireValue(
        ["CAD", "USD"].includes(record.currency),
        "Verify the document currency before exporting.",
        409,
      );
      const company = await pool.query(
        "SELECT name,address FROM companies WHERE id=$1",
        [a.company_id],
      );
      const pdf = await generateInvoicePDFBuffer({
        invoiceNumber: record.invoice_number || record.estimate_number,
        date: String(record.issue_date).slice(0, 10),
        dueDate: String(record.due_date || record.expiry_date || "").slice(
          0,
          10,
        ),
        clientName: record.client_name || "Not specified",
        clientEmail: "",
        currency: record.currency,
        documentTitle: kind === "invoice" ? "INVOICE" : "ESTIMATE",
        items: d.items.map((l: any) => ({
          description: l.description,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unit_price),
          total: Number(l.total),
        })),
        subtotal: Number(record.subtotal),
        taxRate: Number(record.tax_rate),
        taxAmount: Number(record.tax_amount),
        total: Number(record.total),
        notes: record.client_notes || "",
        companyName: company.rows[0]?.name || "",
        companyAddress: company.rows[0]?.address || "",
      });
      res
        .set("Content-Type", "application/pdf")
        .set("Content-Disposition", `attachment; filename=${kind}_${id}.pdf`)
        .send(pdf);
    }),
  );
  router.get(
    "/:id",
    route(async (req: any, res: any) =>
      res.json(await detail(actor(res), documentId(req.params.id))),
    ),
  );
  router.post(
    "/",
    route(async (req: any, res: any) => {
      const a = actor(res),
        p = documentPayload(req.body, kind),
        key = requestKey(req.body.requestKey);
      const result = await transaction((c) =>
        commercialAction(c, a, `create:${kind}:${a.id}:${key}`, p, () =>
          saveDocument(c, a, kind, p),
        ),
      );
      res.status(result.replayed ? 200 : 201).json({
        ...(await detail(a, result.documentId)),
        replayed: !!result.replayed,
      });
    }),
  );
  router.put(
    "/:id",
    route(async (req: any, res: any) => {
      const a = actor(res),
        id = documentId(req.params.id),
        p = {
          ...documentPayload(req.body, kind),
          expectedUpdatedAt: req.body.expectedUpdatedAt,
        },
        key = requestKey(req.body.requestKey);
      const result = await transaction((c) =>
        commercialAction(c, a, `edit:${kind}:${id}:${key}`, p, () =>
          saveDocument(c, a, kind, p, id),
        ),
      );
      res.json({
        ...(await detail(a, result.documentId)),
        replayed: !!result.replayed,
      });
    }),
  );
  router.delete(
    "/:id",
    route(async (req: any, res: any) => {
      const a = actor(res),
        id = documentId(req.params.id);
      const result = await transaction((c) =>
        commercialAction(c, a, `delete:${kind}:${id}`, { id }, async () => {
          const row = await ownedDocument(c, a, kind, id, true);
          requireValue(
            row.status === "draft" && !new Big(row.paid_amount || 0).gt(0),
            "Only unpaid drafts can be deleted.",
            409,
          );
          if (kind === "invoice") {
            const p = await c.query(
              "SELECT id FROM payments WHERE invoice_id=$1 LIMIT 1",
              [id],
            );
            requireValue(
              !p.rows.length,
              "A document with payment records cannot be deleted.",
              409,
            );
          }
          await c.query(`DELETE FROM ${table} WHERE id=$1 AND company_id=$2`, [
            id,
            a.company_id,
          ]);
          return { deleted: true };
        }),
      );
      res.json({ success: true, ...result });
    }),
  );
  router.post(
    "/:id/send",
    route(async (req: any, res: any) => {
      const a = actor(res),
        id = documentId(req.params.id);
      requireValue(
        req.body?.confirmed === true,
        "Confirm that you shared this document externally. No email is sent.",
      );
      await transaction((c) =>
        commercialAction(c, a, `share:${kind}:${id}`, { id }, async () => {
          const row = await ownedDocument(c, a, kind, id, true);
          requireValue(
            ["CAD", "USD"].includes(row.currency),
            "Verify the currency before sharing.",
            409,
          );
          requireValue(
            row.status === "draft" || row.status === "sent",
            "This document cannot be marked shared.",
            409,
          );
          if (req.body.expectedUpdatedAt)
            checkVersion(row, req.body.expectedUpdatedAt);
          await c.query(
            `UPDATE ${table} SET status='sent',sent_at=COALESCE(sent_at,NOW()),updated_at=NOW()${kind === "invoice" ? ",payment_link=NULL" : ""} WHERE id=$1 AND company_id=$2`,
            [id, a.company_id],
          );
          return { documentId: id, emailSent: false };
        }),
      );
      res.json({
        ...(await detail(a, id)),
        message: "Marked shared externally. No email was sent.",
      });
    }),
  );
  if (kind === "estimate") {
    router.post(
      "/:id/accept",
      route(async (req: any, res: any) => {
        const a = actor(res),
          id = documentId(req.params.id),
          reference = note(req.body?.reference, 255);
        requireValue(
          req.body?.confirmed === true && reference.length >= 4,
          "Confirm customer acceptance and provide its reference.",
        );
        await transaction((c) =>
          commercialAction(
            c,
            a,
            `accept:estimate:${id}`,
            { id, reference },
            async () => {
              const row = await ownedDocument(c, a, kind, id, true);
              requireValue(
                row.status === "sent",
                "Only shared estimates can have acceptance recorded.",
                409,
              );
              requireValue(
                ["CAD", "USD"].includes(row.currency),
                "Verify the estimate currency.",
                409,
              );
              await c.query(
                "UPDATE estimates SET status='accepted',accepted_at=NOW(),updated_at=NOW() WHERE id=$1 AND company_id=$2",
                [id, a.company_id],
              );
              return { documentId: id, reference };
            },
          ),
        );
        res.json(await detail(a, id));
      }),
    );
    router.post(
      "/:id/convert",
      route(async (req: any, res: any) => {
        const a = actor(res),
          id = documentId(req.params.id),
          dates = {
            invoiceDate: documentDate(req.body?.invoiceDate),
            dueDate: documentDate(req.body?.dueDate),
          };
        requireValue(
          dates.dueDate >= dates.invoiceDate,
          "Invoice due date must not precede issue date.",
        );
        const result = await transaction((c) =>
          commercialAction(
            c,
            a,
            `convert:estimate:${id}`,
            { id, ...dates },
            async () => {
              const row = await ownedDocument(c, a, kind, id, true);
              if (row.converted_to_invoice_id) {
                await ownedDocument(
                  c,
                  a,
                  "invoice",
                  row.converted_to_invoice_id,
                );
                return { documentId: row.converted_to_invoice_id };
              }
              requireValue(
                row.status === "accepted",
                "Record customer acceptance before conversion.",
                409,
              );
              const lines = await c.query(
                "SELECT description,quantity,unit_price FROM estimate_items WHERE estimate_id=$1 ORDER BY position NULLS LAST,id",
                [id],
              );
              const p = documentPayload(
                {
                  projectId: row.project_id,
                  clientId: row.client_id,
                  currency: row.currency,
                  issueDate: dates.invoiceDate,
                  dueDate: dates.dueDate,
                  taxRate: row.tax_rate,
                  notes: row.notes,
                  clientNotes: row.client_notes,
                  items: lines.rows,
                },
                "invoice",
              );
              const saved = await saveDocument(c, a, "invoice", p);
              await c.query(
                "UPDATE estimates SET status='converted',converted_to_invoice_id=$1,updated_at=NOW() WHERE id=$2 AND company_id=$3",
                [saved.documentId, id, a.company_id],
              );
              return saved;
            },
          ),
        );
        const invoice = await ownedDocument(
          pool,
          a,
          "invoice",
          result.documentId,
        );
        res.json({ success: true, invoice, replayed: !!result.replayed });
      }),
    );
  } else {
    router.post(
      "/:id/payments",
      route(async (req: any, res: any) => {
        const a = actor(res),
          id = documentId(req.params.id),
          amount = decimal(req.body?.amount, 99999999.99, true),
          date = documentDate(req.body?.paymentDate),
          reference = note(req.body?.reference, 255),
          method = note(req.body?.method, 50),
          notes = note(req.body?.notes);
        requireValue(
          req.body?.confirmed === true && reference.length >= 4,
          "Confirm a completed external payment with a valid past/current date and unique receipt reference.",
        );
        const payload = { id, amount, date, reference, method, notes };
        const result = await transaction((c) =>
          commercialAction(
            c,
            a,
            receiptKey(id, reference),
            payload,
            async () => {
              const row = await ownedDocument(c, a, kind, id, true);
              requireValue(
                ["sent", "viewed", "partial", "overdue"].includes(row.status),
                "Only issued, unpaid invoices accept payment records.",
                409,
              );
              requireValue(
                ["CAD", "USD"].includes(row.currency),
                "Reconcile the legacy invoice currency first.",
                409,
              );
              const calendar = await c.query(
                "SELECT (CURRENT_TIMESTAMP AT TIME ZONE COALESCE(NULLIF(to_jsonb(c)->>'timezone',''),'UTC'))::date::text today FROM companies c WHERE id=$1",
                [a.company_id],
              );
              requireValue(
                date <= calendar.rows[0].today,
                "Payment date cannot be in the future in the company timezone.",
              );
              const sum = await c.query(
                "SELECT COALESCE(SUM(amount),0)::text amount FROM payments WHERE invoice_id=$1",
                [id],
              );
              const paid = new Big(sum.rows[0].amount);
              requireValue(
                paid.eq(row.paid_amount || 0),
                "Reconcile the existing invoice payment ledger before adding a record.",
                409,
              );
              const next = paid.plus(amount);
              requireValue(
                next.lte(row.total),
                "Payment exceeds the remaining invoice balance.",
                409,
              );
              await c.query(
                "INSERT INTO payments(invoice_id,amount,payment_date,method,reference,notes) VALUES($1,$2,$3,$4,$5,$6)",
                [id, amount, date, method, reference, notes],
              );
              await c.query(
                "UPDATE invoices SET paid_amount=$1,status=$2::varchar,paid_at=CASE WHEN $2::varchar='paid' THEN NOW() ELSE paid_at END,updated_at=NOW() WHERE id=$3 AND company_id=$4",
                [
                  next.toFixed(2),
                  next.eq(row.total) ? "paid" : "partial",
                  id,
                  a.company_id,
                ],
              );
              return {
                documentId: id,
                moneyMovement: false,
                bankSettlementVerified: false,
              };
            },
          ),
        );
        res.json({
          ...(await detail(a, id)),
          ...result,
          moneyMovement: false,
          bankSettlementVerified: false,
        });
      }),
    );
  }
  router.use((e: any, _req: any, res: any, _next: any) =>
    res.status(e.status || 503).json({
      success: false,
      message: e.status
        ? e.message
        : "Commercial documents are unavailable. Try again or contact support.",
    }),
  );
  return router;
}
