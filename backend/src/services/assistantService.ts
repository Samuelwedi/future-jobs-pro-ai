import { pool } from '../config/database';
import OpenAI from 'openai';

let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function askAssistant(question: string, userId: string, voiceMode: boolean = false): Promise<string> {
  // Try OpenAI first
  if (openai) {
    try {
      const context = await gatherContext(userId);
      const systemPrompt = voiceMode
        ? 'You are a helpful voice assistant for a field service management app. Answer concisely and clearly, as if speaking to the user. If the user asks you to perform an action (e.g., create shift, clock in), include a JSON action block in your response with type and parameters so the app can execute it.'
        : 'You are a helpful assistant for a field service management app. Use the provided context to answer the user\'s question concisely. If the context does not contain the answer, say you don\'t have that information.';

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Context:\n${context}\n\nQuestion: ${question}` }
        ],
        temperature: 0.3,
        max_tokens: 300,
      });
      return response.choices[0].message.content || 'I could not generate a response.';
    } catch (err) {
      console.error('OpenAI assistant error:', err);
      // fall back to rule‑based
    }
  }

  // Rule‑based fallback
  return await ruleBasedAnswer(question, userId);
}

async function gatherContext(userId: string): Promise<string> {
  const parts: string[] = [];

  // User pattern
  const pattern = await pool.query('SELECT * FROM user_behavior_patterns WHERE user_id = $1', [userId]);
  if (pattern.rows.length) {
    const p = pattern.rows[0];
    parts.push(`User patterns: avg clock-in ${p.avg_clock_in_time}, avg clock-out ${p.avg_clock_out_time}, common work days ${p.common_work_days}, avg shift duration ${p.avg_shift_duration_minutes} min.`);
  }

  // Recent time entries
  const timeRes = await pool.query(
    `SELECT te.*, pr.name as project_name FROM time_entries te
     JOIN projects pr ON te.project_id = pr.id
     WHERE te.user_id = $1 ORDER BY te.created_at DESC LIMIT 10`,
    [userId]
  );
  if (timeRes.rows.length) {
    parts.push('Recent time entries:');
    timeRes.rows.forEach(row => {
      parts.push(`- ${row.project_name}: ${row.clock_in} → ${row.clock_out || 'active'}`);
    });
  }

  // Active projects
  const projRes = await pool.query('SELECT name, status FROM projects WHERE status = $1', ['active']);
  if (projRes.rows.length) {
    parts.push('Active projects: ' + projRes.rows.map(r => r.name).join(', '));
  }

  return parts.join('\n');
}

async function ruleBasedAnswer(question: string, userId: string): Promise<string> {
  const q = question.toLowerCase();

  if (q.includes('hours') || q.includes('how many')) {
    const res = await pool.query(
      `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (clock_out - clock_in))/3600), 0) as total_hours
       FROM time_entries WHERE user_id = $1 AND clock_out IS NOT NULL`,
      [userId]
    );
    return `You have worked a total of ${parseFloat(res.rows[0].total_hours).toFixed(1)} hours.`;
  }

  if (q.includes('clock in') || q.includes('clocked in')) {
    const res = await pool.query(
      'SELECT clock_in, project_id FROM time_entries WHERE user_id = $1 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1',
      [userId]
    );
    if (res.rows.length) {
      return `You are currently clocked in since ${new Date(res.rows[0].clock_in).toLocaleString()}.`;
    }
    return 'You are not currently clocked in.';
  }

  if (q.includes('project') || q.includes('active')) {
    const res = await pool.query('SELECT name FROM projects WHERE status = $1', ['active']);
    const names = res.rows.map(r => r.name).join(', ');
    return names ? `Active projects: ${names}` : 'No active projects.';
  }

  if (q.includes('evidence') || q.includes('dispute')) {
    return 'You can generate a dispute evidence report from the Reports section. Would you like me to help with that?';
  }

  // AI pattern query
  const patRes = await pool.query('SELECT * FROM user_behavior_patterns WHERE user_id = $1', [userId]);
  if (patRes.rows.length) {
    const p = patRes.rows[0];
    if (q.includes('pattern') || q.includes('routine')) {
      return `Your average clock-in time is ${p.avg_clock_in_time} and you usually work on days ${p.common_work_days?.join(', ')}.`;
    }
  }

  return "I'm here to help with work‑related questions. Try asking about your hours, clock‑in status, or projects.";
}