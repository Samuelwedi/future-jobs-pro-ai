import cron from 'node-cron';
import { pool } from '../config/database';
import { generatePayroll } from './payrollGenerator';

// Run every day at 9:00 AM
cron.schedule('0 9 * * *', async () => {
  console.log('⏰ Checking payroll schedules...');
  try {
    const companies = await pool.query(
      `SELECT id, payroll_schedule, payroll_day, payroll_time
       FROM companies
       WHERE payroll_schedule IS NOT NULL`
    );

    const today = new Date();
    const dayOfWeek = today.getDay();
    const dayOfMonth = today.getDate();

    for (const company of companies.rows) {
      let shouldRun = false;
      if (company.payroll_schedule === 'weekly' && company.payroll_day === dayOfWeek) {
        shouldRun = true;
      } else if (company.payroll_schedule === 'biweekly') {
        const weekNumber = Math.ceil((today.getTime() - new Date(today.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
        if (weekNumber % 2 === 0 && company.payroll_day === dayOfWeek) {
          shouldRun = true;
        }
      } else if (company.payroll_schedule === 'monthly' && company.payroll_day === dayOfMonth) {
        shouldRun = true;
      }

      if (shouldRun) {
        console.log(`📅 Generating payroll for company ${company.id}`);
        const periodStart = new Date(today);
        periodStart.setDate(today.getDate() - 7);
        const periodEnd = new Date(today);
        periodEnd.setDate(today.getDate() - 1);

        try {
          const result = await generatePayroll(
            company.id,
            periodStart.toISOString().split('T')[0],
            periodEnd.toISOString().split('T')[0],
            null // system user
          );
          console.log(`✅ Payroll generated: ${result.employeeCount} employees, $${result.totalPay.toFixed(2)}`);
        } catch (err) {
          console.error(`❌ Failed to generate payroll for company ${company.id}:`, err);
        }
      }
    }
  } catch (error) {
    console.error('Error in payroll scheduler:', error);
  }
});

console.log('⏰ Payroll scheduler started – will run daily at 9:00 AM');