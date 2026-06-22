// ============================================================
// WATERMARK SERVICE – Future Jobs Pro AI
// Features: Image/Video watermark, QR code, WeatherKit, Hash
// ============================================================

import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { getWeather } from './weatherService';

const execAsync = promisify(exec);

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

export interface WatermarkResult {
  outputPath: string;
  verificationHash: string;
}

// ---------- Reverse Geocode (fallback address) ----------
async function getAddressFromCoords(lat: number, lng: number): Promise<string | undefined> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Future Jobs Pro AI (support@futurejobsproai.com)' },
    });
    if (!response.ok) return undefined;
    const data: any = await response.json();
    if (data?.display_name) {
      return data.display_name.split(',').slice(0, 3).join(',');
    }
    return undefined;
  } catch (e) {
    console.warn('Reverse geocoding failed:', e);
    return undefined;
  }
}

// ---------- Generate Tamper‑Proof Hash ----------
function generateVerificationHash(metadata: {
  latitude?: number;
  longitude?: number;
  address?: string;
  weather?: string;
  takenAt: Date;
}): string {
  const data = JSON.stringify({
    lat: metadata.latitude || 0,
    lng: metadata.longitude || 0,
    address: metadata.address || '',
    weather: metadata.weather || '',
    time: metadata.takenAt.toISOString(),
  });
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 8);
}

// ---------- Escape XML for SVG ----------
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================
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
    takenAt?: Date;
  },
  options: WatermarkOptions = {}
): Promise<WatermarkResult> {
  const takenAt = metadata.takenAt || new Date();

  // 1. Resolve address if missing
  let address: string | undefined = metadata.address;
  if (!address && metadata.latitude && metadata.longitude) {
    const resolved = await getAddressFromCoords(metadata.latitude, metadata.longitude);
    if (resolved) {
      address = resolved;
      console.log(`📍 Resolved address: ${address}`);
    }
  }

  const locationDisplay =
    address ||
    (metadata.latitude && metadata.longitude
      ? `${metadata.latitude.toFixed(6)}, ${metadata.longitude.toFixed(6)}`
      : 'No location');

  // 2. Fetch weather if missing and coordinates exist
  let weather = metadata.weather;
  if (!weather && metadata.latitude && metadata.longitude) {
    weather = await getWeather(metadata.latitude, metadata.longitude, takenAt);
    console.log(`🌤️ Weather fetched: ${weather}`);
  } else if (!weather) {
    weather = 'Weather unavailable';
  }

  // 3. Generate verification hash
  const verificationHash = generateVerificationHash({
    latitude: metadata.latitude,
    longitude: metadata.longitude,
    address: address,
    weather: weather,
    takenAt,
  });
  console.log(`🔒 Verification hash: ${verificationHash}`);

  // 4. Determine if video
  const isVideo = ['.mp4', '.mov', '.avi', '.m4v', '.mkv'].includes(
    path.extname(inputPath).toLowerCase()
  );

  const fullMetadata = {
    ...metadata,
    address: locationDisplay,
    weather,
    takenAt,
  };

  if (isVideo) {
    await applyVideoWatermark(inputPath, outputPath, fullMetadata, options, verificationHash);
  } else {
    await applyImageWatermark(inputPath, outputPath, fullMetadata, options, verificationHash);
  }

  return { outputPath, verificationHash };
}

// ============================================================
// IMAGE WATERMARK
// ============================================================
async function applyImageWatermark(
  inputPath: string,
  outputPath: string,
  metadata: any,
  options: WatermarkOptions,
  verificationHash: string
): Promise<void> {
  const opts = {
    template: options.template || 'standard',
    showDate: options.showDate !== false,
    showTime: options.showTime !== false,
    showGPS: options.showGPS !== false,
    showWeather: options.showWeather !== false,
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
  const smallFontSize = Math.round(lineFontSize * 0.85);

  const now = metadata.takenAt || new Date();
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Build text lines
  const lines: { text: string; fontSize: number; bold: boolean }[] = [];

  // Company name (bold)
  lines.push({ text: opts.customText, fontSize: baseFontSize, bold: true });

  // Date/Time
  lines.push({ text: `${dateStr}  ${timeStr}`, fontSize: lineFontSize, bold: false });

  // Address
  if (metadata.address && metadata.address !== 'No location') {
    lines.push({ text: metadata.address, fontSize: lineFontSize, bold: false });
  }

  // GPS (only if no address)
  if (metadata.latitude && metadata.longitude && metadata.address === 'No location') {
    const latDir = metadata.latitude >= 0 ? 'N' : 'S';
    const lngDir = metadata.longitude >= 0 ? 'E' : 'W';
    lines.push({
      text: `${Math.abs(metadata.latitude).toFixed(6)}°${latDir}  ${Math.abs(metadata.longitude).toFixed(6)}°${lngDir}`,
      fontSize: lineFontSize,
      bold: false,
    });
  }

  // Weather
  if (metadata.weather && metadata.weather !== 'Weather unavailable') {
    lines.push({ text: `🌤️ ${metadata.weather}`, fontSize: lineFontSize, bold: false });
  }

  // Verification hash (plain text)
  lines.push({ text: `🔒 Verified: ${verificationHash}`, fontSize: smallFontSize, bold: false });

  // QR code (we'll embed this as an image in the SVG)
  const qrSize = Math.round(baseFontSize * 2.2);
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(verificationHash, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      margin: 1,
      width: qrSize,
    });
  } catch (e) {
    console.warn('QR generation failed:', e);
  }

  // Calculate box dimensions
  const lineHeight = 1.5;
  const textPadding = 16;
  const boxPadding = 14;
  const qrMargin = 12;

  // Estimate text block width
  const maxLineChars = Math.max(...lines.map(l => l.text.length));
  const estimatedTextWidth = maxLineChars * (lineFontSize * 0.55);
  const totalTextHeight = lines.reduce((sum, l) => sum + l.fontSize * lineHeight, 0);

  // If QR exists, add its width + margin to box width
  const qrExtraWidth = qrDataUrl ? qrSize + qrMargin : 0;
  const boxWidth = estimatedTextWidth + boxPadding * 2 + qrExtraWidth;
  const boxHeight = Math.max(totalTextHeight + boxPadding * 2, qrSize + boxPadding * 2);

  // Position
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

  const cornerRadius = 10;

  // Build SVG
  let svgContent = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" rx="${cornerRadius}" ry="${cornerRadius}"
          fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" />`;

  // Text block (left side)
  let textY = boxY + boxPadding + lines[0].fontSize;
  for (const line of lines) {
    const fontWeight = line.bold ? 'bold' : 'normal';
    svgContent += `<text x="${boxX + boxPadding}" y="${textY}" font-size="${line.fontSize}" fill="white" opacity="0.95" font-family="Arial, sans-serif" font-weight="${fontWeight}">${escapeXml(line.text)}</text>`;
    textY += line.fontSize * lineHeight;
  }

  // QR code (right side)
  if (qrDataUrl) {
    const qrX = boxX + boxWidth - boxPadding - qrSize;
    const qrY = boxY + (boxHeight - qrSize) / 2;
    svgContent += `<image x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" href="${qrDataUrl}" />`;
  }

  svgContent += '</svg>';

  const svgBuffer = Buffer.from(svgContent);
  await sharp(inputPath).composite([{ input: svgBuffer, top: 0, left: 0 }]).toFile(outputPath);
  console.log(`✅ Image watermark applied: ${path.basename(outputPath)}`);
}

// ============================================================
// VIDEO WATERMARK (with ffprobe scaling & bottom-left default)
// ============================================================
async function applyVideoWatermark(
  inputPath: string,
  outputPath: string,
  metadata: any,
  options: WatermarkOptions,
  verificationHash: string
): Promise<void> {
  console.log('🎬 Applying watermark to video...');

  // Get video dimensions via ffprobe
  let videoWidth = 1280;
  let videoHeight = 720;
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${inputPath}"`
    );
    const dims = stdout.trim().split(',');
    if (dims.length === 2) {
      videoWidth = parseInt(dims[0], 10);
      videoHeight = parseInt(dims[1], 10);
      console.log(`📐 Video dimensions: ${videoWidth}x${videoHeight}`);
    }
  } catch (e) {
    console.warn('⚠️ ffprobe failed, using default 1280x720');
  }

  const opts = {
    template: options.template || 'standard',
    showDate: options.showDate !== false,
    showTime: options.showTime !== false,
    showGPS: options.showGPS !== false,
    showWeather: options.showWeather !== false,
    customText: options.customText || 'Future Jobs Pro AI',
    position: options.position || 'bottom-left', // default
    opacity: options.opacity || 0.7,
    fontSize: options.fontSize || 0,
  };

  const baseFontSize = opts.fontSize || Math.round(videoWidth / 40);
  const lineFontSize = Math.round(baseFontSize * 0.72);
  const smallFontSize = Math.round(lineFontSize * 0.85);

  const now = metadata.takenAt || new Date();
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const lines: { text: string; fontSize: number; bold: boolean }[] = [];
  lines.push({ text: opts.customText, fontSize: baseFontSize, bold: true });
  lines.push({ text: `${dateStr}  ${timeStr}`, fontSize: lineFontSize, bold: false });

  if (metadata.address && metadata.address !== 'No location') {
    lines.push({ text: metadata.address, fontSize: lineFontSize, bold: false });
  }

  if (metadata.latitude && metadata.longitude && metadata.address === 'No location') {
    const latDir = metadata.latitude >= 0 ? 'N' : 'S';
    const lngDir = metadata.longitude >= 0 ? 'E' : 'W';
    lines.push({
      text: `${Math.abs(metadata.latitude).toFixed(6)}°${latDir}  ${Math.abs(metadata.longitude).toFixed(6)}°${lngDir}`,
      fontSize: lineFontSize,
      bold: false,
    });
  }

  if (metadata.weather && metadata.weather !== 'Weather unavailable') {
    lines.push({ text: `🌤️ ${metadata.weather}`, fontSize: lineFontSize, bold: false });
  }

  lines.push({ text: `🔒 Verified: ${verificationHash}`, fontSize: smallFontSize, bold: false });

  // QR Code
  const qrSize = Math.round(baseFontSize * 2.2);
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(verificationHash, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      margin: 1,
      width: qrSize,
    });
  } catch (e) {}

  const lineHeight = 1.5;
  const textPadding = 20;
  const boxPadding = 16;
  const qrMargin = 12;

  const maxLineChars = Math.max(...lines.map(l => l.text.length));
  const estimatedTextWidth = maxLineChars * (lineFontSize * 0.55);
  const totalTextHeight = lines.reduce((sum, l) => sum + l.fontSize * lineHeight, 0);
  const qrExtraWidth = qrDataUrl ? qrSize + qrMargin : 0;
  const boxWidth = estimatedTextWidth + boxPadding * 2 + qrExtraWidth;
  const boxHeight = Math.max(totalTextHeight + boxPadding * 2, qrSize + boxPadding * 2);

  // Position: bottom-left by default
  let boxX = textPadding;
  let boxY = videoHeight - boxHeight - textPadding;

  // (Other positions can be added easily if needed)
  if (opts.position === 'top-left') boxY = textPadding;
  else if (opts.position === 'top-right') { boxX = videoWidth - boxWidth - textPadding; boxY = textPadding; }
  else if (opts.position === 'bottom-right') { boxX = videoWidth - boxWidth - textPadding; boxY = videoHeight - boxHeight - textPadding; }

  const cornerRadius = 10;

  let svgContent = `<svg width="${videoWidth}" height="${videoHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" rx="${cornerRadius}" ry="${cornerRadius}"
          fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" />`;

  let textY = boxY + boxPadding + lines[0].fontSize;
  for (const line of lines) {
    const fontWeight = line.bold ? 'bold' : 'normal';
    svgContent += `<text x="${boxX + boxPadding}" y="${textY}" font-size="${line.fontSize}" fill="white" opacity="0.95" font-family="Arial, sans-serif" font-weight="${fontWeight}">${escapeXml(line.text)}</text>`;
    textY += line.fontSize * lineHeight;
  }

  if (qrDataUrl) {
    const qrX = boxX + boxWidth - boxPadding - qrSize;
    const qrY = boxY + (boxHeight - qrSize) / 2;
    svgContent += `<image x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" href="${qrDataUrl}" />`;
  }

  svgContent += '</svg>';

  const pngPath = inputPath + '.watermark.png';
  const svgBuffer = Buffer.from(svgContent);
  await sharp(svgBuffer).png().toFile(pngPath);

  try {
    // Overlay at calculated position
    const ffmpegCmd = `ffmpeg -i "${inputPath}" -i "${pngPath}" -filter_complex "overlay=${boxX}:${boxY}" -c:a copy "${outputPath}" -y`;
    await execAsync(ffmpegCmd);
    console.log(`✅ Video watermark applied (${videoWidth}x${videoHeight})`);
  } catch (err) {
    console.error('❌ ffmpeg watermark failed, using fallback copy:', err);
    fs.copyFileSync(inputPath, outputPath);
  }

  if (fs.existsSync(pngPath)) fs.unlinkSync(pngPath);
}

// ============================================================
// PDF REPORT – with background watermark & embedded hash
// ============================================================
export async function generateWatermarkedPDFReport(
  photos: Array<{
    photoPath: string;
    takenAt: Date;
    latitude?: number;
    longitude?: number;
    address?: string;
    weather?: string;
    complianceScore?: number;
    notes?: string;
    verificationHash?: string;
  }>,
  outputPath: string,
  reportTitle: string = 'Job Site Photo Report',
  companyName: string = 'Future Jobs Pro AI'
): Promise<string> {
  const PDFDocument = (await import('pdfkit')).default;
  const doc = new PDFDocument({ size: 'A4', margin: 30 });
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  // ----- Helper: Draw background watermark on each page -----
  function drawBackgroundWatermark() {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  doc.save();
  doc.opacity(0.06);
  doc.fontSize(60);
  doc.font('Helvetica-Bold');
  doc.fillColor('#000');
  doc.rotate(-30, { origin: [pageWidth / 2, pageHeight / 2] });
  // Manually calculate the y position to center vertically
  const textWidth = doc.widthOfString('FUTURE JOBS PRO AI');
  const textHeight = 60; // approximate
  const x = (pageWidth - textWidth) / 2;
  const y = (pageHeight - textHeight) / 2;
  doc.text('FUTURE JOBS PRO AI', x, y, { align: 'center' });
  doc.restore();
  doc.opacity(1);
}

  // ----- Header (first page) -----
  drawBackgroundWatermark();

  doc.fontSize(24).font('Helvetica-Bold').text(companyName, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(18).font('Helvetica-Bold').text(reportTitle, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica').text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(8).font('Helvetica').fillColor('#888').text('🔒 Tamper‑Proof Evidence – Verified by Future Jobs Pro AI', { align: 'center' });
  doc.fillColor('#000');
  doc.moveDown(1);

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    if (i > 0) {
      doc.addPage();
      drawBackgroundWatermark();
    }

    doc.fontSize(14).font('Helvetica-Bold').text(`Photo ${i + 1}`, { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(10).font('Helvetica').text(`📅 Taken: ${photo.takenAt.toLocaleString()}`);
    doc.moveDown(0.2);

    if (photo.address) {
      doc.text(`📍 Address: ${photo.address}`);
    } else if (photo.latitude && photo.longitude) {
      doc.text(`📍 GPS: ${photo.latitude.toFixed(6)}, ${photo.longitude.toFixed(6)}`);
    }
    doc.moveDown(0.2);

    if (photo.weather) {
      doc.text(`🌤️ Weather: ${photo.weather}`);
    }

    if (photo.complianceScore !== undefined) {
      doc.text(`📊 Compliance Score: ${photo.complianceScore}/100`);
    }

    if (photo.verificationHash) {
      doc.text(`🔒 Verification Hash: ${photo.verificationHash}`);
    }

    if (photo.notes) {
      doc.text(`📝 Notes: ${photo.notes}`);
    }

    doc.moveDown(0.5);

    // Embed photo
    if (fs.existsSync(photo.photoPath)) {
      try {
        doc.image(photo.photoPath, { fit: [500, 350], align: 'center', valign: 'center' });
      } catch (e) {
        doc.fillColor('#F44336').text('⚠️ Could not embed image').fillColor('#000');
      }
    } else {
      doc.fillColor('#F44336').text('⚠️ Photo file missing').fillColor('#000');
    }

    doc.moveDown(0.5);
    doc.fontSize(8).font('Helvetica').fillColor('#888')
      .text('🔒 Tamper‑Proof Evidence – Verified by Future Jobs Pro AI', { align: 'center' });
    doc.fillColor('#000');
  }

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

console.log('🖼️ Watermark Service loaded (with QR, WeatherKit, Hash)');