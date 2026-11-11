import PDFDocument from 'pdfkit';
import path from 'path';
import { companyDate } from './payPeriodCalendar';

export type TimesheetExportRow = { date: string; clockIn: string; clockOut: string; project: string; hours: string; regular: string; overtime: string; wage: string };
const fixed = (value: unknown): string => Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '0.00';
export function exportRows(rows: any[], computed: any): TimesheetExportRow[] {
  const timezone = computed.policy.timezone;
  const time = (value: unknown) => new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(String(value)));
  const rates = new Map(computed.rows.map((row: any) => [row.id, Number(row.overtime_hourly_rate)]));
  return rows.map(row => {
    const calculated = row.payroll_locked_at ? undefined : computed.hours.get(row.id);
    const rate = Number(rates.get(row.id));
    const hours = row.clock_out ? Math.max(0, (new Date(row.clock_out).getTime() - new Date(row.clock_in).getTime()) / 3600000 - Number(row.break_minutes ?? 0) / 60) : 0;
    return { date: companyDate(timezone, new Date(row.clock_in)), clockIn: time(row.clock_in),
      clockOut: row.clock_out ? `${companyDate(timezone, new Date(row.clock_out))} ${time(row.clock_out)}` : '',
      project: String(row.project_name || ''), hours: fixed(hours), regular: fixed(calculated?.regular ?? row.regular_hours),
      overtime: fixed(calculated?.overtime ?? row.overtime_hours),
      wage: row.payroll_locked_at ? fixed(row.total_wage) : (rate > 0 && calculated ? fixed((calculated.regular + calculated.overtime * computed.policy.overtime_multiplier) * rate) : '') };
  });
}
export function timesheetCsv(rows: TimesheetExportRow[]): string {
  const cell = (value: string) => '"' + value.replace(/^([\s\uFEFF]*[=+@-])/, "'$1").replace(/"/g, '""') + '"';
  // Numeric values are generated internally, not user text. Preserve their conventional CSV representation.
  return '\uFEFFDate,Clock In,Clock Out,Project,Hours,Regular,Overtime,Wage\r\n' + rows.map(row => [cell(row.date), cell(row.clockIn), cell(row.clockOut), cell(row.project), row.hours, row.regular, row.overtime, row.wage].join(',')).join('\r\n') + '\r\n';
}
export function timesheetPdf(rows: TimesheetExportRow[], scope: { userId: string; start: string; end: string; timezone: string }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true, info: {Title: 'Timesheet report'} });
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(Buffer.from(chunk)));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    try {
      doc.font(path.join(__dirname, '../../assets/fonts/DejaVuSans.ttf'));
      const heading = () => {
        doc.fillColor('#17232D').fontSize(19).text('Timesheet report');
        doc.fontSize(9).text(`${scope.start} through ${scope.end} | ${scope.timezone}`);
        doc.text(`Employee ID: ${scope.userId}`);
        doc.fillColor('#52616B').fontSize(8).text('Hours exclude unpaid breaks. Open shifts have no final hours. This is not a pay statement.');
        doc.moveDown();
      };
      heading();
      for (const row of rows) {
        const project = row.project || 'No project';
        doc.fontSize(10);
        const height = doc.heightOfString(project, {width: 510}) + 62;
        if (doc.y + height > 775) {doc.addPage(); heading();}
        doc.fillColor('#17232D').fontSize(10).text(project, {width:510});
        doc.fontSize(9).text(`${row.date} ${row.clockIn}  to  ${row.clockOut || 'In progress'}`);
        doc.text(`Hours: ${row.hours}   Regular: ${row.regular}   Overtime: ${row.overtime}`);
        doc.text(`Wage (record currency): ${row.wage || 'Unavailable'}`);
        doc.moveDown(0.65);
        doc.moveTo(42, doc.y).lineTo(553, doc.y).strokeColor('#D8E2E7').stroke();
        doc.moveDown(0.65);
      }
      const pages = doc.bufferedPageRange();
      for (let index = pages.start; index < pages.start + pages.count; index++) {
        doc.switchToPage(index);
        doc.fontSize(8).fillColor('#52616B').text(`Page ${index + 1} of ${pages.count}`, 42, 800, {lineBreak:false});
      }
      doc.end();
    } catch (error) {doc.destroy(); reject(error);}
  });
}
