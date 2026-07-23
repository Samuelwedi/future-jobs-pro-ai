import { pool } from '../config/database';
import { generatePayStubPDFBuffer } from './pdfService';
import { sendPayStubEmail } from './emailService';
import fs from 'fs';
import path from 'path';

const PDF_DIR = path.join(__dirname, '../../pdfs');
if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}

interface PayStubData {
  employeeName: string;
  employeeEmail: string;
  periodStart: string;
  periodEnd: string;
  hours: number;
  rate: number;
  pay: number;
  adjustments: number;
  finalPay: number;
  companyName: string;
  companyAddress?: string;
}

interface GenerateOptions {
  payrollId: string;
  sendEmail?: boolean;
}

export async function generatePayStubs(payrollId: string, sendEmail: boolean = true) {
  // Fetch payroll details
  const payrollRes = await pool.query(
    `SELECT p.*, c.name as company_name, c.address as company_address
     FROM payrolls p
     JOIN companies c ON p.company_id = c.id
     WHERE p.id = $1`,
    [payrollId]
  );
  if (payrollRes.rows.length === 0) {
    throw new Error('Payroll not found');
  }
  const payroll = payrollRes.rows[0];

  // Fetch payroll items with employee details
  const items = await pool.query(
    `SELECT pi.*, u.first_name, u.last_name, u.email
     FROM payroll_items pi
     JOIN users u ON pi.employee_id = u.id
     WHERE pi.payroll_id = $1`,
    [payrollId]
  );

  if (items.rows.length === 0) {
    console.log('No employees in this payroll.');
    return [];
  }

  const payStubs = [];
  for (const item of items.rows) {
    const data: PayStubData = {
      employeeName: `${item.first_name} ${item.last_name}`,
      employeeEmail: item.email || 'no-email@example.com',
      periodStart: payroll.period_start,
      periodEnd: payroll.period_end,
      hours: Number(item.hours) || 0,
      rate: Number(item.hourly_rate) || 0,
      pay: Number(item.pay) || 0,
      adjustments: Number(item.adjustments) || 0,
      finalPay: Number(item.final_pay) || 0,
      companyName: payroll.company_name || 'Future Jobs Pro AI',
      companyAddress: payroll.company_address || '',
    };

    // Generate PDF as buffer
    const pdfBuffer = await generatePayStubPDFBuffer(data);

    // Save to filesystem
    const filename = `paystub_${Date.now()}_${item.employee_id}.pdf`;
    const filepath = path.join(PDF_DIR, filename);
    fs.writeFileSync(filepath, pdfBuffer);
    const pdfUrl = `/pdfs/${filename}`;

    // Save to database
    const result = await pool.query(
      `INSERT INTO pay_stubs (payroll_id, employee_id, pdf_url)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [payrollId, item.employee_id, pdfUrl]
    );
    const stubId = result.rows[0].id;

    // Send email if requested
    if (sendEmail && data.employeeEmail && data.employeeEmail !== 'no-email@example.com') {
      try {
        await sendPayStubEmail(
          data.employeeEmail,
          data.employeeName,
          `${payroll.period_start} – ${payroll.period_end}`,
          pdfBuffer,
          `paystub_${stubId}.pdf`
        );
        // Update sent_at
        await pool.query('UPDATE pay_stubs SET sent_at = NOW() WHERE id = $1', [stubId]);
        console.log(`📧 Pay stub email sent to ${data.employeeEmail}`);
      } catch (emailErr) {
        console.error(`Failed to send email to ${data.employeeEmail}:`, emailErr);
      }
    }

    payStubs.push({
      id: stubId,
      employeeId: item.employee_id,
      employeeName: data.employeeName,
      pdfUrl,
      sent: sendEmail,
    });
  }
  return payStubs;
}

export async function getPayStubsByEmployee(employeeId: string) {
  const result = await pool.query(
    `SELECT ps.*, p.period_start, p.period_end
     FROM pay_stubs ps
     JOIN payrolls p ON ps.payroll_id = p.id
     WHERE ps.employee_id = $1
     ORDER BY ps.generated_at DESC`,
    [employeeId]
  );
  return result.rows;
}