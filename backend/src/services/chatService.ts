import { pool } from '../config/database';

// ========== ROOMS ==========
export async function createDirectRoom(userId1: string, userId2: string) {
  // Check if a direct room already exists between these two users
  const existing = await pool.query(
    `SELECT cr.id FROM chat_rooms cr
     JOIN chat_room_members m1 ON cr.id = m1.room_id AND m1.user_id = $1
     JOIN chat_room_members m2 ON cr.id = m2.room_id AND m2.user_id = $2
     WHERE cr.is_group = false`,
    [userId1, userId2]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  // Create new direct room
  const companyRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId1]);
  const companyId = companyRes.rows[0].company_id;
  const room = await pool.query(
    `INSERT INTO chat_rooms (company_id, created_by, is_group) VALUES ($1, $2, false) RETURNING id`,
    [companyId, userId1]
  );
  const roomId = room.rows[0].id;
  await pool.query('INSERT INTO chat_room_members (room_id, user_id) VALUES ($1, $2), ($1, $3)', [roomId, userId1, userId2]);
  return roomId;
}

export async function createGroupRoom(name: string, creatorId: string, memberIds: string[]) {
  const companyRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [creatorId]);
  const companyId = companyRes.rows[0].company_id;
  const room = await pool.query(
    `INSERT INTO chat_rooms (company_id, name, created_by, is_group) VALUES ($1, $2, $3, true) RETURNING id`,
    [companyId, name, creatorId]
  );
  const roomId = room.rows[0].id;
  const allMembers = [creatorId, ...memberIds];
  for (const uid of allMembers) {
    await pool.query('INSERT INTO chat_room_members (room_id, user_id) VALUES ($1, $2)', [roomId, uid]);
  }
  return roomId;
}

export async function getUserRooms(userId: string) {
  const result = await pool.query(
    `SELECT cr.id, cr.name, cr.is_group, cr.created_at,
            (SELECT u.first_name || ' ' || u.last_name FROM users u
             JOIN chat_room_members m ON u.id = m.user_id
             WHERE m.room_id = cr.id AND u.id != $1 AND cr.is_group = false
             LIMIT 1) as other_user_name
     FROM chat_rooms cr
     JOIN chat_room_members crm ON cr.id = crm.room_id
     WHERE crm.user_id = $1
     ORDER BY cr.created_at DESC`,
    [userId]
  );
  return result.rows;
}

// ========== MESSAGES ==========
export async function saveMessage(
  senderId: string,
  roomId: string,
  message: string,
  companyId: string
) {
  const result = await pool.query(
    `WITH inserted AS (
       INSERT INTO chat_messages (sender_id, company_id, message, room_id)
       VALUES ($1, $2, $3, $4) RETURNING *
     ), touched AS (
       UPDATE chat_rooms SET updated_at = NOW() WHERE id = $4
     )
     SELECT inserted.*,
            TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS sender_name
     FROM inserted JOIN users u ON u.id = inserted.sender_id`,
    [senderId, companyId, message, roomId]
  );
  return result.rows[0];
}

export async function getRoomMessages(roomId: string, limit = 50) {
  const result = await pool.query(
    `SELECT cm.*, u.first_name, u.last_name
     FROM chat_messages cm
     JOIN users u ON cm.sender_id = u.id
     WHERE cm.room_id = $1
     ORDER BY cm.created_at DESC
     LIMIT $2`,
    [roomId, limit]
  );
  return result.rows.reverse();
}

export async function getRoomMembers(roomId: string) {
  const result = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.role
     FROM chat_room_members crm
     JOIN users u ON crm.user_id = u.id
     WHERE crm.room_id = $1`,
    [roomId]
  );
  return result.rows;
}
