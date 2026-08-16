import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import OpenAI from 'openai';

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

type AiResult = {
  isWorkRelated: boolean;
  description: string;
  tags: string[];
  concerns: string[];
};

function client(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key && key !== 'your_openai_api_key_here' ? new OpenAI({ apiKey: key }) : null;
}

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

function parseJsonObject(value: string): any {
  const cleaned = value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Photo AI did not return JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function analyzeWithAI(imagePath: string, format: string): Promise<{ model: string; result: AiResult }> {
  const openai = client();
  if (!openai) throw new Error('OPENAI_API_KEY is not configured');
  const model = process.env.OPENAI_PHOTO_MODEL?.trim() || 'gpt-5.6';
  const encoded = await sharp(imagePath)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  const response = await openai.responses.create({
    model,
    input: [{
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: 'Analyze this job-site evidence photo. Return JSON only: {"isWorkRelated":boolean,"description":string,"tags":string[],"concerns":string[]}. Judge whether it visibly documents construction, repair, maintenance, inspection, delivery, or completed work. Do not infer facts that are not visible.',
        },
        {
          type: 'input_image',
          image_url: `data:image/jpeg;base64,${encoded.toString('base64')}`,
          detail: 'auto',
        },
      ],
    }],
  });
  const parsed = parseJsonObject(response.output_text || '');
  return {
    model,
    result: {
      isWorkRelated: parsed.isWorkRelated === true,
      description: String(parsed.description || '').slice(0, 1000),
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 20) : [],
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns.map(String).slice(0, 20) : [],
    },
  };
}

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

  let aiAnalyzed = false;
  let aiModel: string | null = null;
  let aiDescription: string | null = null;
  let aiTags: string[] = [];
  try {
    const ai = await analyzeWithAI(photoPath, metadata.format);
    aiAnalyzed = true;
    aiModel = ai.model;
    aiDescription = ai.result.description;
    aiTags = ai.result.tags;
    if (!ai.result.isWorkRelated) {
      score -= 25;
      issues.push('AI review could not confirm visible job-related evidence.');
      suggestions.push('Retake the photo with the work, equipment, damage, or completed result clearly framed.');
    }
    for (const concern of ai.result.concerns) issues.push(`AI observation: ${concern}`);
  } catch (error: any) {
    console.warn('Photo AI analysis unavailable; local quality checks were retained:', error.message);
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
    aiAnalyzed,
    aiModel,
    aiDescription,
    aiTags,
  };
}
