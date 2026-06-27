// ============================================================
// WATERMARK SERVICE – Future Jobs Pro AI
// Uses ffmpeg drawtext with emoji support, local timezone,
// address splitting, and professional box layout.
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import sharp from 'sharp';

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

// ---------- Format local time (America/Edmonton) ----------
function formatLocalTime(date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'America/Edmonton',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  };
  const formatter = new Intl.DateTimeFormat('en-US', options);
  return formatter.format(date);
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
// Helper: get dimensions
// ============================================================
async function getDimensions(inputPath: string): Promise<{ width: number; height: number }> {
  const isVideo = ['.mp4', '.mov', '.avi', '.m4v', '.mkv'].includes(
    path.extname(inputPath).toLowerCase()
  );
  if (isVideo) {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${inputPath}"`
      );
      const dims = stdout.trim().split(',');
      if (dims.length === 2) {
        return { width: parseInt(dims[0], 10), height: parseInt(dims[1], 10) };
      }
    } catch {}
    return { width: 1280, height: 720 };
  } else {
    const img = sharp(inputPath);
    const meta = await img.metadata();
    return { width: meta.width || 800, height: meta.height || 600 };
  }
}

// ============================================================
// Build ffmpeg drawtext command using a text file
// ============================================================
async function buildDrawtextCommand(
  inputPath: string,
  outputPath: string,
  lines: string[],
  options: WatermarkOptions,
  width: number,
  height: number
): Promise<string> {
  // Font size proportional to width
  const fontSize = options.fontSize || Math.round(width / 35);
  const lineSpacing = Math.round(fontSize * 0.4);

  // Build text with newlines
  const text = lines.join('\n');

  // Write text to a temporary file (avoids escaping issues)
  const textFile = inputPath + '.text.txt';
  fs.writeFileSync(textFile, text, 'utf-8');

  const margin = 20;
  const x = margin;
  const y = `h - (text_h + ${margin})`;

  // Use no specific fontfile – rely on system fonts (includes emoji support via noto-fonts-emoji)
  const ffmpegCmd =
    `ffmpeg -i "${inputPath}" ` +
    `-vf "drawtext=textfile='${textFile}':` +
    `fontcolor=white:` +
    `box=1:` +
    `boxcolor=black@0.8:` +
    `boxborderw=12:` +
    `fontsize=${fontSize}:` +
    `x=${x}:` +
    `y=${y}:` +
    `line_spacing=${lineSpacing}" ` +
    (path.extname(inputPath).toLowerCase() === '.mp4' ? '-c:a copy ' : '-frames:v 1 ') +
    `"${outputPath}" -y`;

  // Clean up text file after command execution (we'll do it after running)
  return ffmpegCmd;
}

// ============================================================
// Apply watermark (image)
// ============================================================
async function applyImageWatermark(
  inputPath: string,
  outputPath: string,
  metadata: any,
  options: WatermarkOptions,
  hash: string
): Promise<void> {
  console.log('🖼️ Applying image watermark...');

  const dims = await getDimensions(inputPath);
  console.log(`📐 Image dimensions: ${dims.width}x${dims.height}`);

  const now = metadata.takenAt || new Date();
  const formattedTime = formatLocalTime(now);

  // Build lines – with emojis
  const company = options.customText || 'Future Jobs Pro AI';
  const lines: string[] = [company, formattedTime];

  // Address – split if too long (> 40 chars)
  if (metadata.address && metadata.address !== 'No location') {
    const addr = metadata.address;
    // Split into chunks of max 40 chars (with a space break)
    if (addr.length > 40) {
      const parts = addr.split(',');
      if (parts.length >= 2) {
        lines.push(`📍 ${parts[0].trim()}`);
        lines.push(parts.slice(1).join(',').trim());
      } else {
        // Split at space near 35 chars
        const mid = Math.min(35, addr.length);
        let splitIdx = addr.lastIndexOf(' ', mid);
        if (splitIdx < 0) splitIdx = mid;
        lines.push(`📍 ${addr.substring(0, splitIdx)}`);
        lines.push(addr.substring(splitIdx + 1));
      }
    } else {
      lines.push(`📍 ${addr}`);
    }
  }

  // Weather with emoji
  if (metadata.weather && metadata.weather !== 'Weather unavailable') {
    lines.push(`🌤️ ${metadata.weather}`);
  } else {
    lines.push('🌤️ Weather not available');
  }

  // GPS coordinates
  if (metadata.latitude && metadata.longitude) {
    const latDir = metadata.latitude >= 0 ? 'N' : 'S';
    const lngDir = metadata.longitude >= 0 ? 'E' : 'W';
    const gps = `${Math.abs(metadata.latitude).toFixed(6)}°${latDir}, ${Math.abs(metadata.longitude).toFixed(6)}°${lngDir}`;
    lines.push(gps);
  }

  // Verification hash with lock emoji
  lines.push(`🔒 Verified: ${hash}`);

  const cmd = await buildDrawtextCommand(inputPath, outputPath, lines, options, dims.width, dims.height);

  // Execute ffmpeg
  const textFile = inputPath + '.text.txt';
  try {
    console.log('🎬 Running ffmpeg drawtext...');
    await execAsync(cmd);
    console.log(`✅ Image watermark applied: ${path.basename(outputPath)}`);
  } catch (err) {
    console.error('❌ ffmpeg drawtext failed, copying original:', err);
    fs.copyFileSync(inputPath, outputPath);
  } finally {
    if (fs.existsSync(textFile)) fs.unlinkSync(textFile);
  }
}

// ============================================================
// Apply watermark (video) – identical to image
// ============================================================
async function applyVideoWatermark(
  inputPath: string,
  outputPath: string,
  metadata: any,
  options: WatermarkOptions,
  hash: string
): Promise<void> {
  console.log('🎬 Applying video watermark...');

  const dims = await getDimensions(inputPath);
  console.log(`📐 Video dimensions: ${dims.width}x${dims.height}`);

  const now = metadata.takenAt || new Date();
  const formattedTime = formatLocalTime(now);

  const company = options.customText || 'Future Jobs Pro AI';
  const lines: string[] = [company, formattedTime];

  if (metadata.address && metadata.address !== 'No location') {
    const addr = metadata.address;
    if (addr.length > 40) {
      const parts = addr.split(',');
      if (parts.length >= 2) {
        lines.push(`📍 ${parts[0].trim()}`);
        lines.push(parts.slice(1).join(',').trim());
      } else {
        const mid = Math.min(35, addr.length);
        let splitIdx = addr.lastIndexOf(' ', mid);
        if (splitIdx < 0) splitIdx = mid;
        lines.push(`📍 ${addr.substring(0, splitIdx)}`);
        lines.push(addr.substring(splitIdx + 1));
      }
    } else {
      lines.push(`📍 ${addr}`);
    }
  }

  if (metadata.weather && metadata.weather !== 'Weather unavailable') {
    lines.push(`🌤️ ${metadata.weather}`);
  } else {
    lines.push('🌤️ Weather not available');
  }

  if (metadata.latitude && metadata.longitude) {
    const latDir = metadata.latitude >= 0 ? 'N' : 'S';
    const lngDir = metadata.longitude >= 0 ? 'E' : 'W';
    const gps = `${Math.abs(metadata.latitude).toFixed(6)}°${latDir}, ${Math.abs(metadata.longitude).toFixed(6)}°${lngDir}`;
    lines.push(gps);
  }

  lines.push(`🔒 Verified: ${hash}`);

  const cmd = await buildDrawtextCommand(inputPath, outputPath, lines, options, dims.width, dims.height);
  const textFile = inputPath + '.text.txt';

  try {
    await execAsync(cmd);
    console.log(`✅ Video watermark applied`);
  } catch (err) {
    console.error('❌ ffmpeg drawtext failed, copying original:', err);
    fs.copyFileSync(inputPath, outputPath);
  } finally {
    if (fs.existsSync(textFile)) fs.unlinkSync(textFile);
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

console.log('🖼️ Watermark Service loaded – ffmpeg drawtext with emojis, text file, line splitting');