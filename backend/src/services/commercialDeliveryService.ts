import { loadSubscriptionActor, hasCompanyEntitlement } from '../middleware/trialMiddleware';
import { createHash, randomUUID } from 'crypto';
import { pool } from '../config/database';
import { commercialSnapshot, renderCommercialPdf, CommercialKind } from './commercialPdf';
import { commercialMailAvailable, sendCommercialDocumentEmail } from './emailService';
import { day, hasMilestones } from './invoicePlanService';
const table = (kind: CommercialKind) => kind === 'invoice' ? 'invoices' : 'estimates';
export function commercialFingerprint(kind: CommercialKind, record: any, items: any[]): string {
    return createHash('sha256').update(JSON.stringify({ kind, number: record.invoice_number || record.estimate_number, company: record.company_name, client: [record.first_name, record.last_name], recipient: record.recipient_email, issue: day(record.issue_date), due: day(kind === 'invoice' ? record.due_date : record.expiry_date), subtotal: String(record.subtotal), tax: String(record.tax_rate || 0), paid: String(record.paid_amount || 0), clientNotes: record.client_notes || null, items: items.map(item => [item.description, String(item.quantity), String(item.unit_price)]) })).digest('hex');
}
export async function assertNoCommercialDelivery(c: any, kind: CommercialKind, id: string): Promise<void> {
    if ((await c.query("SELECT id FROM commercial_delivery_jobs WHERE kind=$1 AND record_id=$2 AND status IN ('queued','sending','uncertain') LIMIT 1", [kind, id])).rowCount)
        throw Object.assign(Error('An email is queued, sending or awaiting verification. Cancel or resolve it before changing this record.'), { status: 409 });
}
const projection = 'id,status,recipient,created_at,started_at,completed_at,message_id';
export async function deliveryOptions(kind: CommercialKind, id: string, company: string) {
    const { record, items } = await commercialSnapshot(pool, kind, id, company);
    const jobs = await pool.query(`SELECT ${projection} FROM commercial_delivery_jobs WHERE kind=$1 AND record_id=$2 AND company_id=$3 ORDER BY created_at DESC,id DESC LIMIT 10`, [kind, id, company]);
    return { configured: commercialMailAvailable(), recipient: record.recipient_email || null, fingerprint: commercialFingerprint(kind, record, items), eligible: (kind === 'invoice' ? ['draft', 'sent', 'overdue'] : ['draft', 'sent']).includes(record.status) && !(kind === 'invoice' && await hasMilestones(pool, id)), jobs: jobs.rows };
}
export async function enqueueCommercialDelivery(kind: CommercialKind, id: string, actor: any, body: any) {
    if (body.confirmed !== true || typeof body.requestKey !== 'string' || !/^[-_a-zA-Z0-9]{8,100}$/.test(body.requestKey))
        throw Error('Confirm the recipient and provide an email request key.');
    const c = await pool.connect();
    try {
        await c.query('BEGIN');
        await c.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [actor.company_id]);
        const previous = await c.query(`SELECT ${projection},fingerprint FROM commercial_delivery_jobs WHERE kind=$1 AND record_id=$2 AND company_id=$3 AND request_key=$4`, [kind, id, actor.company_id, body.requestKey]);
        if (previous.rowCount) {
            if (previous.rows[0].fingerprint !== body.fingerprint || previous.rows[0].recipient !== body.recipient)
                throw Object.assign(Error('This email request key belongs to a different confirmed document or recipient.'), { status: 409 });
            await c.query('COMMIT');
            return { job: previous.rows[0], replayed: true };
        }
        if (!commercialMailAvailable())
            throw Object.assign(Error('Email delivery is unavailable because SMTP is not configured.'), { status: 503 });
        const { record, items } = await commercialSnapshot(c, kind, id, actor.company_id);
        if (!(kind === 'invoice' ? ['draft', 'sent', 'overdue'] : ['draft', 'sent']).includes(record.status))
            throw Error('Only a draft or issued unpaid record can be emailed.');
        if (kind === 'invoice' && await hasMilestones(c, id))
            throw Error('Email the milestone invoices, not the contract parent.');
        const recipient = String(record.recipient_email || '').trim();
        if (recipient.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
            throw Error('Set a valid email for the selected client before sending.');
        await assertNoCommercialDelivery(c, kind, id);
        const fingerprint = commercialFingerprint(kind, record, items);
        if (body.fingerprint !== fingerprint || body.recipient !== recipient)
            throw Object.assign(Error('Document or recipient changed. Refresh and confirm again.'), { status: 409 });
        const pdf = await renderCommercialPdf(kind, id, { ...record, status: 'sent' }, items);
        if (pdf.length > 5 * 1024 * 1024)
            throw Error('The PDF is too large for email delivery.');
        const jobId = randomUUID(), messageId = `<futurejobs-${jobId}@futurejobsproai.com>`;
        const inserted = await c.query(`INSERT INTO commercial_delivery_jobs(id,company_id,kind,record_id,requested_by,request_key,recipient,fingerprint,pdf,message_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${projection}`, [jobId, actor.company_id, kind, id, actor.id, body.requestKey, recipient, fingerprint, pdf, messageId]);
        await c.query('COMMIT');
        return { job: inserted.rows[0], replayed: false };
    }
    catch (error) {
        await c.query('ROLLBACK');
        throw error;
    }
    finally {
        c.release();
    }
}
export async function changeCommercialDelivery(kind: CommercialKind, id: string, actor: any, jobId: string, body: any) {
    const c = await pool.connect();
    try {
        if (body.confirmed !== true)
            throw Error('Confirm the delivery action.');
        await c.query('BEGIN');
        await c.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [actor.company_id]);
        const result = await c.query('SELECT * FROM commercial_delivery_jobs WHERE id=$1 AND company_id=$2 AND kind=$3 AND record_id=$4 FOR UPDATE', [jobId, actor.company_id, kind, id]);
        const job = result.rows[0];
        if (!job)
            throw Object.assign(Error('Email job not found'), { status: 404 });
        let status: string;
        if (body.action === 'cancel' && job.status === 'queued')
            status = 'cancelled';
        else if (body.action === 'resolve' && job.status === 'uncertain' && typeof body.delivered === 'boolean')
            status = body.delivered ? 'sent' : 'failed';
        else
            throw Object.assign(Error('Email state changed. Refresh before continuing.'), { status: 409 });
        if (status === 'sent')
            await c.query(`UPDATE ${table(kind)} SET status=CASE WHEN status='draft' THEN 'sent' ELSE status END,sent_at=COALESCE(sent_at,NOW()) WHERE id=$1 AND company_id=$2`, [id, actor.company_id]);
        await c.query('UPDATE commercial_delivery_jobs SET status=$1,pdf=NULL,completed_at=NOW() WHERE id=$2', [status, jobId]);
        await c.query('COMMIT');
        return { success: true };
    }
    catch (error) {
        await c.query('ROLLBACK');
        throw error;
    }
    finally {
        c.release();
    }
}
let running = false;
export async function runCommercialEmailTick(send = sendCommercialDocumentEmail): Promise<void> {
    if (running)
        return;
    running = true;
    let job: any, attempted = false;
    let c: any;
    try {
        c = await pool.connect();
        // A process may have stopped after SMTP accepted the mail. Never resend that work automatically.
        await c.query("UPDATE commercial_delivery_jobs SET status='uncertain' WHERE status='sending' AND started_at<NOW()-interval '10 minutes'");
        await c.query('BEGIN');
        const selected = await c.query("SELECT * FROM commercial_delivery_jobs WHERE status='queued' ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED");
        job = selected.rows[0];
        if (!job) {
            await c.query('COMMIT');
            return;
        }
        await c.query("UPDATE commercial_delivery_jobs SET status='sending',started_at=NOW() WHERE id=$1", [job.id]);
        await c.query('COMMIT');
        const actor = await c.query("SELECT id FROM users WHERE id=$1 AND company_id=$2 AND COALESCE(is_active,true) AND LOWER(role) IN ('boss','owner','admin','manager')", [job.requested_by, job.company_id]);
        const snapshot = await commercialSnapshot(c, job.kind, job.record_id, job.company_id);
        if (!actor.rowCount || !hasCompanyEntitlement(await loadSubscriptionActor(job.requested_by)) || !(job.kind === 'invoice' ? ['draft', 'sent', 'overdue'] : ['draft', 'sent']).includes(snapshot.record.status) || commercialFingerprint(job.kind, snapshot.record, snapshot.items) !== job.fingerprint) {
            await c.query("UPDATE commercial_delivery_jobs SET status='cancelled',pdf=NULL,completed_at=NOW() WHERE id=$1", [job.id]);
            return;
        }
        if (!commercialMailAvailable()) {
            await c.query("UPDATE commercial_delivery_jobs SET status='failed',pdf=NULL,completed_at=NOW() WHERE id=$1", [job.id]);
            return;
        }
        attempted = true;
        await send(job.recipient, `${job.kind === 'invoice' ? 'Invoice' : 'Estimate'} ${snapshot.record.invoice_number || snapshot.record.estimate_number || ''}`, `Attached is your ${job.kind} from ${snapshot.record.company_name || 'your service provider'}. Please review the attached document and contact the sender with questions.`, Buffer.from(job.pdf), `${job.kind}.pdf`, job.message_id);
        await c.query('BEGIN');
        await c.query(`UPDATE ${table(job.kind)} SET status=CASE WHEN status='draft' THEN 'sent' ELSE status END,sent_at=COALESCE(sent_at,NOW()) WHERE id=$1 AND company_id=$2`, [job.record_id, job.company_id]);
        await c.query("UPDATE commercial_delivery_jobs SET status='sent',pdf=NULL,completed_at=NOW() WHERE id=$1", [job.id]);
        await c.query('COMMIT');
    }
    catch (error) {
        if (c)
            await c.query('ROLLBACK').catch(() => { });
        if (job && c)
            await c.query("UPDATE commercial_delivery_jobs SET status=$1,completed_at=NOW() WHERE id=$2", [attempted ? 'uncertain' : 'failed', job.id]).catch(() => { });
        throw error;
    }
    finally {
        if (c)
            c.release();
        running = false;
    }
}
export function startCommercialEmailWorker() { const tick = () => void runCommercialEmailTick().catch(() => console.error('Commercial email processing could not complete; inspect its job status.')); const timer = setInterval(tick, 15000); timer.unref(); tick(); return () => clearInterval(timer); }
