import { authFetch } from "./api";
import { getApiUrl } from "./serverConfig";
import type { DriveBrowseResult, DriveCreateKind, DriveItem } from "./socialMedia";

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
  drive_folder_id: string | null;
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

// A projekt saját Drive-mappájára szűkített böngésző/feltöltő hívások —
// ugyanaz a válaszforma, mint a Social Media modul Drive-böngészőjénél
// (lib/socialMedia.ts), csak a /web/projects/:id/drive/... végpontokra megy,
// hogy a gyökér a projekt mappájára legyen korlátozva.
export async function browseWebDrive(token: string, projectId: number, folderId?: string): Promise<DriveBrowseResult> {
  const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : "";
  const res = await authFetch(token, `/web/projects/${projectId}/drive/browse${query}`);
  return res.json();
}

export async function createWebDriveItem(
  token: string,
  projectId: number,
  folderId: string,
  name: string,
  kind: DriveCreateKind
): Promise<DriveItem> {
  const res = await authFetch(token, `/web/projects/${projectId}/drive/create-item`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderId, name, kind }),
  });
  const data = await res.json();
  return data.file;
}

export async function renameWebDriveItem(token: string, projectId: number, itemId: string, name: string): Promise<DriveItem> {
  const res = await authFetch(token, `/web/projects/${projectId}/drive/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId, name }),
  });
  const data = await res.json();
  return data.file;
}

export async function deleteWebDriveItem(token: string, projectId: number, itemId: string): Promise<void> {
  await authFetch(token, `/web/projects/${projectId}/drive/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId }),
  });
}

export function uploadWebDriveFiles(
  token: string,
  projectId: number,
  folderId: string,
  files: File[],
  onProgress?: (fraction: number) => void
): Promise<{ uploadedCount: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    for (const file of files) formData.append("files", file);

    xhr.open(
      "POST",
      `${getApiUrl()}/web/projects/${projectId}/drive/upload?folderId=${encodeURIComponent(folderId)}`
    );
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
