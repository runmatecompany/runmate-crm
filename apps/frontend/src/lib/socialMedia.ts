import { authFetch } from "./api";
import { getApiUrl } from "./serverConfig";

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

export type Platform = "instagram" | "tiktok" | "youtube" | "facebook";

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  script_writing: "Scriptre vár",
  script_review: "Script jóváhagyásra vár",
  shoot_done: "Forgatásra vár",
  editing: "Vágásra vár",
  edit_review: "Vágás jóváhagyásra vár",
  scheduling: "Időzítésre vár",
  published: "Közzétéve",
  planning: "Tervezés alatt",
  approval: "Jóváhagyásra vár",
};

// A képes poszt egyszerűsített, 4 fázisú köre — nincs forgatás/vágás, ezért
// nincs email-jóváhagyásos állapotgép sem (lásd getCardAction, ami csak a
// videó 7 fázisára vonatkozik). A "Tovább" gomb egyszerűen a következő
// indexre lép a listában.
export const IMAGE_POST_STATUSES: ContentStatus[] = ["planning", "approval", "scheduling", "published"];

export function nextImagePostStatus(status: ContentStatus): ContentStatus | null {
  const idx = IMAGE_POST_STATUSES.indexOf(status);
  if (idx === -1 || idx === IMAGE_POST_STATUSES.length - 1) return null;
  return IMAGE_POST_STATUSES[idx + 1];
}

// A kanban nem minden státuszt jelenít meg külön oszlopként: a
// "jóváhagyásra vár" állapotok a megfelelő munka-oszlopon belül, egy
// jelvénnyel jelennek meg (lásd getStageBadge), nem önálló oszlopként — így
// jóváhagyás után egyből a következő munka-oszlopba kerül a kártya.
export interface KanbanColumn {
  key: string;
  label: string;
  statuses: ContentStatus[];
}

// A "scheduling" (vágás jóváhagyva, posztolásra kész) és a "published"
// (kiposztolva) állapotok nem jelennek meg kanban-oszlopként — a "scheduling"
// elemek a külön "Posztolni valók" nézetben vannak (lásd PostQueueView), a
// "published" elemeknek pedig nincs dedikált listanézete.
export const KANBAN_COLUMNS: KanbanColumn[] = [
  { key: "script", label: "Scriptre vár", statuses: ["script_writing", "script_review"] },
  { key: "shoot", label: "Forgatásra vár", statuses: ["shoot_done"] },
  { key: "editing", label: "Vágásra vár", statuses: ["editing", "edit_review"] },
];

export type StageBadge = "not_started" | "in_progress" | "sent";

export const STAGE_BADGE_LABELS: Record<StageBadge, string> = {
  not_started: "Nincs elkezdve",
  in_progress: "Folyamatban",
  sent: "Kiküldve",
};

// A "Scriptre vár"/"Vágásra vár" összevont oszlopokon belüli jelvény: az adott
// munka még el sem lett kezdve, folyamatban van, vagy már ki lett küldve
// jóváhagyásra (ez utóbbi esetben a kártyán a Jóváhagyva/Módosítás kell
// gombok is megjelennek).
export function getStageBadge(item: ContentItem): StageBadge | null {
  if (item.status === "script_writing") return item.script_content?.trim() ? "in_progress" : "not_started";
  if (item.status === "script_review") return "sent";
  if (item.status === "editing") return item.edited_media_url?.trim() ? "in_progress" : "not_started";
  if (item.status === "edit_review") return "sent";
  return null;
}

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

export interface ContentItemEvent {
  id: number;
  content_item_id: number;
  user_id: number | null;
  user_name: string | null;
  from_status: ContentStatus | null;
  to_status: ContentStatus;
  created_at: string;
}

export interface ContentItemFormInput {
  title: string;
  platform: Platform;
  assignedTo?: number;
  scriptContent?: string;
  editedMediaUrl?: string;
  shootDate?: string;
}

export interface ContentItemsListResult {
  items: ContentItem[];
  hasAccess: boolean;
}

export type TransitionAction =
  | "send_script_for_approval"
  | "approve_script"
  | "reject_script"
  | "upload_raw"
  | "send_edit_for_approval"
  | "approve_edit"
  | "reject_edit"
  | "schedule";

export interface TransitionPayload {
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
  | { kind: "forward"; action: TransitionAction; label: string; input?: "rawMediaUrl" | "scheduledPublishAt" }
  | { kind: "review"; approveAction: TransitionAction; rejectAction: TransitionAction }
  | { kind: "none" };

// Csak videó (content_type === "video") elemekre hívjuk — a képes posztok
// a nextImagePostStatus()/setContentItemStatus() egyszerű, közvetlen
// útján haladnak, nem ezen a jóváhagyásos állapotgépen.
export function getCardAction(status: ContentStatus): CardAction {
  switch (status) {
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
    case "planning":
    case "approval":
      return { kind: "none" };
  }
}

// <input type="datetime-local"> "ÉÉÉÉ-HH-NNTÓÓ:PP" formátumot vár, a helyi
// időzóna szerint (nem UTC) — ezért nem elég a plain toISOString(). A
// kanban prompt()-jának alapértéke és a részletes nézet dátum-mezője is
// ugyanezt a formátumot várja, hogy a felhasználó egyszerűen elfogadhassa.
export function toDatetimeLocalValue(value: string): string {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
  input: {
    clientId: number;
    title: string;
    contentType: ContentType;
    platform: Platform;
    assignedTo?: number;
  }
): Promise<ContentItem> {
  const res = await authFetch(token, "/content-items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.item;
}

// Csak image_post típusú elemekre — lásd a getCardAction fenti kommentjét.
export async function setContentItemStatus(token: string, id: number, status: ContentStatus): Promise<ContentItem> {
  const res = await authFetch(token, `/content-items/${id}/set-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
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

export async function generateScriptDraft(token: string, itemId: number, topic: string): Promise<string> {
  const res = await authFetch(token, `/content-items/${itemId}/generate-script`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
  });
  const data = await res.json();
  return data.script;
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

// XMLHttpRequest kell (nem fetch) a valódi feltöltési előrehaladás-eseményekhez
// — a fetch streamelt request body-jának nincs egyszerű, széles körben
// elérhető progress-API-ja a böngészőkben/webview-kban.
function uploadFiles(
  token: string,
  itemId: number,
  endpoint: "upload-raw" | "upload-edited",
  files: File[],
  onProgress?: (fraction: number) => void
): Promise<ContentItem> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    for (const file of files) formData.append("files", file);

    xhr.open("POST", `${getApiUrl()}/content-items/${itemId}/${endpoint}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText).item);
        } catch {
          reject(new Error("Érvénytelen válasz a szervertől"));
        }
      } else {
        try {
          reject(new Error(JSON.parse(xhr.responseText).error ?? "Feltöltés sikertelen"));
        } catch {
          reject(new Error("Feltöltés sikertelen"));
        }
      }
    };
    xhr.onerror = () => reject(new Error("Hálózati hiba a feltöltés közben"));
    xhr.send(formData);
  });
}

export function uploadRawFiles(
  token: string,
  itemId: number,
  files: File[],
  onProgress?: (fraction: number) => void
): Promise<ContentItem> {
  return uploadFiles(token, itemId, "upload-raw", files, onProgress);
}

export function uploadEditedFiles(
  token: string,
  itemId: number,
  files: File[],
  onProgress?: (fraction: number) => void
): Promise<ContentItem> {
  return uploadFiles(token, itemId, "upload-edited", files, onProgress);
}

export async function listApprovals(token: string, itemId: number): Promise<Approval[]> {
  const res = await authFetch(token, `/content-items/${itemId}/approvals`);
  const data = await res.json();
  return data.approvals;
}

export async function sendReminder(token: string, itemId: number, approvalId: number): Promise<void> {
  await authFetch(token, `/content-items/${itemId}/approvals/${approvalId}/remind`, { method: "POST" });
}

// Munkatörténet: ki vitte tovább a feladatot melyik fázisból a következőbe.
export async function listContentItemEvents(token: string, itemId: number): Promise<ContentItemEvent[]> {
  const res = await authFetch(token, `/content-items/${itemId}/activity`);
  const data = await res.json();
  return data.events;
}

// Nincs még számlázási modul — ez az ideiglenes admin-only jóváhagyás egy
// payment_confirmed=false-szal létrejött tartalom elindíthatóvá tételéhez.
export async function confirmContentItemPayment(token: string, itemId: number): Promise<ContentItem> {
  const res = await authFetch(token, `/content-items/${itemId}/confirm-payment`, { method: "POST" });
  const data = await res.json();
  return data.item;
}

export interface DriveBreadcrumbEntry {
  id: string;
  name: string;
}

export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
}

export interface DriveBrowseResult {
  folderId: string;
  breadcrumb: DriveBreadcrumbEntry[];
  folders: DriveItem[];
  files: DriveItem[];
}

export async function browseDrive(token: string, folderId?: string): Promise<DriveBrowseResult> {
  const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : "";
  const res = await authFetch(token, `/social-media/drive/browse${query}`);
  return res.json();
}

export type DriveCreateKind = "folder" | "document" | "spreadsheet" | "presentation";

export const DRIVE_CREATE_KIND_LABELS: Record<DriveCreateKind, string> = {
  folder: "Új mappa",
  document: "Google Dokumentum",
  spreadsheet: "Google Táblázat",
  presentation: "Google Prezentáció",
};

export async function createDriveItem(
  token: string,
  folderId: string,
  name: string,
  kind: DriveCreateKind
): Promise<DriveItem> {
  const res = await authFetch(token, "/social-media/drive/create-item", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderId, name, kind }),
  });
  const data = await res.json();
  return data.file;
}

export async function renameDriveItem(token: string, itemId: string, name: string): Promise<DriveItem> {
  const res = await authFetch(token, "/social-media/drive/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId, name }),
  });
  const data = await res.json();
  return data.file;
}

export async function deleteDriveItem(token: string, itemId: string): Promise<void> {
  await authFetch(token, "/social-media/drive/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId }),
  });
}

// XMLHttpRequest kell itt is a feltöltési előrehaladáshoz, ugyanúgy, mint a
// nyersanyag/vágott videó feltöltésénél.
export function uploadDriveFiles(
  token: string,
  folderId: string,
  files: File[],
  onProgress?: (fraction: number) => void
): Promise<{ uploadedCount: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    for (const file of files) formData.append("files", file);

    xhr.open("POST", `${getApiUrl()}/social-media/drive/upload?folderId=${encodeURIComponent(folderId)}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Érvénytelen válasz a szervertől"));
        }
      } else {
        try {
          reject(new Error(JSON.parse(xhr.responseText).error ?? "Feltöltés sikertelen"));
        } catch {
          reject(new Error("Feltöltés sikertelen"));
        }
      }
    };
    xhr.onerror = () => reject(new Error("Hálózati hiba a feltöltés közben"));
    xhr.send(formData);
  });
}

// Kijelölt fájlok letöltése egy ZIP-be csomagolva — hitelesített végpont,
// ezért (mint a számla-PDF-nél) blob-ként kell letölteni, nem sima <a
// href>-fel; a hívó fél (DriveView) alakítja tovább letöltés-indító linkké.
export async function downloadDriveZip(token: string, itemIds: string[]): Promise<Blob> {
  const res = await authFetch(token, "/social-media/drive/download-zip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemIds }),
  });
  return res.blob();
}

export async function createDriveFolderWithItems(
  token: string,
  folderId: string,
  name: string,
  itemIds: string[]
): Promise<{ folder: DriveItem; movedCount: number }> {
  const res = await authFetch(token, "/social-media/drive/create-folder-with-items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderId, name, itemIds }),
  });
  return res.json();
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
