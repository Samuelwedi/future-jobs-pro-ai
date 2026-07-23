import { pool } from '../config/database';
import { generatePayStubPDF } from './pdfService';

export async function generatePayStubs(payrollId: string) {
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
    const data = {
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

    const pdfUrl = await generatePayStubPDF(data);

    const result = await pool.query(
      `INSERT INTO pay_stubs (payroll_id, employee_id, pdf_url)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [payrollId, item.employee_id, pdfUrl]
    );
    payStubs.push({
      id: result.rows[0].id,
      employeeId: item.employee_id,
      employeeName: data.employeeName,
      pdfUrl,
    });
  }
  return payStubs;
}