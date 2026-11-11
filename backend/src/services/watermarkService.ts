// ============================================================
// WATERMARK SERVICE – with video re‑encode to H.264
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

export interface WatermarkOptions {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  customText?: string;
  fontSize?: number;
}

export interface WatermarkResult {
  outputPath: string;
  verificationHash: string;
  applied: boolean;
}

// ---------- OpenWeatherMap ----------
async function fetchWeather(lat: number, lng: number): Promise<string> {
  const apiKey = process.env.OPENWEATHER_API_KEY?.trim();
  if (!apiKey) return 'Weather unavailable';
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&appid=${apiKey}`;
  try {
    const res = await fetch(url, {signal: AbortSignal.timeout(5000)});
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
    const res = await fetch(url, { headers: { 'User-Agent': 'Future Jobs Pro AI' }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return undefined;
    const data: any = await res.json();
    return data?.display_name?.split(',').slice(0, 3).join(',');
  } catch {
    return undefined;
  }
}

// Coordinates are recorded metadata, not independently verified location evidence.
function hasValidCoordinates(metadata: any): boolean {
  return typeof metadata.latitude === 'number' && Number.isFinite(metadata.latitude)
    && Math.abs(metadata.latitude) <= 90
    && typeof metadata.longitude === 'number' && Number.isFinite(metadata.longitude)
    && Math.abs(metadata.longitude) <= 180;
}

// ---------- Metadata checksum (not an authenticity proof) ----------
function generateVerificationHash(metadata: any): string {
  const data = JSON.stringify({
    lat: hasValidCoordinates(metadata) ? metadata.latitude : null,
    lng: hasValidCoordinates(metadata) ? metadata.longitude : null,
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
  if (!address && hasValidCoordinates(metadata)) {
    address = await getAddressFromCoords(metadata.latitude, metadata.longitude) || 'No location';
  }
  let weather = metadata.weather;
  if (!weather && hasValidCoordinates(metadata)) {
    weather = await fetchWeather(metadata.latitude, metadata.longitude);
  } else if (!weather) {
    weather = 'Weather unavailable';
  }

  const hash = generateVerificationHash({ ...metadata, address, weather, takenAt });
  const fullMeta = { ...metadata, address, weather, takenAt };

  const isVideo = ['.mp4', '.mov', '.avi', '.m4v', '.mkv'].includes(
    path.extname(inputPath).toLowerCase()
  );

  const applied = isVideo
    ? await applyVideoWatermark(inputPath, outputPath, fullMeta, options, hash)
    : await applyImageWatermark(inputPath, outputPath, fullMeta, options, hash);
  const actualPath = applied ? outputPath : inputPath;
  const stats = fs.statSync(actualPath);
  if (stats.size === 0) throw new Error('Evidence file is empty');
  return { outputPath: actualPath, verificationHash: hash, applied };
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
      const { stdout } = await execFileAsync('ffprobe', ['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0',inputPath], {timeout:15000, killSignal:'SIGKILL', maxBuffer:1024*1024});
      const dims = stdout.trim().split(',');
      if (dims.length === 2) {
        return { width: parseInt(dims[0], 10), height: parseInt(dims[1], 10) };
      }
    } catch (e) {
      console.warn('⚠️ ffprobe failed, using default 1280x720');
    }
    return { width: 1280, height: 720 };
  } else {
    const img = sharp(inputPath);
    const meta = await img.metadata();
    return { width: meta.width || 800, height: meta.height || 600 };
  }
}

// ============================================================
// Build text lines (plain labels)
// ============================================================
function buildTextLines(metadata: any, options: WatermarkOptions, hash: string): string[] {
  const now = metadata.takenAt || new Date();
  const formattedTime = formatLocalTime(now);
  const company = options.customText || 'Future Jobs Pro AI';
  const lines: string[] = [company, formattedTime];

  if (metadata.address && metadata.address !== 'No location') {
    const addr = metadata.address;
    if (addr.length > 40) {
      const parts = addr.split(',');
      if (parts.length >= 2) {
        lines.push(parts[0].trim());
        lines.push(parts.slice(1).join(',').trim());
      } else {
        const mid = Math.min(35, addr.length);
        let splitIdx = addr.lastIndexOf(' ', mid);
        if (splitIdx < 0) splitIdx = mid;
        lines.push(addr.substring(0, splitIdx));
        lines.push(addr.substring(splitIdx + 1));
      }
    } else {
      lines.push(addr);
    }
  }

  if (metadata.weather && metadata.weather !== 'Weather unavailable') {
    lines.push(`Weather: ${metadata.weather}`);
  } else {
    lines.push('Weather: Not available');
  }

  if (hasValidCoordinates(metadata)) {
    const latDir = metadata.latitude >= 0 ? 'N' : 'S';
    const lngDir = metadata.longitude >= 0 ? 'E' : 'W';
    const gps = `${Math.abs(metadata.latitude).toFixed(6)}°${latDir}, ${Math.abs(metadata.longitude).toFixed(6)}°${lngDir}`;
    lines.push(`Recorded GPS: ${gps}`);
  }

  lines.push(`Metadata checksum: ${hash}`);
  return lines;
}

// ============================================================
// BUILD FFMPEG COMMAND – with re‑encode to H.264/AAC
// ============================================================
async function buildDrawtextArgs(
  inputPath: string,
  outputPath: string,
  lines: string[],
  options: WatermarkOptions,
  width: number,
  height: number,
  isVideo: boolean
): Promise<string[]> {
  const fontSize = options.fontSize || Math.round(width / 35);
  const lineSpacing = Math.round(fontSize * 0.4);

  const text = lines.join('\n');
  const textFile = inputPath + '.text.txt';
  fs.writeFileSync(textFile, text, 'utf-8');

  const margin = 20;
  const x = margin;
  const y = `h - (text_h + ${margin})`;

  const filter = `drawtext=textfile='${textFile}':fontcolor=white:box=1:boxcolor=black@0.8:boxborderw=12:fontsize=${fontSize}:x=${x}:y=${y}:line_spacing=${lineSpacing}`;
  const args = ['-i', inputPath, '-vf', filter];
  if (isVideo) args.push('-c:v','libx264','-preset','fast','-crf','23','-c:a','aac','-b:a','128k','-movflags','+faststart');
  else args.push('-frames:v','1');
  args.push(outputPath, '-y');
  return args;
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
): Promise<boolean> {
  console.log('🖼️ Applying image watermark...');
  const textFile = inputPath + '.text.txt';
  try {
    const dims = await getDimensions(inputPath);
    const lines = buildTextLines(metadata, options, hash);
    const args = await buildDrawtextArgs(inputPath, outputPath, lines, options, dims.width, dims.height, false);
    await execFileAsync('ffmpeg', args, {timeout:300000, killSignal:'SIGKILL', maxBuffer:4*1024*1024});
    console.log(`✅ Image watermark applied: ${path.basename(outputPath)}`);
    return fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0;
  } catch (err) {
    console.error('❌ ffmpeg failed for image, preserving original:', err);
    return false;
  } finally {
    if (fs.existsSync(textFile)) fs.unlinkSync(textFile);
  }
}

// ============================================================
// VIDEO WATERMARK – with re‑encode and fallback
// ============================================================
async function applyVideoWatermark(
  inputPath: string,
  outputPath: string,
  metadata: any,
  options: WatermarkOptions,
  hash: string
): Promise<boolean> {
  console.log('🎬 Applying video watermark with re‑encode...');
  const inputStats = fs.statSync(inputPath);
  console.log(`📥 Input video size: ${(inputStats.size / 1024).toFixed(2)} KB`);

  const textFile = inputPath + '.text.txt';
  try {
    const dims = await getDimensions(inputPath);
    const lines = buildTextLines(metadata, options, hash);
    const args = await buildDrawtextArgs(inputPath, outputPath, lines, options, dims.width, dims.height, true);
    console.log('🎬 Running ffmpeg with H.264/AAC re‑encode...');
    await execFileAsync('ffmpeg', args, {timeout:300000, killSignal:'SIGKILL', maxBuffer:4*1024*1024});

    if (fs.existsSync(outputPath)) {
      const outStats = fs.statSync(outputPath);
      if (outStats.size < 5000) {
        console.warn(`⚠️ Output video too small (${outStats.size} bytes). Falling back to original.`);
        return false;
      } else {
        console.log(`✅ Video watermarked and re‑encoded: ${(outStats.size / 1024).toFixed(2)} KB`);
        return true;
      }
    } else {
      console.error('❌ Output file missing; preserving original.');
      return false;
    }
  } catch (err: any) {
    console.error('❌ ffmpeg failed for video:', err.message);
    console.log('🔄 Falling back to original video (no watermark).');
    return false;
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

console.log('🖼️ Watermark Service loaded – video re‑encode to H.264/AAC');
