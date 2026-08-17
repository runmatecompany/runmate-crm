import { authFetch } from "./api";
import type { ContentItem } from "./socialMedia";

export interface ClientTaskSummary {
  client_id: number;
  client_name: string;
  monthly_video_target: number | null;
  monthly_post_target: number | null;
}

export interface TasksResult {
  clients: ClientTaskSummary[];
  items: ContentItem[];
  hasAccess: boolean;
}

export async function listTasks(token: string): Promise<TasksResult> {
  const res = await authFetch(token, "/tasks");
  return res.json();
}
