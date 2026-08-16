import { pool } from "./pool.js";

export type DraftType = "script" | "caption" | "image_concept" | "carousel";

export interface ContentDraftRow {
  id: number;
  client_id: number;
  client_name: string;
  type: DraftType;
  platform: string;
  title: string;
  topic: string | null;
  content_text: string | null;
  drive_file_id: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

const CONTENT_DRAFT_SELECT = `
  SELECT
    d.id, d.client_id, cl.company_name AS client_name,
    d.type, d.platform, d.title, d.topic, d.content_text, d.drive_file_id,
    d.created_by, cu.name AS created_by_name,
    d.created_at, d.updated_at
  FROM content_drafts d
  JOIN clients cl ON cl.id = d.client_id
  LEFT JOIN users cu ON cu.id = d.created_by
`;

export async function listContentDrafts(clientId?: number): Promise<ContentDraftRow[]> {
  if (clientId != null) {
    const { rows } = await pool.query<ContentDraftRow>(
      `${CONTENT_DRAFT_SELECT} WHERE d.client_id = $1 ORDER BY d.updated_at DESC`,
      [clientId]
    );
    return rows;
  }
  const { rows } = await pool.query<ContentDraftRow>(`${CONTENT_DRAFT_SELECT} ORDER BY d.updated_at DESC`);
  return rows;
}

export async function getContentDraftById(id: number): Promise<ContentDraftRow | undefined> {
  const { rows } = await pool.query<ContentDraftRow>(`${CONTENT_DRAFT_SELECT} WHERE d.id = $1`, [id]);
  return rows[0];
}

export interface CreateContentDraftInput {
  clientId: number;
  type: DraftType;
  platform: string;
  title: string;
  topic?: string;
  createdBy: number;
}

export async function createContentDraft(input: CreateContentDraftInput): Promise<ContentDraftRow> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO content_drafts (client_id, type, platform, title, topic, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [input.clientId, input.type, input.platform, input.title, input.topic ?? null, input.createdBy]
  );
  return (await getContentDraftById(rows[0].id))!;
}

export interface UpdateContentDraftInput {
  title: string;
  topic?: string;
  contentText?: string;
}

export async function updateContentDraft(
  id: number,
  input: UpdateContentDraftInput
): Promise<ContentDraftRow | undefined> {
  const { rowCount } = await pool.query(
    `UPDATE content_drafts SET
       title = $2, topic = COALESCE($3, topic), content_text = COALESCE($4, content_text),
       updated_at = now()
     WHERE id = $1`,
    [id, input.title, input.topic ?? null, input.contentText ?? null]
  );
  if (!rowCount) return undefined;
  return getContentDraftById(id);
}

export async function setContentDraftText(id: number, contentText: string): Promise<ContentDraftRow> {
  await pool.query(`UPDATE content_drafts SET content_text = $2, updated_at = now() WHERE id = $1`, [id, contentText]);
  return (await getContentDraftById(id))!;
}

export async function setContentDraftDriveFile(id: number, driveFileId: string): Promise<ContentDraftRow> {
  await pool.query(`UPDATE content_drafts SET drive_file_id = $2, updated_at = now() WHERE id = $1`, [id, driveFileId]);
  return (await getContentDraftById(id))!;
}

export async function deleteContentDraft(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM content_drafts WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
