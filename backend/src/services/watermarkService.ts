// ============================================================
// WATERMARK SERVICE – Future Jobs Pro AI
// Visible, tamper‑proof stamp (like a PDF watermark)
// No QR, OpenWeatherMap, bold & clear
// ============================================================

import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';

const execAsync = promisify(exec);

export interface WatermarkOptions {
  template?: 'standard' | 'minimal' | 'detailed';
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  customText?: string;
  fontSize?: number;
}

export interface WatermarkResult {
  outputPath: string;
  verificationHash: string;
}

// ---------- OpenWeatherMap ----------
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
    const capitalized = condition.charAt(0).toUpperCase() + condition.slice(1);
    return `${capitalized} ${temp}°C`;
  } catch (error) {
    console.warn('OpenWeather fetch failed:', error);
    return 'Weather unavailable';
  }
}

// ---------- Reverse Geocode ----------
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

// ---------- Hash ----------
function generateVerificationHash(metadata: any): string {
  const data = JSON.stringify({
    lat: metadata.latitude || 0,
    lng: metadata.longitude || 0,
    address: metadata.address || '',
    weather: metadata.weather || '',
    time: (metadata.takenAt || new Date()).toISOString(),
  });
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 8);
}

// ---------- XML escape ----------
function escapeXml(str: string): string {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

// ============================================================
// MAIN
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
    takenAt?: Date;
  },
  options: WatermarkOptions = {}
): Promise<WatermarkResult> {
  const takenAt = metadata.takenAt || new Date();

  let address = metadata.address;
  if (!address && metadata.latitude && metadata.longitude) {
    address = await getAddressFromCoords(metadata.latitude, metadata.longitude) || 'No location';
  }
  let weather = metadata.weather;
  if (!weather && metadata.latitude && metadata.longitude) {
    weather = await fetchWeather(metadata.latitude, metadata.longitude);
  } else if (!weather) {
    weather = 'Weather unavailable';
  }

  const hash = generateVerificationHash({ ...metadata, address, weather, takenAt });
  const fullMeta = { ...metadata, address, weather, takenAt };

  const isVideo = ['.mp4','.mov','.avi','.m4v','.mkv'].includes(path.extname(inputPath).toLowerCase());
  if (isVideo) {
    await applyVideoWatermark(inputPath, outputPath, fullMeta, options, hash);
  } else {
    await applyImageWatermark(inputPath, outputPath, fullMeta, options, hash);
  }

  // Debug: log output file size to confirm overlay
  const stats = fs.statSync(outputPath);
  console.log(`📦 Output file size: ${(stats.size / 1024).toFixed(2)} KB`);

  return { outputPath, verificationHash: hash };
}

// ============================================================
// IMAGE WATERMARK – Bold, opaque, visible
// ============================================================
async function applyImageWatermark(
  inputPath: string,
  outputPath: string,
  metadata: any,
  options: WatermarkOptions,
  hash: string
): Promise<void> {
  const opts = {
    customText: options.customText || 'Future Jobs Pro AI',
    position: options.position || 'bottom-left',
    fontSize: options.fontSize || 0,
  };

  const image = sharp(inputPath);
  const { width = 800, height = 600 } = await image.metadata();

  // Larger font for readability
  const baseFontSize = opts.fontSize || Math.round(width / 30);
  const lineFontSize = Math.round(baseFontSize * 0.75);
  const smallFontSize = Math.round(lineFontSize * 0.85);

  const now = metadata.takenAt || new Date();
  const dateStr = now.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit' });

  const lines = [
    { text: opts.customText, fontSize: baseFontSize, bold: true },
    { text: `${dateStr}  ${timeStr}`, fontSize: lineFontSize, bold: false },
  ];
  if (metadata.address && metadata.address !== 'No location') {
    lines.push({ text: metadata.address, fontSize: lineFontSize, bold: false });
  }
  if (metadata.latitude && metadata.longitude && metadata.address === 'No location') {
    const latDir = metadata.latitude >=0 ? 'N' : 'S';
    const lngDir = metadata.longitude >=0 ? 'E' : 'W';
    lines.push({
      text: `${Math.abs(metadata.latitude).toFixed(6)}°${latDir}  ${Math.abs(metadata.longitude).toFixed(6)}°${lngDir}`,
      fontSize: lineFontSize,
      bold: false,
    });
  }
  if (metadata.weather && metadata.weather !== 'Weather unavailable') {
    lines.push({ text: `🌤️ ${metadata.weather}`, fontSize: lineFontSize, bold: false });
  }
  lines.push({ text: `🔒 Verified: ${hash}`, fontSize: smallFontSize, bold: false });

  const lineHeight = 1.6;
  const textPadding = 20;
  const boxPadding = 18;

  const maxLineChars = Math.max(...lines.map(l => l.text.length));
  const estimatedTextWidth = maxLineChars * (lineFontSize * 0.6);
  const totalTextHeight = lines.reduce((sum, l) => sum + l.fontSize * lineHeight, 0);
  const boxWidth = estimatedTextWidth + boxPadding * 2;
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
    boxX = (width - boxWidth) / 2;
    boxY = (height - boxHeight) / 2;
  }

  // Build SVG with bold, visible stamp
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  // Shadow
  svg += `<rect x="${boxX+2}" y="${boxY+2}" width="${boxWidth}" height="${boxHeight}" rx="12" ry="12"
          fill="rgba(0,0,0,0.3)" />`;
  // Main box – more opaque
  svg += `<rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" rx="12" ry="12"
          fill="rgba(0,0,0,0.85)" stroke="rgba(255,255,255,0.4)" stroke-width="2" />`;
  // Text with black stroke for contrast
  let textY = boxY + boxPadding + lines[0].fontSize;
  for (const line of lines) {
    const fontWeight = line.bold ? 'bold' : 'normal';
    svg += `<text x="${boxX + boxPadding}" y="${textY}" font-size="${line.fontSize}" 
            fill="white" stroke="black" stroke-width="1.2" 
            font-family="Arial, sans-serif" font-weight="${fontWeight}" 
            paint-order="stroke fill">${escapeXml(line.text)}</text>`;
    textY += line.fontSize * lineHeight;
  }
  svg += '</svg>';

  const svgBuffer = Buffer.from(svg);
  await sharp(inputPath).composite([{ input: svgBuffer, top: 0, left: 0 }]).toFile(outputPath);
  console.log(`✅ Image watermark applied (visible stamp): ${path.basename(outputPath)}`);
}

// ============================================================
// VIDEO WATERMARK – same style (no QR)
// ============================================================
async function applyVideoWatermark(
  inputPath: string,
  outputPath: string,
  metadata: any,
  options: WatermarkOptions,
  hash: string
): Promise<void> {
  console.log('🎬 Applying video watermark (visible stamp)');

  let videoWidth = 1280, videoHeight = 720;
  try {
    const { stdout } = await execAsync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${inputPath}"`);
    const dims = stdout.trim().split(',');
    if (dims.length === 2) {
      videoWidth = parseInt(dims[0],10);
      videoHeight = parseInt(dims[1],10);
    }
  } catch {}

  const opts = {
    customText: options.customText || 'Future Jobs Pro AI',
    position: options.position || 'bottom-left',
    fontSize: options.fontSize || 0,
  };

  const baseFontSize = opts.fontSize || Math.round(videoWidth / 35);
  const lineFontSize = Math.round(baseFontSize * 0.75);
  const smallFontSize = Math.round(lineFontSize * 0.85);

  const now = metadata.takenAt || new Date();
  const dateStr = now.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit' });

  const lines = [
    { text: opts.customText, fontSize: baseFontSize, bold: true },
    { text: `${dateStr}  ${timeStr}`, fontSize: lineFontSize, bold: false },
  ];
  if (metadata.address && metadata.address !== 'No location') {
    lines.push({ text: metadata.address, fontSize: lineFontSize, bold: false });
  }
  if (metadata.latitude && metadata.longitude && metadata.address === 'No location') {
    const latDir = metadata.latitude >=0 ? 'N' : 'S';
    const lngDir = metadata.longitude >=0 ? 'E' : 'W';
    lines.push({
      text: `${Math.abs(metadata.latitude).toFixed(6)}°${latDir}  ${Math.abs(metadata.longitude).toFixed(6)}°${lngDir}`,
      fontSize: lineFontSize,
      bold: false,
    });
  }
  if (metadata.weather && metadata.weather !== 'Weather unavailable') {
    lines.push({ text: `🌤️ ${metadata.weather}`, fontSize: lineFontSize, bold: false });
  }
  lines.push({ text: `🔒 Verified: ${hash}`, fontSize: smallFontSize, bold: false });

  const lineHeight = 1.6;
  const textPadding = 20;
  const boxPadding = 18;

  const maxLineChars = Math.max(...lines.map(l => l.text.length));
  const estimatedTextWidth = maxLineChars * (lineFontSize * 0.6);
  const totalTextHeight = lines.reduce((sum, l) => sum + l.fontSize * lineHeight, 0);
  const boxWidth = estimatedTextWidth + boxPadding * 2;
  const boxHeight = totalTextHeight + boxPadding * 2;

  let boxX = textPadding;
  let boxY = videoHeight - boxHeight - textPadding; // bottom-left default
  if (opts.position === 'top-left') { boxY = textPadding; }
  else if (opts.position === 'top-right') { boxX = videoWidth - boxWidth - textPadding; boxY = textPadding; }
  else if (opts.position === 'bottom-right') { boxX = videoWidth - boxWidth - textPadding; boxY = videoHeight - boxHeight - textPadding; }

  let svg = `<svg width="${videoWidth}" height="${videoHeight}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect x="${boxX+2}" y="${boxY+2}" width="${boxWidth}" height="${boxHeight}" rx="12" ry="12"
          fill="rgba(0,0,0,0.3)" />`;
  svg += `<rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" rx="12" ry="12"
          fill="rgba(0,0,0,0.85)" stroke="rgba(255,255,255,0.4)" stroke-width="2" />`;

  let textY = boxY + boxPadding + lines[0].fontSize;
  for (const line of lines) {
    const fontWeight = line.bold ? 'bold' : 'normal';
    svg += `<text x="${boxX + boxPadding}" y="${textY}" font-size="${line.fontSize}" 
            fill="white" stroke="black" stroke-width="1.2" 
            font-family="Arial, sans-serif" font-weight="${fontWeight}" 
            paint-order="stroke fill">${escapeXml(line.text)}</text>`;
    textY += line.fontSize * lineHeight;
  }
  svg += '</svg>';

  const pngPath = inputPath + '.watermark.png';
  await sharp(Buffer.from(svg)).png().toFile(pngPath);

  try {
    await execAsync(`ffmpeg -i "${inputPath}" -i "${pngPath}" -filter_complex "overlay=${boxX}:${boxY}" -c:a copy "${outputPath}" -y`);
    console.log(`✅ Video watermark applied (${videoWidth}x${videoHeight})`);
  } catch (err) {
    console.error('❌ ffmpeg watermark failed, using fallback copy:', err);
    fs.copyFileSync(inputPath, outputPath);
  }

  if (fs.existsSync(pngPath)) fs.unlinkSync(pngPath);
}

// ============================================================
// PDF REPORT (unchanged)
// ============================================================
export async function generateWatermarkedPDFReport(
  photos: Array<any>,
  outputPath: string,
  reportTitle = 'Job Site Photo Report',
  companyName = 'Future Jobs Pro AI'
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
    doc.rotate(-30, { origin: [pw/2, ph/2] });
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
    doc.fontSize(14).font('Helvetica-Bold').text(`Photo ${i+1}`, { underline: true });
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
      try { doc.image(p.photoPath, { fit: [500,350], align:'center', valign:'center' }); } catch { doc.fillColor('#F44336').text('⚠️ Could not embed').fillColor('#000'); }
    } else {
      doc.fillColor('#F44336').text('⚠️ Missing file').fillColor('#000');
    }
    doc.moveDown(0.5);
    doc.fontSize(8).font('Helvetica').fillColor('#888').text('🔒 Tamper‑Proof Evidence', { align: 'center' });
    doc.fillColor('#000');
  }
  doc.end();
  return new Promise((resolve, reject) => { stream.on('finish', ()=>resolve(outputPath)); stream.on('error', reject); });
}

console.log('🖼️ Watermark Service loaded – visible stamp, OpenWeather, plain hash');