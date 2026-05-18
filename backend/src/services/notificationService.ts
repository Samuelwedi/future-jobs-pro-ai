// ============================================
// PUSH NOTIFICATION SERVICE
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { pool } from '../config/database';

const expo = new Expo();

// Send to a single user
export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: any
): Promise<void> {
  console.log(`🔔 [Samuel B.] Sending notification to user ${userId}: ${title}`);

  try {
    const result = await pool.query(
      `SELECT push_token FROM user_push_tokens WHERE user_id = $1`,
      [userId]
    );
    const tokens = result.rows.map((row) => row.push_token);

    if (tokens.length === 0) {
      console.log(`⚠️ No push tokens found for user ${userId}`);
      return;
    }

    const messages: ExpoPushMessage[] = [];
    for (const token of tokens) {
      if (!Expo.isExpoPushToken(token)) {
        console.error(`❌ Invalid token: ${token}`);
        continue;
      }
      messages.push({
        to: token,
        sound: 'default',
        title,
        body,
        data: { ...data, owner: 'Samuel B.' },
        priority: 'high',
      });
    }

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      console.log(`📤 Sent ${tickets.length} notifications`);
    }
  } catch (error) {
    console.error('❌ Failed to send notification:', error);
  }
}

// Send to all users in a company
export async function sendCompanyNotification(
  companyId: string,
  title: string,
  body: string,
  data?: any
): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT upt.push_token
       FROM user_push_tokens upt
       JOIN users u ON upt.user_id = u.id
       WHERE u.company_id = $1`,
      [companyId]
    );

    const messages: ExpoPushMessage[] = [];
    for (const row of result.rows) {
      if (Expo.isExpoPushToken(row.push_token)) {
        messages.push({
          to: row.push_token,
          sound: 'default',
          title,
          body,
          data: { ...data, owner: 'Samuel B.' },
          priority: 'high',
        });
      }
    }

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
    console.log(`📤 Sent company notification to ${messages.length} devices`);
  } catch (error) {
    console.error('❌ Failed to send company notification:', error);
  }
}

// Register a device token
export async function registerPushToken(
  userId: string,
  token: string,
  deviceType: string
): Promise<void> {
  try {
    const existing = await pool.query(
      `SELECT id FROM user_push_tokens WHERE push_token = $1`,
      [token]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE user_push_tokens SET last_used = NOW() WHERE push_token = $1`,
        [token]
      );
    } else {
      await pool.query(
        `INSERT INTO user_push_tokens (user_id, push_token, device_type)
         VALUES ($1, $2, $3)`,
        [userId, token, deviceType]
      );
    }
    console.log(`✅ Push token registered for user ${userId}`);
  } catch (error) {
    console.error('❌ Failed to register push token:', error);
  }
}

console.log('🔔 Notification Service loaded – Future Jobs Pro AI by Samuel B.');