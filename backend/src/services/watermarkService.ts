// ============================================================
// WATERMARK SERVICE – Future Jobs Pro AI
// Uses node-canvas for reliable text rendering
// ============================================================

import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import { createCanvas, loadImage } from 'canvas';

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
// Canvas overlay generator – reliable text rendering
// ============================================================
async function generateOverlayBuffer(
  width: number,
  height: number,
  lines: string[],
  options: { position: string; customText: string; fontSize: number }
): Promise<Buffer> {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Determine font sizes
  const baseSize = options.fontSize || Math.round(width / 30);
  const lineSize = Math.round(baseSize * 0.75);
  const smallSize = Math.round(lineSize * 0.85);

  // Measure text and compute box
  const lineSpacing = 1.5;
  let maxWidth = 0;
  const lineHeights: number[] = [];
  const lineFontSizes: number[] = [];

  ctx.font = `bold ${baseSize}px sans-serif`;
  let totalHeight = 0;

  for (let i = 0; i < lines.length; i++) {
    const isBold = i === 0;
    const isHash = lines[i].startsWith('Verified:');
    const fontSize = i === 0 ? baseSize : (isHash ? smallSize : lineSize);
    ctx.font = `${isBold ? 'bold' : 'normal'} ${fontSize}px sans-serif`;
    const metrics = ctx.measureText(lines[i]);
    const textWidth = metrics.width;
    const textHeight = fontSize * 1.2; // approximate
    maxWidth = Math.max(maxWidth, textWidth);
    lineHeights.push(textHeight);
    lineFontSizes.push(fontSize);
    totalHeight += textHeight * lineSpacing;
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

  // 1. Draw semi-transparent background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  const radius = 12;
  ctx.beginPath();
  ctx.moveTo(boxX + radius, boxY);
  ctx.arcTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + boxHeight, radius);
  ctx.arcTo(boxX + boxWidth, boxY + boxHeight, boxX, boxY + boxHeight, radius);
  ctx.arcTo(boxX, boxY + boxHeight, boxX, boxY, radius);
  ctx.arcTo(boxX, boxY, boxX + boxWidth, boxY, radius);
  ctx.closePath();
  ctx.fill();

  // 2. Draw border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 3. Draw text (white)
  let currentY = boxY + padding + lineHeights[0];
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const fontSize = lineFontSizes[i];
    const isBold = i === 0;
    ctx.font = `${isBold ? 'bold' : 'normal'} ${fontSize}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';

    // Measure again to center horizontally
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const xPos = boxX + padding + (maxWidth - textWidth) / 2;
    const yPos = currentY;

    // Draw with a subtle shadow for readability
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    ctx.fillText(text, xPos, yPos);
    ctx.shadowBlur = 0;

    currentY += lineHeights[i] * lineSpacing;
  }

  // Return PNG buffer
  return canvas.toBuffer('image/png');
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

  const overlayBuffer = await generateOverlayBuffer(
    width,
    height,
    lines,
    { position: options.position || 'bottom-left', customText: options.customText || 'Future Jobs Pro AI', fontSize: options.fontSize || 0 }
  );

  await sharp(inputPath)
    .composite([{ input: overlayBuffer, top: 0, left: 0 }])
    .toFile(outputPath);

  console.log(`✅ Image watermark applied (canvas): ${path.basename(outputPath)}`);
}

// ============================================================
// VIDEO WATERMARK – same canvas overlay + ffmpeg
// ============================================================
async function applyVideoWatermark(
  inputPath: string,
  outputPath: string,
  metadata: any,
  options: WatermarkOptions,
  hash: string
): Promise<void> {
  console.log('🎬 Applying video watermark with canvas...');

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

  const overlayBuffer = await generateOverlayBuffer(
    videoWidth,
    videoHeight,
    lines,
    { position: options.position || 'bottom-left', customText: options.customText || 'Future Jobs Pro AI', fontSize: options.fontSize || 0 }
  );

  const pngPath = inputPath + '.watermark.png';
  fs.writeFileSync(pngPath, overlayBuffer);

  // Recompute box position (same logic as generateOverlayBuffer)
  // We'll just use the same coordinates – we can re-use the function but we need to pass width/height.
  // To avoid duplication, we'll compute in generateOverlayBuffer and return the coordinates.
  // But to keep it simple, we'll recompute the box position here using the same logic.
  // Actually, the overlay already has the correct position embedded (it's a full-size canvas).
  // So we can overlay at (0,0) – but the overlay already has the box drawn at the correct position.
  // So we can composite at (0,0) without specifying coordinates.
  // That's what we do in the image watermark – we overlay at (0,0) because the overlay is full-size.
  // So for video, we'll just use (0,0) as well.

  try {
    await execAsync(`ffmpeg -i "${inputPath}" -i "${pngPath}" -filter_complex "overlay=0:0" -c:a copy "${outputPath}" -y`);
    console.log(`✅ Video watermark applied (${videoWidth}x${videoHeight})`);
  } catch (err) {
    console.error('❌ ffmpeg failed, copying original:', err);
    fs.copyFileSync(inputPath, outputPath);
  }
  if (fs.existsSync(pngPath)) fs.unlinkSync(pngPath);
}

// ============================================================
// PDF REPORT (placeholder)
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

console.log('🖼️ Watermark Service loaded – using node-canvas for reliable text');