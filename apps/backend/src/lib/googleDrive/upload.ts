import { createReadStream, createWriteStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import type { OAuth2Client } from "google-auth-library";
import {
  getCachedMonthFolder,
  recordMonthFolder,
  getCachedVideoSubfolder,
  recordVideoSubfolder,
  type VideoSubfolderKind,
} from "../../db/googleDrive.js";
import { findOrCreateFolder, startResumableUpload } from "./api.js";

// A hónap-mappa ("{ügyfélmappa}/ÉÉÉÉ-HH") lusta létrehozással jön létre, és a
// content_upload_folders táblában gyorsítótárazva marad.
export async function ensureMonthFolder(
  client: OAuth2Client,
  clientId: number,
  clientFolderId: string,
  yearMonth: string
): Promise<string> {
  const cached = await getCachedMonthFolder(clientId, yearMonth);
  if (cached) return cached;
  const folder = await findOrCreateFolder(client, clientFolderId, yearMonth);
  await recordMonthFolder(clientId, yearMonth, folder.id);
  return folder.id;
}

// A hónap-mappán belüli "Videók/Nyersek" ill. "Videók/Megvágva" almappa —
// csak akkor jön ténylegesen létre, amikor az első fájl tényleg oda kerül
// (forgatás utáni nyers feltöltés, ill. vágás utáni feltöltés).
export async function ensureVideoSubfolder(
  client: OAuth2Client,
  clientId: number,
  clientFolderId: string,
  yearMonth: string,
  kind: VideoSubfolderKind
): Promise<string> {
  const cached = await getCachedVideoSubfolder(clientId, yearMonth, kind);
  if (cached) return cached;

  const monthFolderId = await ensureMonthFolder(client, clientId, clientFolderId, yearMonth);
  const videosFolder = await findOrCreateFolder(client, monthFolderId, "Videók");
  const subFolder = await findOrCreateFolder(client, videosFolder.id, kind === "raw" ? "Nyersek" : "Megvágva");
  await recordVideoSubfolder(clientId, yearMonth, kind, subFolder.id);
  return subFolder.id;
}

// A bejövő (multipart) fájl-stream-et előbb egy ideiglenes fájlba írjuk
// (streamelve, nem memóriában pufferelve — nagy videófájloknál ez számít),
// hogy pontos Content-Length-et tudjunk adni a Drive resumable-upload
// PUT-jának, majd a válasz megérkezése után az ideiglenes fájlt töröljük.
export async function uploadStreamToFolder(
  client: OAuth2Client,
  folderId: string,
  filename: string,
  mimetype: string,
  fileStream: Readable
): Promise<void> {
  const tempPath = path.join(tmpdir(), `runmate-upload-${randomUUID()}`);
  try {
    await pipeline(fileStream, createWriteStream(tempPath));
    const { size } = await stat(tempPath);

    const sessionUrl = await startResumableUpload(client, folderId, filename, mimetype);
    const { token: accessToken } = await client.getAccessToken();
    if (!accessToken) throw new Error("Nincs érvényes Google access token");

    // A "duplex: half" kötelező streamelt request body-nál Node fetch-nél
    // (undici), de a TS DOM-lib RequestInit típusa még nem ismeri —
    // ez futásidőben helyes, csak a típusdefiníció van le maradva.
    const res = await fetch(sessionUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": mimetype,
        "Content-Length": String(size),
      },
      body: Readable.toWeb(createReadStream(tempPath)) as ReadableStream<Uint8Array>,
      duplex: "half",
    } as unknown as RequestInit);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Nem sikerült feltölteni a(z) "${filename}" fájlt a Drive-ra (${res.status}): ${body.slice(0, 300)}`);
    }
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}
