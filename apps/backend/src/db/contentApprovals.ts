import { pool } from "./pool.js";

export type ApprovalType = "script" | "edit";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ContentApprovalRow {
  id: number;
  content_item_id: number;
  type: ApprovalType;
  version: number;
  token_hash: string;
  token_expires_at: string;
  snapshot: string;
  status: ApprovalStatus;
  decided_at: string | null;
  decided_by_name: string | null;
  feedback: string | null;
  sent_at: string;
}

export interface CreateApprovalInput {
  contentItemId: number;
  type: ApprovalType;
  version: number;
  snapshot: string;
  tokenHash: string;
  expiresAt: Date;
}

export async function createApproval(input: CreateApprovalInput): Promise<ContentApprovalRow> {
  const { rows } = await pool.query<ContentApprovalRow>(
    `INSERT INTO content_approvals (content_item_id, type, version, snapshot, token_hash, token_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [input.contentItemId, input.type, input.version, input.snapshot, input.tokenHash, input.expiresAt]
  );
  return rows[0];
}

export async function getApprovalByTokenHash(tokenHash: string): Promise<ContentApprovalRow | undefined> {
  const { rows } = await pool.query<ContentApprovalRow>(`SELECT * FROM content_approvals WHERE token_hash = $1`, [
    tokenHash,
  ]);
  return rows[0];
}

export async function getApprovalById(id: number): Promise<ContentApprovalRow | undefined> {
  const { rows } = await pool.query<ContentApprovalRow>(`SELECT * FROM content_approvals WHERE id = $1`, [id]);
  return rows[0];
}

export interface DecideApprovalInput {
  status: "approved" | "rejected";
  decidedByName: string;
  feedback?: string;
}

export async function markApprovalDecided(
  id: number,
  input: DecideApprovalInput
): Promise<ContentApprovalRow | undefined> {
  const { rowCount } = await pool.query(
    `UPDATE content_approvals
     SET status = $2, decided_at = now(), decided_by_name = $3, feedback = $4
     WHERE id = $1`,
    [id, input.status, input.decidedByName, input.feedback ?? null]
  );
  if (!rowCount) return undefined;
  return getApprovalById(id);
}

// Az állapotgép invariánsa szerint egy tartalomhoz egyszerre legfeljebb egy
// függő (pending) jóváhagyás tartozhat egy adott típusból (script/edit) —
// ez az, amit az approve_*/reject_* akciók eldöntenek.
export async function getPendingApproval(
  contentItemId: number,
  type: ApprovalType
): Promise<ContentApprovalRow | undefined> {
  const { rows } = await pool.query<ContentApprovalRow>(
    `SELECT * FROM content_approvals WHERE content_item_id = $1 AND type = $2 AND status = 'pending'
     ORDER BY id DESC LIMIT 1`,
    [contentItemId, type]
  );
  return rows[0];
}

export async function listApprovalsForItem(contentItemId: number): Promise<ContentApprovalRow[]> {
  const { rows } = await pool.query<ContentApprovalRow>(
    `SELECT * FROM content_approvals WHERE content_item_id = $1 ORDER BY id DESC`,
    [contentItemId]
  );
  return rows;
}

// A következő verziószám egy adott tartalom + típus (script/edit) párhoz —
// 1-től indul, minden újabb jóváhagyás-kéréssel eggyel nő.
export async function getNextApprovalVersion(contentItemId: number, type: ApprovalType): Promise<number> {
  const { rows } = await pool.query<{ max: number | null }>(
    `SELECT MAX(version) AS max FROM content_approvals WHERE content_item_id = $1 AND type = $2`,
    [contentItemId, type]
  );
  return (rows[0]?.max ?? 0) + 1;
}

// A "Jóváhagyásra vár" nézethez: minden még függő approval, a hozzá tartozó
// tartalom és ügyfél nevével együtt.
export interface PendingApprovalRow extends ContentApprovalRow {
  content_title: string;
  client_name: string;
}

export async function listPendingApprovals(assignedTo?: number): Promise<PendingApprovalRow[]> {
  if (assignedTo != null) {
    const { rows } = await pool.query<PendingApprovalRow>(
      `SELECT ca.*, ci.title AS content_title, cl.company_name AS client_name
       FROM content_approvals ca
       JOIN content_items ci ON ci.id = ca.content_item_id
       JOIN clients cl ON cl.id = ci.client_id
       WHERE ca.status = 'pending' AND ci.assigned_to = $1
       ORDER BY ca.sent_at ASC`,
      [assignedTo]
    );
    return rows;
  }
  const { rows } = await pool.query<PendingApprovalRow>(
    `SELECT ca.*, ci.title AS content_title, cl.company_name AS client_name
     FROM content_approvals ca
     JOIN content_items ci ON ci.id = ca.content_item_id
     JOIN clients cl ON cl.id = ci.client_id
     WHERE ca.status = 'pending'
     ORDER BY ca.sent_at ASC`
  );
  return rows;
}
