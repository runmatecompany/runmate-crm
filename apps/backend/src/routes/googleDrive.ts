import type { FastifyInstance } from "fastify";
import { hasSocialMediaAccess } from "../db/contentItems.js";
import { getAuthorizedClient } from "../lib/googleCalendar/oauth.js";
import { getClientsRootFolder } from "../lib/googleDrive/root.js";
import { isDriveFolder, listFolderChildren, resolveBreadcrumb } from "../lib/googleDrive/api.js";

async function canAccessSocialMediaModule(userId: number, role: "admin" | "user"): Promise<boolean> {
  return role === "admin" || (await hasSocialMediaAccess(userId));
}

// A beépített Drive-böngészőhöz: egy mappa tartalma (almappák/fájlok
// szétválasztva) + a morzsamenü a gyökérig (Runmate CRM/Ügyfelek). A kért
// folderId-nek a gyökér alatt kell lennie — máskülönben az alkalmazott ki
// tudna lépni onnan a beépített böngészőben, amit a felhasználó kifejezetten
// nem szeretne.
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

      const breadcrumb =
        folderId === root.id ? [{ id: root.id, name: "Ügyfelek" }] : await resolveBreadcrumb(oauth, folderId, root.id);
      if (!breadcrumb) {
        return reply.code(403).send({ error: "Ez a mappa nem érhető el innen" });
      }
      // A gyökér neve mindig "Ügyfelek" legyen a morzsamenüben (a valódi
      // Drive-mappanév egyezik is ezzel, de explicit biztosra megyünk).
      breadcrumb[0].name = "Ügyfelek";

      const children = await listFolderChildren(oauth, folderId);
      const folders = children.filter(isDriveFolder);
      const files = children.filter((item) => !isDriveFolder(item));

      return { folderId, breadcrumb, folders, files };
    }
  );
}
