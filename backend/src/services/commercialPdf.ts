import PDFDocument from 'pdfkit';
import Big from 'big.js';
import { pool } from '../config/database';
export async function commercialPdf(kind: 'invoice' | 'estimate', id: string, companyId: string): Promise<Buffer> {
    const table = kind === 'invoice' ? 'invoices' : 'estimates', itemTable = kind === 'invoice' ? 'invoice_items' : 'estimate_items', foreignKey = kind === 'invoice' ? 'invoice_id' : 'estimate_id';
    const client = await pool.connect();
    let record: any, items: any[];
    try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const result = await client.query(`SELECT d.*,c.name company_name,u.first_name,u.last_name FROM ${table} d JOIN companies c ON c.id=d.company_id LEFT JOIN users u ON u.id=d.client_id AND u.company_id=d.company_id WHERE d.id=$1 AND d.company_id=$2`, [id, companyId]);
        if (!result.rowCount)
            throw Object.assign(Error('Document not found'), { status: 404 });
        record = result.rows[0];
        items = (await client.query(`SELECT description,quantity,unit_price FROM ${itemTable} WHERE ${foreignKey}=$1 ORDER BY id`, [id])).rows;
        await client.query('COMMIT');
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
    const pdf = new PDFDocument({ size: 'A4', margin: 40 }), chunks: Buffer[] = [];
    const completed = new Promise<Buffer>((resolve, reject) => { pdf.on('data', chunk => chunks.push(chunk)); pdf.on('end', () => resolve(Buffer.concat(chunks))); pdf.on('error', reject); });
    pdf.fontSize(20).text(kind === 'invoice' ? 'Invoice' : 'Estimate');
    pdf.fontSize(11).text(record.company_name || 'Future Jobs Pro AI');
    pdf.text(record.invoice_number || record.estimate_number || id);
    pdf.text(`Status: ${record.status}`);
    pdf.text(`Client: ${[record.first_name, record.last_name].filter(Boolean).join(' ') || 'Not set'}`);
    const date = (value: any) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
    pdf.text(`Issued: ${date(record.issue_date)} | ${kind === 'invoice' ? 'Due' : 'Expires'}: ${date(kind === 'invoice' ? record.due_date : record.expiry_date)}`).moveDown();
    if (record.status === 'draft')
        pdf.text('DRAFT — review recipient, currency, tax and amounts before issuing.').moveDown();
    for (const item of items) {
        // PDFKit wraps long descriptions and adds pages; avoid truncating a fixed-height row.
        pdf.fontSize(11).text(item.description);
        pdf.fontSize(10).text(`${item.quantity} x ${item.unit_price} = ${new Big(item.quantity).times(item.unit_price).toFixed(2)}`).moveDown();
    }
    const subtotal = new Big(record.subtotal), tax = subtotal.times(record.tax_rate || 0).div(100).round(2);
    pdf.text(`Subtotal: ${subtotal.toFixed(2)}`).text(`Tax (${record.tax_rate || 0}%): ${tax.toFixed(2)}`).text(`Total: ${subtotal.plus(tax).toFixed(2)}`);
    if (kind === 'invoice')
        pdf.text(`Recorded payments: ${record.paid_amount || '0.00'}`).text(`Remaining: ${subtotal.plus(tax).minus(record.paid_amount || 0).toFixed(2)}`);
    if (record.client_notes)
        pdf.moveDown().text(String(record.client_notes));
    pdf.moveDown().fontSize(9).text('Amounts use the currency agreed with the customer. This record is not a payment confirmation.');
    pdf.end();
    return completed;
}
