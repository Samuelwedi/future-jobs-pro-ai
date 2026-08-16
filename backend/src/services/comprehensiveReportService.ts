import PDFDocument from 'pdfkit';

export interface ProjectReportData {
  company: { name?: string; legal_name?: string; address?: string; city?: string; province?: string; postal_code?: string; phone?: string; email?: string };
  project: { id: string; name: string; address?: string; client_name?: string; status?: string };
  dateRange: { start: string; end: string };
  workforce: any[];
  media: any[];
  voiceNotes: any[];
  gpsPoints: any[];
  attachments: any[];
  generatedAt: string;
  summary?: any;
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

      const navy = '#071720';
      const cyan = '#00CDEA';
      const ink = '#17232D';
      const muted = '#687B88';
      const line = '#D8E2E7';
      const green = '#168A5B';
      const amber = '#B96D00';

      const section = (title: string, subtitle?: string) => {
        if (doc.y > 690) doc.addPage();
        doc.moveDown(1.1);
        doc.fillColor(cyan).font('Helvetica-Bold').fontSize(9).text(title.toUpperCase(), { characterSpacing: 1.2 });
        if (subtitle) doc.fillColor(muted).font('Helvetica').fontSize(8).text(subtitle);
        doc.moveDown(0.5);
      };

      const divider = () => {
        doc.moveDown(0.35);
        doc.moveTo(46, doc.y).lineTo(566, doc.y).strokeColor(line).lineWidth(0.6).stroke();
        doc.moveDown(0.55);
      };

      doc.rect(0, 0, 612, 160).fill(navy);
      doc.fillColor(cyan).font('Helvetica-Bold').fontSize(10).text('FUTURE JOBS PRO AI  /  OPERATIONS INTELLIGENCE', 46, 34, { characterSpacing: 1.1 });
      doc.fillColor('#FFFFFF').fontSize(27).text('Project Performance Report', 46, 61);
      doc.fillColor('#B8CAD4').font('Helvetica').fontSize(13).text(data.project.name, 46, 99);
      doc.fontSize(9).text(`${data.dateRange.start} through ${data.dateRange.end}  |  Generated ${dateTime(data.generatedAt)}`, 46, 126);

      doc.y = 188;
      doc.fillColor(ink).font('Helvetica-Bold').fontSize(16).text('Executive brief');
      doc.moveDown(0.4);
      const summary = data.summary || {};
      const readiness = Number(summary.readinessScore || 0);
      const narrative = data.workforce.length
        ? `${summary.employees || 0} team member(s) recorded ${number(summary.totalHours)} hours across ${summary.timeEntries || 0} time entries. ${summary.approvedEntries || 0} completed entries are approved for downstream payroll review.`
        : 'No workforce activity was recorded for this project during the selected reporting period.';
      doc.fillColor(muted).font('Helvetica').fontSize(10.5).text(narrative, { lineGap: 3 });
      doc.moveDown(1);

      const metrics = [
        ['REPORT READINESS', `${readiness}%`, readiness >= 80 ? green : amber],
        ['RECORDED HOURS', number(summary.totalHours), cyan],
        ['GROSS WAGES', money(summary.grossWages), ink],
        ['GPS OBSERVATIONS', String(summary.gpsPoints || 0), ink],
      ];
      const metricTop = doc.y;
      metrics.forEach((metric, index) => {
        const x = 46 + index * 132;
        doc.roundedRect(x, metricTop, 120, 65, 7).fillAndStroke('#F4F8FA', line);
        doc.fillColor(muted).font('Helvetica-Bold').fontSize(7).text(metric[0], x + 10, metricTop + 12, { width: 100 });
        doc.fillColor(metric[2]).fontSize(18).text(metric[1], x + 10, metricTop + 31, { width: 100 });
      });
      doc.y = metricTop + 76;

      section('Project and client context');
      const contextRows = [
        ['Company', data.company.legal_name || data.company.name || 'Not supplied'],
        ['Project', data.project.name],
        ['Client', data.project.client_name || 'Not supplied'],
        ['Job site', data.project.address || 'Not supplied'],
        ['Project status', data.project.status || 'Not supplied'],
        ['Reporting period', `${data.dateRange.start} to ${data.dateRange.end}`],
      ];
      contextRows.forEach(([label, value]) => {
        doc.fillColor(muted).font('Helvetica-Bold').fontSize(8).text(label.toUpperCase(), 46, doc.y, { width: 120 });
        doc.fillColor(ink).font('Helvetica').fontSize(10).text(String(value), 170, doc.y - 9, { width: 390 });
        divider();
      });

      section('Workforce performance', 'Recorded time and payroll-facing values for this project');
      if (!data.workforce.length) {
        doc.fillColor(muted).font('Helvetica').fontSize(10).text('No time entries in this period.');
      } else {
        const grouped = new Map<string, { entries: number; regular: number; overtime: number; wages: number; approved: number }>();
        data.workforce.forEach((entry) => {
          const name = entry.employee_name || 'Unknown employee';
          const current = grouped.get(name) || { entries: 0, regular: 0, overtime: 0, wages: 0, approved: 0 };
          current.entries += 1;
          current.regular += Number(entry.regular_hours || 0);
          current.overtime += Number(entry.overtime_hours || 0);
          current.wages += Number(entry.total_wage || 0);
          if (entry.approval_status === 'approved') current.approved += 1;
          grouped.set(name, current);
        });
        doc.fillColor(muted).font('Helvetica-Bold').fontSize(7.5);
        doc.text('EMPLOYEE', 46, doc.y, { width: 190 });
        doc.text('ENTRIES', 240, doc.y - 9, { width: 55, align: 'right' });
        doc.text('REGULAR', 304, doc.y - 9, { width: 60, align: 'right' });
        doc.text('OVERTIME', 376, doc.y - 9, { width: 60, align: 'right' });
        doc.text('GROSS', 452, doc.y - 9, { width: 108, align: 'right' });
        divider();
        grouped.forEach((value, name) => {
          if (doc.y > 700) doc.addPage();
          doc.fillColor(ink).font('Helvetica').fontSize(9.5).text(name, 46, doc.y, { width: 190 });
          doc.text(String(value.entries), 240, doc.y - 11, { width: 55, align: 'right' });
          doc.text(number(value.regular), 304, doc.y - 11, { width: 60, align: 'right' });
          doc.text(number(value.overtime), 376, doc.y - 11, { width: 60, align: 'right' });
          doc.font('Helvetica-Bold').text(money(value.wages), 452, doc.y - 11, { width: 108, align: 'right' });
          divider();
        });
      }

      section('Operational record inventory');
      const inventory = [
        ['Photo and video records', data.media.length, `${summary.verifiedMedia || 0} cryptographically marked`],
        ['Voice notes', data.voiceNotes.length, 'Field context and transcripts'],
        ['GPS observations', data.gpsPoints.length, 'Timestamped location records'],
        ['Supporting documents', data.attachments.length, 'Project-linked files'],
      ];
      inventory.forEach(([label, count, detail]) => {
        const top = doc.y;
        doc.roundedRect(46, top, 520, 42, 6).fillAndStroke('#F7FAFB', line);
        doc.fillColor(ink).font('Helvetica-Bold').fontSize(10).text(String(label), 58, top + 8, { width: 260 });
        doc.fillColor(muted).font('Helvetica').fontSize(8).text(String(detail), 58, top + 23, { width: 300 });
        doc.fillColor(cyan).font('Helvetica-Bold').fontSize(19).text(String(count), 490, top + 10, { width: 58, align: 'right' });
        doc.y = top + 50;
      });

      section('Management review');
      const reviewLines = [
        `Time-entry completion: ${summary.completionRate || 0}%`,
        `Completed-entry approval: ${summary.approvalRate || 0}%`,
        `Regular hours: ${number(summary.regularHours)}  |  Overtime hours: ${number(summary.overtimeHours)}`,
        `Gross recorded wages: ${money(summary.grossWages)}`,
      ];
      reviewLines.forEach((value) => doc.fillColor(ink).font('Helvetica').fontSize(10).text(`• ${value}`, { lineGap: 4 }));
      doc.moveDown(0.7);
      doc.fillColor(muted).fontSize(8.5).text('This operational report summarizes company records for management review. Evidence packages, signed media exports, GPS playback videos, and chain-of-custody artifacts remain available separately in Evidence Center.', { lineGap: 3 });

      const pageRange = doc.bufferedPageRange();
      for (let pageIndex = 0; pageIndex < pageRange.count; pageIndex += 1) {
        doc.switchToPage(pageIndex);
        doc.moveTo(46, 746).lineTo(566, 746).strokeColor(line).lineWidth(0.6).stroke();
        doc.fillColor(muted).font('Helvetica').fontSize(7.5).text(
          `${data.company.name || 'Future Jobs Pro AI'}  •  Confidential management report`,
          46,
          756,
          { width: 390 },
        );
        doc.text(`Page ${pageIndex + 1} of ${pageRange.count}`, 456, 756, { width: 110, align: 'right' });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
