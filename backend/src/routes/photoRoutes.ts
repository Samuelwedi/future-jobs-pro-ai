// ============================================
// PHOTO ROUTES (Cloudinary + Accurate Weather + Unit Toggle)
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import express, { Request, Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { analyzePhotoCompliance } from '../services/photoComplianceService';
import { recordUserEvent } from '../services/adaptiveAIService';
import { pool } from '../config/database';
import { applyWatermark, generateWatermarkedPDFReport, WatermarkTemplate } from '../services/watermarkService';
import { uploadPhoto } from '../services/cloudStorageService';
import { reverseGeocode } from '../services/geocodeService';

// ----- Weather Types -----
interface WeatherApiResponse {
  current_weather?: {
    temperature: number;
    weathercode: number;
    time: string;
  };
  hourly?: {
    time: string[];
    temperature_2m: number[];
    weathercode: number[];
  };
}

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `photo-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed!') as any, false);
  }
});

const router = express.Router();

// ==================== IMPROVED WEATHER FETCHER (with unit support) ====================

async function getWeather(lat: number, lng: number, unit: 'celsius' | 'fahrenheit' = 'celsius'): Promise<string | undefined> {
  try {
    const tempUnit = unit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current_weather=true&hourly=temperature_2m,weathercode` +
      `&temperature_unit=${tempUnit}&forecast_hours=2&timezone=auto`
    );
    const data = (await res.json()) as WeatherApiResponse;

    // Prefer hourly data for the current hour
    if (data?.hourly?.temperature_2m && data.hourly.temperature_2m.length > 0) {
      const now = new Date();
      const currentHour = now.toISOString().substring(0, 13) + ':00';
      const hourIndex = data.hourly.time.findIndex((t: string) => t === currentHour);
      const idx = hourIndex >= 0 ? hourIndex : 0;
      const temp = Math.round(data.hourly.temperature_2m[idx]);
      const code = data.hourly.weathercode?.[idx] ?? data.current_weather?.weathercode ?? 0;
      const condition = weatherCodeToText(code);
      const unitSymbol = unit === 'fahrenheit' ? '°F' : '°C';
      return `${condition}, ${temp}${unitSymbol}`;
    }

    // Fallback to current_weather
    if (data?.current_weather) {
      const temp = Math.round(data.current_weather.temperature);
      const code = data.current_weather.weathercode;
      const condition = weatherCodeToText(code);
      const unitSymbol = unit === 'fahrenheit' ? '°F' : '°C';
      return `${condition}, ${temp}${unitSymbol}`;
    }
  } catch (err) {
    console.warn('Weather fetch failed:', err);
  }
  return undefined;
}

function weatherCodeToText(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly Cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  if (code <= 86) return 'Snow Showers';
  return 'Thunderstorm';
}

// ==================== ROUTES ====================

// POST /api/photos/upload
router.post('/upload', upload.single('photo'), async (req: Request, res: Response) => {
  console.log('\n📸 ========== NEW PHOTO UPLOAD – Samuel B. ==========');
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No photo file provided' });

    const { userId, projectId, timeEntryId, latitude, longitude, template } = req.body;
    const originalPath = req.file.path;
    const watermarkedPath = originalPath.replace(/(\.\w+)$/, '-watermarked$1');

    // Fetch company logo
    let companyLogoPath: string | undefined;
    try {
      const userResult = await pool.query(
        `SELECT c.logo_url FROM users u JOIN companies c ON u.company_id = c.id WHERE u.id = $1`,
        [userId]
      );
      if (userResult.rows.length > 0) {
        const logoUrl = userResult.rows[0].logo_url;
        if (logoUrl) companyLogoPath = path.join(__dirname, '../../', logoUrl);
      }
    } catch (err) { console.warn('Could not fetch company logo:', err); }

    // Look up company temperature unit
    let tempUnit: 'celsius' | 'fahrenheit' = 'celsius';
    try {
      const companyResult = await pool.query(
        `SELECT c.temperature_unit FROM companies c
         JOIN users u ON u.company_id = c.id
         WHERE u.id = $1`,
        [userId]
      );
      if (companyResult.rows.length > 0) {
        tempUnit = companyResult.rows[0].temperature_unit || 'celsius';
      }
    } catch (err) { /* keep default */ }

    // Fetch address and weather with the correct unit
    let addressStr: string | undefined;
    let weatherStr: string | undefined;
    if (latitude && longitude) {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      [addressStr, weatherStr] = await Promise.all([
        reverseGeocode(lat, lng),
        getWeather(lat, lng, tempUnit),
      ]);
    }

    // Apply watermark
    await applyWatermark(originalPath, watermarkedPath, {
      latitude: latitude ? parseFloat(latitude) : undefined,
      longitude: longitude ? parseFloat(longitude) : undefined,
      weather: weatherStr,
      address: addressStr,
    }, {
      template: (template as WatermarkTemplate) || 'standard',
      logoPath: companyLogoPath,
      showLogo: !!companyLogoPath,
      showWeather: !!weatherStr,
      position: 'bottom-left',
    });

    // Upload to Cloudinary
    const cloudUrl = await uploadPhoto(watermarkedPath, `companies/${userId}/projects/${projectId}`);

    // Compliance analysis
    const complianceResult = await analyzePhotoCompliance(
      watermarkedPath,
      latitude ? parseFloat(latitude) : undefined,
      longitude ? parseFloat(longitude) : undefined
    );

    // Save to database
    const saveQuery = `
      INSERT INTO photos (user_id, project_id, time_entry_id, s3_key, latitude, longitude, taken_at, compliance_score, verification_hash, ai_tags)
      VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,$8,$9)
      RETURNING id
    `;
    const saveResult = await pool.query(saveQuery, [
      userId, projectId, timeEntryId || null, cloudUrl,
      latitude ? parseFloat(latitude) : null, longitude ? parseFloat(longitude) : null,
      complianceResult.score, complianceResult.verificationHash,
      complianceResult.issues
    ]);
    const photoId = saveResult.rows[0].id;

    // Record AI event
    await recordUserEvent({
      userId,
      eventType: 'photo_taken',
      eventData: { photoId, complianceScore: complianceResult.score, passed: complianceResult.passed, issues: complianceResult.issues },
      latitude: latitude ? parseFloat(latitude) : undefined,
      longitude: longitude ? parseFloat(longitude) : undefined,
    });

    // Clean up local files
    fs.unlink(originalPath, () => {});
    fs.unlink(watermarkedPath, () => {});

    res.json({
      success: true,
      photoId,
      compliance: {
        passed: complianceResult.passed,
        score: complianceResult.score,
        issues: complianceResult.issues,
        suggestions: complianceResult.suggestions,
      },
      metadata: complianceResult.metadata,
      verificationHash: complianceResult.verificationHash,
      cloudUrl,
      address: addressStr,
      weather: weatherStr,
      unit: tempUnit,
      message: complianceResult.passed ? '✅ Photo passed compliance check!' : '⚠️ Photo has issues that may affect dispute resolution',
    });
  } catch (error) {
    console.error('❌ Photo upload error:', error);
    res.status(500).json({ success: false, message: 'Failed to process photo' });
  }
});

// POST /api/photos/watermark
router.post('/watermark', upload.single('photo'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No photo file provided' });

    const options = req.body.options ? JSON.parse(req.body.options) : {};
    const metadata = {
      latitude: req.body.latitude ? parseFloat(req.body.latitude) : undefined,
      longitude: req.body.longitude ? parseFloat(req.body.longitude) : undefined,
      altitude: req.body.altitude ? parseFloat(req.body.altitude) : undefined,
      direction: req.body.direction ? parseFloat(req.body.direction) : undefined,
      weather: req.body.weather || undefined,
      projectName: req.body.projectName || undefined,
      clientName: req.body.clientName || undefined,
    };

    const watermarkedPath = req.file.path.replace(/(\.\w+)$/, '-watermarked$1');
    await applyWatermark(req.file.path, watermarkedPath, metadata, options);

    res.json({ success: true, watermarkedUrl: `/uploads/${path.basename(watermarkedPath)}` });
  } catch (error: any) {
    console.error('Watermark error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/photos/report
router.post('/report', async (req: Request, res: Response) => {
  try {
    const { photoIds, reportTitle } = req.body;

    const photoResult = await pool.query(
      `SELECT * FROM photos WHERE id = ANY($1::uuid[])`,
      [photoIds]
    );
    const photos = photoResult.rows;

    const watermarkedPhotos = [];
    for (const photo of photos) {
      const watermarkedPath = photo.s3_key.replace(/(\.\w+)$/, '-report$1');
      const lat = photo.latitude ? parseFloat(photo.latitude) : undefined;
      const lng = photo.longitude ? parseFloat(photo.longitude) : undefined;

      await applyWatermark(photo.s3_key, watermarkedPath, { latitude: lat, longitude: lng }, { template: 'detailed' });

      watermarkedPhotos.push({
        photoPath: watermarkedPath,
        takenAt: photo.taken_at,
        latitude: lat,
        longitude: lng,
        complianceScore: photo.compliance_score,
      });
    }

    const reportPath = path.join(uploadDir, `report-${Date.now()}.pdf`);
    await generateWatermarkedPDFReport(watermarkedPhotos, reportPath, reportTitle || 'Job Site Photo Report');

    res.json({ success: true, reportUrl: `/uploads/${path.basename(reportPath)}` });
  } catch (error: any) {
    console.error('Report error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/photos/report/:photoId
router.get('/report/:photoId', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.first_name || ' ' || u.last_name as user_name, pr.name as project_name
       FROM photos p
       JOIN users u ON p.user_id = u.id
       JOIN projects pr ON p.project_id = pr.id
       WHERE p.id = $1`,
      [req.params.photoId as string]
    );
    const photo = result.rows[0];
    if (!photo) return res.status(404).json({ success: false, message: 'Photo not found' });

    res.json({
      success: true,
      report: {
        photoId: photo.id,
        takenBy: photo.user_name,
        project: photo.project_name,
        takenAt: photo.taken_at,
        location: { latitude: photo.latitude, longitude: photo.longitude },
        complianceScore: photo.compliance_score,
        verificationHash: photo.verification_hash,
        isCompliant: photo.compliance_score >= 70,
        reportGeneratedBy: 'Samuel B. – Future Jobs Pro AI',
      },
    });
  } catch (error) {
    console.error('❌ Report error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate report' });
  }
});

// GET /api/photos/project/:projectId
router.get('/project/:projectId', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.first_name || ' ' || u.last_name as taken_by
       FROM photos p
       JOIN users u ON p.user_id = u.id
       WHERE p.project_id = $1
       ORDER BY p.taken_at DESC`,
      [req.params.projectId as string]
    );
    res.json({ success: true, count: result.rows.length, photos: result.rows });
  } catch (error) {
    console.error('Fetch photos error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch photos' });
  }
});

export default router;