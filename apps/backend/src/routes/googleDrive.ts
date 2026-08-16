import type { FastifyInstance } from "fastify";
import { hasSocialMediaAccess } from "../db/contentItems.js";
import { getAuthorizedClient } from "../lib/googleCalendar/oauth.js";
import { getClientsRootFolder } from "../lib/googleDrive/root.js";
import {
  createGoogleDoc,
  isDriveFolder,
  listFolderChildren,
  resolveBreadcrumb,
  type DriveFolder,
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

      let breadcrumb: DriveFolder[] | null;
      if (folderId === root.id) {
        breadcrumb = [{ id: root.id, name: "Ügyfelek" }];
      } else if (breadcrumbCache.has(folderId)) {
        breadcrumb = breadcrumbCache.get(folderId)!;
      } else {
        breadcrumb = await resolveBreadcrumb(oauth, folderId, root.id);
        if (breadcrumb) breadcrumbCache.set(folderId, breadcrumb);
      }
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

  // "+ Új Google Dokumentum" gomb: csak a beépített böngészőben már
  // validált (a gyorsítótárban vagy a gyökérben szereplő) mappákba enged
  // létrehozni — ugyanaz a határ, mint a böngészésnél.
  fastify.post<{ Body: { folderId: string; name: string } }>(
    "/social-media/drive/create-doc",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessSocialMediaModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
      }
      const { folderId, name } = request.body;
      if (!folderId || !name?.trim()) {
        return reply.code(400).send({ error: "Hiányzó mappa vagy fájlnév" });
      }
      const oauth = await getAuthorizedClient();
      if (!oauth) {
        return reply.code(400).send({ error: "Nincs beállítva Google-kapcsolat (Beállítások > Google-integráció)" });
      }

      const root = await getClientsRootFolder(oauth);
      const isKnown = folderId === root.id || breadcrumbCache.has(folderId);
      if (!isKnown) {
        const breadcrumb = await resolveBreadcrumb(oauth, folderId, root.id);
        if (!breadcrumb) return reply.code(403).send({ error: "Ez a mappa nem érhető el innen" });
        breadcrumbCache.set(folderId, breadcrumb);
      }

      const doc = await createGoogleDoc(oauth, folderId, name.trim());
      return reply.code(201).send({ file: doc });
    }
  );
}
