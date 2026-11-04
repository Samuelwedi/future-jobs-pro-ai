import { pool } from '../config/database';

export class EstimateSaveError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const validDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export async function saveEstimate(companyId: string, actorId: string, input: any, id?: string) {
  const { projectId, clientId, issueDate, expiryDate, notes, clientNotes } = input;
  const taxRate = Number(input.taxRate ?? 0);
  if (!validDate(issueDate) || (expiryDate && (!validDate(expiryDate) || expiryDate < issueDate))) throw new EstimateSaveError(400, 'Provide valid issue and expiry dates');
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw new EstimateSaveError(400, 'Tax rate must be between 0 and 100');
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 500) throw new EstimateSaveError(400, 'Provide between 1 and 500 line items');
  const items = input.items.map((item: any) => {
    const quantity = Number(item?.quantity ?? 1), price = Number(item?.unit_price);
    if (typeof item?.description !== 'string' || !item.description.trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price < 0) throw new EstimateSaveError(400, 'Line items require a description, positive quantity and nonnegative price');
    return { description: item.description.trim(), quantity, price };
  });
  const subtotal = items.reduce((sum: number, item: any) => sum + item.quantity * item.price, 0);
  if (!Number.isFinite(subtotal)) throw new EstimateSaveError(400, 'Estimate total is invalid');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    if (id) {
      const existing = await db.query('SELECT status FROM estimates WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, companyId]);
      if (!existing.rows.length) throw new EstimateSaveError(404, 'Estimate not found');
      if (existing.rows[0].status !== 'draft') throw new EstimateSaveError(409, 'Only draft estimates can be edited');
    }
    if (projectId && !(await db.query('SELECT id FROM projects WHERE id=$1 AND company_id=$2', [projectId, companyId])).rows.length) throw new EstimateSaveError(400, 'Project must belong to your company');
    if (clientId && !(await db.query('SELECT id FROM users WHERE id=$1 AND company_id=$2', [clientId, companyId])).rows.length) throw new EstimateSaveError(400, 'Client must belong to your company');
    const values = [companyId, projectId || null, clientId || null, issueDate, expiryDate || null, taxRate, subtotal, notes || null, clientNotes || null];
    let estimateId = id;
    if (id) {
      await db.query(`UPDATE estimates SET project_id=$2,client_id=$3,issue_date=$4,expiry_date=$5,tax_rate=$6,subtotal=$7,notes=$8,client_notes=$9 WHERE company_id=$1 AND id=$10`, [...values, id]);
      await db.query('DELETE FROM estimate_items WHERE estimate_id=$1', [id]);
    } else {
      const result = await db.query(`INSERT INTO estimates (company_id,project_id,client_id,issue_date,expiry_date,tax_rate,subtotal,notes,client_notes,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [...values, actorId]);
      estimateId = result.rows[0].id;
    }
    for (const item of items) await db.query('INSERT INTO estimate_items (estimate_id,description,quantity,unit_price) VALUES ($1,$2,$3,$4)', [estimateId, item.description, item.quantity, item.price]);
    const result = await db.query('SELECT * FROM estimates WHERE id=$1 AND company_id=$2', [estimateId, companyId]);
    await db.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { db.release(); }
}
