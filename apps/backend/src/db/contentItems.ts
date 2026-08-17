import { pool } from "./pool.js";
import { logContentItemEvent } from "./contentItemEvents.js";

export type ContentStatus =
  | "script_writing"
  | "script_review"
  | "shoot_done"
  | "editing"
  | "edit_review"
  | "scheduling"
  | "published"
  | "planning"
  | "approval";

export type ContentType = "video" | "image_post";

// A videó a 7 fázisos state machine-t használja (script_writing ... published),
// a képes poszt az egyszerűsített 4 fázisosat — forgatás/vágás nem
// értelmezhető egy statikus képnél.
export const VIDEO_STATUSES: ContentStatus[] = [
  "script_writing",
  "script_review",
  "shoot_done",
  "editing",
  "edit_review",
  "scheduling",
  "published",
];
export const IMAGE_POST_STATUSES: ContentStatus[] = ["planning", "approval", "scheduling", "published"];

export type Platform = "instagram" | "tiktok" | "youtube" | "facebook";

export interface ContentItemRow {
  id: number;
  client_id: number;
  client_name: string;
  client_contact_name: string | null;
  client_email: string | null;
  client_approval_email: string | null;
  client_next_shoot_date: string | null;
  title: string;
  content_type: ContentType;
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
  last_actor_name: string | null;
  last_actor_at: string | null;
  payment_confirmed: boolean;
  created_at: string;
  updated_at: string;
}

// A last_actor_* a content_item_events legutóbbi sorából jön (LATERAL) —
// ki vitte tovább a feladatot utoljára, hogy egyben látszódjon a Feladatok
// modulban/kanban kártyán, ne kelljen külön lekérdezni előzményenként. A
// client_approval_email az onboarding-profilból jön: ha az ügyfélnél meg
// van adva külön jóváhagyó kapcsolattartó, a jóváhagyó emailek oda mennek
// a fő kapcsolattartói cím helyett (lásd lib/socialMedia/notify.ts).
const CONTENT_ITEM_SELECT = `
  SELECT
    ci.id, ci.client_id, cl.company_name AS client_name,
    cl.contact_name AS client_contact_name, cl.email AS client_email,
    op.approver_email AS client_approval_email,
    cl.next_shoot_date AS client_next_shoot_date,
    ci.title, ci.content_type, ci.platform, ci.status,
    ci.shoot_date, ci.script_content, ci.raw_media_url, ci.edited_media_url,
    ci.scheduled_publish_at, ci.published_at,
    ci.assigned_to, au.name AS assigned_to_name,
    lastev.user_name AS last_actor_name, lastev.created_at AS last_actor_at,
    ci.payment_confirmed,
    ci.created_at, ci.updated_at
  FROM content_items ci
  JOIN clients cl ON cl.id = ci.client_id
  LEFT JOIN client_onboarding_profiles op ON op.client_id = ci.client_id
  LEFT JOIN users au ON au.id = ci.assigned_to
  LEFT JOIN LATERAL (
    SELECT user_name, created_at FROM content_item_events
    WHERE content_item_id = ci.id ORDER BY created_at DESC LIMIT 1
  ) lastev ON true
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
  contentType: ContentType;
  platform: Platform;
  assignedTo?: number;
  shootDate?: Date | string;
}

// Videó "script_writing" ("Scriptre vár") állapotban indul, képes poszt
// "planning"-ban (nincs forgatás/vágás fázisa) — nincs többé külön
// forgatás-egyeztető előfázis, a forgatás dátumát vagy a Google Naptár
// szinkron adja meg létrehozáskor, vagy utólag kézzel szerkeszthető.
export async function createContentItem(input: CreateContentItemInput): Promise<ContentItemRow> {
  const initialStatus: ContentStatus = input.contentType === "video" ? "script_writing" : "planning";
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO content_items (client_id, title, content_type, platform, assigned_to, status, shoot_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [input.clientId, input.title, input.contentType, input.platform, input.assignedTo ?? null, initialStatus, input.shootDate ?? null]
  );
  const created = await getContentItemById(rows[0].id);
  return created!;
}

export async function confirmContentItemPayment(id: number): Promise<ContentItemRow | undefined> {
  const { rowCount } = await pool.query(`UPDATE content_items SET payment_confirmed = true, updated_at = now() WHERE id = $1`, [
    id,
  ]);
  if (!rowCount) return undefined;
  return getContentItemById(id);
}

export interface UpdateContentItemDetailsInput {
  title: string;
  platform: Platform;
  assignedTo?: number;
  scriptContent?: string;
  editedMediaUrl?: string;
  shootDate?: string;
}

// A cím/platform/felelős mellett ez szolgál a script szövegének, a vágott
// anyag linkjének és a forgatás dátumának szerkesztésére is — ezeket a
// mezőket a felhasználó folyamatosan írja/frissíti, mielőtt a
// send_script_for_approval / send_edit_for_approval akció "pillanatképet"
// (snapshot) készít belőlük.
export async function updateContentItemDetails(
  id: number,
  input: UpdateContentItemDetailsInput
): Promise<ContentItemRow | undefined> {
  const { rowCount } = await pool.query(
    `UPDATE content_items SET
       title = $2, platform = $3, assigned_to = $4,
       script_content = COALESCE($5, script_content),
       edited_media_url = COALESCE($6, edited_media_url),
       shoot_date = COALESCE($7, shoot_date),
       updated_at = now()
     WHERE id = $1`,
    [
      id,
      input.title,
      input.platform,
      input.assignedTo ?? null,
      input.scriptContent ?? null,
      input.editedMediaUrl ?? null,
      input.shootDate ?? null,
    ]
  );
  if (!rowCount) return undefined;
  return getContentItemById(id);
}

// Csak a képes poszt egyszerű, közvetlen státuszváltásához (nincs email-
// jóváhagyás/token, ellentétben a videó lib/socialMedia/transitions.ts
// állapotgépével) — a hívó fél (routes/contentItems.ts) ellenőrzi, hogy csak
// image_post típusú elemre és csak IMAGE_POST_STATUSES értékre hívható.
export async function updateContentItemStatus(
  id: number,
  status: ContentStatus,
  actor?: { id: number; name: string }
): Promise<ContentItemRow | undefined> {
  const existing = await getContentItemById(id);
  if (!existing) return undefined;
  const { rowCount } = await pool.query(`UPDATE content_items SET status = $2, updated_at = now() WHERE id = $1`, [
    id,
    status,
  ]);
  if (!rowCount) return undefined;
  await logContentItemEvent({
    contentItemId: id,
    userId: actor?.id ?? null,
    userName: actor?.name ?? null,
    fromStatus: existing.status,
    toStatus: status,
  });
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
