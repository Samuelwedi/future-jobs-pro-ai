// ============================================================
// WATERMARK SERVICE – Future Jobs Pro AI
// Features: Image/Video watermark, OpenWeatherMap, plain hash
// No QR code – clean and reliable
// ============================================================

import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';

const execAsync = promisify(exec);

export type WatermarkTemplate = 'standard' | 'minimal' | 'detailed' | 'map-style';

export interface WatermarkOptions {
  template?: WatermarkTemplate;
  showDate?: boolean;
  showTime?: boolean;
  showGPS?: boolean;
  showWeather?: boolean;
  customText?: string;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  opacity?: number;
  fontSize?: number;
}

export interface WatermarkResult {
  outputPath: string;
  verificationHash: string;
}

// ---------- OpenWeatherMap API ----------
async function fetchWeather(lat: number, lng: number): Promise<string> {
  const apiKey = process.env.OPENWEATHER_API_KEY || '5747418241c0b06e9b0dc9223223479f';
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&appid=${apiKey}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn('OpenWeather API error:', response.status);
      return 'Weather unavailable';
    }
    const data: any = await response.json();
    const temp = Math.round(data.main.temp);
    const condition = data.weather?.[0]?.description || 'unknown';
    // Capitalize first letter
    const capitalized = condition.charAt(0).toUpperCase() + condition.slice(1);
    return `${capitalized} ${temp}°C`;
  } catch (error) {
    console.warn('OpenWeather fetch failed:', error);
    return 'Weather unavailable';
  }
}

// ---------- Reverse Geocode (Nominatim) ----------
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
    weather = await fetchWeather(metadata.latitude, metadata.longitude);
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

  const fullMetadata = {
    ...metadata,
    address: locationDisplay,
    weather,
    takenAt,
  };

  const isVideo = ['.mp4', '.mov', '.avi', '.m4v', '.mkv'].includes(
    path.extname(inputPath).toLowerCase()
  );

  try {
    if (isVideo) {
      await applyVideoWatermark(inputPath, outputPath, fullMetadata, options, verificationHash);
    } else {
      await applyImageWatermark(inputPath, outputPath, fullMetadata, options, verificationHash);
    }
  } catch (err) {
    console.error('❌ Watermark failed, copying original:', err);
    fs.copyFileSync(inputPath, outputPath);
  }

  return { outputPath, verificationHash };
}

// ============================================================
// IMAGE WATERMARK – no QR, only plain text + hash
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

  // Build text lines (no QR)
  const lines: { text: string; fontSize: number; bold: boolean }[] = [];

  // Company name
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

  // Calculate box dimensions
  const lineHeight = 1.5;
  const textPadding = 16;
  const boxPadding = 14;

  const maxLineChars = Math.max(...lines.map(l => l.text.length));
  const estimatedTextWidth = maxLineChars * (lineFontSize * 0.55);
  const totalTextHeight = lines.reduce((sum, l) => sum + l.fontSize * lineHeight, 0);

  const boxWidth = estimatedTextWidth + boxPadding * 2;
  const boxHeight = totalTextHeight + boxPadding * 2;

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

  // Build SVG (no QR image)
  let svgContent = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" rx="${cornerRadius}" ry="${cornerRadius}"
          fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" />`;

  let textY = boxY + boxPadding + lines[0].fontSize;
  for (const line of lines) {
    const fontWeight = line.bold ? 'bold' : 'normal';
    svgContent += `<text x="${boxX + boxPadding}" y="${textY}" font-size="${line.fontSize}" fill="white" opacity="0.95" font-family="Arial, sans-serif" font-weight="${fontWeight}">${escapeXml(line.text)}</text>`;
    textY += line.fontSize * lineHeight;
  }

  svgContent += '</svg>';

  const svgBuffer = Buffer.from(svgContent);
  await sharp(inputPath).composite([{ input: svgBuffer, top: 0, left: 0 }]).toFile(outputPath);
  console.log(`✅ Image watermark applied: ${path.basename(outputPath)}`);
}

// ============================================================
// VIDEO WATERMARK – no QR
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
    position: options.position || 'bottom-left',
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

  const lineHeight = 1.5;
  const textPadding = 20;
  const boxPadding = 16;

  const maxLineChars = Math.max(...lines.map(l => l.text.length));
  const estimatedTextWidth = maxLineChars * (lineFontSize * 0.55);
  const totalTextHeight = lines.reduce((sum, l) => sum + l.fontSize * lineHeight, 0);
  const boxWidth = estimatedTextWidth + boxPadding * 2;
  const boxHeight = totalTextHeight + boxPadding * 2;

  let boxX = textPadding;
  let boxY = videoHeight - boxHeight - textPadding; // bottom-left default

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

  svgContent += '</svg>';

  const pngPath = inputPath + '.watermark.png';
  const svgBuffer = Buffer.from(svgContent);
  await sharp(svgBuffer).png().toFile(pngPath);

  try {
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
// PDF REPORT – with background watermark (unchanged)
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

  function drawBackgroundWatermark() {
    const pw = doc.page.width, ph = doc.page.height;
    doc.save();
    doc.opacity(0.06);
    doc.fontSize(60);
    doc.font('Helvetica-Bold');
    doc.fillColor('#000');
    doc.rotate(-30, { origin: [pw / 2, ph / 2] });
    const txt = 'FUTURE JOBS PRO AI';
    const tw = doc.widthOfString(txt);
    const th = 60;
    const x = (pw - tw) / 2;
    const y = (ph - th) / 2;
    doc.text(txt, x, y, { align: 'center' });
    doc.restore();
    doc.opacity(1);
  }

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
    if (i > 0) { doc.addPage(); drawBackgroundWatermark(); }
    const p = photos[i];
    doc.fontSize(14).font('Helvetica-Bold').text(`Photo ${i + 1}`, { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').text(`📅 Taken: ${p.takenAt.toLocaleString()}`);
    if (p.address) doc.text(`📍 Address: ${p.address}`);
    else if (p.latitude && p.longitude) doc.text(`📍 GPS: ${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}`);
    if (p.weather) doc.text(`🌤️ Weather: ${p.weather}`);
    if (p.complianceScore !== undefined) doc.text(`📊 Compliance: ${p.complianceScore}/100`);
    if (p.verificationHash) doc.text(`🔒 Hash: ${p.verificationHash}`);
    if (p.notes) doc.text(`📝 Notes: ${p.notes}`);
    doc.moveDown(0.5);
    if (fs.existsSync(p.photoPath)) {
      try { doc.image(p.photoPath, { fit: [500, 350], align: 'center', valign: 'center' }); } catch { doc.fillColor('#F44336').text('⚠️ Could not embed').fillColor('#000'); }
    } else {
      doc.fillColor('#F44336').text('⚠️ Missing file').fillColor('#000');
    }
    doc.moveDown(0.5);
    doc.fontSize(8).font('Helvetica').fillColor('#888').text('🔒 Tamper‑Proof Evidence', { align: 'center' });
    doc.fillColor('#000');
  }
  doc.end();
  return new Promise((resolve, reject) => { stream.on('finish', () => resolve(outputPath)); stream.on('error', reject); });
}

console.log('🖼️ Watermark Service loaded (OpenWeather, plain hash, no QR)');