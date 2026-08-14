import { pool } from "./pool.js";

export interface RoomSummary {
  id: number;
  name: string | null;
  is_dm: boolean;
  other_user_id: number | null;
  other_user_name: string | null;
  last_message_body: string | null;
  last_message_at: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: number;
  room_id: number;
  sender_id: number;
  sender_name: string;
  body: string;
  created_at: string;
}

export interface Colleague {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user";
}

export async function listRoomsForUser(userId: number): Promise<RoomSummary[]> {
  const { rows } = await pool.query<RoomSummary>(
    `SELECT
       r.id,
       r.name,
       r.is_dm,
       r.created_at,
       om.id AS other_user_id,
       om.name AS other_user_name,
       lm.body AS last_message_body,
       lm.created_at AS last_message_at
     FROM chat_rooms r
     JOIN chat_room_members rm ON rm.room_id = r.id AND rm.user_id = $1
     LEFT JOIN LATERAL (
       SELECT u.id, u.name
       FROM chat_room_members rm2
       JOIN users u ON u.id = rm2.user_id
       WHERE rm2.room_id = r.id AND rm2.user_id != $1
       LIMIT 1
     ) om ON r.is_dm
     LEFT JOIN LATERAL (
       SELECT body, created_at FROM chat_messages m WHERE m.room_id = r.id ORDER BY m.id DESC LIMIT 1
     ) lm ON true
     ORDER BY COALESCE(lm.created_at, r.created_at) DESC`,
    [userId]
  );
  return rows;
}

export async function createRoom(input: {
  name: string;
  memberIds: number[];
  createdBy: number;
}): Promise<RoomSummary> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: number; name: string | null; is_dm: boolean; created_at: string }>(
      `INSERT INTO chat_rooms (name, is_dm, created_by) VALUES ($1, false, $2) RETURNING id, name, is_dm, created_at`,
      [input.name, input.createdBy]
    );
    const room = rows[0];
    const memberIds = Array.from(new Set([...input.memberIds, input.createdBy]));
    for (const userId of memberIds) {
      await client.query(`INSERT INTO chat_room_members (room_id, user_id) VALUES ($1, $2)`, [room.id, userId]);
    }
    await client.query("COMMIT");
    return { ...room, other_user_id: null, other_user_name: null, last_message_body: null, last_message_at: null };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getOrCreateDmRoom(userA: number, userB: number): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `SELECT r.id
     FROM chat_rooms r
     JOIN chat_room_members m1 ON m1.room_id = r.id AND m1.user_id = $1
     JOIN chat_room_members m2 ON m2.room_id = r.id AND m2.user_id = $2
     WHERE r.is_dm = true
     LIMIT 1`,
    [userA, userB]
  );
  if (rows[0]) return rows[0].id;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: created } = await client.query<{ id: number }>(
      `INSERT INTO chat_rooms (is_dm, created_by) VALUES (true, $1) RETURNING id`,
      [userA]
    );
    const roomId = created[0].id;
    await client.query(`INSERT INTO chat_room_members (room_id, user_id) VALUES ($1, $2), ($1, $3)`, [
      roomId,
      userA,
      userB,
    ]);
    await client.query("COMMIT");
    return roomId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function isRoomMember(roomId: number, userId: number): Promise<boolean> {
  const { rowCount } = await pool.query(`SELECT 1 FROM chat_room_members WHERE room_id = $1 AND user_id = $2`, [
    roomId,
    userId,
  ]);
  return (rowCount ?? 0) > 0;
}

export async function getRoomMemberIds(roomId: number): Promise<number[]> {
  const { rows } = await pool.query<{ user_id: number }>(
    `SELECT user_id FROM chat_room_members WHERE room_id = $1`,
    [roomId]
  );
  return rows.map((r) => r.user_id);
}

export async function listMessages(roomId: number, limit = 50, before?: number): Promise<ChatMessage[]> {
  const { rows } = await pool.query<ChatMessage>(
    before
      ? `SELECT m.id, m.room_id, m.sender_id, u.name AS sender_name, m.body, m.created_at
         FROM chat_messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.room_id = $1 AND m.id < $3
         ORDER BY m.id DESC
         LIMIT $2`
      : `SELECT m.id, m.room_id, m.sender_id, u.name AS sender_name, m.body, m.created_at
         FROM chat_messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.room_id = $1
         ORDER BY m.id DESC
         LIMIT $2`,
    before ? [roomId, limit, before] : [roomId, limit]
  );
  return rows.reverse();
}

export async function insertMessage(roomId: number, senderId: number, body: string): Promise<ChatMessage> {
  const { rows } = await pool.query<ChatMessage>(
    `WITH inserted AS (
       INSERT INTO chat_messages (room_id, sender_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, room_id, sender_id, body, created_at
     )
     SELECT i.*, u.name AS sender_name
     FROM inserted i
     JOIN users u ON u.id = i.sender_id`,
    [roomId, senderId, body]
  );
  return rows[0];
}

export async function listColleagues(): Promise<Colleague[]> {
  const { rows } = await pool.query<Colleague>(`SELECT id, name, email, role FROM users ORDER BY name`);
  return rows;
}
