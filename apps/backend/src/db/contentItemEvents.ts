import { pool } from "./pool.js";

export interface ContentItemEventRow {
  id: number;
  content_item_id: number;
  user_id: number | null;
  user_name: string | null;
  from_status: string | null;
  to_status: string;
  created_at: string;
}

export interface LogContentItemEventInput {
  contentItemId: number;
  userId: number | null;
  userName: string | null;
  fromStatus: string | null;
  toStatus: string;
}

export async function logContentItemEvent(input: LogContentItemEventInput): Promise<void> {
  await pool.query(
    `INSERT INTO content_item_events (content_item_id, user_id, user_name, from_status, to_status)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.contentItemId, input.userId, input.userName, input.fromStatus, input.toStatus]
  );
}

export async function listContentItemEvents(contentItemId: number): Promise<ContentItemEventRow[]> {
  const { rows } = await pool.query<ContentItemEventRow>(
    `SELECT id, content_item_id, user_id, user_name, from_status, to_status, created_at
     FROM content_item_events WHERE content_item_id = $1 ORDER BY created_at ASC`,
    [contentItemId]
  );
  return rows;
}
