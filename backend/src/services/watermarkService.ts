// ============================================================
// WATERMARK SERVICE – Future Jobs Pro AI
// Uses ffmpeg drawtext with textfile for reliable multi-line
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

async function applyWatermarkWithFfmpeg(
  inputPath: string,
  outputPath: string,
  lines: string[],
  options: WatermarkOptions,
  width: number,
  height: number,
  isVideo: boolean
): Promise<void> {
  // Create a temporary text file with the lines
  const textFile = inputPath + '.txt';
  fs.writeFileSync(textFile, lines.join('\n'), 'utf-8');

  const fontSize = options.fontSize || Math.round(width / 35);
  const margin = 20;
  const x = margin;
  const y = `h - (text_h + ${margin})`;

  // Use textfile to read from file (handles newlines correctly)
  const cmd =
    `ffmpeg -i "${inputPath}" ` +
    `-vf "drawtext=textfile='${textFile}':fontcolor=white:box=1:boxcolor=black@0.8:boxborderw=10:fontsize=${fontSize}:x=${x}:y=${y}:line_spacing=10" ` +
    (isVideo ? '-c:a copy ' : '-frames:v 1 ') +
    `"${outputPath}" -y`;

  console.log(`🎬 Running ffmpeg with textfile`);

  try {
    await execAsync(cmd);
    console.log(`✅ Watermark applied successfully`);
  } catch (err) {
    console.error('❌ ffmpeg failed, copying original:', err);
    fs.copyFileSync(inputPath, outputPath);
  } finally {
    // Clean up temp file
    if (fs.existsSync(textFile)) fs.unlinkSync(textFile);
  }
}

async function applyImageWatermark(
  inputPath: string,
  outputPath: string,
  metadata: any,
  options: WatermarkOptions,
  hash: string
): Promise<void> {
  console.log('🖼️ Applying image watermark with ffmpeg textfile...');

  const dims = await getDimensions(inputPath);
  console.log(`📐 Image dimensions: ${dims.width}x${dims.height}`);

  const now = metadata.takenAt || new Date();
  const formattedTime = formatLocalTime(now);

  const lines: string[] = [
    options.customText || 'Future Jobs Pro AI',
    formattedTime,
  ];
  if (metadata.address && metadata.address !== 'No location') {
    lines.push(metadata.address);
  }
  if (metadata.weather && metadata.weather !== 'Weather unavailable') {
    lines.push(`Weather: ${metadata.weather}`);
  }
  if (metadata.latitude && metadata.longitude) {
    const latDir = metadata.latitude >= 0 ? 'N' : 'S';
    const lngDir = metadata.longitude >= 0 ? 'E' : 'W';
    lines.push(`${Math.abs(metadata.latitude).toFixed(6)}°${latDir}, ${Math.abs(metadata.longitude).toFixed(6)}°${lngDir}`);
  }
  lines.push(`Verified: ${hash}`);

  await applyWatermarkWithFfmpeg(inputPath, outputPath, lines, options, dims.width, dims.height, false);
}

async function applyVideoWatermark(
  inputPath: string,
  outputPath: string,
  metadata: any,
  options: WatermarkOptions,
  hash: string
): Promise<void> {
  console.log('🎬 Applying video watermark with ffmpeg textfile...');

  const dims = await getDimensions(inputPath);
  console.log(`📐 Video dimensions: ${dims.width}x${dims.height}`);

  const now = metadata.takenAt || new Date();
  const formattedTime = formatLocalTime(now);

  const lines: string[] = [
    options.customText || 'Future Jobs Pro AI',
    formattedTime,
  ];
  if (metadata.address && metadata.address !== 'No location') {
    lines.push(metadata.address);
  }
  if (metadata.weather && metadata.weather !== 'Weather unavailable') {
    lines.push(`Weather: ${metadata.weather}`);
  }
  if (metadata.latitude && metadata.longitude) {
    const latDir = metadata.latitude >= 0 ? 'N' : 'S';
    const lngDir = metadata.longitude >= 0 ? 'E' : 'W';
    lines.push(`${Math.abs(metadata.latitude).toFixed(6)}°${latDir}, ${Math.abs(metadata.longitude).toFixed(6)}°${lngDir}`);
  }
  lines.push(`Verified: ${hash}`);

  await applyWatermarkWithFfmpeg(inputPath, outputPath, lines, options, dims.width, dims.height, true);
}

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

console.log('🖼️ Watermark Service loaded – ffmpeg textfile, local timezone, professional box');