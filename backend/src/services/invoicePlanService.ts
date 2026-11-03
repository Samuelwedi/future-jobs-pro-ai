import { loadSubscriptionActor, hasCompanyEntitlement } from '../middleware/trialMiddleware';
import Big from 'big.js';
import { randomUUID } from 'crypto';
import { pool } from '../config/database';
import { validDate } from './payPeriodCalendar';
export const day = (value: any): string => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const conflict = (message: string): never => { throw Object.assign(Error(message), { status: 409 }); };
export function recurringDate(anchor: string, frequency: string, index: number): string {
    if (!validDate(anchor) || !Number.isInteger(index) || index < 1 || index > 1200 || !['weekly', 'monthly', 'quarterly'].includes(frequency))
        throw Error('Invalid recurrence configuration.');
    const date = new Date(anchor + 'T12:00:00Z');
    if (frequency === 'weekly')
        date.setUTCDate(date.getUTCDate() + 7 * index);
    else {
        const originalDay = date.getUTCDate(), months = index * (frequency === 'quarterly' ? 3 : 1);
        date.setUTCDate(1);
        date.setUTCMonth(date.getUTCMonth() + months);
        const last = new Date(date);
        last.setUTCMonth(last.getUTCMonth() + 1);
        last.setUTCDate(0);
        date.setUTCDate(Math.min(originalDay, last.getUTCDate()));
    }
    const result = date.toISOString().slice(0, 10);
    if (!validDate(result))
        throw Error('Recurrence exceeds the supported calendar.');
    return result;
}
export function localBillingDay(timezone: string, now = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}
export async function hasMilestones(c: any, id: string): Promise<boolean> { return Boolean((await c.query("SELECT id FROM invoices WHERE parent_invoice_id=$1 AND status NOT IN ('cancelled','void') LIMIT 1", [id])).rowCount); }
// Call within the same company-locked transaction as the invoice write.
export async function saveInvoicePlan(c: any, company: string, id: string, body: any, actorId?: string): Promise<void> {
    const row = (await c.query('SELECT * FROM invoices WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, company])).rows[0];
    if (!row)
        throw Error('Invoice not found.');
    const recurring = body.isRecurring === undefined ? Boolean(row.is_recurring) : body.isRecurring;
    if (typeof recurring !== 'boolean')
        throw Error('Recurring must be true or false.');
    const frequency = body.recurringFrequency ?? row.recurring_frequency, end = body.recurringEndDate === undefined ? day(row.recurring_end_date) : body.recurringEndDate;
    const milestoneName = body.milestone_name === undefined ? row.milestone_name : body.milestone_name;
    const percentage = body.milestone_percentage === undefined ? row.milestone_percentage : body.milestone_percentage;
    const parentId = body.parent_invoice_id === undefined ? row.parent_invoice_id : body.parent_invoice_id;
    const linked = await c.query('SELECT id FROM invoice_items WHERE invoice_id=$1 AND cardinality(time_entry_ids)>0 LIMIT 1', [id]);
    if (recurring) {
        if (!['weekly', 'monthly', 'quarterly'].includes(frequency) || (end && (!validDate(end) || end < day(row.issue_date))))
            throw Error('Choose a valid recurring frequency and end date.');
        if (parentId || milestoneName || row.recurring_source_id || linked.rowCount || await hasMilestones(c, id))
            throw Error('A recurring template cannot contain worked-time links or milestone invoices.');
    }
    if (milestoneName || parentId || percentage) {
        if (recurring || typeof milestoneName !== 'string' || !milestoneName.trim() || milestoneName.length > 255 || !parentId || parentId === id || !/^\d+(\.\d{1,2})?$/.test(String(percentage)) || new Big(percentage).lte(0) || new Big(percentage).gt(100))
            throw Error('Provide a contract, milestone name and percentage between 0 and 100.');
        const parent = (await c.query('SELECT * FROM invoices WHERE id=$1 AND company_id=$2 FOR UPDATE', [parentId, company])).rows[0];
        if (!parent || parent.status !== 'draft' || parent.parent_invoice_id || parent.is_recurring || parent.recurring_source_id)
            throw Error('Use a draft contract invoice from this company as the milestone parent.');
        if ((await c.query("SELECT id FROM commercial_delivery_jobs WHERE kind='invoice' AND record_id=$1 AND status IN ('queued','sending','uncertain') LIMIT 1", [parentId])).rowCount)
            conflict('Resolve the contract parent email before creating milestones.');
        if ((await c.query('SELECT id FROM payments WHERE invoice_id=$1 LIMIT 1', [parentId])).rowCount)
            throw Error('A contract parent cannot have payment records.');
        if ((parent.project_id || null) !== (row.project_id || null) || (parent.client_id || null) !== (row.client_id || null))
            throw Error('Milestone and contract must use the same project and client.');
        if ((await c.query('SELECT id FROM invoice_items WHERE invoice_id=$1 AND cardinality(time_entry_ids)>0 LIMIT 1', [parentId])).rowCount)
            throw Error('A contract parent cannot reserve worked time.');
        const allocated = (await c.query("SELECT COALESCE(SUM(milestone_percentage),0) percentage FROM invoices WHERE parent_invoice_id=$1 AND id<>$2 AND status NOT IN ('cancelled','void')", [parentId, id])).rows[0];
        if (new Big(allocated.percentage).plus(percentage).gt(100))
            conflict('Milestone allocations exceed 100% of the contract.');
        const expected = new Big(parent.subtotal).times(percentage).div(100).round(2);
        if (!expected.eq(row.subtotal) || !new Big(parent.tax_rate || 0).eq(row.tax_rate || 0))
            throw Error(`Milestone subtotal must be ${expected.toFixed(2)} and use the contract tax rate.`);
    }
    const nextIndex = Number(row.recurring_next_index || 1), next = recurring ? recurringDate(day(row.issue_date), frequency, nextIndex) : null;
    await c.query('UPDATE invoices SET is_recurring=$1,recurring_enabled=$1,recurring_frequency=$2,recurring_end_date=$3,recurring_next_date=$4,milestone_name=$5,milestone_percentage=$6,parent_invoice_id=$7,recurring_owner_id=COALESCE($10,recurring_owner_id) WHERE id=$8 AND company_id=$9', [recurring, recurring ? frequency : null, recurring && end ? end : null, next, milestoneName || null, milestoneName ? percentage : null, milestoneName ? parentId : null, id, company, actorId || null]);
}
export async function recurrencePreview(c: any, company: string, id: string, now = new Date()): Promise<any> {
    const row = (await c.query('SELECT i.*,c.timezone FROM invoices i JOIN companies c ON c.id=i.company_id WHERE i.id=$1 AND i.company_id=$2', [id, company])).rows[0];
    if (!row)
        throw Object.assign(Error('Invoice not found'), { status: 404 });
    const index = Number(row.recurring_next_index || 1), next = row.is_recurring && index <= 1200 ? recurringDate(day(row.issue_date), row.recurring_frequency, index) : null;
    return { source: row, index, nextDate: next, today: localBillingDay(row.timezone || 'UTC', now), ended: Boolean(row.is_recurring && (!next || (row.recurring_end_date && next > day(row.recurring_end_date)))), enabled: Boolean(row.recurring_enabled) };
}
export async function generateRecurring(company: string, id: string, expectedIndex?: number, actorId?: string, now = new Date()): Promise<any> {
    const c = await pool.connect();
    try {
        await c.query('BEGIN');
        await c.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [company]);
        const plan = await recurrencePreview(c, company, id, now), root = plan.source;
        if (expectedIndex !== undefined && (!Number.isInteger(expectedIndex) || expectedIndex < 1))
            throw Error('Invalid occurrence.');
        if (expectedIndex !== undefined && expectedIndex < plan.index) {
            const prior = await c.query('SELECT * FROM invoices WHERE recurring_source_id=$1 AND recurring_occurrence=$2 AND company_id=$3', [id, expectedIndex, company]);
            if (prior.rowCount) {
                await c.query('COMMIT');
                return { invoice: prior.rows[0], replayed: true };
            }
        }
        if (!root.is_recurring || !plan.enabled || root.recurring_source_id || !['sent', 'overdue', 'paid'].includes(root.status))
            conflict('Issue an enabled recurring template first.');
        if (expectedIndex !== undefined && expectedIndex !== plan.index)
            conflict('Recurring schedule changed; refresh before continuing.');
        if (plan.ended) {
            await c.query('UPDATE invoices SET recurring_enabled=false WHERE id=$1', [id]);
            await c.query('COMMIT');
            return { ended: true };
        }
        if (plan.nextDate > plan.today) {
            await c.query('COMMIT');
            return { pending: true, nextDate: plan.nextDate };
        }
        const items = (await c.query('SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY id', [id])).rows;
        if (!items.length || items.some((item: any) => item.time_entry_ids?.length))
            throw Error('Recurring templates require lines without worked-time links.');
        const due = new Date(plan.nextDate + 'T12:00:00Z');
        due.setUTCDate(due.getUTCDate() + Math.round((Date.parse(day(root.due_date)) - Date.parse(day(root.issue_date))) / 86400000));
        const invoiceId = randomUUID();
        const invoice = (await c.query("INSERT INTO invoices(id,company_id,project_id,client_id,invoice_number,issue_date,due_date,subtotal,tax_rate,notes,client_notes,created_by,status,is_recurring,recurring_source_id,recurring_occurrence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft',false,$13,$14) RETURNING *", [invoiceId, company, root.project_id, root.client_id, 'FJ-' + invoiceId, plan.nextDate, day(due), root.subtotal, root.tax_rate, root.notes, root.client_notes, actorId || root.recurring_owner_id || root.created_by, id, plan.index])).rows[0];
        for (const item of items)
            await c.query('INSERT INTO invoice_items(invoice_id,description,quantity,unit_price,time_entry_ids) VALUES($1,$2,$3,$4,$5)', [invoiceId, item.description, item.quantity, item.unit_price, []]);
        const next = plan.index < 1200 ? recurringDate(day(root.issue_date), root.recurring_frequency, plan.index + 1) : null;
        await c.query('UPDATE invoices SET recurring_next_index=$1,recurring_next_date=$2,recurring_enabled=($2::date IS NOT NULL) WHERE id=$3', [plan.index + 1, next, id]);
        await c.query('COMMIT');
        return { invoice, replayed: false };
    }
    catch (error) {
        await c.query('ROLLBACK');
        throw error;
    }
    finally {
        c.release();
    }
}
let ticking = false;
export async function runRecurringInvoiceTick(now = new Date()): Promise<void> {
    if (ticking)
        return;
    ticking = true;
    try {
        const due = await pool.query("SELECT i.id,i.company_id,u.id owner_id FROM invoices i JOIN users u ON u.id=COALESCE(i.recurring_owner_id,i.created_by) AND u.company_id=i.company_id WHERE i.recurring_enabled AND i.is_recurring AND i.recurring_source_id IS NULL AND i.status IN ('sent','overdue','paid') AND i.recurring_next_date<=($1::timestamptz+interval '1 day')::date AND COALESCE(u.is_active,true) AND LOWER(u.role) IN ('boss','manager','owner','admin') ORDER BY i.recurring_next_date,i.id LIMIT 20", [now]);
        for (const row of due.rows)
            try {
                if (!hasCompanyEntitlement(await loadSubscriptionActor(row.owner_id)))
                    continue;
                await generateRecurring(row.company_id, row.id, undefined, undefined, now);
            }
            catch {
                console.error('Recurring draft generation failed for a configured schedule.');
            }
    }
    finally {
        ticking = false;
    }
}
export function startRecurringInvoiceWorker() { const tick = () => void runRecurringInvoiceTick().catch(() => console.error('Recurring invoice worker unavailable.')); const timer = setInterval(tick, 60000); timer.unref(); tick(); return () => clearInterval(timer); }
