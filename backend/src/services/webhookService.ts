// ============================================
// WEBHOOK SERVICE (Zapier Integration)
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import { pool } from '../config/database';
import crypto from 'crypto';

// Triggers that Zapier can subscribe to
const TRIGGERS: Record<string, (payload: any) => Promise<any>> = {
  'new_time_entry': async (payload) => {
    const result = await pool.query(
      `SELECT te.*, u.first_name, u.last_name, p.name as project_name
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       JOIN projects p ON te.project_id = p.id
       WHERE te.created_at > NOW() - INTERVAL '1 hour'
       ORDER BY te.created_at DESC LIMIT 10`
    );
    return result.rows;
  },
  'new_photo': async (payload) => {
    const result = await pool.query(
      `SELECT ph.*, u.first_name, u.last_name, p.name as project_name
       FROM photos ph
       JOIN users u ON ph.user_id = u.id
       JOIN projects p ON ph.project_id = p.id
       WHERE ph.created_at > NOW() - INTERVAL '1 hour'
       ORDER BY ph.created_at DESC LIMIT 10`
    );
    return result.rows;
  },
  'shift_created': async (payload) => {
    const result = await pool.query(
      `SELECT s.*, p.name as project_name
       FROM shifts s
       JOIN projects p ON s.project_id = p.id
       WHERE s.created_at > NOW() - INTERVAL '1 hour'
       ORDER BY s.created_at DESC LIMIT 10`
    );
    return result.rows;
  },
};

export async function handleIncomingWebhook(trigger: string, payload: any): Promise<any> {
  console.log(`📨 Webhook received: ${trigger}`);
  const handler = TRIGGERS[trigger];
  if (!handler) {
    throw new Error(`Unknown trigger: ${trigger}`);
  }
  return await handler(payload);
}

// Outgoing webhook – call a Zapier URL when an event happens in your app
export async function sendOutgoingWebhook(event: string, data: any, targetUrl: string): Promise<void> {
  try {
    await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, data, timestamp: new Date().toISOString() }),
    });
    console.log(`📤 Outgoing webhook sent: ${event}`);
  } catch (err) {
    console.error('Failed to send outgoing webhook:', err);
  }
}

console.log('🔗 Webhook Service loaded – Future Jobs Pro AI by Samuel B.');