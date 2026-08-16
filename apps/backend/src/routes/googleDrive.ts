import type { FastifyInstance } from "fastify";
import type { OAuth2Client } from "google-auth-library";
import { hasSocialMediaAccess } from "../db/contentItems.js";
import { getAuthorizedClient } from "../lib/googleCalendar/oauth.js";
import { getClientsRootFolder } from "../lib/googleDrive/root.js";
import {
  createFolder,
  createGoogleFile,
  isDriveFolder,
  listFolderChildren,
  resolveBreadcrumb,
  type CreatableKind,
  type DriveFolder,
  type DriveItem,
} from "../lib/googleDrive/api.js";

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
}
