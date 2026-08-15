import { pool } from "./pool.js";

export type ContentStatus =
  | "shoot_pending"
  | "shoot_scheduled"
  | "script_writing"
  | "script_review"
  | "shoot_done"
  | "editing"
  | "edit_review"
  | "scheduling"
  | "published";

export type Platform = "instagram" | "tiktok" | "youtube" | "facebook";

export interface ContentItemRow {
  id: number;
  client_id: number;
  client_name: string;
  client_contact_name: string | null;
  client_email: string | null;
  client_next_shoot_date: string | null;
  title: string;
  platform: Platform;
  status: ContentStatus;
  shoot_date: string | null;
  script_content: string | null;
  raw_media_url: string | null;
  edited_media_url: string | null;
  scheduled_publish_at: string | null;
  published_at: string | null;
  assigned_to: number | null;
  assigned_to_name: string | null;
  created_at: string;
  updated_at: string;
}

const CONTENT_ITEM_SELECT = `
  SELECT
    ci.id, ci.client_id, cl.company_name AS client_name,
    cl.contact_name AS client_contact_name, cl.email AS client_email,
    cl.next_shoot_date AS client_next_shoot_date,
    ci.title, ci.platform, ci.status,
    ci.shoot_date, ci.script_content, ci.raw_media_url, ci.edited_media_url,
    ci.scheduled_publish_at, ci.published_at,
    ci.assigned_to, au.name AS assigned_to_name,
    ci.created_at, ci.updated_at
  FROM content_items ci
  JOIN clients cl ON cl.id = ci.client_id
  LEFT JOIN users au ON au.id = ci.assigned_to
`;

export interface ListContentItemsFilter {
  assignedTo?: number;
}

export async function listContentItems(filter: ListContentItemsFilter = {}): Promise<ContentItemRow[]> {
  if (filter.assignedTo != null) {
    const { rows } = await pool.query<ContentItemRow>(
      `${CONTENT_ITEM_SELECT} WHERE ci.assigned_to = $1 ORDER BY ci.updated_at DESC`,
      [filter.assignedTo]
    );
    return rows;
  }
  const { rows } = await pool.query<ContentItemRow>(`${CONTENT_ITEM_SELECT} ORDER BY ci.updated_at DESC`);
  return rows;
}

export async function getContentItemById(id: number): Promise<ContentItemRow | undefined> {
  const { rows } = await pool.query<ContentItemRow>(`${CONTENT_ITEM_SELECT} WHERE ci.id = $1`, [id]);
  return rows[0];
}

export interface CreateContentItemInput {
  clientId: number;
  title: string;
  platform: Platform;
  assignedTo?: number;
}

export async function createContentItem(input: CreateContentItemInput): Promise<ContentItemRow> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO content_items (client_id, title, platform, assigned_to)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [input.clientId, input.title, input.platform, input.assignedTo ?? null]
  );
  const created = await getContentItemById(rows[0].id);
  return created!;
}

export interface UpdateContentItemDetailsInput {
  title: string;
  platform: Platform;
  assignedTo?: number;
  scriptContent?: string;
  editedMediaUrl?: string;
}

// A cím/platform/felelős mellett ez szolgál a script szövegének és a vágott
// anyag linkjének szerkesztésére is — ezeket a mezőket a felhasználó
// folyamatosan írja/frissíti, mielőtt a send_script_for_approval /
// send_edit_for_approval akció "pillanatképet" (snapshot) készít belőlük.
export async function updateContentItemDetails(
  id: number,
  input: UpdateContentItemDetailsInput
): Promise<ContentItemRow | undefined> {
  const { rowCount } = await pool.query(
    `UPDATE content_items SET
       title = $2, platform = $3, assigned_to = $4,
       script_content = COALESCE($5, script_content),
       edited_media_url = COALESCE($6, edited_media_url),
       updated_at = now()
     WHERE id = $1`,
    [id, input.title, input.platform, input.assignedTo ?? null, input.scriptContent ?? null, input.editedMediaUrl ?? null]
  );
  if (!rowCount) return undefined;
  return getContentItemById(id);
}

export async function deleteContentItem(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM content_items WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

// A teljes "Social Media" modulhoz való hozzáférés — modul-szintű, mint a
// Leadeknél/Ügyfeleknél. Az, hogy egy nem-admin kolléga MELYIK content_items
// sorokat látja, az assigned_to alapján dől el (lásd routes/contentItems.ts).
export async function hasSocialMediaAccess(userId: number): Promise<boolean> {
  const { rowCount } = await pool.query(`SELECT 1 FROM social_media_access WHERE user_id = $1`, [userId]);
  return (rowCount ?? 0) > 0;
}

export async function grantSocialMediaAccess(userId: number, grantedBy: number): Promise<void> {
  await pool.query(
    `INSERT INTO social_media_access (user_id, granted_by) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
    [userId, grantedBy]
  );
}

export async function revokeSocialMediaAccess(userId: number): Promise<void> {
  await pool.query(`DELETE FROM social_media_access WHERE user_id = $1`, [userId]);
}
