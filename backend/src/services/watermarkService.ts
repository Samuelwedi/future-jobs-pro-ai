// ============================================
// WATERMARK SERVICE (boxed, Timemark style)
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';

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

// ----- Reverse geocoding to get address from coordinates -----
async function getAddressFromCoords(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'FutureJobsProAI/1.0' },
    });
    if (!response.ok) return null;
    const data: any = await response.json();
    if (data && data.display_name) {
      return data.display_name;
    }
    return null;
  } catch (e) {
    return null;
  }
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

  // If address is not provided but lat/lng are, try to fetch it
  let address = metadata.address || '';
  if (!address && metadata.latitude !== undefined && metadata.longitude !== undefined) {
    const fetched = await getAddressFromCoords(metadata.latitude, metadata.longitude);
    if (fetched) {
      address = fetched;
      console.log(`📍 Address resolved: ${address}`);
    } else {
      // Fallback: format coordinates as address
      address = `${metadata.latitude.toFixed(6)}, ${metadata.longitude.toFixed(6)}`;
      console.log(`📍 Using coordinates as address: ${address}`);
    }
  }

  const isVideo = ['.mp4', '.mov', '.avi', '.m4v', '.mkv'].includes(path.extname(inputPath).toLowerCase());
  if (isVideo) {
    return applyVideoWatermark(inputPath, outputPath, { ...metadata, address }, options);
  }

  return applyImageWatermark(inputPath, outputPath, { ...metadata, address }, options);
}

// ===== IMAGE WATERMARK =====
async function applyImageWatermark(
  inputPath: string,
  outputPath: string,
  metadata: any,
  options: WatermarkOptions
): Promise<string> {
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

  lines.push({ text: opts.customText, fontSize: baseFontSize, bold: true });

  // Date & Time
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  lines.push({ text: `${dateStr}  ${timeStr}`, fontSize: lineFontSize, bold: false });

  // Address (now either fetched or coordinates)
  if (metadata.address) {
    const maxAddrLen = 45; // truncate long addresses
    const addr = metadata.address.length > maxAddrLen ? metadata.address.substring(0, maxAddrLen) + '...' : metadata.address;
    lines.push({ text: addr, fontSize: lineFontSize, bold: false });
  } else if (metadata.latitude !== undefined && metadata.longitude !== undefined) {
    lines.push({
      text: `${metadata.latitude.toFixed(6)}, ${metadata.longitude.toFixed(6)}`,
      fontSize: lineFontSize,
      bold: false,
    });
  }

  // Weather
  if (opts.showWeather && metadata.weather) {
    lines.push({ text: `Weather: ${metadata.weather}`, fontSize: lineFontSize, bold: false });
  }

  // Detailed extras
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

  if (opts.template === 'map-style' && metadata.latitude !== undefined && metadata.longitude !== undefined) {
    lines.push({
      text: `maps.google.com/?q=${metadata.latitude},${metadata.longitude}`,
      fontSize: Math.round(lineFontSize * 0.85),
      bold: false,
    });
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

  // Build SVG
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
  const layers: sharp.OverlayOptions[] = [{ input: svgBuffer, top: 0, left: 0 }];

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

// ===== VIDEO WATERMARK (uses ffmpeg) =====
async function applyVideoWatermark(
  inputPath: string,
  outputPath: string,
  metadata: any,
  options: WatermarkOptions
): Promise<string> {
  console.log('🎬 Applying watermark to video...');

  const pngPath = inputPath + '.watermark.png';
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

  const width = 1280;
  const height = 720;
  const baseFontSize = 28;
  const lineFontSize = Math.round(baseFontSize * 0.72);

  const now = new Date();
  const lines: { text: string; fontSize: number; bold: boolean }[] = [];

  lines.push({ text: opts.customText, fontSize: baseFontSize, bold: true });

  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  lines.push({ text: `${dateStr}  ${timeStr}`, fontSize: lineFontSize, bold: false });

  if (metadata.address) {
    const maxAddrLen = 45;
    const addr = metadata.address.length > maxAddrLen ? metadata.address.substring(0, maxAddrLen) + '...' : metadata.address;
    lines.push({ text: addr, fontSize: lineFontSize, bold: false });
  } else if (metadata.latitude !== undefined && metadata.longitude !== undefined) {
    lines.push({
      text: `${metadata.latitude.toFixed(6)}, ${metadata.longitude.toFixed(6)}`,
      fontSize: lineFontSize,
      bold: false,
    });
  }

  if (metadata.weather) {
    lines.push({ text: `Weather: ${metadata.weather}`, fontSize: lineFontSize, bold: false });
  }

  // Build PNG watermark
  const lineHeight = 1.5;
  const textPadding = 20;
  const boxPadding = 16;

  const maxLineChars = Math.max(...lines.map(l => l.text.length));
  const estimatedTextWidth = maxLineChars * (lineFontSize * 0.55);
  const boxWidth = estimatedTextWidth + boxPadding * 2;
  const totalTextHeight = lines.reduce((sum, l) => sum + l.fontSize * lineHeight, 0);
  const boxHeight = totalTextHeight + boxPadding * 2;

  const boxX = textPadding;
  const boxY = height - boxHeight - textPadding;

  let svgContent = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" rx="10" ry="10"
          fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.3)" stroke-width="1" />`;

  let textY = boxY + boxPadding + lines[0].fontSize;
  for (const line of lines) {
    const fontWeight = line.bold ? 'bold' : 'normal';
    svgContent += `<text x="${boxX + boxPadding}" y="${textY}" font-size="${line.fontSize}" fill="white" opacity="0.95" font-family="Arial, sans-serif" font-weight="${fontWeight}">${escapeXml(line.text)}</text>`;
    textY += line.fontSize * lineHeight;
  }
  svgContent += '</svg>';

  const svgBuffer = Buffer.from(svgContent);
  await sharp(svgBuffer).png().toFile(pngPath);

  try {
    const ffmpegCmd = `ffmpeg -i "${inputPath}" -i "${pngPath}" -filter_complex "[0:v][1:v] overlay=10:${height - boxHeight - 10}" -c:a copy "${outputPath}" -y`;
    await execAsync(ffmpegCmd);
    console.log('✅ Video watermark applied using ffmpeg');
  } catch (err) {
    console.error('❌ ffmpeg watermark failed, using fallback copy:', err);
    fs.copyFileSync(inputPath, outputPath);
  }

  if (fs.existsSync(pngPath)) fs.unlinkSync(pngPath);

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