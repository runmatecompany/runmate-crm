import type { FastifyInstance } from "fastify";
import {
  createContentDraft,
  deleteContentDraft,
  getContentDraftById,
  listContentDrafts,
  setContentDraftDriveFile,
  updateContentDraft,
  type DraftType,
} from "../db/contentDrafts.js";
import { getClientAiProfile } from "../db/clientAiProfiles.js";
import { getClientById } from "../db/clients.js";
import { hasSocialMediaAccess } from "../db/contentItems.js";
import { generateContentDraft, isAiScriptDraftEnabled } from "../lib/aiScriptDraft.js";
import { getAuthorizedClient } from "../lib/googleCalendar/oauth.js";
import { createGoogleDocFromText, driveFileLink } from "../lib/googleDrive/api.js";
import { ensureMonthFolder } from "../lib/googleDrive/upload.js";
import { provisionClientDriveFolders } from "../lib/googleDrive/onboarding.js";

const DRAFT_TYPES = ["script", "caption", "image_concept", "carousel"] as const;
const PLATFORM_VALUES = ["instagram", "tiktok", "youtube", "facebook"] as const;

const DRAFT_TYPE_LABELS: Record<DraftType, string> = {
  script: "Script",
  caption: "Poszt-szöveg",
  image_concept: "Kép-koncepció",
  carousel: "Karusszel",
};

const createBodySchema = {
  type: "object",
  required: ["clientId", "type", "platform", "title"],
  properties: {
    clientId: { type: "integer" },
    type: { type: "string", enum: [...DRAFT_TYPES] },
    platform: { type: "string", enum: [...PLATFORM_VALUES] },
    title: { type: "string", minLength: 1 },
    topic: { type: "string" },
  },
} as const;

const updateBodySchema = {
  type: "object",
  required: ["title"],
  properties: {
    title: { type: "string", minLength: 1 },
    topic: { type: "string" },
    contentText: { type: "string" },
  },
} as const;

const generateBodySchema = {
  type: "object",
  required: ["topic"],
  properties: {
    topic: { type: "string", minLength: 1 },
  },
} as const;

async function canAccessSocialMediaModule(userId: number, role: "admin" | "user"): Promise<boolean> {
  return role === "admin" || (await hasSocialMediaAccess(userId));
}

export default async function contentDraftsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { clientId?: string } }>(
    "/content-drafts",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessSocialMediaModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
      }
      const clientId = request.query.clientId ? Number(request.query.clientId) : undefined;
      const drafts = await listContentDrafts(clientId);
      return { drafts };
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/content-drafts/:id",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessSocialMediaModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
      }
      const draft = await getContentDraftById(Number(request.params.id));
      if (!draft) return reply.code(404).send({ error: "Draft not found" });
      return { draft };
    }
  );

  fastify.post<{ Body: { clientId: number; type: DraftType; platform: string; title: string; topic?: string } }>(
    "/content-drafts",
    { onRequest: [fastify.authenticate], schema: { body: createBodySchema } },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessSocialMediaModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
      }
      const draft = await createContentDraft({ ...request.body, createdBy: userId });
      return reply.code(201).send({ draft });
    }
  );

  fastify.put<{ Params: { id: string }; Body: { title: string; topic?: string; contentText?: string } }>(
    "/content-drafts/:id",
    { onRequest: [fastify.authenticate], schema: { body: updateBodySchema } },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessSocialMediaModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
      }
      const existing = await getContentDraftById(Number(request.params.id));
      if (!existing) return reply.code(404).send({ error: "Draft not found" });
      const draft = await updateContentDraft(existing.id, request.body);
      return { draft };
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    "/content-drafts/:id",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessSocialMediaModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
      }
      const deleted = await deleteContentDraft(Number(request.params.id));
      if (!deleted) return reply.code(404).send({ error: "Draft not found" });
      return { ok: true };
    }
  );

  // "AI-vázlat generálása" — a draft típusának és az ügyfél AI-profiljának
  // megfelelő promptot épít, nem menti automatikusan (a felhasználó a
  // "Mentés" gombbal menti, miután átnézte/szerkesztette).
  fastify.post<{ Params: { id: string }; Body: { topic: string } }>(
    "/content-drafts/:id/generate",
    { onRequest: [fastify.authenticate], schema: { body: generateBodySchema } },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessSocialMediaModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
      }
      const draft = await getContentDraftById(Number(request.params.id));
      if (!draft) return reply.code(404).send({ error: "Draft not found" });
      if (!isAiScriptDraftEnabled()) {
        return reply.code(503).send({ error: "Az AI-vázlat generálása nincs beállítva a szerveren" });
      }

      const client = await getClientById(draft.client_id);
      if (!client) return reply.code(404).send({ error: "Client not found" });
      const profile = await getClientAiProfile(draft.client_id);

      try {
        const contentText = await generateContentDraft({
          clientName: client.company_name,
          platform: draft.platform,
          type: draft.type,
          topic: request.body.topic,
          profile,
        });
        return { contentText };
      } catch (err) {
        request.log.error(err, "AI content draft generation failed");
        return reply.code(502).send({ error: err instanceof Error ? err.message : "Nem sikerült generálni a vázlatot" });
      }
    }
  );

  // "Mentés Drive-ra" — natív Google Dokumentumként menti a jelenlegi
  // tartalmat az ügyfél folyó hónap-mappájába (ugyanoda, ahova a
  // forgatás/vágás anyagai kerülnek).
  fastify.post<{ Params: { id: string } }>(
    "/content-drafts/:id/save-to-drive",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessSocialMediaModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
      }
      const draft = await getContentDraftById(Number(request.params.id));
      if (!draft) return reply.code(404).send({ error: "Draft not found" });
      if (!draft.content_text?.trim()) {
        return reply.code(400).send({ error: "Nincs még tartalom, amit menthetnénk" });
      }

      const oauth = await getAuthorizedClient();
      if (!oauth) {
        return reply.code(400).send({ error: "Nincs beállítva Google-kapcsolat (Beállítások > Google-integráció)" });
      }

      let client = await getClientById(draft.client_id);
      if (!client) return reply.code(404).send({ error: "Client not found" });
      if (!client.drive_folder_id) {
        try {
          await provisionClientDriveFolders(client);
          client = (await getClientById(draft.client_id))!;
        } catch (err) {
          request.log.error(err, "Drive folder onboarding failed during draft save");
        }
        if (!client.drive_folder_id) {
          return reply.code(400).send({ error: "Nem sikerült létrehozni az ügyfél Drive-mappáját" });
        }
      }

      try {
        const yearMonth = new Date().toISOString().slice(0, 7);
        const monthFolderId = await ensureMonthFolder(oauth, client.id, client.drive_folder_id, yearMonth);
        const fileName = `${DRAFT_TYPE_LABELS[draft.type]} - ${draft.title}`;
        const file = await createGoogleDocFromText(oauth, monthFolderId, fileName, draft.content_text);
        const updated = await setContentDraftDriveFile(draft.id, file.id);
        return { draft: updated, driveLink: driveFileLink(file.id) };
      } catch (err) {
        request.log.error(err, "Drive draft save failed");
        return reply.code(502).send({ error: err instanceof Error ? err.message : "Nem sikerült menteni a Drive-ra" });
      }
    }
  );
}
