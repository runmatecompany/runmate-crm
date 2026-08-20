import { authFetch } from "./api";

export type WebProjectType = "website" | "landing_page";
export type WebProjectStatus = "planning" | "development" | "review" | "live";

export interface WebProject {
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

export interface WebProjectsResult {
  projects: WebProject[];
  hasAccess: boolean;
}

export interface WebProjectInput {
  title: string;
  projectType: WebProjectType;
  clientId: number;
  liveUrl?: string;
  notes?: string;
  assignedTo?: number;
}

export async function listWebProjects(token: string): Promise<WebProjectsResult> {
  const res = await authFetch(token, "/web/projects");
  return res.json();
}

export async function updateWebProject(token: string, id: number, input: WebProjectInput): Promise<WebProject> {
  const res = await authFetch(token, `/web/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.project;
}

export async function updateWebProjectStatus(token: string, id: number, status: WebProjectStatus): Promise<WebProject> {
  const res = await authFetch(token, `/web/projects/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const data = await res.json();
  return data.project;
}

export async function deleteWebProject(token: string, id: number): Promise<void> {
  await authFetch(token, `/web/projects/${id}`, { method: "DELETE" });
}
