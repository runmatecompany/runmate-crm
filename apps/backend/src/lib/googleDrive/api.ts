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

// supportsAllDrives/includeItemsFromAllDrives kötelező mindenhol, ahol egy
// mappa (vagy a benne lévő fájlok) esetleg egy Megosztott meghajtóban
// (Shared Drive) van/lett áthelyezve — enélkül a Drive API csendben, hiba
// nélkül üres találati listát ad vissza az ottani tartalomra, miközben a
// böngészőben az adott mappa tartalma teljesen normálisan látszik.
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
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  const data = await driveFetch<{ files?: DriveFolder[] }>(client, url);
  return data.files?.[0] ?? null;
}

export async function createFolder(client: OAuth2Client, parentId: string | null, name: string): Promise<DriveFolder> {
  return driveFetch<DriveFolder>(client, `${DRIVE_FILES_URL}?fields=id,name&supportsAllDrives=true`, {
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

// Ha egy mappaazonosítót valaki kézzel törölt a Drive-on (vagy eleve hibás
// lett elmentve), a `parents` mezőben rá hivatkozó create-hívás NEM hibázik
// — a Drive csendben, hiba nélkül gyökérszinten hozza létre az új elemet.
// Ezért kell explicit létezés-ellenőrzés minden olyan helyen, ahol egy
// adatbázisban tárolt mappaazonosítót szülőként újra felhasználunk (lásd
// onboarding.ts getReadyClient).
export async function folderExists(client: OAuth2Client, folderId: string): Promise<boolean> {
  const { token: accessToken } = await client.getAccessToken();
  if (!accessToken) throw new Error("Nincs érvényes Google access token");
  const res = await fetch(`${DRIVE_FILES_URL}/${folderId}?fields=id,trashed&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return false;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Drive API hiba (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { trashed?: boolean };
  return !data.trashed;
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
  const res = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=resumable&supportsAllDrives=true`, {
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

// Névre szóló (nem "bárki, akinél a link van") szerkesztői jog adása egy
// vágó saját Google-fiókjának egy ügyfél-mappára — ez NEM ütközik a
// korábban felfedezett láthatatlansági hibába (az kifejezetten a "bárki
// linkkel" megosztásnál jelentkezett). A visszaadott permission ID kell a
// később esetleges visszavonáshoz (revokePermission).
export async function grantPermission(client: OAuth2Client, fileId: string, email: string): Promise<string> {
  const result = await driveFetch<{ id: string }>(
    client,
    `${DRIVE_FILES_URL}/${fileId}/permissions?sendNotificationEmail=false&supportsAllDrives=true&fields=id`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "writer", type: "user", emailAddress: email }),
    }
  );
  return result.id;
}

// A DELETE válasza üres (204), ezért nem a driveFetch-en megy (az mindig
// JSON-t vár) — sima fetch, mint a resumable-upload indításnál.
export async function revokePermission(client: OAuth2Client, fileId: string, permissionId: string): Promise<void> {
  const { token: accessToken } = await client.getAccessToken();
  if (!accessToken) throw new Error("Nincs érvényes Google access token");
  const res = await fetch(`${DRIVE_FILES_URL}/${fileId}/permissions/${permissionId}?supportsAllDrives=true`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // 404: a jog már úgyis nincs meg (pl. valaki kézzel törölte a Drive-on) — nem hiba.
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => "");
    throw new Error(`Nem sikerült visszavonni a Drive-jogosultságot (${res.status}): ${body.slice(0, 300)}`);
  }
}

export function driveFolderLink(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

export function driveFileLink(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
}

// A beépített Drive-böngészőhöz: egy mappa közvetlen tartalma (almappák és
// fájlok egyben, mappa-elsőbbséggel rendezve).
export async function listFolderChildren(client: OAuth2Client, folderId: string): Promise<DriveItem[]> {
  const url = new URL(DRIVE_FILES_URL);
  url.searchParams.set("q", `'${folderId}' in parents and trashed = false`);
  url.searchParams.set("fields", "files(id,name,mimeType)");
  url.searchParams.set("orderBy", "folder,name");
  url.searchParams.set("pageSize", "1000");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  const data = await driveFetch<{ files?: DriveItem[] }>(client, url);
  return data.files ?? [];
}

export function isDriveFolder(item: Pick<DriveItem, "mimeType">): boolean {
  return item.mimeType === FOLDER_MIME_TYPE;
}

// A beépített Drive-böngésző "+ Új..." menüjéhez — a Drive saját "Új" menüje
// mintájára, ugyanazokkal a fájltípusokkal.
export const CREATABLE_MIME_TYPES = {
  document: "application/vnd.google-apps.document",
  spreadsheet: "application/vnd.google-apps.spreadsheet",
  presentation: "application/vnd.google-apps.presentation",
} as const;

export type CreatableKind = keyof typeof CREATABLE_MIME_TYPES;

export async function createGoogleFile(
  client: OAuth2Client,
  parentId: string,
  name: string,
  kind: CreatableKind
): Promise<DriveItem> {
  return driveFetch<DriveItem>(client, `${DRIVE_FILES_URL}?fields=id,name,mimeType&supportsAllDrives=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: CREATABLE_MIME_TYPES[kind], parents: [parentId] }),
  });
}

// A Tervező "Mentés Drive-ra" gombjához — a createGoogleFile-lal ellentétben
// ez nem üres dokumentumot hoz létre, hanem a megadott sima szöveget rögtön
// beletölti (a Drive multipart-feltöltéskor automatikusan konvertálja natív
// Google Dokumentummá, ha a cél mimeType application/vnd.google-apps.document).
export async function createGoogleDocFromText(
  client: OAuth2Client,
  parentId: string,
  name: string,
  textContent: string
): Promise<DriveItem> {
  const { token: accessToken } = await client.getAccessToken();
  if (!accessToken) throw new Error("Nincs érvényes Google access token");

  const boundary = `runmate-${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name, mimeType: CREATABLE_MIME_TYPES.document, parents: [parentId] });
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/plain; charset=UTF-8\r\n\r\n` +
    `${textContent}\r\n` +
    `--${boundary}--`;

  const res = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name,mimeType&supportsAllDrives=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Nem sikerült létrehozni a Google Dokumentumot (${res.status}): ${errBody.slice(0, 300)}`);
  }
  return res.json();
}

export async function renameItem(client: OAuth2Client, itemId: string, name: string): Promise<DriveItem> {
  return driveFetch<DriveItem>(client, `${DRIVE_FILES_URL}/${itemId}?fields=id,name,mimeType&supportsAllDrives=true`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

// Kukába dobás (nem végleges törlés) — ugyanaz, mint amit a Drive saját
// kuka-ikonja csinál, a Drive-on belül vissza is állítható.
export async function trashItem(client: OAuth2Client, itemId: string): Promise<void> {
  await driveFetch<{ id: string }>(client, `${DRIVE_FILES_URL}/${itemId}?fields=id&supportsAllDrives=true`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
}

// Felfelé sétál a szülőláncon a gyökér-mappáig, hogy (a) morzsamenüt tudjunk
// belőle építeni, és (b) ellenőrizhessük, hogy a kért mappa tényleg a
// megengedett gyökér (Ügyfelek) alatt van-e — a beépített böngészőben ne
// lehessen kilépni onnan. Null, ha a lánc nem fut bele a gyökérbe.
export async function resolveBreadcrumb(
  client: OAuth2Client,
  folderId: string,
  rootId: string,
  maxDepth = 8
): Promise<DriveFolder[] | null> {
  const chain: DriveFolder[] = [];
  let currentId = folderId;
  for (let i = 0; i < maxDepth; i++) {
    let info: { id: string; name: string; parents?: string[] };
    try {
      info = await driveFetch<{ id: string; name: string; parents?: string[] }>(
        client,
        `${DRIVE_FILES_URL}/${currentId}?fields=id,name,parents&supportsAllDrives=true`
      );
    } catch {
      // A lánc egy nem elérhető/nem hagyományos fájl-azonosítóba futott
      // (pl. egy megosztott meghajtó gyökere) — ez nem lehet a mi
      // gyökerünk alatt, tehát elutasítjuk.
      return null;
    }
    chain.unshift({ id: info.id, name: info.name });
    if (info.id === rootId) return chain;
    const parentId = info.parents?.[0];
    if (!parentId) return null;
    currentId = parentId;
  }
  return null;
}
