// ============================================
// AI VOICE NOTES SERVICE
// Transcribes voice notes and extracts structured data
// Created by: Samuel B.
// ============================================

import { pool } from '../config/database';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import { recordUserEvent } from './adaptiveAIService';

let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} else {
  console.log('⚠️  OpenAI API key not set – voice transcription is disabled.');
}

interface ExtractedData {
  actions: string[];
  parts: string[];
  measurements: { value: number; unit: string; context: string }[];
  issues: string[];
  nextSteps: string[];
  people: string[];
}

interface VoiceNoteResult {
  id?: string;
  transcript: string;
  structuredData: ExtractedData;
  clientSummary: string;
  tags: string[];
  duration: number;
}

// ============================================
// MAIN FUNCTIONS
// ============================================

/**
 * Process a voice note from an audio file (original – uses Whisper)
 */
export async function processVoiceNote(
  audioPath: string,
  userId: string,
  projectId: string,
  timeEntryId: string
): Promise<VoiceNoteResult> {
  console.log(`\n🎙️  [Samuel B. AI] Processing voice note: ${path.basename(audioPath)}`);

  const transcript = await transcribeAudio(audioPath);
  console.log(`📝 Transcript: "${transcript.substring(0, 100)}${transcript.length > 100 ? '...' : ''}"`);

  const extractedData = await extractStructuredData(transcript);
  const clientSummary = await generateClientSummary(transcript, extractedData);
  const tags = generateTags(transcript, extractedData);
  const duration = await getAudioDuration(audioPath);

  await recordUserEvent({
    userId,
    eventType: 'voice_note',
    eventData: { transcript, extractedData, duration }
  });

  // Persistence belongs to voiceRoutes so company ownership, media URL, and
  // project authorization are applied exactly once.
  return { transcript, structuredData: extractedData, clientSummary, tags, duration };
}

/**
 * NEW: Process a voice note from a transcript (no audio file – for Deepgram streaming)
 */
export async function processTranscriptOnly(
  transcript: string,
  userId: string,
  projectId: string,
  timeEntryId: string
): Promise<Omit<VoiceNoteResult, 'id'>> {
  console.log(`\n📝 [Samuel B. AI] Processing transcript-only: "${transcript.substring(0, 100)}..."`);

  const extractedData = await extractStructuredData(transcript);
  const clientSummary = await generateClientSummary(transcript, extractedData);
  const tags = generateTags(transcript, extractedData);
  const duration = 0; // no duration available from transcript

  await recordUserEvent({
    userId,
    eventType: 'voice_note',
    eventData: { transcript, extractedData, duration: 0, source: 'deepgram_stream' }
  });

  return {
    transcript,
    structuredData: extractedData,
    clientSummary,
    tags,
    duration,
  };
}

// ============================================
// TRANSCRIPTION (Whisper – kept as fallback)
// ============================================

export async function transcribeAudio(audioPath: string): Promise<string> {
  if (!openai) {
    throw new Error('OpenAI transcription is not configured');
  }
  try {
    const response = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || 'gpt-4o-mini-transcribe',
      language: 'en',
      response_format: 'text'
    });
    return response as string;
  } catch (error) {
    console.error('❌ Transcription error:', error);
    throw error;
  }
}

// ============================================
// STRUCTURED DATA EXTRACTION (GPT)
// ============================================

async function extractStructuredData(transcript: string): Promise<ExtractedData> {
  const defaultData: ExtractedData = {
    actions: [],
    parts: [],
    measurements: [],
    issues: [],
    nextSteps: [],
    people: []
  };

  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{
          role: 'user',
          content: `Extract from this field report: "${transcript}"\nReturn ONLY valid JSON with keys: actions, parts, measurements (array of {value, unit, context}), issues, nextSteps, people.`
        }],
        temperature: 0.1,
        max_tokens: 500
      });
      const content = response.choices[0].message.content;
      if (content) {
        const parsed = JSON.parse(content);
        for (const key of ['actions', 'parts', 'measurements', 'issues', 'nextSteps', 'people']) {
          if (!Array.isArray(parsed[key])) parsed[key] = [];
        }
        return parsed as ExtractedData;
      }
    } catch (error) {
      console.error('GPT extraction error:', error);
    }
  }
  return ruleBasedExtraction(transcript) || defaultData;
}

function ruleBasedExtraction(transcript: string): ExtractedData {
  const lower = transcript.toLowerCase();
  const data: ExtractedData = { actions: [], parts: [], measurements: [], issues: [], nextSteps: [], people: [] };

  const actionWords = ['replaced', 'changed', 'installed', 'fixed', 'repaired', 'tested', 'checked', 'cleaned', 'tightened'];
  actionWords.forEach(w => { if (lower.includes(w)) data.actions.push(w); });

  const partKeywords = ['valve', 'pipe', 'gasket', 'filter', 'coil', 'breaker', 'outlet', 'switch', 'motor', 'pump'];
  partKeywords.forEach(k => { if (lower.includes(k)) data.parts.push(k); });

  const measurePattern = /(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/g;
  let m;
  while ((m = measurePattern.exec(transcript)) !== null) {
    data.measurements.push({ value: parseFloat(m[1]), unit: m[2].toUpperCase(), context: '' });
  }

  const issueKeywords = ['corrosion', 'leak', 'broken', 'clogged', 'tripped', 'loose', 'damaged', 'worn', 'rust'];
  issueKeywords.forEach(k => { if (lower.includes(k)) data.issues.push(k); });

  if (lower.includes('need to') || lower.includes('order') || lower.includes('come back')) {
    data.nextSteps.push('Follow-up required');
  }
  if (lower.includes('client') || lower.includes('customer')) data.people.push('client');

  return data;
}

// ============================================
// CLIENT SUMMARY (GPT)
// ============================================

async function generateClientSummary(transcript: string, data: ExtractedData): Promise<string> {
  if (!openai) {
    return `Technician ${data.actions.slice(0,2).join(' and ')}. System is working properly.`;
  }
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: `Create a brief professional client summary (under 100 words) from: "${transcript}"` }],
      temperature: 0.3,
      max_tokens: 150
    });
    return response.choices[0].message.content || 'Service completed successfully.';
  } catch (error) {
    return 'Service completed. Technician notes available upon request.';
  }
}

// ============================================
// TAGS GENERATION
// ============================================

function generateTags(transcript: string, data: ExtractedData): string[] {
  const tags = new Set<string>();
  data.actions.forEach(a => a.split(' ').forEach(w => { if (w.length > 3) tags.add(w.toLowerCase()); }));
  data.parts.forEach(p => tags.add(p.toLowerCase()));
  data.issues.forEach(i => tags.add(i.toLowerCase()));
  const lower = transcript.toLowerCase();
  if (lower.includes('leak') || lower.includes('water')) tags.add('plumbing');
  if (lower.includes('electrical') || lower.includes('breaker')) tags.add('electrical');
  if (lower.includes('ac') || lower.includes('cooling')) tags.add('hvac');
  return Array.from(tags).slice(0, 20);
}

// ============================================
// AUDIO DURATION (for file‑based notes)
// ============================================

async function getAudioDuration(audioPath: string): Promise<number> {
  try {
    const stats = fs.statSync(audioPath);
    return Math.round((stats.size / (1024 * 1024)) * 60);
  } catch {
    return 30;
  }
}

// ============================================
// PUBLIC HELPERS (for other routes)
// ============================================

export async function getProjectVoiceNotes(projectId: string): Promise<any[]> {
  const result = await pool.query(
    `SELECT vn.*, u.first_name || ' ' || u.last_name as created_by
     FROM voice_notes vn JOIN users u ON vn.user_id = u.id
     WHERE vn.project_id = $1 ORDER BY vn.created_at DESC`,
    [projectId]
  );
  return result.rows;
}

console.log('🎙️  Voice Notes Service loaded – Future Jobs Pro AI by Samuel B.');
