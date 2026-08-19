import { pool } from "./pool.js";

export type ManualTaskStatus = "todo" | "in_progress" | "done";

export interface ManualTaskRow {
  id: number;
  title: string;
  description: string | null;
  client_id: number | null;
  client_name: string | null;
  assigned_to: number | null;
  assigned_to_name: string | null;
  created_by: number;
  created_by_name: string;
  status: ManualTaskStatus;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  last_actor_name: string | null;
  last_actor_at: string | null;
}

const MANUAL_TASK_SELECT = `
  SELECT
    t.id, t.title, t.description, t.client_id, c.company_name AS client_name,
    t.assigned_to, au.name AS assigned_to_name,
    t.created_by, cu.name AS created_by_name,
    t.status, t.due_date, t.created_at, t.updated_at,
    ev.user_name AS last_actor_name, ev.created_at AS last_actor_at
  FROM manual_tasks t
  LEFT JOIN clients c ON c.id = t.client_id
  LEFT JOIN users au ON au.id = t.assigned_to
  JOIN users cu ON cu.id = t.created_by
  LEFT JOIN LATERAL (
    SELECT user_name, created_at FROM manual_task_events
    WHERE manual_task_id = t.id ORDER BY created_at DESC LIMIT 1
  ) ev ON true
`;

export async function listManualTasks(): Promise<ManualTaskRow[]> {
  const { rows } = await pool.query<ManualTaskRow>(
    `${MANUAL_TASK_SELECT}
     ORDER BY CASE t.status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
              t.due_date ASC NULLS LAST, t.created_at DESC`
  );
  return rows;
}

export async function getManualTaskById(id: number): Promise<ManualTaskRow | undefined> {
  const { rows } = await pool.query<ManualTaskRow>(`${MANUAL_TASK_SELECT} WHERE t.id = $1`, [id]);
  return rows[0];
}

export interface CreateManualTaskInput {
  title: string;
  description?: string;
  clientId?: number;
  assignedTo?: number;
  dueDate?: string;
  createdBy: number;
}

export async function createManualTask(input: CreateManualTaskInput): Promise<ManualTaskRow> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO manual_tasks (title, description, client_id, assigned_to, created_by, due_date)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      input.title,
      input.description ?? null,
      input.clientId ?? null,
      input.assignedTo ?? null,
      input.createdBy,
      input.dueDate ?? null,
    ]
  );
  const created = await getManualTaskById(rows[0].id);
  return created!;
}

export interface UpdateManualTaskInput {
  title: string;
  description?: string;
  clientId?: number;
  assignedTo?: number;
  dueDate?: string;
}

export async function updateManualTask(
  id: number,
  input: UpdateManualTaskInput
): Promise<ManualTaskRow | undefined> {
  const { rowCount } = await pool.query(
    `UPDATE manual_tasks
     SET title = $2, description = $3, client_id = $4, assigned_to = $5, due_date = $6, updated_at = now()
     WHERE id = $1`,
    [id, input.title, input.description ?? null, input.clientId ?? null, input.assignedTo ?? null, input.dueDate ?? null]
  );
  if (!rowCount) return undefined;
  return getManualTaskById(id);
}

export async function updateManualTaskStatus(
  id: number,
  status: ManualTaskStatus,
  actor?: { id: number; name: string }
): Promise<ManualTaskRow | undefined> {
  const existing = await getManualTaskById(id);
  if (!existing) return undefined;

  await pool.query(`UPDATE manual_tasks SET status = $2, updated_at = now() WHERE id = $1`, [id, status]);
  await pool.query(
    `INSERT INTO manual_task_events (manual_task_id, user_id, user_name, from_status, to_status)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, actor?.id ?? null, actor?.name ?? null, existing.status, status]
  );

  return getManualTaskById(id);
}

export async function deleteManualTask(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM manual_tasks WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

export async function hasTasksAccess(userId: number): Promise<boolean> {
  const { rowCount } = await pool.query(`SELECT 1 FROM tasks_access WHERE user_id = $1`, [userId]);
  return (rowCount ?? 0) > 0;
}

export async function grantTasksAccess(userId: number, grantedBy: number): Promise<void> {
  await pool.query(`INSERT INTO tasks_access (user_id, granted_by) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`, [
    userId,
    grantedBy,
  ]);
}

export async function revokeTasksAccess(userId: number): Promise<void> {
  await pool.query(`DELETE FROM tasks_access WHERE user_id = $1`, [userId]);
}

export interface ClientTaskSummaryRow {
  client_id: number;
  client_name: string;
  monthly_video_target: number | null;
  monthly_post_target: number | null;
  service_clipping: boolean;
  service_short_videos: boolean;
  service_image_posts: boolean;
}

// A "kész ebben a hónapban" számot a frontend számolja a /content-items
// listából (published_at szerint szűrve) — itt csak az ügyfél + célszámok
// jönnek, hogy ne kelljen duplikálni a "melyik hónap" logikát backend- és
// frontend-oldalon is. A service_clipping=true ügyfeleknél ez a szám nem
// content_items-ekből jön, hanem külön, a Drive-mappából (lásd
// GET /clients/:id/clipping-progress) — a frontend ez alapján dönt, melyik
// forrást kérdezze le. Szándékosan MINDEN ügyfelet visszaad (nem csak a
// social media szolgáltatással rendelkezőket) — ugyanezt a listát
// használja a Feladatok oldal ügyfél-szűrő legördülője is, ahol egy
// tisztán web-ügyfélhez tartozó kézi feladatot is szűrni kell tudni; a
// frontend szűri le social-media-relevánsra csak a tartalom-áttekintés
// kártyák megjelenítésénél.
export async function listClientTaskSummaries(): Promise<ClientTaskSummaryRow[]> {
  const { rows } = await pool.query<ClientTaskSummaryRow>(
    `SELECT c.id AS client_id, c.company_name AS client_name,
            op.monthly_video_target, op.monthly_post_target,
            COALESCE(op.service_clipping, false) AS service_clipping,
            COALESCE(op.service_short_videos, false) AS service_short_videos,
            COALESCE(op.service_image_posts, false) AS service_image_posts
     FROM clients c
     LEFT JOIN client_onboarding_profiles op ON op.client_id = c.id
     ORDER BY c.company_name ASC`
  );
  return rows;
}
