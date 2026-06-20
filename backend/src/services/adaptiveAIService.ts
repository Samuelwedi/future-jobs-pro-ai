// ============================================
// ADAPTIVE AI LEARNING SERVICE
// Learns each user's unique patterns and behaviors
// Created by: Samuel B.
// ============================================

import { pool } from '../config/database';
import OpenAI from 'openai';

// Only initialise OpenAI if a valid API key is present
let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} else {
  console.log('⚠️  OpenAI API key not set – advanced AI features are disabled.');
}

// Types
interface UserPattern {
  userId: string;
  avgClockInTime: string | null;
  avgClockOutTime: string | null;
  commonWorkDays: number[];
  avgShiftDurationMinutes: number | null;
  frequentLocations: LocationPattern[];
  preferredProjectTypes: string[];
  avgJobDurationMinutes: number | null;
  avgPhotoComplianceScore: number | null;
  commonPhotoIssues: string[];
  commonPhrases: string[];
  dataPointsCollected: number;
  patternStrength: number;
}

interface LocationPattern {
  latitude: number;
  longitude: number;
  address: string;
  frequency: number;
  lastVisited: Date;
}

interface AIEvent {
  userId: string;
  eventType: string;
  eventData: any;
  latitude?: number;
  longitude?: number;
  deviceInfo?: any;
  sessionId?: string;
}

// ============================================
// SELF-HEALING: Ensure table and columns exist
// ============================================
async function ensureBehaviorTableExists(): Promise<void> {
  try {
    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_behavior_patterns (
        user_id UUID PRIMARY KEY REFERENCES users(id),
        avg_clock_in_time TIME,
        avg_clock_out_time TIME,
        common_work_days INTEGER[],
        avg_shift_duration_minutes INTEGER,
        frequent_locations JSONB,
        preferred_project_types TEXT[],
        avg_job_duration_minutes INTEGER,
        avg_photo_compliance_score INTEGER,
        common_photo_issues TEXT[],
        common_phrases TEXT[],
        data_points_collected INTEGER DEFAULT 0,
        overall_pattern_strength INTEGER DEFAULT 0,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Add columns if they are missing (in case table existed without them)
    const columns = [
      'avg_clock_in_time', 'avg_clock_out_time', 'common_work_days',
      'avg_shift_duration_minutes', 'frequent_locations', 'preferred_project_types',
      'avg_job_duration_minutes', 'avg_photo_compliance_score', 'common_photo_issues',
      'common_phrases', 'data_points_collected', 'overall_pattern_strength'
    ];
    for (const col of columns) {
      let type = 'TEXT';
      if (col === 'avg_clock_in_time' || col === 'avg_clock_out_time') type = 'TIME';
      else if (col === 'common_work_days') type = 'INTEGER[]';
      else if (col === 'avg_shift_duration_minutes' || col === 'avg_job_duration_minutes' || col === 'avg_photo_compliance_score' || col === 'data_points_collected' || col === 'overall_pattern_strength') type = 'INTEGER';
      else if (col === 'frequent_locations') type = 'JSONB';
      else if (col === 'preferred_project_types' || col === 'common_photo_issues' || col === 'common_phrases') type = 'TEXT[]';
      await pool.query(`ALTER TABLE user_behavior_patterns ADD COLUMN IF NOT EXISTS ${col} ${type}`);
    }
    console.log('✅ user_behavior_patterns table verified');
  } catch (err) {
    console.error('❌ Failed to ensure behavior table:', err);
  }
}

// ============================================
// CORE FUNCTION: Record a user event (eyes & ears of AI)
// ============================================
export async function recordUserEvent(event: AIEvent): Promise<void> {
  console.log(`🧠 [Samuel B. AI] Recording event for user ${event.userId}: ${event.eventType}`);

  try {
    // 1. Insert raw event
    await pool.query(
      `INSERT INTO user_events (user_id, event_type, event_data, location_lat, location_lng, device_info, session_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        event.userId,
        event.eventType,
        JSON.stringify(event.eventData),
        event.latitude || null,
        event.longitude || null,
        event.deviceInfo ? JSON.stringify(event.deviceInfo) : null,
        event.sessionId || null
      ]
    );

    // 2. Ensure the behavior table exists before updating
    await ensureBehaviorTableExists();

    // 3. Update the user's behavior pattern
    await updateUserPatterns(event.userId);

    // 4. Generate proactive insights/suggestions
    await generateInsights(event.userId, event);

  } catch (error) {
    console.error('❌ Failed to record user event:', error);
  }
}

// ============================================
// Update the user's learned pattern
// ============================================
async function updateUserPatterns(userId: string): Promise<void> {
  console.log(`📊 [Samuel B. AI] Updating patterns for user ${userId}`);

  try {
    const eventsResult = await pool.query(
      `SELECT * FROM user_events WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId]
    );
    const events = eventsResult.rows;
    const eventCount = events.length;

    if (eventCount < 5) {
      console.log(`⚠️ Not enough data for user ${userId} (${eventCount} events)`);
      return;
    }

    const clockInEvents = events.filter(e => e.event_type === 'clock_in');
    const clockOutEvents = events.filter(e => e.event_type === 'clock_out');

    // Average clock‑in time
    let avgClockInTime: string | null = null;
    if (clockInEvents.length >= 3) {
      const minutes = clockInEvents.map(e => {
        const d = new Date(e.created_at);
        return d.getHours() * 60 + d.getMinutes();
      });
      const avg = Math.round(minutes.reduce((a,b) => a+b, 0) / minutes.length);
      avgClockInTime = `${String(Math.floor(avg/60)).padStart(2,'0')}:${String(avg%60).padStart(2,'0')}`;
    }

    // Average clock‑out time
    let avgClockOutTime: string | null = null;
    if (clockOutEvents.length >= 3) {
      const minutes = clockOutEvents.map(e => {
        const d = new Date(e.created_at);
        return d.getHours() * 60 + d.getMinutes();
      });
      const avg = Math.round(minutes.reduce((a,b) => a+b, 0) / minutes.length);
      avgClockOutTime = `${String(Math.floor(avg/60)).padStart(2,'0')}:${String(avg%60).padStart(2,'0')}`;
    }

    // Common work days
    const workDaysCount = [0,0,0,0,0,0,0];
    clockInEvents.forEach(e => {
      const day = new Date(e.created_at).getDay();
      workDaysCount[day]++;
    });
    const commonWorkDays: number[] = [];
    workDaysCount.forEach((count, day) => {
      if (count >= clockInEvents.length * 0.2) commonWorkDays.push(day);
    });

    // Average shift duration
    let avgShiftDuration: number | null = null;
    const durations: number[] = [];
    for (const ci of clockInEvents) {
      const co = clockOutEvents.find(e => e.session_id === ci.session_id && new Date(e.created_at) > new Date(ci.created_at));
      if (co) {
        durations.push((new Date(co.created_at).getTime() - new Date(ci.created_at).getTime()) / 60000);
      }
    }
    if (durations.length) avgShiftDuration = Math.round(durations.reduce((a,b) => a+b, 0) / durations.length);

    // Photo compliance patterns
    const photoEvents = events.filter(e => e.event_type === 'photo_taken');
    let avgPhotoComplianceScore: number | null = null;
    const photoIssuesMap: Record<string, number> = {};
    photoEvents.forEach(e => {
      if (e.event_data?.complianceScore) {
        const scores = photoEvents.map(ev => ev.event_data.complianceScore).filter(s => s);
        if (scores.length) avgPhotoComplianceScore = Math.round(scores.reduce((a,b) => a+b, 0) / scores.length);
      }
      if (e.event_data?.issues) {
        e.event_data.issues.forEach((issue: string) => {
          photoIssuesMap[issue] = (photoIssuesMap[issue] || 0) + 1;
        });
      }
    });
    const commonPhotoIssues = Object.entries(photoIssuesMap)
      .sort((a,b) => b[1]-a[1])
      .slice(0,3)
      .map(([issue]) => issue);

    // Voice note patterns
    const voiceEvents = events.filter(e => e.event_type === 'voice_note');
    const commonPhrases: string[] = [];
    if (voiceEvents.length) {
      const wordsMap: Record<string, number> = {};
      voiceEvents.forEach(e => {
        if (e.event_data?.transcript) {
          e.event_data.transcript.toLowerCase().split(/\s+/).forEach((w: string) => {
            if (w.length > 3) wordsMap[w] = (wordsMap[w] || 0) + 1;
          });
        }
      });
      Object.entries(wordsMap).sort((a,b) => b[1]-a[1]).slice(0,20).forEach(([w]) => commonPhrases.push(w));
    }

    // Frequent locations
    const locMap = new Map<string, { lat: number; lng: number; count: number; lastSeen: Date }>();
    events.forEach(e => {
      if (e.location_lat && e.location_lng) {
        const lat = parseFloat(e.location_lat);
        const lng = parseFloat(e.location_lng);
        if (isNaN(lat) || isNaN(lng)) return;
        const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
        const existing = locMap.get(key);
        if (existing) {
          existing.count++;
          if (new Date(e.created_at) > existing.lastSeen) existing.lastSeen = new Date(e.created_at);
        } else {
          locMap.set(key, { lat, lng, count: 1, lastSeen: new Date(e.created_at) });
        }
      }
    });
    const frequentLocations: LocationPattern[] = Array.from(locMap.entries())
      .sort((a,b) => b[1].count - a[1].count)
      .slice(0,5)
      .map(([_, data]) => ({
        latitude: data.lat,
        longitude: data.lng,
        address: '',
        frequency: data.count,
        lastVisited: data.lastSeen
      }));

    // Upsert pattern
    await pool.query(
      `INSERT INTO user_behavior_patterns (
        user_id, avg_clock_in_time, avg_clock_out_time, common_work_days,
        avg_shift_duration_minutes, frequent_locations, avg_photo_compliance_score,
        common_photo_issues, common_phrases, data_points_collected, overall_pattern_strength
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0)
      ON CONFLICT (user_id) DO UPDATE SET
        avg_clock_in_time = EXCLUDED.avg_clock_in_time,
        avg_clock_out_time = EXCLUDED.avg_clock_out_time,
        common_work_days = EXCLUDED.common_work_days,
        avg_shift_duration_minutes = EXCLUDED.avg_shift_duration_minutes,
        frequent_locations = EXCLUDED.frequent_locations,
        avg_photo_compliance_score = EXCLUDED.avg_photo_compliance_score,
        common_photo_issues = EXCLUDED.common_photo_issues,
        common_phrases = EXCLUDED.common_phrases,
        data_points_collected = EXCLUDED.data_points_collected,
        overall_pattern_strength = EXCLUDED.overall_pattern_strength,
        last_updated = NOW()`,
      [
        userId, avgClockInTime, avgClockOutTime, commonWorkDays,
        avgShiftDuration, JSON.stringify(frequentLocations), avgPhotoComplianceScore,
        commonPhotoIssues, commonPhrases, eventCount
      ]
    );

    console.log(`✅ [Samuel B. AI] Patterns updated for user ${userId} (${eventCount} data points)`);
  } catch (error) {
    console.error('❌ Failed to update patterns:', error);
  }
}

// ============================================
// Generate proactive AI suggestions
// ============================================
async function generateInsights(userId: string, latestEvent: AIEvent): Promise<void> {
  try {
    const patResult = await pool.query('SELECT * FROM user_behavior_patterns WHERE user_id = $1', [userId]);
    const pattern = patResult.rows[0];
    if (!pattern || pattern.data_points_collected < 10) return;

    const suggestions: any[] = [];

    // 1. Unusual clock‑in time
    if (pattern.avg_clock_in_time && latestEvent.eventType === 'clock_in') {
      const evTime = new Date(latestEvent.eventData.timestamp);
      const evMinutes = evTime.getHours()*60 + evTime.getMinutes();
      const [ah, am] = pattern.avg_clock_in_time.split(':').map(Number);
      const avgMinutes = ah*60 + am;
      const diff = Math.abs(evMinutes - avgMinutes);
      if (diff > 60) {
        suggestions.push({
          userId,
          suggestionType: 'anomaly',
          title: 'Unusual Clock‑In Time',
          description: `You clocked in ${evMinutes > avgMinutes ? 'later' : 'earlier'} than usual. Everything okay?`,
          priority: 'medium',
          actionData: { type: 'check_in_confirm' }
        });
      }
    }

    // 2. Reminder to clock out
    if (pattern.avg_clock_out_time && latestEvent.eventType === 'clock_in') {
      const [ah, am] = pattern.avg_clock_out_time.split(':').map(Number);
      const reminderTime = new Date();
      reminderTime.setHours(ah, am-15, 0);
      if (reminderTime > new Date()) {
        suggestions.push({
          userId,
          suggestionType: 'reminder',
          title: 'Don\'t Forget to Clock Out',
          description: `You usually finish around ${pattern.avg_clock_out_time}. I'll remind you.`,
          priority: 'low',
          actionData: { type: 'schedule_reminder', time: reminderTime.toISOString() }
        });
      }
    }

    // 3. Photo quality tip
    if (pattern.common_photo_issues?.length) {
      const topIssue = pattern.common_photo_issues[0];
      let tip = '';
      if (topIssue.includes('dark')) tip = 'Try using flash or move to better lighting.';
      else if (topIssue.includes('blur')) tip = 'Hold your phone steady or use both hands.';
      else if (topIssue.includes('far')) tip = 'Move closer to the work you\'re documenting.';
      if (tip) {
        suggestions.push({
          userId,
          suggestionType: 'tip',
          title: 'Photo Quality Tip',
          description: `I noticed your photos are sometimes ${topIssue}. ${tip}`,
          priority: 'low',
          actionData: { type: 'show_camera_tip', tip }
        });
      }
    }

    for (const s of suggestions) {
      await pool.query(
        `INSERT INTO ai_suggestions (user_id, suggestion_type, title, description, priority, action_data, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW()+INTERVAL'7 days')`,
        [s.userId, s.suggestionType, s.title, s.description, s.priority, JSON.stringify(s.actionData)]
      );
    }
    console.log(`💡 [Samuel B. AI] Generated ${suggestions.length} insights for user ${userId}`);
  } catch (error) {
    console.error('❌ Failed to generate insights:', error);
  }
}

// ============================================
// Public helpers (to be used later)
// ============================================
export async function getUserPattern(userId: string): Promise<UserPattern | null> {
  const result = await pool.query('SELECT * FROM user_behavior_patterns WHERE user_id=$1', [userId]);
  if (!result.rows.length) return null;
  const r = result.rows[0];
  return {
    userId: r.user_id,
    avgClockInTime: r.avg_clock_in_time,
    avgClockOutTime: r.avg_clock_out_time,
    commonWorkDays: r.common_work_days || [],
    avgShiftDurationMinutes: r.avg_shift_duration_minutes,
    frequentLocations: r.frequent_locations || [],
    preferredProjectTypes: r.preferred_project_types || [],
    avgJobDurationMinutes: r.avg_job_duration_minutes,
    avgPhotoComplianceScore: r.avg_photo_compliance_score,
    commonPhotoIssues: r.common_photo_issues || [],
    commonPhrases: r.common_phrases || [],
    dataPointsCollected: r.data_points_collected,
    patternStrength: r.overall_pattern_strength || 0
  };
}

export async function getPendingSuggestions(userId: string): Promise<any[]> {
  const res = await pool.query(
    `SELECT * FROM ai_suggestions WHERE user_id=$1 AND is_dismissed=false AND expires_at>NOW()
     ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, created_at DESC`,
    [userId]
  );
  return res.rows;
}

export async function dismissSuggestion(suggestionId: string): Promise<void> {
  await pool.query('UPDATE ai_suggestions SET is_dismissed=true WHERE id=$1', [suggestionId]);
}

// Record a human correction for a sync log
export async function recordSyncCorrection(syncLogId: string, correction: any): Promise<void> {
  await pool.query(
    `UPDATE sync_logs SET human_correction=$1, status='manual_override' WHERE id=$2`,
    [JSON.stringify(correction), syncLogId]
  );
  // In future, this will feed back into the AI model.
}

console.log('🧠 Adaptive AI Service loaded – Future Jobs Pro AI by Samuel B.');