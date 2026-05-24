// ============================================
// WATERMARK SERVICE (boxed, Timemark style)
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

export type WatermarkTemplate = 'standard' | 'minimal' | 'detailed' | 'map-style';

export interface WatermarkOptions {
  template?: WatermarkTemplate;
  showDate?: boolean;
  showTime?: boolean;
  showGPS?: boolean;
  showLogo?: boolean;
  showMap?: boolean;
  showWeather?: boolean;
  showAltitude?: boolean;
  showCompass?: boolean;
  logoPath?: string;
  customText?: string;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  opacity?: number;
  fontSize?: number;
}

export async function applyWatermark(
  inputPath: string,
  outputPath: string,
  metadata: {
    latitude?: number;
    longitude?: number;
    altitude?: number;
    direction?: number;
    weather?: string;
    address?: string;
    projectName?: string;
    clientName?: string;
  },
  options: WatermarkOptions = {}
): Promise<string> {

  console.log(`🖼️ [Samuel B.] Applying ${options.template || 'standard'} watermark...`);

  const opts: Required<WatermarkOptions> = {
    template: options.template || 'standard',
    showDate: options.showDate !== false,
    showTime: options.showTime !== false,
    showGPS: options.showGPS !== false,
    showLogo: options.showLogo !== false,
    showMap: options.showMap !== false,
    showWeather: options.showWeather !== false,
    showAltitude: options.showAltitude !== false,
    showCompass: options.showCompass !== false,
    logoPath: options.logoPath || '',
    customText: options.customText || 'Future Jobs Pro AI',
    position: options.position || 'bottom-left',
    opacity: options.opacity || 0.7,
    fontSize: options.fontSize || 0,
  };

  const image = sharp(inputPath);
  const imgMeta = await image.metadata();
  const width = imgMeta.width || 800;
  const height = imgMeta.height || 600;

  const baseFontSize = opts.fontSize || Math.round(width / 35);
  const lineFontSize = Math.round(baseFontSize * 0.72);

  const now = new Date();
  const lines: { text: string; fontSize: number; bold: boolean }[] = [];

  // Header line
  lines.push({ text: opts.customText, fontSize: baseFontSize, bold: true });

  // Date & Time
  if (opts.showDate || opts.showTime) {
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (opts.showDate && opts.showTime) {
      lines.push({ text: `${dateStr}  ${timeStr}`, fontSize: lineFontSize, bold: false });
    } else if (opts.showDate) {
      lines.push({ text: dateStr, fontSize: lineFontSize, bold: false });
    } else {
      lines.push({ text: timeStr, fontSize: lineFontSize, bold: false });
    }
  }

  // Address
  if (metadata.address) {
    lines.push({ text: metadata.address, fontSize: lineFontSize, bold: false });
  }

  // GPS Coordinates
  if (opts.showGPS && metadata.latitude && metadata.longitude) {
    const latDir = metadata.latitude >= 0 ? 'N' : 'S';
    const lngDir = metadata.longitude >= 0 ? 'E' : 'W';
    lines.push({
      text: `${Math.abs(metadata.latitude).toFixed(6)}°${latDir}  ${Math.abs(metadata.longitude).toFixed(6)}°${lngDir}`,
      fontSize: lineFontSize,
      bold: false,
    });
  }

  // Weather
  if (opts.showWeather && metadata.weather) {
    lines.push({ text: `Weather: ${metadata.weather}`, fontSize: lineFontSize, bold: false });
  }

  // Detailed template extras
  if (opts.template === 'detailed' || opts.template === 'map-style') {
    if (opts.showAltitude && metadata.altitude !== undefined) {
      lines.push({ text: `Altitude: ${Math.round(metadata.altitude)}m`, fontSize: lineFontSize, bold: false });
    }
    if (opts.showCompass && metadata.direction !== undefined) {
      const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const idx = Math.round(metadata.direction / 45) % 8;
      lines.push({ text: `Direction: ${metadata.direction}° ${dirs[idx]}`, fontSize: lineFontSize, bold: false });
    }
  }

  if (opts.template === 'map-style') {
    if (metadata.latitude && metadata.longitude) {
      lines.push({
        text: `maps.google.com/?q=${metadata.latitude},${metadata.longitude}`,
        fontSize: Math.round(lineFontSize * 0.85),
        bold: false,
      });
    }
  }

  // Calculate box dimensions
  const lineHeight = 1.5;
  const textPadding = 16;
  const boxPadding = 12;

  const maxLineChars = Math.max(...lines.map(l => l.text.length));
  const estimatedTextWidth = maxLineChars * (lineFontSize * 0.55);
  const boxWidth = estimatedTextWidth + boxPadding * 2;
  const totalTextHeight = lines.reduce((sum, l) => sum + l.fontSize * lineHeight, 0);
  const boxHeight = totalTextHeight + boxPadding * 2;

  // Box position
  let boxX = textPadding;
  let boxY = textPadding;
  if (opts.position === 'top-right') {
    boxX = width - boxWidth - textPadding;
  } else if (opts.position === 'bottom-left') {
    boxY = height - boxHeight - textPadding;
  } else if (opts.position === 'bottom-right') {
    boxX = width - boxWidth - textPadding;
    boxY = height - boxHeight - textPadding;
  } else if (opts.position === 'center') {
    boxX = Math.round((width - boxWidth) / 2);
    boxY = Math.round((height - boxHeight) / 2);
  }

  // Build SVG with background box
  const cornerRadius = 10;
  let svgContent = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" rx="${cornerRadius}" ry="${cornerRadius}"
          fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.3)" stroke-width="1" />`;

  let textY = boxY + boxPadding + lines[0].fontSize;
  for (const line of lines) {
    const fontWeight = line.bold ? 'bold' : 'normal';
    svgContent += `<text x="${boxX + boxPadding}" y="${textY}" font-size="${line.fontSize}" fill="white" opacity="0.95" font-family="Arial, sans-serif" font-weight="${fontWeight}">${escapeXml(line.text)}</text>`;
    textY += line.fontSize * lineHeight;
  }
  svgContent += '</svg>';

  const svgBuffer = Buffer.from(svgContent);

  // Composite layers
  const layers: sharp.OverlayOptions[] = [{ input: svgBuffer, top: 0, left: 0 }];

  // Logo overlay
  if (opts.logoPath && fs.existsSync(opts.logoPath)) {
    try {
      const logoMeta = await sharp(opts.logoPath).metadata();
      const logoW = Math.round(baseFontSize * 2);
      const logoH = Math.round((logoW / (logoMeta.width || 1)) * (logoMeta.height || 1));
      const logoBuf = await sharp(opts.logoPath).resize(logoW, logoH).toBuffer();
      layers.push({ input: logoBuf, top: textPadding, left: textPadding });
    } catch (e) { console.warn('Logo overlay error:', e); }
  }

  await sharp(inputPath).composite(layers).toFile(outputPath);
  console.log(`✅ Watermark applied: ${path.basename(outputPath)}`);
  return outputPath;
}

// ============================================
// PDF REPORT (unchanged)
// ============================================
export async function generateWatermarkedPDFReport(
  photos: Array<{
    photoPath: string;
    takenAt: Date;
    latitude?: number;
    longitude?: number;
    complianceScore?: number;
    notes?: string;
  }>,
  outputPath: string,
  reportTitle: string = 'Job Site Photo Report'
): Promise<string> {

  const PDFDocument = (await import('pdfkit')).default;
  const doc = new PDFDocument({ size: 'A4', margin: 30 });
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  doc.fontSize(20).font('Helvetica-Bold').text(reportTitle, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica').text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(8).font('Helvetica').fillColor('#888').text('Future Jobs Pro AI – Samuel B.', { align: 'center' });
  doc.fillColor('#000');
  doc.moveDown(1);

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    if (i > 0) doc.addPage();

    doc.fontSize(12).font('Helvetica-Bold').text(`Photo ${i + 1}`);
    doc.fontSize(9).font('Helvetica').text(`Taken: ${photo.takenAt.toLocaleString()}`);
    if (photo.latitude && photo.longitude) {
      doc.text(`GPS: ${photo.latitude.toFixed(6)}, ${photo.longitude.toFixed(6)}`);
    }
    if (photo.complianceScore) {
      doc.text(`Compliance Score: ${photo.complianceScore}/100`);
    }
    if (photo.notes) {
      doc.text(`Notes: ${photo.notes}`);
    }
    doc.moveDown(0.5);

    if (fs.existsSync(photo.photoPath)) {
      doc.image(photo.photoPath, { fit: [500, 350], align: 'center', valign: 'center' });
    }

    doc.moveDown(0.5);
    doc.fontSize(7).font('Helvetica').fillColor('#888')
      .text('Verified by Future Jobs Pro AI – Tamper‑Proof Evidence', { align: 'center' });
    doc.fillColor('#000');
  }

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

console.log('🖼️ Watermark Service loaded – Future Jobs Pro AI by Samuel B.');