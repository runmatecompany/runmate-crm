import { createReadStream, createWriteStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import type { OAuth2Client } from "google-auth-library";
import { getCachedMonthFolder, recordMonthFolder } from "../../db/googleDrive.js";
import { findOrCreateFolder, startResumableUpload } from "./api.js";

// A hónap-almappa lusta létrehozással jön létre (első feltöltéskor az adott
// hónapra), és a content_upload_folders táblában gyorsítótárazva marad.
export async function ensureMonthFolder(
  client: OAuth2Client,
  clientId: number,
  rawFolderId: string,
  yearMonth: string
): Promise<string> {
  const cached = await getCachedMonthFolder(clientId, yearMonth);
  if (cached) return cached;
  const folder = await findOrCreateFolder(client, rawFolderId, yearMonth);
  await recordMonthFolder(clientId, yearMonth, folder.id);
  return folder.id;
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
