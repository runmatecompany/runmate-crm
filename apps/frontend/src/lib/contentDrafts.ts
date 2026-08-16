import { authFetch } from "./api";
import type { Platform } from "./socialMedia";

export type DraftType = "script" | "caption" | "image_concept" | "carousel";

export const DRAFT_TYPE_LABELS: Record<DraftType, string> = {
  script: "Script",
  caption: "Poszt-szöveg",
  image_concept: "Kép-koncepció",
  carousel: "Karusszel",
};

export interface ContentDraft {
  id: number;
  client_id: number;
  client_name: string;
  type: DraftType;
  platform: Platform;
  title: string;
  topic: string | null;
  content_text: string | null;
  drive_file_id: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export async function listContentDrafts(token: string, clientId?: number): Promise<ContentDraft[]> {
  const query = clientId ? `?clientId=${clientId}` : "";
  const res = await authFetch(token, `/content-drafts${query}`);
  const data = await res.json();
  return data.drafts;
}

export async function getContentDraft(token: string, id: number): Promise<ContentDraft> {
  const res = await authFetch(token, `/content-drafts/${id}`);
  const data = await res.json();
  return data.draft;
}

export interface CreateContentDraftInput {
  clientId: number;
  type: DraftType;
  platform: Platform;
  title: string;
  topic?: string;
}

export async function createContentDraft(token: string, input: CreateContentDraftInput): Promise<ContentDraft> {
  const res = await authFetch(token, "/content-drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.draft;
}

export interface UpdateContentDraftInput {
  title: string;
  topic?: string;
  contentText?: string;
}

export async function updateContentDraft(token: string, id: number, input: UpdateContentDraftInput): Promise<ContentDraft> {
  const res = await authFetch(token, `/content-drafts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.draft;
}

export async function deleteContentDraft(token: string, id: number): Promise<void> {
  await authFetch(token, `/content-drafts/${id}`, { method: "DELETE" });
}

export async function generateDraftContent(token: string, id: number, topic: string): Promise<string> {
  const res = await authFetch(token, `/content-drafts/${id}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
  });
  const data = await res.json();
  return data.contentText;
}

export async function saveDraftToDrive(token: string, id: number): Promise<{ draft: ContentDraft; driveLink: string }> {
  const res = await authFetch(token, `/content-drafts/${id}/save-to-drive`, { method: "POST" });
  return res.json();
}
