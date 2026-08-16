import type { FastifyInstance } from "fastify";
import { hasSocialMediaAccess } from "../db/contentItems.js";
import { getAuthorizedClient } from "../lib/googleCalendar/oauth.js";
import { getAppRootFolder } from "../lib/googleDrive/root.js";
import { driveFolderLink } from "../lib/googleDrive/api.js";

// A Social Media > Drive nézet gombjához: a "Runmate CRM" app-gyökér mappa
// linkje, amiben minden ügyfélmappa (és a bennük lévő minden forgatás/vágás)
// megtalálható.
export default async function googleDriveRoutes(fastify: FastifyInstance) {
  fastify.get("/social-media/drive-root", { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { sub: userId, role } = request.user;
    if (!(role === "admin" || (await hasSocialMediaAccess(userId)))) {
      return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
    }
    const oauth = await getAuthorizedClient();
    if (!oauth) {
      return reply.code(400).send({ error: "Nincs beállítva Google-kapcsolat (Beállítások > Google-integráció)" });
    }
    const folder = await getAppRootFolder(oauth);
    return { folderId: folder.id, link: driveFolderLink(folder.id) };
  });
}
