import express from 'express';
import Big from 'big.js';
import { pool } from '../config/database';
import { generateRecurring, recurrencePreview, saveInvoicePlan } from '../services/invoicePlanService';
const router = express.Router();
const fail = (res: any, error: any) => res.status(error.status || 400).json({ message: error.message || 'Billing plan action failed.' });
router.get('/:id/billing-plan', async (req, res) => {
    try {
        const result = await recurrencePreview(pool, res.locals.actor.company_id, String(req.params.id));
        const milestones = await pool.query('SELECT id,invoice_number,milestone_name,milestone_percentage,subtotal,status FROM invoices WHERE parent_invoice_id=$1 AND company_id=$2 ORDER BY issue_date,id', [req.params.id, res.locals.actor.company_id]);
        res.json({ ...result, source: undefined, isRecurring: result.source.is_recurring, frequency: result.source.recurring_frequency, endDate: result.source.recurring_end_date, status: result.source.status, generatedFromId: result.source.recurring_source_id, parentId: result.source.parent_invoice_id, milestones: milestones.rows });
    }
    catch (error) {
        fail(res, error);
    }
});
router.put('/:id/billing-plan', async (req, res) => {
    const c = await pool.connect();
    try {
        await c.query('BEGIN');
        await c.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [res.locals.actor.company_id]);
        // Issued template amounts are immutable; this endpoint can stop/resume its existing schedule.
        const found = await c.query('SELECT * FROM invoices WHERE id=$1 AND company_id=$2 FOR UPDATE', [req.params.id, res.locals.actor.company_id]);
        if (!found.rowCount)
            throw Object.assign(Error('Invoice not found'), { status: 404 });
        if (found.rows[0].status !== 'draft') {
            if (typeof req.body.enabled !== 'boolean' || !found.rows[0].is_recurring || found.rows[0].recurring_source_id)
                throw Error('Only an existing issued recurring schedule can be paused or resumed.');
            await c.query('UPDATE invoices SET recurring_enabled=$1,recurring_owner_id=$3 WHERE id=$2', [req.body.enabled, req.params.id, res.locals.actor.id]);
        }
        else
            await saveInvoicePlan(c, res.locals.actor.company_id, String(req.params.id), req.body, res.locals.actor.id);
        await c.query('COMMIT');
        res.json({ success: true });
    }
    catch (error) {
        await c.query('ROLLBACK');
        fail(res, error);
    }
    finally {
        c.release();
    }
});
router.post('/:id/recurring-next', async (req, res) => { try {
    if (req.body.confirmed !== true || !Number.isInteger(req.body.index))
        throw Error('Confirm the displayed occurrence.');
    res.json(await generateRecurring(res.locals.actor.company_id, String(req.params.id), req.body.index, res.locals.actor.id));
}
catch (error) {
    fail(res, error);
} });
router.get('/:id/milestone-preview', async (req, res) => {
    try {
        const percentage = String(req.query.percentage || '');
        if (!/^\d+(\.\d{1,2})?$/.test(percentage) || new Big(percentage).lte(0) || new Big(percentage).gt(100))
            throw Error('Use a percentage between 0 and 100.');
        const r = await pool.query("SELECT * FROM invoices WHERE id=$1 AND company_id=$2 AND status='draft' AND parent_invoice_id IS NULL AND NOT COALESCE(is_recurring,false)", [req.params.id, res.locals.actor.company_id]);
        if (!r.rowCount)
            throw Object.assign(Error('Draft contract not found'), { status: 404 });
        const row = r.rows[0];
        res.json({ subtotal: new Big(row.subtotal).times(percentage).div(100).round(2).toFixed(2), taxRate: row.tax_rate, projectId: row.project_id, clientId: row.client_id });
    }
    catch (error) {
        fail(res, error);
    }
});
export default router;
