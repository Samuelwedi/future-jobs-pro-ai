// ============================================================
// WATERMARK SERVICE – Future Jobs Pro AI
// Simple, bulletproof SVG with plain text (no stroke, no emoji)
// Uses OpenWeatherMap, plain hash
// ============================================================

import sharp from 'sharp';
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

// ---------- Escape XML (minimal) ----------
function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
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
// IMAGE WATERMARK – Simple SVG (no stroke, no emoji)
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

  const baseFontSize = opts.fontSize || Math.round(width / 30);
  const lineFontSize = Math.round(baseFontSize * 0.75);
  const smallFontSize = Math.round(lineFontSize * 0.85);

  const now = metadata.takenAt || new Date();
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Build lines WITHOUT emoji – plain text only
  const lines: string[] = [
    opts.customText,
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

  const lineHeight = 1.6;
  const textPadding = 20;
  const boxPadding = 18;

  // Estimate text width using max char count
  const maxChars = Math.max(...lines.map(l => l.length));
  const estimatedTextWidth = maxChars * (lineFontSize * 0.6);
  const totalTextHeight = lines.length * lineFontSize * lineHeight;

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

  // Build a simple SVG – no stroke, no fancy styles
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  // Shadow
  svg += `<rect x="${boxX+2}" y="${boxY+2}" width="${boxWidth}" height="${boxHeight}" rx="12" ry="12" fill="rgba(0,0,0,0.3)" />`;
  // Main box
  svg += `<rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" rx="12" ry="12" fill="rgba(0,0,0,0.85)" stroke="rgba(255,255,255,0.3)" stroke-width="2" />`;
  // Text – white, no stroke
  let textY = boxY + boxPadding + lineFontSize;
  for (const line of lines) {
    const fontSize = line === opts.customText ? baseFontSize : (line.startsWith('Verified:') ? smallFontSize : lineFontSize);
    const fontWeight = line === opts.customText ? 'bold' : 'normal';
    svg += `<text x="${boxX + boxPadding}" y="${textY}" font-size="${fontSize}" fill="white" font-family="sans-serif" font-weight="${fontWeight}">${escapeXml(line)}</text>`;
    textY += fontSize * lineHeight;
  }
  svg += '</svg>';

  // Log the SVG for debugging
  console.log('📝 SVG generated (first 200 chars):', svg.substring(0, 200) + '...');

  // Render SVG to PNG overlay
  const overlayPng = await sharp(Buffer.from(svg)).png().toBuffer();

  // Composite
  await sharp(inputPath)
    .composite([{ input: overlayPng, top: 0, left: 0 }])
    .toFile(outputPath);

  console.log(`✅ Image watermark applied: ${path.basename(outputPath)}`);
}

// ============================================================
// VIDEO WATERMARK – same simple SVG
// ============================================================
async function applyVideoWatermark(
  inputPath: string,
  outputPath: string,
  metadata: any,
  options: WatermarkOptions,
  hash: string
): Promise<void> {
  console.log('🎬 Applying video watermark');

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

  const opts = {
    customText: options.customText || 'Future Jobs Pro AI',
    position: options.position || 'bottom-left',
    fontSize: options.fontSize || 0,
  };

  const baseFontSize = opts.fontSize || Math.round(videoWidth / 35);
  const lineFontSize = Math.round(baseFontSize * 0.75);
  const smallFontSize = Math.round(lineFontSize * 0.85);

  const now = metadata.takenAt || new Date();
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const lines: string[] = [
    opts.customText,
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

  const lineHeight = 1.6;
  const textPadding = 20;
  const boxPadding = 18;

  const maxChars = Math.max(...lines.map(l => l.length));
  const estimatedTextWidth = maxChars * (lineFontSize * 0.6);
  const totalTextHeight = lines.length * lineFontSize * lineHeight;

  const boxWidth = estimatedTextWidth + boxPadding * 2;
  const boxHeight = totalTextHeight + boxPadding * 2;

  let boxX = textPadding;
  let boxY = videoHeight - boxHeight - textPadding; // bottom-left default
  if (opts.position === 'top-left') { boxY = textPadding; }
  else if (opts.position === 'top-right') { boxX = videoWidth - boxWidth - textPadding; boxY = textPadding; }
  else if (opts.position === 'bottom-right') { boxX = videoWidth - boxWidth - textPadding; boxY = videoHeight - boxHeight - textPadding; }

  let svg = `<svg width="${videoWidth}" height="${videoHeight}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect x="${boxX+2}" y="${boxY+2}" width="${boxWidth}" height="${boxHeight}" rx="12" ry="12" fill="rgba(0,0,0,0.3)" />`;
  svg += `<rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" rx="12" ry="12" fill="rgba(0,0,0,0.85)" stroke="rgba(255,255,255,0.3)" stroke-width="2" />`;
  let textY = boxY + boxPadding + lineFontSize;
  for (const line of lines) {
    const fontSize = line === opts.customText ? baseFontSize : (line.startsWith('Verified:') ? smallFontSize : lineFontSize);
    const fontWeight = line === opts.customText ? 'bold' : 'normal';
    svg += `<text x="${boxX + boxPadding}" y="${textY}" font-size="${fontSize}" fill="white" font-family="sans-serif" font-weight="${fontWeight}">${escapeXml(line)}</text>`;
    textY += fontSize * lineHeight;
  }
  svg += '</svg>';

  const pngPath = inputPath + '.watermark.png';
  await sharp(Buffer.from(svg)).png().toFile(pngPath);

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
// PDF REPORT (unchanged)
// ============================================================
export async function generateWatermarkedPDFReport(
  photos: Array<any>,
  outputPath: string,
  reportTitle = 'Job Site Photo Report',
  companyName = 'Future Jobs Pro AI'
): Promise<string> {
  // ... (unchanged, same as before)
  // I'll keep it brief – you can keep your existing implementation
  // This part is not the source of the issue.
  return outputPath; // Placeholder – your existing code is fine.
}

console.log('🖼️ Watermark Service loaded – simple SVG, no emoji, no stroke');