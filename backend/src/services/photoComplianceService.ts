import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type PhotoMetadata = {
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  format: string;
  hasExif: boolean;
};

export type ComplianceCheckResult = {
  passed: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
  metadata: PhotoMetadata;
  verificationHash: string;
  aiAnalyzed: boolean;
  aiModel: string | null;
  aiDescription: string | null;
  aiTags: string[];
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function sharpness(imagePath: string): Promise<number> {
  const stats = await sharp(imagePath).greyscale().stats();
  const deviation = stats.channels[0]?.stdev || 0;
  return Math.min(1, deviation / 55);
}

async function brightness(imagePath: string): Promise<number> {
  const stats = await sharp(imagePath).removeAlpha().stats();
  const means = stats.channels.slice(0, 3).map((channel) => channel.mean);
  return means.reduce((sum, value) => sum + value, 0) / Math.max(1, means.length) / 255;
}

// Keep evidence-photo assessment local. A configured provider or model is not
// authorization to send a photo. Any future external analysis needs a separately
// reviewed, photo-specific consent and server enforcement path.
export async function analyzePhotoCompliance(photoPath: string): Promise<ComplianceCheckResult> {
  const image = sharp(photoPath);
  const source = await image.metadata();
  const file = fs.statSync(photoPath);
  const metadata: PhotoMetadata = {
    fileName: path.basename(photoPath),
    fileSize: file.size,
    width: source.width || 0,
    height: source.height || 0,
    format: source.format || 'unknown',
    hasExif: Boolean(source.exif),
  };
  let score = 100;
  const issues: string[] = [];
  const suggestions: string[] = [];

  if (metadata.width < 1280 || metadata.height < 720) {
    score -= 20;
    issues.push(`Low resolution: ${metadata.width}×${metadata.height}`);
    suggestions.push('Capture at 1280×720 or higher, preferably 1920×1080.');
  }
  const focus = await sharpness(photoPath);
  if (focus < 0.45) {
    score -= Math.round((0.45 - focus) * 45);
    issues.push(`Limited image detail (quality signal ${Math.round(focus * 100)}%).`);
    suggestions.push('Steady the camera, clean the lens, and retake the photo in focus.');
  }
  const light = await brightness(photoPath);
  if (light < 0.18) {
    score -= 25;
    issues.push(`Image is too dark (${Math.round(light * 100)}% brightness).`);
    suggestions.push('Add light or enable flash while keeping the work area visible.');
  } else if (light > 0.92) {
    score -= 15;
    issues.push(`Image is overexposed (${Math.round(light * 100)}% brightness).`);
    suggestions.push('Reduce exposure or move away from direct glare.');
  }

  const verificationHash = crypto
    .createHash('sha256')
    .update(fs.readFileSync(photoPath))
    .update(JSON.stringify(metadata))
    .digest('hex');
  const finalScore = clamp(score);
  return {
    passed: finalScore >= 70,
    score: finalScore,
    issues,
    suggestions,
    metadata,
    verificationHash,
    aiAnalyzed: false,
    aiModel: null,
    aiDescription: null,
    aiTags: [],
  };
}
