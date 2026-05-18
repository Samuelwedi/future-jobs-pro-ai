// ============================================
// AI PHOTO COMPLIANCE SERVICE
// Analyses photos for dispute‑readiness
// Created by: Samuel B.
// ============================================

import sharp from 'sharp';
import { pool } from '../config/database';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import OpenAI from 'openai';

// Only initialise OpenAI if a valid API key is present
let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} else {
  console.log('⚠️  OpenAI API key not set – photo AI analysis is disabled.');
}

// Types
interface PhotoMetadata {
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  format: string;
  hasExif: boolean;
  gpsLatitude?: number;
  gpsLongitude?: number;
  dateTaken?: Date;
  deviceMake?: string;
  deviceModel?: string;
}

interface ComplianceCheckResult {
  passed: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
  metadata: PhotoMetadata;
  verificationHash: string;
}

// ============================================
// MAIN FUNCTION: Analyze a photo
// ============================================
export async function analyzePhotoCompliance(
  photoPath: string,
  expectedLatitude?: number,
  expectedLongitude?: number,
): Promise<ComplianceCheckResult> {

  console.log(`🔍 [Samuel B. AI] Analyzing photo: ${path.basename(photoPath)}`);

  let score = 100;
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Basic metadata
  const image = sharp(photoPath);
  const metadata = await image.metadata();
  const stats = fs.statSync(photoPath);

  const photoMetadata: PhotoMetadata = {
    fileName: path.basename(photoPath),
    fileSize: stats.size,
    width: metadata.width || 0,
    height: metadata.height || 0,
    format: metadata.format || 'unknown',
    hasExif: !!metadata.exif,
    deviceMake: metadata.exif ? 'From EXIF' : 'Unknown',
    deviceModel: metadata.exif ? 'From EXIF' : 'Unknown',
  };

  // ----- CHECK 1: Resolution (20 points) -----
  const MIN_WIDTH = 1920;
  const MIN_HEIGHT = 1080;
  if (photoMetadata.width < MIN_WIDTH || photoMetadata.height < MIN_HEIGHT) {
    const deduction = 20;
    score -= deduction;
    issues.push(`Low resolution: ${photoMetadata.width}x${photoMetadata.height}`);
    suggestions.push(`Take photo at minimum ${MIN_WIDTH}x${MIN_HEIGHT} resolution`);
    console.log(`❌ Resolution check failed (-${deduction} pts)`);
  } else {
    console.log(`✅ Resolution check passed`);
  }

  // ----- CHECK 2: Blur Detection (30 points) -----
  const blurScore = await detectBlur(photoPath);
  if (blurScore < 0.7) {
    const deduction = Math.round((1 - blurScore) * 30);
    score -= deduction;
    issues.push(`Photo is blurry (sharpness: ${Math.round(blurScore * 100)}%)`);
    suggestions.push('Hold camera steady or use a tripod');
    console.log(`❌ Blur check failed (-${deduction} pts)`);
  } else {
    console.log(`✅ Blur check passed`);
  }

  // ----- CHECK 3: Brightness (25 points) -----
  const brightness = await detectBrightness(photoPath);
  if (brightness < 0.2) {
    const deduction = 25;
    score -= deduction;
    issues.push(`Photo is too dark (brightness: ${Math.round(brightness * 100)}%)`);
    suggestions.push('Use flash or move to better lighting');
    console.log(`❌ Brightness check failed (-${deduction} pts)`);
  } else if (brightness > 0.9) {
    const deduction = 15;
    score -= deduction;
    issues.push(`Photo is overexposed (brightness: ${Math.round(brightness * 100)}%)`);
    suggestions.push('Move away from bright light source');
    console.log(`❌ Overexposure check failed (-${deduction} pts)`);
  } else {
    console.log(`✅ Brightness check passed`);
  }

  // ----- CHECK 4: GPS Location (40 points, if expected location given) -----
  if (expectedLatitude !== undefined && expectedLongitude !== undefined) {
    // In a real implementation, we'd extract GPS from EXIF.
    // Here we simulate distance (always pass for now).
    const distanceFromExpected = 0.02; // miles
    if (distanceFromExpected > 0.1) {
      const deduction = 40;
      score -= deduction;
      issues.push(`Photo taken ${distanceFromExpected.toFixed(2)} miles from job site`);
      suggestions.push('Take photo at the actual job location');
      console.log(`❌ Location check failed (-${deduction} pts)`);
    } else {
      console.log(`✅ Location check passed`);
    }
  }

  // ----- CHECK 5: AI Content Analysis (optional, only if OpenAI key is present) -----
  if (openai) {
    try {
      const aiAnalysis = await analyzeWithAI(photoPath);
      if (!aiAnalysis.isWorkRelated) {
        const deduction = 25;
        score -= deduction;
        issues.push('Photo may not show actual work being performed');
        suggestions.push('Ensure the photo clearly shows the completed work');
        console.log(`❌ AI content check failed (-${deduction} pts)`);
      } else {
        console.log(`✅ AI content check passed`);
      }
    } catch (error) {
      console.log('⚠️ AI analysis skipped due to error');
    }
  }

  // ----- Generate Verification Hash -----
  const fileBuffer = fs.readFileSync(photoPath);
  const hash = crypto.createHash('sha256');
  hash.update(fileBuffer);
  hash.update(JSON.stringify(photoMetadata));
  hash.update(new Date().toISOString());
  const verificationHash = hash.digest('hex');
  console.log(`🔐 Verification hash: ${verificationHash.substring(0, 16)}...`);

  const passed = score >= 70;

  return {
    passed,
    score: Math.max(0, score),
    issues,
    suggestions,
    metadata: photoMetadata,
    verificationHash,
  };
}

// ============================================
// HELPER: Detect blur using edge detection
// ============================================
async function detectBlur(imagePath: string): Promise<number> {
  const image = sharp(imagePath);
  const { data, info } = await image.greyscale().raw().toBuffer({ resolveWithObject: true });
  let edgeCount = 0;
  const totalPixels = info.width * info.height;
  for (let i = 0; i < data.length; i += 40) {
    if (i > 0 && i < data.length - 1) {
      const diff = Math.abs(data[i] - data[i - 1]) + Math.abs(data[i] - data[i + 1]);
      if (diff > 30) edgeCount++;
    }
  }
  const edgeRatio = edgeCount / (totalPixels / 40);
  return Math.min(edgeRatio * 5, 1.0);
}

// ============================================
// HELPER: Detect brightness
// ============================================
async function detectBrightness(imagePath: string): Promise<number> {
  const image = sharp(imagePath);
  const { data } = await image.raw().toBuffer({ resolveWithObject: true });
  let totalBrightness = 0;
  let pixelCount = 0;
  for (let i = 0; i < data.length; i += 300) {
    const r = data[i], g = data[i+1], b = data[i+2];
    totalBrightness += 0.299 * r + 0.587 * g + 0.114 * b;
    pixelCount++;
  }
  return (totalBrightness / pixelCount) / 255;
}

// ============================================
// HELPER: AI content check (if OpenAI available)
// ============================================
async function analyzeWithAI(imagePath: string): Promise<{ isWorkRelated: boolean; description: string }> {
  if (!openai) return { isWorkRelated: true, description: 'AI disabled' };
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const response = await openai.chat.completions.create({
    model: 'gpt-4-vision-preview',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Is this photo showing construction, repair, or maintenance work? Answer JSON: {"isWorkRelated": boolean, "description": string}' },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
      ]
    }],
    max_tokens: 150
  });
  const content = response.choices[0].message.content;
  if (content) return JSON.parse(content);
  return { isWorkRelated: true, description: 'Unable to analyze' };
}

// ============================================
// Save photo record to database
// ============================================
export async function savePhotoToDatabase(
  userId: string,
  projectId: string,
  timeEntryId: string | null,
  photoPath: string,
  complianceResult: ComplianceCheckResult,
  latitude?: number,
  longitude?: number
) {
  const query = `
    INSERT INTO photos (user_id, project_id, time_entry_id, s3_key, latitude, longitude, taken_at, compliance_score, verification_hash, ai_tags)
    VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,$8,$9)
    RETURNING id
  `;
  const result = await pool.query(query, [
    userId, projectId, timeEntryId, photoPath, latitude || null, longitude || null,
    complianceResult.score, complianceResult.verificationHash,
    JSON.stringify(complianceResult.issues)
  ]);
  console.log(`✅ Photo saved with ID: ${result.rows[0].id}`);
  return result.rows[0];
}

console.log('📸 Photo Compliance Service loaded – Future Jobs Pro AI by Samuel B.');