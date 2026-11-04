import { pool } from '../config/database';
import { sendEmail } from './emailService';

export class EstimateDeliveryError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const amount = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new EstimateDeliveryError(409, 'Estimate contains an invalid amount');
  return n.toFixed(2);
};

export async function deliverEstimate(id: string, companyId: string) {
  const db = await pool.connect();
  let accepted = false;
  try {
    await db.query('BEGIN');
    // Lock the estimate so concurrent send requests cannot deliver it twice.
    const result = await db.query(`SELECT i.*, u.email AS recipient_email,
      c.name AS company_name FROM estimates i
      JOIN companies c ON c.id=i.company_id
      LEFT JOIN users u ON u.id=i.client_id AND u.company_id=i.company_id
      WHERE i.id=$1 AND i.company_id=$2 FOR UPDATE OF i`, [id, companyId]);
    const estimate = result.rows[0];
    if (!estimate) throw new EstimateDeliveryError(404, 'Estimate not found');
    if (estimate.status !== 'draft') {
      throw new EstimateDeliveryError(409, 'Only draft estimates can be sent');
    }
    const recipient = String(estimate.recipient_email || '').trim();
    if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(recipient)) {
      throw new EstimateDeliveryError(409, 'The estimate needs a client with a valid email address in your company');
    }
    const items = await db.query('SELECT description, quantity, unit_price FROM estimate_items WHERE estimate_id=$1 ORDER BY id', [id]);
    if (!items.rows.length) throw new EstimateDeliveryError(409, 'The estimate needs at least one line item');
    const rows = items.rows.map(item => `<tr><td>${escapeHtml(item.description)}</td><td>${amount(item.quantity)}</td><td>${amount(item.unit_price)}</td></tr>`).join('');
    const due = estimate.expiry_date instanceof Date ? estimate.expiry_date.toISOString().slice(0,10) : String(estimate.expiry_date || '').slice(0,10);
    const reference = String(estimate.estimate_number || estimate.id).replace(/[\r\n]/g, '');
    await sendEmail(recipient, `Estimate ${reference}`, `<h2>${escapeHtml(estimate.company_name)}</h2>
      <p>Estimate ${escapeHtml(reference)}</p><p>Valid until: ${escapeHtml(due)}</p>
      <table><thead><tr><th>Description</th><th>Quantity</th><th>Unit price</th></tr></thead><tbody>${rows}</tbody></table>
      <p>Total: ${amount(estimate.total)}</p><p>${escapeHtml(estimate.client_notes)}</p>
      <p>Please contact the issuing company to discuss or accept this estimate.</p>`);
    accepted = true;
    const updated = await db.query(`UPDATE estimates SET status='sent',sent_at=NOW()
      WHERE id=$1 AND company_id=$2 RETURNING *`, [id, companyId]);
    await db.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    if (error instanceof EstimateDeliveryError) throw error;
    throw new EstimateDeliveryError(503, accepted
      ? 'The provider accepted the email, but saving its status failed. Check delivery before retrying.'
      : 'Email delivery could not be confirmed. The estimate remains a draft. Check SMTP and delivery before retrying.');
  } finally { db.release(); }
}
