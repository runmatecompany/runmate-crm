import { pool } from "./pool.js";

export type WebProjectType = "website" | "landing_page";
export type WebProjectStatus = "planning" | "development" | "review" | "live";

export interface WebProjectRow {
  id: number;
  title: string;
  project_type: WebProjectType;
  client_id: number;
  client_name: string;
  status: WebProjectStatus;
  live_url: string | null;
  notes: string | null;
  assigned_to: number | null;
  assigned_to_name: string | null;
  created_by: number;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  last_actor_name: string | null;
  last_actor_at: string | null;
}

const WEB_PROJECT_SELECT = `
  SELECT
    p.id, p.title, p.project_type, p.client_id, c.company_name AS client_name,
    p.status, p.live_url, p.notes,
    p.assigned_to, au.name AS assigned_to_name,
    p.created_by, cu.name AS created_by_name,
    p.created_at, p.updated_at,
    ev.user_name AS last_actor_name, ev.created_at AS last_actor_at
  FROM web_projects p
  JOIN clients c ON c.id = p.client_id
  LEFT JOIN users au ON au.id = p.assigned_to
  JOIN users cu ON cu.id = p.created_by
  LEFT JOIN LATERAL (
    SELECT user_name, created_at FROM web_project_events
    WHERE web_project_id = p.id ORDER BY created_at DESC LIMIT 1
  ) ev ON true
`;

export async function listWebProjects(): Promise<WebProjectRow[]> {
  const { rows } = await pool.query<WebProjectRow>(
    `${WEB_PROJECT_SELECT}
     ORDER BY CASE p.status WHEN 'planning' THEN 0 WHEN 'development' THEN 1 WHEN 'review' THEN 2 ELSE 3 END,
              p.created_at DESC`
  );
  return rows;
}

export async function getWebProjectById(id: number): Promise<WebProjectRow | undefined> {
  const { rows } = await pool.query<WebProjectRow>(`${WEB_PROJECT_SELECT} WHERE p.id = $1`, [id]);
  return rows[0];
}

export interface CreateWebProjectInput {
  title: string;
  projectType: WebProjectType;
  clientId: number;
  liveUrl?: string;
  notes?: string;
  assignedTo?: number;
  createdBy: number;
}

export async function createWebProject(input: CreateWebProjectInput): Promise<WebProjectRow> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO web_projects (title, project_type, client_id, live_url, notes, assigned_to, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      input.title,
      input.projectType,
      input.clientId,
      input.liveUrl ?? null,
      input.notes ?? null,
      input.assignedTo ?? null,
      input.createdBy,
    ]
  );
  const created = await getWebProjectById(rows[0].id);
  return created!;
}

export async function getWebProjectByClientAndType(
  clientId: number,
  projectType: WebProjectType
): Promise<WebProjectRow | undefined> {
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM web_projects WHERE client_id = $1 AND project_type = $2 LIMIT 1`,
    [clientId, projectType]
  );
  if (!rows[0]) return undefined;
  return getWebProjectById(rows[0].id);
}

// Nincs kézi "+ Új projekt" az UI-n — a web_projects sorok automatikusan
// jönnek létre, amikor az onboardingban bejelölik a Weboldal készítés
// vagy Landing oldal készítés szolgáltatást (lásd
// db/clientOnboarding.ts upsertClientOnboarding). Idempotens: ha már van
// projekt ehhez az (ügyfél, típus) párhoz, nem hoz létre másikat, akkor
// sem, ha az meglévő már "Élesítve" állapotban van — újbóli, önálló
// projekthez (pl. egy második landing oldalhoz egy új kampányhoz) egyelőre
// nincs automatikus út, ez a jelenlegi hatókörön kívül esik.
export async function ensureWebProjectForService(
  clientId: number,
  projectType: WebProjectType,
  companyName: string,
  createdBy: number
): Promise<void> {
  const existing = await getWebProjectByClientAndType(clientId, projectType);
  if (existing) return;
  const title = `${companyName} — ${projectType === "website" ? "Weboldal" : "Landing oldal"}`;
  await createWebProject({ title, projectType, clientId, createdBy });
}

export interface UpdateWebProjectInput {
  title: string;
  projectType: WebProjectType;
  clientId: number;
  liveUrl?: string;
  notes?: string;
  assignedTo?: number;
}

export async function updateWebProject(id: number, input: UpdateWebProjectInput): Promise<WebProjectRow | undefined> {
  const { rowCount } = await pool.query(
    `UPDATE web_projects
     SET title = $2, project_type = $3, client_id = $4, live_url = $5, notes = $6, assigned_to = $7, updated_at = now()
     WHERE id = $1`,
    [id, input.title, input.projectType, input.clientId, input.liveUrl ?? null, input.notes ?? null, input.assignedTo ?? null]
  );
  if (!rowCount) return undefined;
  return getWebProjectById(id);
}

export async function updateWebProjectStatus(
  id: number,
  status: WebProjectStatus,
  actor?: { id: number; name: string }
): Promise<WebProjectRow | undefined> {
  const existing = await getWebProjectById(id);
  if (!existing) return undefined;

  await pool.query(`UPDATE web_projects SET status = $2, updated_at = now() WHERE id = $1`, [id, status]);
  await pool.query(
    `INSERT INTO web_project_events (web_project_id, user_id, user_name, from_status, to_status)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, actor?.id ?? null, actor?.name ?? null, existing.status, status]
  );

  return getWebProjectById(id);
}

export async function deleteWebProject(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM web_projects WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

export async function hasWebAccess(userId: number): Promise<boolean> {
  const { rowCount } = await pool.query(`SELECT 1 FROM web_access WHERE user_id = $1`, [userId]);
  return (rowCount ?? 0) > 0;
}

export async function grantWebAccess(userId: number, grantedBy: number): Promise<void> {
  await pool.query(`INSERT INTO web_access (user_id, granted_by) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`, [
    userId,
    grantedBy,
  ]);
}

export async function revokeWebAccess(userId: number): Promise<void> {
  await pool.query(`DELETE FROM web_access WHERE user_id = $1`, [userId]);
}
