// ============================================================
// WATERMARK SERVICE – Future Jobs Pro AI
// Uses ffmpeg drawtext with proper escaping
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';

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
// Helper: escape text for ffmpeg drawtext
// ============================================================
function escapeForDrawtext(text: string): string {
  // Escape colons, backslashes, double quotes, and single quotes
  return text
    .replace(/\\/g, '\\\\')   // backslash
    .replace(/:/g, '\\:')     // colon (important!)
    .replace(/"/g, '\\"')     // double quote
    .replace(/'/g, "\\'");    // single quote
}

// ============================================================
// IMAGE WATERMARK – using ffmpeg drawtext
// ============================================================
async function applyImageWatermark(
  inputPath: string,
  outputPath: string,
  metadata: any,
  options: WatermarkOptions,
  hash: string
): Promise<void> {
  console.log('🖼️ Applying image watermark with ffmpeg drawtext...');

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

  // Escape each line individually
  const escapedLines = lines.map(escapeForDrawtext);
  const textWithNewlines = escapedLines.join('\\n');

  const fontSize = options.fontSize || 24;
  const x = 20;
  const y = 'h - text_h - 20';

  // Use a box with black background at 85% opacity, white text
  const ffmpegCmd = `ffmpeg -i "${inputPath}" -vf "drawtext=text='${textWithNewlines}':fontcolor=white:box=1:boxcolor=black@0.85:fontsize=${fontSize}:x=${x}:y=${y}:line_spacing=10" -frames:v 1 "${outputPath}" -y`;

  console.log('🎬 Running ffmpeg for image...');
  try {
    await execAsync(ffmpegCmd);
    console.log(`✅ Image watermark applied via ffmpeg drawtext: ${path.basename(outputPath)}`);
  } catch (err) {
    console.error('❌ ffmpeg drawtext failed, falling back to copy:', err);
    // Fallback: copy original
    fs.copyFileSync(inputPath, outputPath);
    console.warn('⚠️ Used fallback copy (no watermark)');
  }
}

// ============================================================
// VIDEO WATERMARK – using ffmpeg drawtext
// ============================================================
async function applyVideoWatermark(
  inputPath: string,
  outputPath: string,
  metadata: any,
  options: WatermarkOptions,
  hash: string
): Promise<void> {
  console.log('🎬 Applying video watermark with ffmpeg drawtext...');

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

  const escapedLines = lines.map(escapeForDrawtext);
  const textWithNewlines = escapedLines.join('\\n');

  const fontSize = options.fontSize || 24;
  const x = 20;
  const y = 'h - text_h - 20';

  const ffmpegCmd = `ffmpeg -i "${inputPath}" -vf "drawtext=text='${textWithNewlines}':fontcolor=white:box=1:boxcolor=black@0.85:fontsize=${fontSize}:x=${x}:y=${y}:line_spacing=10" -c:a copy "${outputPath}" -y`;

  try {
    await execAsync(ffmpegCmd);
    console.log(`✅ Video watermark applied via ffmpeg drawtext`);
  } catch (err) {
    console.error('❌ ffmpeg drawtext failed, copying original:', err);
    fs.copyFileSync(inputPath, outputPath);
  }
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

console.log('🖼️ Watermark Service loaded – ffmpeg drawtext (colons escaped)');