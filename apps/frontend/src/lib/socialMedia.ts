import { authFetch } from "./api";

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

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  shoot_pending: "Forgatás egyeztetése",
  shoot_scheduled: "Forgatás dátuma rögzítve",
  script_writing: "Script írása",
  script_review: "Script jóváhagyásra várva",
  shoot_done: "Forgatás megtörtént",
  editing: "Vágás folyamatban",
  edit_review: "Vágás jóváhagyásra várva",
  scheduling: "Időzítés esedékes",
  published: "Közzétéve",
};

export const CONTENT_STATUS_ORDER: ContentStatus[] = [
  "shoot_pending",
  "shoot_scheduled",
  "script_writing",
  "script_review",
  "shoot_done",
  "editing",
  "edit_review",
  "scheduling",
  "published",
];

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
};

export interface ContentItem {
  id: number;
  client_id: number;
  client_name: string;
  client_contact_name: string | null;
  client_email: string | null;
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

export interface ContentItemFormInput {
  title: string;
  platform: Platform;
  assignedTo?: number;
  scriptContent?: string;
  editedMediaUrl?: string;
}

export interface ContentItemsListResult {
  items: ContentItem[];
  hasAccess: boolean;
}

export type TransitionAction =
  | "set_shoot_date"
  | "start_script"
  | "send_script_for_approval"
  | "approve_script"
  | "reject_script"
  | "upload_raw"
  | "send_edit_for_approval"
  | "approve_edit"
  | "reject_edit"
  | "schedule";

export interface TransitionPayload {
  shootDate?: string;
  rawMediaUrl?: string;
  scheduledPublishAt?: string;
  feedback?: string;
}

export interface Approval {
  id: number;
  content_item_id: number;
  type: "script" | "edit";
  version: number;
  snapshot: string;
  status: "pending" | "approved" | "rejected";
  decided_at: string | null;
  decided_by_name: string | null;
  feedback: string | null;
  sent_at: string;
}

// A kanban kártya és a részletes nézet ugyanezt használja, hogy mindig
// pontosan egyetlen érvényes következő lépés jelenjen meg — nincs szabadon
// húzható/választható átmenet.
export type CardAction =
  | { kind: "forward"; action: TransitionAction; label: string; input?: "shootDate" | "rawMediaUrl" | "scheduledPublishAt" }
  | { kind: "review"; approveAction: TransitionAction; rejectAction: TransitionAction }
  | { kind: "none" };

export function getCardAction(status: ContentStatus): CardAction {
  switch (status) {
    case "shoot_pending":
      return { kind: "forward", action: "set_shoot_date", label: "Forgatás dátumának rögzítése", input: "shootDate" };
    case "shoot_scheduled":
      return { kind: "forward", action: "start_script", label: "Script írásának megkezdése" };
    case "script_writing":
      return { kind: "forward", action: "send_script_for_approval", label: "Script küldése jóváhagyásra" };
    case "script_review":
      return { kind: "review", approveAction: "approve_script", rejectAction: "reject_script" };
    case "shoot_done":
      return { kind: "forward", action: "upload_raw", label: "Nyersanyag feltöltve", input: "rawMediaUrl" };
    case "editing":
      return { kind: "forward", action: "send_edit_for_approval", label: "Vágás küldése jóváhagyásra" };
    case "edit_review":
      return { kind: "review", approveAction: "approve_edit", rejectAction: "reject_edit" };
    case "scheduling":
      return { kind: "forward", action: "schedule", label: "Időzítés és közzététel", input: "scheduledPublishAt" };
    case "published":
      return { kind: "none" };
  }
}

export async function listContentItems(token: string): Promise<ContentItemsListResult> {
  const res = await authFetch(token, "/content-items");
  return res.json();
}

export async function getContentItem(token: string, id: number): Promise<ContentItem> {
  const res = await authFetch(token, `/content-items/${id}`);
  const data = await res.json();
  return data.item;
}

export async function createContentItem(
  token: string,
  input: { clientId: number; title: string; platform: Platform; assignedTo?: number }
): Promise<ContentItem> {
  const res = await authFetch(token, "/content-items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.item;
}

export async function updateContentItem(token: string, id: number, input: ContentItemFormInput): Promise<ContentItem> {
  const res = await authFetch(token, `/content-items/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.item;
}

export async function deleteContentItem(token: string, id: number): Promise<void> {
  await authFetch(token, `/content-items/${id}`, { method: "DELETE" });
}

export async function transitionContentItem(
  token: string,
  id: number,
  action: TransitionAction,
  payload?: TransitionPayload
): Promise<ContentItem> {
  const res = await authFetch(token, `/content-items/${id}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const data = await res.json();
  return data.item;
}

export async function listApprovals(token: string, itemId: number): Promise<Approval[]> {
  const res = await authFetch(token, `/content-items/${itemId}/approvals`);
  const data = await res.json();
  return data.approvals;
}

export async function sendReminder(token: string, itemId: number, approvalId: number): Promise<void> {
  await authFetch(token, `/content-items/${itemId}/approvals/${approvalId}/remind`, { method: "POST" });
}

export interface PendingApproval extends Approval {
  content_title: string;
  client_name: string;
}

export async function listPendingApprovals(token: string): Promise<PendingApproval[]> {
  const res = await authFetch(token, "/content-items/approvals/pending");
  const data = await res.json();
  return data.approvals;
}

export async function getSocialMediaSenderAccount(token: string): Promise<number | null> {
  const res = await authFetch(token, "/admin/social-media/config");
  const data = await res.json();
  return data.senderAccountId;
}

export async function setSocialMediaSenderAccount(token: string, senderAccountId: number | null): Promise<void> {
  await authFetch(token, "/admin/social-media/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ senderAccountId }),
  });
}
