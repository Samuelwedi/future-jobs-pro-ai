import { pool } from '../config/database';
import { sendEmail } from './emailService';

export class InvoiceDeliveryError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const amount = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new InvoiceDeliveryError(409, 'Invoice contains an invalid amount');
  return n.toFixed(2);
};

export async function deliverInvoice(id: string, companyId: string, resend = false) {
  const db = await pool.connect();
  let accepted = false;
  try {
    await db.query('BEGIN');
    // Lock the invoice so concurrent send requests cannot deliver it twice.
    const result = await db.query(`SELECT i.*, u.email AS recipient_email,
      c.name AS company_name FROM invoices i
      JOIN companies c ON c.id=i.company_id
      LEFT JOIN users u ON u.id=i.client_id AND u.company_id=i.company_id
      WHERE i.id=$1 AND i.company_id=$2 FOR UPDATE OF i`, [id, companyId]);
    const invoice = result.rows[0];
    if (!invoice) throw new InvoiceDeliveryError(404, 'Invoice not found');
    if ((!resend && invoice.status !== 'draft') || (resend && !['sent','viewed','overdue'].includes(invoice.status))) {
      throw new InvoiceDeliveryError(409, 'This invoice cannot be sent in its current state');
    }
    if (resend && invoice.sent_at && Date.now() - new Date(invoice.sent_at).getTime() < 60000) {
      throw new InvoiceDeliveryError(429, 'Please wait one minute before resending this invoice');
    }
    const recipient = String(invoice.recipient_email || '').trim();
    if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(recipient)) {
      throw new InvoiceDeliveryError(409, 'The invoice needs a client with a valid email address in your company');
    }
    const items = await db.query('SELECT description, quantity, unit_price FROM invoice_items WHERE invoice_id=$1 ORDER BY id', [id]);
    if (!items.rows.length) throw new InvoiceDeliveryError(409, 'The invoice needs at least one line item');
    const rows = items.rows.map(item => `<tr><td>${escapeHtml(item.description)}</td><td>${amount(item.quantity)}</td><td>${amount(item.unit_price)}</td></tr>`).join('');
    const due = invoice.due_date instanceof Date ? invoice.due_date.toISOString().slice(0,10) : String(invoice.due_date || '').slice(0,10);
    const reference = String(invoice.invoice_number || invoice.id).replace(/[\r\n]/g, '');
    await sendEmail(recipient, `Invoice ${reference}`, `<h2>${escapeHtml(invoice.company_name)}</h2>
      <p>Invoice ${escapeHtml(reference)}</p><p>Due: ${escapeHtml(due)}</p>
      <table><thead><tr><th>Description</th><th>Quantity</th><th>Unit price</th></tr></thead><tbody>${rows}</tbody></table>
      <p>Total: ${amount(invoice.total)}</p><p>${escapeHtml(invoice.client_notes)}</p>
      <p>Please contact the issuing company for payment arrangements.</p>`);
    accepted = true;
    // No fabricated checkout URL: this application has no public invoice-pay route.
    const updated = await db.query(`UPDATE invoices SET status=CASE WHEN status='draft' THEN 'sent' ELSE status END,sent_at=NOW(),payment_link=NULL
      WHERE id=$1 AND company_id=$2 RETURNING *`, [id, companyId]);
    await db.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    if (error instanceof InvoiceDeliveryError) throw error;
    throw new InvoiceDeliveryError(503, accepted
      ? 'The provider accepted the email, but saving its status failed. Check delivery before retrying.'
      : 'Email delivery could not be confirmed. The invoice remains a draft. Check SMTP and delivery before retrying.');
  } finally { db.release(); }
}
