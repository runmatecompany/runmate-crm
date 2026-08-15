import type { OAuth2Client } from "google-auth-library";

// Ugyanaz az elv, mint a Naptár-integrációnál (lib/googleCalendar/sync.ts):
// nincs googleapis/@googleapis/drive SDK, mert azok generált típusai
// kifogyasztották a tsc memóriáját ezen a gépen. Sima REST-hívások a
// szükséges pár Drive API művelethez.
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

export interface DriveFolder {
  id: string;
  name: string;
}

async function driveFetch<T>(client: OAuth2Client, url: string | URL, init: RequestInit = {}): Promise<T> {
  const { token: accessToken } = await client.getAccessToken();
  if (!accessToken) throw new Error("Nincs érvényes Google access token");
  const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Drive API hiba (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

export async function findFolderByName(
  client: OAuth2Client,
  parentId: string | null,
  name: string
): Promise<DriveFolder | null> {
  const escapedName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const parentClause = parentId ? `'${parentId}' in parents` : "'root' in parents";
  const url = new URL(DRIVE_FILES_URL);
  url.searchParams.set(
    "q",
    `${parentClause} and name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  url.searchParams.set("fields", "files(id,name)");
  const data = await driveFetch<{ files?: DriveFolder[] }>(client, url);
  return data.files?.[0] ?? null;
}

export async function createFolder(client: OAuth2Client, parentId: string | null, name: string): Promise<DriveFolder> {
  return driveFetch<DriveFolder>(client, `${DRIVE_FILES_URL}?fields=id,name`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    }),
  });
}

export async function findOrCreateFolder(client: OAuth2Client, parentId: string | null, name: string): Promise<DriveFolder> {
  const existing = await findFolderByName(client, parentId, name);
  if (existing) return existing;
  return createFolder(client, parentId, name);
}

// Resumable feltöltés indítása — a válasz Location fejléce az a session-URL,
// amire a tényleges fájl-bájtokat (streamelve, pufferelés nélkül) PUT-oljuk.
export async function startResumableUpload(
  client: OAuth2Client,
  folderId: string,
  filename: string,
  mimeType: string
): Promise<string> {
  const { token: accessToken } = await client.getAccessToken();
  if (!accessToken) throw new Error("Nincs érvényes Google access token");
  const res = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=resumable`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType,
    },
    body: JSON.stringify({ name: filename, parents: [folderId] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Nem sikerült elindítani a Drive feltöltést (${res.status}): ${body.slice(0, 300)}`);
  }
  const sessionUrl = res.headers.get("Location");
  if (!sessionUrl) throw new Error("A Drive nem adott vissza feltöltési session URL-t");
  return sessionUrl;
}

export function driveFolderLink(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}
