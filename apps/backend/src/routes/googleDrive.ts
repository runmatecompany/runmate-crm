import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import type { FastifyInstance } from "fastify";
import type { OAuth2Client } from "google-auth-library";
import { hasSocialMediaAccess } from "../db/contentItems.js";
import { getAuthorizedClient } from "../lib/googleCalendar/oauth.js";
import { getClientsRootFolder } from "../lib/googleDrive/root.js";
import {
  createFolder,
  createGoogleFile,
  downloadFile,
  isDriveFolder,
  listFolderChildren,
  moveItem,
  renameItem,
  resolveBreadcrumb,
  trashItem,
  type CreatableKind,
  type DriveFolder,
  type DriveItem,
} from "../lib/googleDrive/api.js";
import { replaceStreamContent, uploadStreamToFolder } from "../lib/googleDrive/upload.js";

async function canAccessSocialMediaModule(userId: number, role: "admin" | "user"): Promise<boolean> {
  return role === "admin" || (await hasSocialMediaAccess(userId));
}

// A mappánkénti morzsamenü-lánc gyorsítótára: mihelyt egy mappát valaha
// kilistáztunk (akár szülőként, akár gyerekként), az ő és minden előre látott
// gyerekének a lánca itt marad, hogy legközelebb ne kelljen a szülőláncon
// végigsétálva (egyenként API-hívásokkal) újra feloldani — csak egy ismeretlen
// (vagy szerver-újraindítás utáni) mappánál esünk vissza a lassabb, de
// biztonságos ellenőrzésre.
const breadcrumbCache = new Map<string, DriveFolder[]>();

// Közös határ-ellenőrzés a böngészéshez és a fájl/mappa-létrehozáshoz is:
// a folderId-nek a gyökér (Ügyfelek) alatt kell lennie. Gyorsítótár-találat
// esetén ingyenes, egyébként a szülőláncon végigsétálva ellenőriz (és el is
// tárolja az eredményt, hogy legközelebb már gyors legyen).
async function ensureBreadcrumb(oauth: OAuth2Client, root: DriveFolder, folderId: string): Promise<DriveFolder[] | null> {
  if (folderId === root.id) return [{ id: root.id, name: "Ügyfelek" }];
  if (breadcrumbCache.has(folderId)) return breadcrumbCache.get(folderId)!;
  const breadcrumb = await resolveBreadcrumb(oauth, folderId, root.id);
  if (breadcrumb) breadcrumbCache.set(folderId, breadcrumb);
  return breadcrumb;
}

const CREATABLE_KINDS: CreatableKind[] = ["document", "spreadsheet", "presentation"];

export default async function googleDriveRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { folderId?: string } }>(
    "/social-media/drive/browse",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessSocialMediaModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
      }
      const oauth = await getAuthorizedClient();
      if (!oauth) {
        return reply.code(400).send({ error: "Nincs beállítva Google-kapcsolat (Beállítások > Google-integráció)" });
      }

      const root = await getClientsRootFolder(oauth);
      const folderId = request.query.folderId || root.id;

      const breadcrumb = await ensureBreadcrumb(oauth, root, folderId);
      if (!breadcrumb) {
        return reply.code(403).send({ error: "Ez a mappa nem érhető el innen" });
      }
      breadcrumb[0].name = "Ügyfelek";

      const children = await listFolderChildren(oauth, folderId);
      // A most listázott gyerekek láncát is rögtön eltesszük — ha legközelebb
      // beléjük navigálnak, az már gyorsítótár-találat lesz.
      for (const child of children) {
        if (!breadcrumbCache.has(child.id)) {
          breadcrumbCache.set(child.id, [...breadcrumb, { id: child.id, name: child.name }]);
        }
      }

      const folders = children.filter(isDriveFolder);
      const files = children.filter((item) => !isDriveFolder(item));

      return { folderId, breadcrumb, folders, files };
    }
  );

  // A "+ Új..." menü (mappa / Dokumentum / Táblázat / Prezentáció), a Drive
  // saját "Új" menüje mintájára — csak a beépített böngészőben már validált
  // mappákba enged létrehozni, ugyanaz a határ, mint a böngészésnél.
  fastify.post<{ Body: { folderId: string; name: string; kind: "folder" | CreatableKind } }>(
    "/social-media/drive/create-item",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessSocialMediaModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
      }
      const { folderId, name, kind } = request.body;
      if (!folderId || !name?.trim()) {
        return reply.code(400).send({ error: "Hiányzó mappa vagy fájlnév" });
      }
      if (kind !== "folder" && !CREATABLE_KINDS.includes(kind)) {
        return reply.code(400).send({ error: "Ismeretlen típus" });
      }
      const oauth = await getAuthorizedClient();
      if (!oauth) {
        return reply.code(400).send({ error: "Nincs beállítva Google-kapcsolat (Beállítások > Google-integráció)" });
      }

      const root = await getClientsRootFolder(oauth);
      const breadcrumb = await ensureBreadcrumb(oauth, root, folderId);
      if (!breadcrumb) {
        return reply.code(403).send({ error: "Ez a mappa nem érhető el innen" });
      }

      const file: DriveItem =
        kind === "folder"
          ? { ...(await createFolder(oauth, folderId, name.trim())), mimeType: "application/vnd.google-apps.folder" }
          : await createGoogleFile(oauth, folderId, name.trim(), kind);

      return reply.code(201).send({ file });
    }
  );

  // Fájl/mappa átnevezése — az itemId-nek is a gyökér (Ügyfelek) alatt kell
  // lennie, ugyanaz a határ-ellenőrzés fut le rá, mint egy mappa
  // böngészésekor.
  fastify.post<{ Body: { itemId: string; name: string } }>(
    "/social-media/drive/rename",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessSocialMediaModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
      }
      const { itemId, name } = request.body;
      if (!itemId || !name?.trim()) {
        return reply.code(400).send({ error: "Hiányzó elem vagy név" });
      }
      const oauth = await getAuthorizedClient();
      if (!oauth) {
        return reply.code(400).send({ error: "Nincs beállítva Google-kapcsolat (Beállítások > Google-integráció)" });
      }

      const root = await getClientsRootFolder(oauth);
      const breadcrumb = await ensureBreadcrumb(oauth, root, itemId);
      if (!breadcrumb) {
        return reply.code(403).send({ error: "Ez az elem nem érhető el innen" });
      }

      const file = await renameItem(oauth, itemId, name.trim());
      // A gyorsítótárban a régi név maradna benne (és minden alatta lévő
      // elem morzsamenüjében is) — töröljük a bejegyzést, hogy legközelebb
      // friss névvel oldódjon fel; a leszármazottak morzsamenüje szerver-
      // újraindításig elavult maradhat, ez csak megjelenítési részlet.
      breadcrumbCache.delete(itemId);
      return { file };
    }
  );

  // Fájl/mappa kukába dobása — a gyökér (Ügyfelek) maga nem törölhető.
  fastify.post<{ Body: { itemId: string } }>(
    "/social-media/drive/delete",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessSocialMediaModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
      }
      const { itemId } = request.body;
      if (!itemId) return reply.code(400).send({ error: "Hiányzó elem" });

      const oauth = await getAuthorizedClient();
      if (!oauth) {
        return reply.code(400).send({ error: "Nincs beállítva Google-kapcsolat (Beállítások > Google-integráció)" });
      }

      const root = await getClientsRootFolder(oauth);
      if (itemId === root.id) {
        return reply.code(400).send({ error: "Az Ügyfelek gyökérmappa nem törölhető" });
      }
      const breadcrumb = await ensureBreadcrumb(oauth, root, itemId);
      if (!breadcrumb) {
        return reply.code(403).send({ error: "Ez az elem nem érhető el innen" });
      }

      await trashItem(oauth, itemId);
      breadcrumbCache.delete(itemId);
      return { ok: true };
    }
  );

  // Tetszőleges fájl(ok) feltöltése a beépített böngészőben épp nyitva lévő
  // mappába — ugyanaz a streamelt multipart minta, mint a nyersanyag/vágott
  // videó feltöltésnél (routes/contentItems.ts), csak itt bármelyik
  // validált mappára megy, nem csak a "Nyersek"/"Megvágva" almappára.
  fastify.post<{ Querystring: { folderId?: string } }>(
    "/social-media/drive/upload",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessSocialMediaModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
      }
      const folderId = request.query.folderId;
      if (!folderId) return reply.code(400).send({ error: "Hiányzó mappa" });

      const oauth = await getAuthorizedClient();
      if (!oauth) {
        return reply.code(400).send({ error: "Nincs beállítva Google-kapcsolat (Beállítások > Google-integráció)" });
      }

      const root = await getClientsRootFolder(oauth);
      const breadcrumb = await ensureBreadcrumb(oauth, root, folderId);
      if (!breadcrumb) {
        return reply.code(403).send({ error: "Ez a mappa nem érhető el innen" });
      }

      try {
        let uploadedCount = 0;
        for await (const part of request.files()) {
          await uploadStreamToFolder(oauth, folderId, part.filename, part.mimetype, part.file);
          uploadedCount++;
        }
        if (uploadedCount === 0) {
          return reply.code(400).send({ error: "Nincs kiválasztott fájl" });
        }
        return { ok: true, uploadedCount };
      } catch (err) {
        request.log.error(err, "Drive upload failed");
        return reply.code(502).send({ error: err instanceof Error ? err.message : "Nem sikerült feltölteni a fájlokat" });
      }
    }
  );

  // Egyetlen meglévő fájl tartalmának lecserélése — a beépített böngésző
  // "már létezik ilyen nevű fájl, felülírod?" kérdésének "igen" válaszához
  // (DriveView.tsx uploadFiles). A fájl id-je/mappája/megosztásai nem
  // változnak, csak a bájtjai — nem az /upload végpont "hozz létre egy
  // (esetleg azonos nevű) új fájlt" logikáját futtatja.
  fastify.post<{ Querystring: { fileId?: string } }>(
    "/social-media/drive/replace",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessSocialMediaModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
      }
      const fileId = request.query.fileId;
      if (!fileId) return reply.code(400).send({ error: "Hiányzó fájl" });

      const oauth = await getAuthorizedClient();
      if (!oauth) {
        return reply.code(400).send({ error: "Nincs beállítva Google-kapcsolat (Beállítások > Google-integráció)" });
      }

      const root = await getClientsRootFolder(oauth);
      const breadcrumb = await ensureBreadcrumb(oauth, root, fileId);
      if (!breadcrumb) {
        return reply.code(403).send({ error: "Ez a fájl nem érhető el innen" });
      }

      try {
        let replaced = false;
        for await (const part of request.files()) {
          await replaceStreamContent(oauth, fileId, part.filename, part.mimetype, part.file);
          replaced = true;
          break;
        }
        if (!replaced) {
          return reply.code(400).send({ error: "Nincs kiválasztott fájl" });
        }
        return { ok: true };
      } catch (err) {
        request.log.error(err, "Drive file replace failed");
        return reply.code(502).send({ error: err instanceof Error ? err.message : "Nem sikerült lecserélni a fájlt" });
      }
    }
  );

  // Kijelölt fájlok tömeges letöltése egy ZIP-be csomagolva — a beépített
  // böngésző "Kijelölés" módjának "Letöltés" műveletéhez. Fájlonként
  // streamelve tölti le a Drive-ról és rakja bele a ZIP-be, nem tölti be
  // egyszerre memóriába az egészet.
  fastify.post<{ Body: { itemIds: string[] } }>(
    "/social-media/drive/download-zip",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessSocialMediaModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
      }
      const itemIds = request.body.itemIds;
      if (!itemIds || itemIds.length === 0) {
        return reply.code(400).send({ error: "Nincs kijelölt fájl" });
      }
      const oauth = await getAuthorizedClient();
      if (!oauth) {
        return reply.code(400).send({ error: "Nincs beállítva Google-kapcsolat (Beállítások > Google-integráció)" });
      }

      const root = await getClientsRootFolder(oauth);
      for (const itemId of itemIds) {
        const breadcrumb = await ensureBreadcrumb(oauth, root, itemId);
        if (!breadcrumb) {
          return reply.code(403).send({ error: "Az egyik kijelölt elem nem érhető el innen" });
        }
      }

      const archive = new ZipArchive({ zlib: { level: 6 } });
      archive.on("error", (err) => request.log.error(err, "Zip creation failed"));

      reply.header("Content-Disposition", 'attachment; filename="kijelolt_fajlok.zip"');
      reply.type("application/zip");
      reply.send(archive);

      try {
        for (const itemId of itemIds) {
          const file = await downloadFile(oauth, itemId);
          archive.append(Readable.fromWeb(file.stream as import("stream/web").ReadableStream<Uint8Array>), {
            name: file.name,
          });
        }
        await archive.finalize();
      } catch (err) {
        request.log.error(err, "Zip creation failed");
        archive.abort();
      }
    }
  );

  // "Mappa létrehozása a kijelölt fájlokkal" — a jelenleg nyitott mappában
  // (folderId) létrehoz egy új almappát a megadott névvel, majd a kijelölt
  // fájlokat (amiknek szintén ebben a mappában kell lenniük) átmozgatja
  // bele. A fájlok tartalmához nem nyúl, csak a szülő-hivatkozásukat cseréli.
  fastify.post<{ Body: { folderId: string; name: string; itemIds: string[] } }>(
    "/social-media/drive/create-folder-with-items",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessSocialMediaModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
      }
      const { folderId, name, itemIds } = request.body;
      if (!folderId || !name?.trim() || !itemIds || itemIds.length === 0) {
        return reply.code(400).send({ error: "Hiányzó mappa, név vagy kijelölt fájl" });
      }
      const oauth = await getAuthorizedClient();
      if (!oauth) {
        return reply.code(400).send({ error: "Nincs beállítva Google-kapcsolat (Beállítások > Google-integráció)" });
      }

      const root = await getClientsRootFolder(oauth);
      const breadcrumb = await ensureBreadcrumb(oauth, root, folderId);
      if (!breadcrumb) {
        return reply.code(403).send({ error: "Ez a mappa nem érhető el innen" });
      }

      // A kijelölt elemeknek ténylegesen a jelenlegi mappa gyerekeinek kell
      // lenniük — ez adja meg a moveItem-hez szükséges "honnan" szülőt is,
      // nem kell fájlonként külön lekérdezni a jelenlegi szülőjüket.
      const children = await listFolderChildren(oauth, folderId);
      const validIds = new Set(children.map((c) => c.id));
      const toMove = itemIds.filter((id) => validIds.has(id));
      if (toMove.length === 0) {
        return reply.code(400).send({ error: "A kijelölt fájlok már nincsenek ebben a mappában" });
      }

      try {
        const newFolder = await createFolder(oauth, folderId, name.trim());
        for (const itemId of toMove) {
          await moveItem(oauth, itemId, folderId, newFolder.id);
        }
        return reply.code(201).send({ folder: newFolder, movedCount: toMove.length });
      } catch (err) {
        request.log.error(err, "Create-folder-with-items failed");
        return reply.code(502).send({ error: err instanceof Error ? err.message : "Nem sikerült létrehozni a mappát" });
      }
    }
  );
}
