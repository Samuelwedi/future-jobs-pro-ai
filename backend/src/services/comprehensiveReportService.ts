import PDFDocument from 'pdfkit';

interface ReportData {
  project: {
    id: string;
    name: string;
    address?: string;
    client_name?: string;
  };
  dateRange: { start: string; end: string };
  photos: any[];
  videos: any[];
  voiceNotes: any[];
  gpsTrails: any[];
  timesheet: any[];
  notes: any[];
  companyName: string;
}

export async function generateComprehensiveReport(data: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      // ─── Title ─────────────────────────────────────────────
      doc.fontSize(24).font('Helvetica-Bold').text('Project Report', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(16).font('Helvetica').text(`${data.project.name}`, { align: 'center' });
      doc.fontSize(12).text(`Client: ${data.project.client_name || 'N/A'}`, { align: 'center' });
      doc.text(`Period: ${data.dateRange.start} – ${data.dateRange.end}`, { align: 'center' });
      doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown(2);

      // ─── Photos ────────────────────────────────────────────
      if (data.photos.length) {
        doc.fontSize(14).font('Helvetica-Bold').text('📷 Photos');
        doc.moveDown(0.5);
        data.photos.forEach((p, i) => {
          doc.fontSize(10).font('Helvetica')
            .text(`${i+1}. ${p.taken_by_name || 'Unknown'} – ${new Date(p.taken_at).toLocaleString()}`, { continued: true })
            .text(` Score: ${p.compliance_score || 0}%`, { align: 'right' });
          if (p.verification_hash) doc.text(`   ✅ Verified: ${p.verification_hash.slice(0, 8)}`);
          doc.moveDown(0.3);
        });
        doc.moveDown(1);
      }

      // ─── Videos ────────────────────────────────────────────
      if (data.videos.length) {
        doc.fontSize(14).font('Helvetica-Bold').text('🎬 Videos');
        doc.moveDown(0.5);
        data.videos.forEach((v, i) => {
          doc.fontSize(10).font('Helvetica')
            .text(`${i+1}. ${v.taken_by_name || 'Unknown'} – ${new Date(v.taken_at).toLocaleString()}`);
          if (v.duration) doc.text(`   Duration: ${v.duration}s`);
          doc.moveDown(0.3);
        });
        doc.moveDown(1);
      }

      // ─── Voice Notes ───────────────────────────────────────
      if (data.voiceNotes.length) {
        doc.fontSize(14).font('Helvetica-Bold').text('🎙️ Voice Notes');
        doc.moveDown(0.5);
        data.voiceNotes.forEach((vn, i) => {
          doc.fontSize(10).font('Helvetica')
            .text(`${i+1}. ${vn.taken_by_name || 'Unknown'} – ${new Date(vn.taken_at).toLocaleString()}`);
          if (vn.transcript) doc.text(`   Transcript: ${vn.transcript.slice(0, 100)}${vn.transcript.length > 100 ? '...' : ''}`);
          if (vn.duration) doc.text(`   Duration: ${vn.duration}s`);
          doc.moveDown(0.3);
        });
        doc.moveDown(1);
      }

      // ─── GPS Trails ────────────────────────────────────────
      if (data.gpsTrails.length) {
        doc.fontSize(14).font('Helvetica-Bold').text('📍 GPS Trails');
        doc.moveDown(0.5);
        // Group by time entry
        const grouped = data.gpsTrails.reduce((acc, g) => {
          const key = g.time_entry_id;
          if (!acc[key]) acc[key] = { entries: [], user: g.user_name };
          acc[key].entries.push(g);
          return acc;
        }, {});
        for (const [key, group] of Object.entries(grouped)) {
          const g = group as { entries: any[]; user: string };
          doc.fontSize(10).font('Helvetica-Bold').text(`User: ${g.user}`);
          const sorted = g.entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          doc.font('Helvetica').text(`   Points: ${sorted.length}`);
          const start = new Date(sorted[0].timestamp);
          const end = new Date(sorted[sorted.length-1].timestamp);
          const duration = (end.getTime() - start.getTime()) / 60000; // minutes
          doc.text(`   Duration: ${Math.round(duration)} min`);
          doc.text(`   Distance: ~${(sorted.length * 0.01).toFixed(2)} km (approx)`);
          doc.moveDown(0.3);
        }
        doc.moveDown(1);
      }

      // ─── Timesheet ──────────────────────────────────────────
      if (data.timesheet.length) {
        doc.fontSize(14).font('Helvetica-Bold').text('⏱ Timesheet');
        doc.moveDown(0.5);
        const tableTop = doc.y;
        doc.font('Helvetica-Bold').fontSize(10)
          .text('Date', 50, tableTop, { width: 80 })
          .text('Employee', 130, tableTop, { width: 120 })
          .text('Clock In', 250, tableTop, { width: 80 })
          .text('Clock Out', 330, tableTop, { width: 80 })
          .text('Hours', 410, tableTop, { width: 50 });
        doc.moveDown();
        const lineY = doc.y;
        doc.moveTo(50, lineY).lineTo(500, lineY).stroke('#DDD');
        doc.moveDown(0.5);
        data.timesheet.forEach((t) => {
          const y = doc.y;
          const clockIn = new Date(t.clock_in).toLocaleTimeString();
          const clockOut = t.clock_out ? new Date(t.clock_out).toLocaleTimeString() : 'Active';
          const hours = t.clock_out ? ((new Date(t.clock_out).getTime() - new Date(t.clock_in).getTime()) / 3600000).toFixed(1) : '—';
          doc.font('Helvetica').fontSize(10)
            .text(new Date(t.clock_in).toLocaleDateString(), 50, y, { width: 80 })
            .text(t.employee_name || 'Unknown', 130, y, { width: 120 })
            .text(clockIn, 250, y, { width: 80 })
            .text(clockOut, 330, y, { width: 80 })
            .text(hours, 410, y, { width: 50 });
          doc.moveDown(0.3);
        });
        doc.moveDown(1);
      }

      // ─── Notes ──────────────────────────────────────────────
      if (data.notes.length) {
        doc.fontSize(14).font('Helvetica-Bold').text('📝 Notes');
        doc.moveDown(0.5);
        data.notes.forEach((n, i) => {
          doc.fontSize(10).font('Helvetica')
            .text(`${i+1}. ${n.created_by || 'Unknown'} – ${new Date(n.created_at).toLocaleString()}`);
          doc.text(`   ${n.content || n.note || n.text || ''}`);
          doc.moveDown(0.3);
        });
        doc.moveDown(1);
      }

      // ─── Footer ────────────────────────────────────────────
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.fontSize(10)
          .text(
            `Page ${i + 1} of ${pageCount} – ${new Date().toISOString().split('T')[0]}`,
            50,
            doc.page.height - 50,
            { align: 'center', width: 500 }
          );
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}