// ============================================================
// WATERMARK SERVICE – Future Jobs Pro AI
// Uses jimp for text rendering – final TypeScript fixes
// ============================================================

import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import Jimp from 'jimp';

const execAsync = promisify(exec);

export interface WatermarkOptions {
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
    const res = await fetch(url);
    if (!res.ok) return 'Weather unavailable';
    const data: any = await res.json();
    const temp = Math.round(data.main.temp);
    const condition = data.weather?.[0]?.description || 'unknown';
    const capitalized = condition.charAt(0).toUpperCase() + condition.slice(1);
    return `${capitalized} ${temp}°C`;
  } catch {
    return 'Weather unavailable';
  }
}

// ---------- Reverse Geocode ----------
async function getAddressFromCoords(lat: number, lng: number): Promise<string | undefined> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Future Jobs Pro AI' } });
    if (!res.ok) return undefined;
    const data: any = await res.json();
    return data?.display_name?.split(',').slice(0, 3).join(',');
  } catch {
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

// ============================================================
// MAIN
// ============================================================
export async function applyWatermark(
  inputPath: string,
  outputPath: string,
  metadata: any,
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

  const isVideo = ['.mp4', '.mov', '.avi', '.m4v', '.mkv'].includes(
    path.extname(inputPath).toLowerCase()
  );

  if (isVideo) {
    await applyVideoWatermark(inputPath, outputPath, fullMeta, options, hash);
  } else {
    await applyImageWatermark(inputPath, outputPath, fullMeta, options, hash);
  }

  console.log(`📦 Output file size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);
  return { outputPath, verificationHash: hash };
}

// ============================================================
// Generate watermark PNG using jimp
// ============================================================
async function generateWatermarkPNG(
  width: number,
  height: number,
  lines: string[],
  options: { position: string; customText: string; fontSize: number }
): Promise<Buffer> {
  const baseSize = options.fontSize || Math.round(width / 30);
  const lineSize = Math.round(baseSize * 0.75);
  const smallSize = Math.round(lineSize * 0.85);

  // Load fonts – cast to any to avoid TypeScript issues
  const fontLarge = await Jimp.loadFont((Jimp as any).FONT_SANS_64_BLACK);
  const fontNormal = await Jimp.loadFont((Jimp as any).FONT_SANS_32_BLACK);
  const fontSmall = await Jimp.loadFont((Jimp as any).FONT_SANS_16_BLACK);

  const getFont = (size: number) => {
    if (size >= 48) return fontLarge;
    if (size >= 24) return fontNormal;
    return fontSmall;
  };

  let maxWidth = 0;
  let totalHeight = 0;
  const lineSpacing = 1.4;
  const metrics: { width: number; height: number; font: any }[] = [];

  for (const line of lines) {
    const idx = lines.indexOf(line);
    const size = idx === 0 ? baseSize : (line.startsWith('Verified:') ? smallSize : lineSize);
    const font = getFont(size);
    const w = Jimp.measureText(font, line);
    const h = Jimp.measureTextHeight(font, line, w);
    metrics.push({ width: w, height: h, font });
    maxWidth = Math.max(maxWidth, w);
    totalHeight += h * lineSpacing;
  }

  const padding = 18;
  const boxWidth = maxWidth + padding * 2;
  const boxHeight = totalHeight + padding * 2;

  const margin = 20;
  let boxX = margin;
  let boxY = margin;
  if (options.position === 'top-right') {
    boxX = width - boxWidth - margin;
  } else if (options.position === 'bottom-left') {
    boxY = height - boxHeight - margin;
  } else if (options.position === 'bottom-right') {
    boxX = width - boxWidth - margin;
    boxY = height - boxHeight - margin;
  } else if (options.position === 'center') {
    boxX = (width - boxWidth) / 2;
    boxY = (height - boxHeight) / 2;
  }

  // Create transparent overlay using new Jimp constructor (cast to any)
  const overlay = new (Jimp as any)(width, height, 0x00000000);

  const boxColor = 0x000000D9; // ~85% opaque
  for (let y = boxY; y < boxY + boxHeight; y++) {
    for (let x = boxX; x < boxX + boxWidth; x++) {
      overlay.setPixelColor(boxColor, x, y);
    }
  }

  const borderColor = 0xFFFFFFFF;
  for (let x = boxX; x < boxX + boxWidth; x++) {
    overlay.setPixelColor(borderColor, x, boxY);
    overlay.setPixelColor(borderColor, x, boxY + boxHeight - 1);
  }
  for (let y = boxY; y < boxY + boxHeight; y++) {
    overlay.setPixelColor(borderColor, boxX, y);
    overlay.setPixelColor(borderColor, boxX + boxWidth - 1, y);
  }

  let currentY = boxY + padding;
  for (let i = 0; i < lines.length; i++) {
    const metric = metrics[i];
    const text = lines[i];
    const textWidth = metric.width;
    const textHeight = metric.height;
    const xPos = boxX + padding + (maxWidth - textWidth) / 2;
    const yPos = currentY + textHeight;
    overlay.print(metric.font, xPos, yPos, text);
    currentY += textHeight * lineSpacing;
  }

  overlay.invert();
  return overlay.getBufferAsync('image/png');
}

// ============================================================
// IMAGE WATERMARK
// ============================================================
async function applyImageWatermark(
  inputPath: string,
  outputPath: string,
  metadata: any,
  options: WatermarkOptions,
  hash: string
): Promise<void> {
  const img = sharp(inputPath);
  const { width = 800, height = 600 } = await img.metadata();

  const now = metadata.takenAt || new Date();
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const lines: string[] = [
    options.customText || 'Future Jobs Pro AI',
    `${dateStr}  ${timeStr}`,
  ];
  if (metadata.address && metadata.address !== 'No location') {
    lines.push(metadata.address);
  }
  if (metadata.latitude && metadata.longitude && metadata.address === 'No location') {
    const latDir = metadata.latitude >= 0 ? 'N' : 'S';
    const lngDir = metadata.longitude >= 0 ? 'E' : 'W';
    lines.push(`${Math.abs(metadata.latitude).toFixed(6)}°${latDir}  ${Math.abs(metadata.longitude).toFixed(6)}°${lngDir}`);
  }
  if (metadata.weather && metadata.weather !== 'Weather unavailable') {
    lines.push(`Weather: ${metadata.weather}`);
  }
  lines.push(`Verified: ${hash}`);

  const overlayBuffer = await generateWatermarkPNG(
    width,
    height,
    lines,
    { position: options.position || 'bottom-left', customText: options.customText || 'Future Jobs Pro AI', fontSize: options.fontSize || 0 }
  );

  await sharp(inputPath)
    .composite([{ input: overlayBuffer, top: 0, left: 0 }])
    .toFile(outputPath);

  console.log(`✅ Image watermark applied (jimp): ${path.basename(outputPath)}`);
}

// ============================================================
// VIDEO WATERMARK
// ============================================================
async function applyVideoWatermark(
  inputPath: string,
  outputPath: string,
  metadata: any,
  options: WatermarkOptions,
  hash: string
): Promise<void> {
  console.log('🎬 Applying video watermark with jimp...');

  let videoWidth = 1280, videoHeight = 720;
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${inputPath}"`
    );
    const dims = stdout.trim().split(',');
    if (dims.length === 2) {
      videoWidth = parseInt(dims[0], 10);
      videoHeight = parseInt(dims[1], 10);
    }
  } catch {}

  const now = metadata.takenAt || new Date();
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const lines: string[] = [
    options.customText || 'Future Jobs Pro AI',
    `${dateStr}  ${timeStr}`,
  ];
  if (metadata.address && metadata.address !== 'No location') {
    lines.push(metadata.address);
  }
  if (metadata.latitude && metadata.longitude && metadata.address === 'No location') {
    const latDir = metadata.latitude >= 0 ? 'N' : 'S';
    const lngDir = metadata.longitude >= 0 ? 'E' : 'W';
    lines.push(`${Math.abs(metadata.latitude).toFixed(6)}°${latDir}  ${Math.abs(metadata.longitude).toFixed(6)}°${lngDir}`);
  }
  if (metadata.weather && metadata.weather !== 'Weather unavailable') {
    lines.push(`Weather: ${metadata.weather}`);
  }
  lines.push(`Verified: ${hash}`);

  const overlayBuffer = await generateWatermarkPNG(
    videoWidth,
    videoHeight,
    lines,
    { position: options.position || 'bottom-left', customText: options.customText || 'Future Jobs Pro AI', fontSize: options.fontSize || 0 }
  );

  const pngPath = inputPath + '.watermark.png';
  fs.writeFileSync(pngPath, overlayBuffer);

  // Recompute box position (same logic as generateWatermarkPNG)
  const baseSize = options.fontSize || Math.round(videoWidth / 30);
  const lineSize = Math.round(baseSize * 0.75);
  const smallSize = Math.round(lineSize * 0.85);
  const fontLarge = await Jimp.loadFont((Jimp as any).FONT_SANS_64_BLACK);
  const fontNormal = await Jimp.loadFont((Jimp as any).FONT_SANS_32_BLACK);
  const fontSmall = await Jimp.loadFont((Jimp as any).FONT_SANS_16_BLACK);
  const getFont = (size: number) => {
    if (size >= 48) return fontLarge;
    if (size >= 24) return fontNormal;
    return fontSmall;
  };
  let maxWidth = 0, totalHeight = 0;
  for (const line of lines) {
    const idx = lines.indexOf(line);
    const size = idx === 0 ? baseSize : (line.startsWith('Verified:') ? smallSize : lineSize);
    const font = getFont(size);
    const w = Jimp.measureText(font, line);
    const h = Jimp.measureTextHeight(font, line, w);
    maxWidth = Math.max(maxWidth, w);
    totalHeight += h * 1.4;
  }
  const padding = 18;
  const boxWidth = maxWidth + padding * 2;
  const boxHeight = totalHeight + padding * 2;
  const margin = 20;
  let boxX = margin;
  let boxY = videoHeight - boxHeight - margin;
  const pos = options.position || 'bottom-left';
  if (pos === 'top-left') boxY = margin;
  else if (pos === 'top-right') { boxX = videoWidth - boxWidth - margin; boxY = margin; }
  else if (pos === 'bottom-right') { boxX = videoWidth - boxWidth - margin; boxY = videoHeight - boxHeight - margin; }

  try {
    await execAsync(`ffmpeg -i "${inputPath}" -i "${pngPath}" -filter_complex "overlay=${boxX}:${boxY}" -c:a copy "${outputPath}" -y`);
    console.log(`✅ Video watermark applied (${videoWidth}x${videoHeight})`);
  } catch (err) {
    console.error('❌ ffmpeg failed, copying original:', err);
    fs.copyFileSync(inputPath, outputPath);
  }
  if (fs.existsSync(pngPath)) fs.unlinkSync(pngPath);
}

// ============================================================
// PDF REPORT (placeholder – keep your existing implementation)
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
  doc.fontSize(24).text('PDF Report', { align: 'center' });
  doc.end();
  return new Promise((resolve) => { stream.on('finish', () => resolve(outputPath)); });
}

console.log('🖼️ Watermark Service loaded – jimp final (no TypeScript errors)');