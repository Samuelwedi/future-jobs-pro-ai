type Actor = { id: string; company_id: string };
type Database = {
  query: (sql: string, values: unknown[]) => Promise<{ rows: any[] }>;
};
export async function employeePayStatements(db: Database, actor: Actor) {
  return (
    await db.query(
      `SELECT pi.id,pi.employee_id,pi.payroll_id,p.period_start,p.period_end,p.status,
 pi.calculation_snapshot->>'gross' gross,pi.calculation_snapshot->>'net' net,
 pi.calculation_snapshot->>'currency' currency,pi.calculation_snapshot->>'payDate' pay_date,
 pi.calculation_snapshot->>'incomeTax' income_tax,
 EXISTS(SELECT 1 FROM manual_payroll_payments m WHERE m.payroll_item_id=pi.id AND m.company_id=p.company_id) payment_recorded
 FROM payroll_items pi JOIN payrolls p ON p.id=pi.payroll_id JOIN users u ON u.id=pi.employee_id
 WHERE pi.employee_id=$1 AND p.company_id=$2 AND u.company_id=$2
 AND p.status IN ('approved','paid') AND p.manual_review IS NOT NULL AND pi.calculation_snapshot IS NOT NULL
 ORDER BY p.period_start DESC,pi.id LIMIT 200`,
      [actor.id, actor.company_id],
    )
  ).rows;
}
export async function employeePayStatement(
  db: Database,
  actor: Actor,
  id: string,
) {
  return (
    (
      await db.query(
        `SELECT pi.*,p.period_start,p.period_end,u.first_name,u.last_name,u.email,c.name company_name
 FROM payroll_items pi JOIN payrolls p ON p.id=pi.payroll_id JOIN users u ON u.id=pi.employee_id JOIN companies c ON c.id=p.company_id
 WHERE pi.id=$1 AND pi.employee_id=$2 AND p.company_id=$3 AND u.company_id=$3
 AND p.status IN ('approved','paid') AND p.manual_review IS NOT NULL AND pi.calculation_snapshot IS NOT NULL`,
        [id, actor.id, actor.company_id],
      )
    ).rows[0] || null
  );
}
export function employeeStatementPdfData(item: any) {
  const snapshot = item.calculation_snapshot;
  return {
    employeeName: `${item.first_name} ${item.last_name}`,
    employeeEmail: item.email || "no-email@example.com",
    periodStart: item.period_start,
    periodEnd: item.period_end,
    hours: Number(item.hours) || 0,
    rate: Number(item.hourly_rate) || 0,
    pay: Number(snapshot.gross),
    adjustments: Number(snapshot.net) - Number(snapshot.gross),
    finalPay: Number(snapshot.net),
    calculation: snapshot,
    companyName: item.company_name,
  };
}
