import { authFetch } from "./api";
import type { ContentItem } from "./socialMedia";

export interface ClientTaskSummary {
  client_id: number;
  client_name: string;
  monthly_video_target: number | null;
  monthly_post_target: number | null;
}

export type ManualTaskStatus = "todo" | "in_progress" | "done";

export interface ManualTask {
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

export interface TasksResult {
  clients: ClientTaskSummary[];
  items: ContentItem[];
  manualTasks: ManualTask[];
  hasAccess: boolean;
}

export interface ManualTaskInput {
  title: string;
  description?: string;
  clientId?: number;
  assignedTo?: number;
  dueDate?: string;
}

export async function listTasks(token: string): Promise<TasksResult> {
  const res = await authFetch(token, "/tasks");
  return res.json();
}

export async function createManualTask(token: string, input: ManualTaskInput): Promise<ManualTask> {
  const res = await authFetch(token, "/tasks/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.task;
}

export async function updateManualTask(token: string, id: number, input: ManualTaskInput): Promise<ManualTask> {
  const res = await authFetch(token, `/tasks/manual/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.task;
}

export async function updateManualTaskStatus(
  token: string,
  id: number,
  status: ManualTaskStatus
): Promise<ManualTask> {
  const res = await authFetch(token, `/tasks/manual/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const data = await res.json();
  return data.task;
}

export async function deleteManualTask(token: string, id: number): Promise<void> {
  await authFetch(token, `/tasks/manual/${id}`, { method: "DELETE" });
}
