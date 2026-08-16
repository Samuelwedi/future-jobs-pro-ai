import PDFDocument from 'pdfkit';

export interface ProjectReportData {
  company: { name?: string; legal_name?: string; address?: string; city?: string; province?: string; postal_code?: string; phone?: string; email?: string };
  project: { id: string; name: string; address?: string; client_name?: string; status?: string };
  dateRange: { start: string; end: string };
  workforce: any[]; media: any[]; voiceNotes: any[]; gpsPoints: any[]; attachments: any[];
  generatedAt: string; summary?: any;
}

const money = (value: unknown) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(Number(value || 0));
const number = (value: unknown, digits = 1) => Number(value || 0).toFixed(digits);
const dateTime = (value: unknown) => value ? new Date(String(value)).toLocaleString('en-CA') : 'In progress';

export async function generateComprehensiveReport(data: ProjectReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margin: 46, bufferPages: true, info: { Title: `${data.project.name} Operations Report`, Author: data.company.name || 'Future Jobs Pro AI' } });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      const navy = '#071720', cyan = '#00CDEA', ink = '#17232D', muted = '#687B88';
      const line = '#D8E2E7', green = '#168A5B', amber = '#B96D00', red = '#B42318';
      const bottom = 724;
      const summary = data.summary || {};
      const newPage = () => { doc.addPage(); doc.x = 46; doc.y = 52; };
      const ensure = (height: number) => { if (doc.y + height > bottom) newPage(); };
      const section = (title: string, subtitle?: string) => {
        ensure(subtitle ? 45 : 32); doc.x = 46; doc.moveDown(0.85);
        doc.fillColor(cyan).font('Helvetica-Bold').fontSize(9).text(title.toUpperCase(), 46, doc.y, { width: 520, characterSpacing: 1.2 });
        if (subtitle) doc.fillColor(muted).font('Helvetica').fontSize(8).text(subtitle, 46, doc.y, { width: 520 });
        doc.moveDown(0.45);
      };
      const divider = () => { doc.moveDown(0.3); doc.moveTo(46, doc.y).lineTo(566, doc.y).strokeColor(line).lineWidth(0.6).stroke(); doc.moveDown(0.48); };

      doc.rect(0, 0, 612, 160).fill(navy);
      doc.fillColor(cyan).font('Helvetica-Bold').fontSize(10).text('FUTURE JOBS PRO AI  /  OPERATIONS INTELLIGENCE', 46, 34, { characterSpacing: 1.1, lineBreak: false });
      doc.fillColor('#FFFFFF').fontSize(27).text('Project Performance Report', 46, 61, { lineBreak: false });
      doc.fillColor('#B8CAD4').font('Helvetica').fontSize(13).text(data.project.name, 46, 99, { width: 500, lineBreak: false });
      doc.fontSize(9).text(`${data.dateRange.start} through ${data.dateRange.end}  |  Generated ${dateTime(data.generatedAt)}`, 46, 126, { width: 520, lineBreak: false });
      doc.y = 188;
      doc.fillColor(ink).font('Helvetica-Bold').fontSize(16).text('Executive brief'); doc.moveDown(0.35);
      const narrative = data.workforce.length
        ? `${summary.employees || 0} team member(s) recorded ${number(summary.totalHours)} elapsed hours across ${summary.timeEntries || 0} time entries. ${summary.approvedEntries || 0} completed entries are approved for payroll review.`
        : 'No workforce activity was recorded for this project during the selected reporting period.';
      doc.fillColor(muted).font('Helvetica').fontSize(10.2).text(narrative, { lineGap: 2 }); doc.moveDown(0.75);
      const readiness = Number(summary.readinessScore || 0);
      const metrics = [
        ['REPORT READINESS', `${readiness}%`, readiness >= 80 ? green : amber], ['ELAPSED HOURS', number(summary.totalHours), cyan],
        ['GROSS WAGES', money(summary.grossWages), ink], ['GPS POINTS', String(summary.gpsPoints || 0), ink],
      ];
      const metricTop = doc.y;
      metrics.forEach((metric, index) => {
        const x = 46 + index * 132;
        doc.roundedRect(x, metricTop, 120, 62, 7).fillAndStroke('#F4F8FA', line);
        doc.fillColor(muted).font('Helvetica-Bold').fontSize(7).text(metric[0], x + 10, metricTop + 11, { width: 100, lineBreak: false });
        doc.fillColor(metric[2]).fontSize(17).text(metric[1], x + 10, metricTop + 30, { width: 100, lineBreak: false });
      });
      doc.y = metricTop + 70;
      if (Number(summary.anomalousEntries || 0) > 0) {
        const top = doc.y;
        doc.roundedRect(46, top, 520, 47, 6).fillAndStroke('#FFF4ED', '#F7B27A');
        doc.fillColor(red).font('Helvetica-Bold').fontSize(9).text('TIME-ENTRY REVIEW REQUIRED', 58, top + 9, { lineBreak: false });
        doc.fillColor('#7A271A').font('Helvetica').fontSize(8.2).text(`${summary.anomalousEntries} record(s) exceed 24 elapsed hours, contain negative time, or exceed 16 overtime hours. Correct before payroll or client use.`, 58, top + 24, { width: 490, lineBreak: false });
        doc.y = top + 52;
      }
      section('Project and client context');
      [
        ['Company', data.company.legal_name || data.company.name || 'Not supplied'], ['Project', data.project.name],
        ['Client', data.project.client_name || 'Not supplied'], ['Job site', data.project.address || 'Not supplied'],
        ['Project status', data.project.status || 'Not supplied'], ['Reporting period', `${data.dateRange.start} to ${data.dateRange.end}`],
      ].forEach(([label, value]) => {
        ensure(26); const rowY = doc.y;
        doc.fillColor(muted).font('Helvetica-Bold').fontSize(8).text(label.toUpperCase(), 46, rowY, { width: 120, lineBreak: false });
        doc.fillColor(ink).font('Helvetica').fontSize(9.5).text(String(value), 170, rowY, { width: 390, lineBreak: false });
        doc.y = rowY + 14; divider();
      });

      section('Workforce performance', 'Payroll-facing totals grouped by employee');
      const grouped = new Map<string, { entries: number; regular: number; overtime: number; wages: number }>();
      data.workforce.forEach((entry) => {
        const name = entry.employee_name || 'Unknown employee';
        const current = grouped.get(name) || { entries: 0, regular: 0, overtime: 0, wages: 0 };
        current.entries += 1; current.regular += Number(entry.regular_hours || 0); current.overtime += Number(entry.overtime_hours || 0); current.wages += Number(entry.total_wage || 0); grouped.set(name, current);
      });
      if (!grouped.size) doc.fillColor(muted).font('Helvetica').fontSize(10).text('No time entries in this period.');
      else {
        ensure(38); const headerY = doc.y; doc.fillColor(muted).font('Helvetica-Bold').fontSize(7.5);
        doc.text('EMPLOYEE', 46, headerY, { width: 190, lineBreak: false }); doc.text('ENTRIES', 240, headerY, { width: 55, align: 'right', lineBreak: false });
        doc.text('REGULAR', 304, headerY, { width: 60, align: 'right', lineBreak: false }); doc.text('OVERTIME', 376, headerY, { width: 60, align: 'right', lineBreak: false });
        doc.text('GROSS', 452, headerY, { width: 108, align: 'right', lineBreak: false }); doc.y = headerY + 13; divider();
        grouped.forEach((value, name) => {
          ensure(29); const rowY = doc.y;
          doc.fillColor(ink).font('Helvetica').fontSize(9.2).text(name, 46, rowY, { width: 190, lineBreak: false });
          doc.text(String(value.entries), 240, rowY, { width: 55, align: 'right', lineBreak: false }); doc.text(number(value.regular), 304, rowY, { width: 60, align: 'right', lineBreak: false });
          doc.text(number(value.overtime), 376, rowY, { width: 60, align: 'right', lineBreak: false }); doc.font('Helvetica-Bold').text(money(value.wages), 452, rowY, { width: 108, align: 'right', lineBreak: false });
          doc.y = rowY + 14; divider();
        });
      }

      section('Operational record inventory');
      const inventory = [
        ['Photo and video records', data.media.length, summary.analyzedPhotos ? `${summary.verifiedMedia || 0} marked | ${summary.analyzedPhotos} AI-scored | ${summary.averageComplianceScore}% average` : `${summary.verifiedMedia || 0} cryptographically marked | no AI scores yet`],
        ['Voice notes', data.voiceNotes.length, 'Field context and transcripts'], ['GPS observations', data.gpsPoints.length, 'Timestamped location records'], ['Supporting documents', data.attachments.length, 'Project-linked files'],
      ];
      inventory.forEach(([label, count, detail]) => {
        ensure(51); const top = doc.y; doc.roundedRect(46, top, 520, 42, 6).fillAndStroke('#F7FAFB', line);
        doc.fillColor(ink).font('Helvetica-Bold').fontSize(9.5).text(String(label), 58, top + 8, { width: 330, lineBreak: false });
        doc.fillColor(muted).font('Helvetica').fontSize(7.8).text(String(detail), 58, top + 23, { width: 390, lineBreak: false });
        doc.fillColor(cyan).font('Helvetica-Bold').fontSize(18).text(String(count), 490, top + 10, { width: 58, align: 'right', lineBreak: false }); doc.y = top + 49;
      });

      section('Management review');
      const variance = Math.abs(Number(summary.hoursVariance || 0));
      [
        `Time-entry completion: ${summary.completionRate || 0}%`, `Completed-entry approval: ${summary.approvalRate || 0}%`,
        `Payroll hours: ${number(summary.payrollHours)} (${number(summary.regularHours)} regular + ${number(summary.overtimeHours)} overtime)`,
        `Elapsed-versus-payroll hour variance: ${number(variance)} hours`, `Gross recorded wages: ${money(summary.grossWages)}`,
      ].forEach((value) => { ensure(18); doc.fillColor(ink).font('Helvetica').fontSize(9.5).text(`- ${value}`, 46, doc.y, { width: 520, lineGap: 2 }); });
      doc.moveDown(0.45); ensure(40);
      doc.fillColor(muted).fontSize(8.2).text('This management report summarizes operational records. Evidence packages, original media, GPS playback, and chain-of-custody exports remain separately controlled in Evidence Center.', 46, doc.y, { width: 520, lineGap: 2 });

      const pageRange = doc.bufferedPageRange();
      for (let pageIndex = 0; pageIndex < pageRange.count; pageIndex += 1) {
        doc.switchToPage(pageIndex); doc.page.margins.bottom = 0; doc.moveTo(46, 742).lineTo(566, 742).strokeColor(line).lineWidth(0.6).stroke();
        doc.fillColor(muted).font('Helvetica').fontSize(7.5).text(`${data.company.name || 'Future Jobs Pro AI'}  |  Confidential management report`, 46, 752, { width: 390, lineBreak: false });
        doc.text(`Page ${pageIndex + 1} of ${pageRange.count}`, 456, 752, { width: 110, align: 'right', lineBreak: false });
      }
      doc.end();
    } catch (error) { reject(error); }
  });
}
