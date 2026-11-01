import { commercialPdf } from '../services/commercialPdf';
import express from 'express';
import { createHash } from 'crypto';
import { pool } from '../config/database';
import { companyActor, manages } from '../middleware/companyActor';
import { validateInvoiceHeader, validateInvoiceLines } from '../services/invoiceValidation';
import { validDate } from '../services/payPeriodCalendar';
const router = express.Router();
router.use(companyActor, (_req, res, next) => { if (!manages(res.locals.actor))
    return res.status(403).json({ message: 'Manager access required' }); next(); });
const fail = (message: string, status = 400): never => { throw Object.assign(Error(message), { status }); };
const failure = (res: any, error: any) => res.status(error.status || 400).json({ success: false, message: error.message || 'Estimate action failed' });
async function tx(company: string, work: (c: any) => Promise<any>) { const c = await pool.connect(); try {
    await c.query('BEGIN');
    await c.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [company]);
    const result = await work(c);
    await c.query('COMMIT');
    return result;
}
catch (e) {
    await c.query('ROLLBACK');
    throw e;
}
finally {
    c.release();
} }
async function relations(c: any, company: string, project: any, customer: any) { if (project) {
    const r = await c.query('SELECT client_id FROM projects WHERE id=$1 AND company_id=$2', [project, company]);
    if (!r.rowCount)
        fail('Project not found', 404);
    customer ||= r.rows[0].client_id;
} if (customer && !(await c.query('SELECT id FROM users WHERE id=$1 AND company_id=$2', [customer, company])).rowCount)
    fail('Client not found', 404); return customer || null; }
function validate(b: any) { validateInvoiceHeader(b.issueDate, b.expiryDate || b.issueDate, b.taxRate); const v = validateInvoiceLines(b.items); if (v.ids.length)
    fail('Estimates cannot reserve worked time. Add approved labor on an invoice.'); if (v.subtotal * (1 + Number(b.taxRate || 0) / 100) > 99999999.99)
    fail('Estimate total exceeds the supported limit'); return v.subtotal; }
async function lines(c: any, id: string, items: any[]) { for (const i of items)
    await c.query('INSERT INTO estimate_items(estimate_id,description,quantity,unit_price) VALUES($1,$2,$3,$4)', [id, i.description, Number(i.quantity ?? 1), Number(i.unit_price)]); }
router.get('/', async (req, res) => { try {
    const p: any[] = [res.locals.actor.company_id];
    let q = `SELECT e.*,p.name project_name,concat_ws(' ',u.first_name,u.last_name) client_name FROM estimates e LEFT JOIN projects p ON p.id=e.project_id LEFT JOIN users u ON u.id=e.client_id WHERE e.company_id=$1`;
    for (const [k, col] of [['status', 'status'], ['clientId', 'client_id'], ['start', 'issue_date'], ['end', 'issue_date']])
        if (req.query[k]) {
            if (['start', 'end'].includes(k) && !validDate(String(req.query[k])))
                fail('Invalid filter date');
            p.push(String(req.query[k]));
            q += ` AND e.${col}${k === 'start' ? '>=' : k === 'end' ? '<=' : '='}$${p.length}`;
        }
    const limit = Number(req.query.limit ?? 50), offset = Number(req.query.offset ?? 0);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(offset) || offset < 0)
        fail('Invalid page');
    p.push(limit, offset);
    q += ` ORDER BY e.issue_date DESC,e.id LIMIT $${p.length - 1} OFFSET $${p.length}`;
    res.json({ success: true, estimates: (await pool.query(q, p)).rows });
}
catch (e) {
    failure(res, e);
} });
router.get('/:id', async (req, res) => { try {
    const r = await pool.query('SELECT * FROM estimates WHERE id=$1 AND company_id=$2', [req.params.id, res.locals.actor.company_id]);
    if (!r.rowCount)
        fail('Estimate not found', 404);
    res.json({ success: true, estimate: r.rows[0], items: (await pool.query('SELECT * FROM estimate_items WHERE estimate_id=$1 ORDER BY id', [req.params.id])).rows });
}
catch (e) {
    failure(res, e);
} });
router.post('/', async (req, res) => { try {
    const b = req.body, subtotal = validate(b), key = b.requestKey;
    if (key !== undefined && (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(key)))
        fail('Invalid request key');
    const hash = createHash('sha256').update(JSON.stringify({ projectId: b.projectId || null, clientId: b.clientId || null, issueDate: b.issueDate, expiryDate: b.expiryDate || null, taxRate: b.taxRate || 0, notes: b.notes || null, clientNotes: b.clientNotes || null, items: b.items })).digest('hex');
    const result = await tx(res.locals.actor.company_id, async (c) => { if (key) {
        const prior = await c.query('SELECT * FROM estimates WHERE company_id=$1 AND creation_request_key=$2', [res.locals.actor.company_id, key]);
        if (prior.rowCount) {
            if (prior.rows[0].creation_request_hash !== hash)
                fail('Request key already used with different values', 409);
            return { estimate: prior.rows[0], replayed: true };
        }
    } const customer = await relations(c, res.locals.actor.company_id, b.projectId, b.clientId); const r = await c.query('INSERT INTO estimates(company_id,project_id,client_id,issue_date,expiry_date,tax_rate,subtotal,notes,client_notes,created_by,creation_request_key,creation_request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *', [res.locals.actor.company_id, b.projectId || null, customer, b.issueDate, b.expiryDate || null, b.taxRate || 0, subtotal, b.notes || null, b.clientNotes || null, res.locals.actor.id, key || null, key ? hash : null]); await lines(c, r.rows[0].id, b.items); return { estimate: r.rows[0], replayed: false }; });
    res.status(result.replayed ? 200 : 201).json({ success: true, ...result });
}
catch (e) {
    failure(res, e);
} });
router.put('/:id', async (req, res) => { try {
    const b = req.body, subtotal = validate(b);
    const estimate = await tx(res.locals.actor.company_id, async (c) => { const r = await c.query('SELECT * FROM estimates WHERE id=$1 AND company_id=$2 FOR UPDATE', [req.params.id, res.locals.actor.company_id]); if (!r.rowCount)
        fail('Estimate not found', 404); if (r.rows[0].status !== 'draft')
        fail('Only draft estimates can be edited', 409); const customer = await relations(c, res.locals.actor.company_id, b.projectId, b.clientId); await c.query('DELETE FROM estimate_items WHERE estimate_id=$1', [req.params.id]); await lines(c, String(req.params.id), b.items); return (await c.query('UPDATE estimates SET project_id=$1,client_id=$2,issue_date=$3,expiry_date=$4,tax_rate=$5,subtotal=$6,notes=$7,client_notes=$8,updated_at=NOW() WHERE id=$9 AND company_id=$10 RETURNING *', [b.projectId || null, customer, b.issueDate, b.expiryDate || null, b.taxRate || 0, subtotal, b.notes || null, b.clientNotes || null, req.params.id, res.locals.actor.company_id])).rows[0]; });
    res.json({ success: true, estimate });
}
catch (e) {
    failure(res, e);
} });
// Record delivery and client decisions completed outside the app. These endpoints do not send email.
for (const step of ['send', 'accept', 'reject'])
    router.post(`/:id/${step}`, async (req, res) => { try {
        const status = step === 'send' ? 'sent' : step === 'accept' ? 'accepted' : 'rejected';
        const estimate = await tx(res.locals.actor.company_id, async (c) => { const r = await c.query('SELECT * FROM estimates WHERE id=$1 AND company_id=$2 FOR UPDATE', [req.params.id, res.locals.actor.company_id]); if (!r.rowCount)
            fail('Estimate not found', 404); const row = r.rows[0]; if (row.status === status)
            return row; if ((step === 'send' && row.status !== 'draft') || (step !== 'send' && row.status !== 'sent'))
            fail('Estimate status changed; refresh before continuing', 409); return (await c.query(`UPDATE estimates SET status=$1,${step === 'send' ? 'sent_at=NOW(),' : step === 'accept' ? 'accepted_at=NOW(),' : ''}updated_at=NOW() WHERE id=$2 RETURNING *`, [status, req.params.id])).rows[0]; });
        res.json({ success: true, estimate, message: 'External estimate action recorded. No email was sent.' });
    }
    catch (e) {
        failure(res, e);
    } });
router.post('/:id/convert', async (req, res) => { try {
    const result = await tx(res.locals.actor.company_id, async (c) => { const r = await c.query('SELECT * FROM estimates WHERE id=$1 AND company_id=$2 FOR UPDATE', [req.params.id, res.locals.actor.company_id]); if (!r.rowCount)
        fail('Estimate not found', 404); const e = r.rows[0]; if (e.converted_to_invoice_id) {
        const prior = await c.query('SELECT * FROM invoices WHERE id=$1 AND company_id=$2', [e.converted_to_invoice_id, res.locals.actor.company_id]);
        if (!prior.rowCount)
            fail('Converted invoice unavailable', 409);
        return { invoice: prior.rows[0], replayed: true };
    } if (e.status !== 'accepted')
        fail('Only an accepted estimate can become an invoice', 409); const issue = req.body.invoiceDate || new Date().toISOString().slice(0, 10); if (!validDate(issue))
        fail('Invalid invoice date'); const due = req.body.dueDate || new Date(Date.parse(issue + 'T12:00:00Z') + 30 * 86400000).toISOString().slice(0, 10); validateInvoiceHeader(issue, due, e.tax_rate); await relations(c, res.locals.actor.company_id, e.project_id, e.client_id); const items = (await c.query('SELECT * FROM estimate_items WHERE estimate_id=$1 ORDER BY id', [req.params.id])).rows; const { subtotal } = validateInvoiceLines(items); const invoice = (await c.query('INSERT INTO invoices(company_id,project_id,client_id,issue_date,due_date,tax_rate,subtotal,notes,client_notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *', [res.locals.actor.company_id, e.project_id, e.client_id, issue, due, e.tax_rate, subtotal, e.notes, e.client_notes, res.locals.actor.id])).rows[0]; for (const i of items)
        await c.query('INSERT INTO invoice_items(invoice_id,description,quantity,unit_price) VALUES($1,$2,$3,$4)', [invoice.id, i.description, i.quantity, i.unit_price]); await c.query("UPDATE estimates SET status='converted',converted_to_invoice_id=$1,updated_at=NOW() WHERE id=$2", [invoice.id, req.params.id]); return { invoice, replayed: false }; });
    res.json({ success: true, ...result });
}
catch (e) {
    failure(res, e);
} });
router.delete('/:id', async (req, res) => { try {
    const r = await pool.query("DELETE FROM estimates WHERE id=$1 AND company_id=$2 AND status='draft' RETURNING id", [req.params.id, res.locals.actor.company_id]);
    if (!r.rowCount)
        fail('Draft estimate not found', 404);
    res.json({ success: true });
}
catch (e) {
    failure(res, e);
} });
router.get('/:id/pdf', async (req, res) => { try {
    const bytes = await commercialPdf('estimate', String(req.params.id), res.locals.actor.company_id);
    res.type('application/pdf').set('Content-Disposition', 'attachment; filename="estimate.pdf"').send(bytes);
}
catch (error: any) {
    res.status(error.status || 400).json({ message: error.message });
} });
export default router;
