import type { FastifyInstance } from "fastify";
import {
  createContentItem,
  deleteContentItem,
  getContentItemById,
  hasSocialMediaAccess,
  listContentItems,
  updateContentItemDetails,
  type ContentItemRow,
  type Platform,
} from "../db/contentItems.js";
import {
  getApprovalById,
  listApprovalsForItem,
  listPendingApprovals,
  type ApprovalType,
} from "../db/contentApprovals.js";
import { getUserById } from "../db/users.js";
import { pool } from "../db/pool.js";
import { getClientById } from "../db/clients.js";
import { transitionContentItem, TransitionError, type TransitionAction, type TransitionPayload } from "../lib/socialMedia/transitions.js";
import { sendApprovalReminderEmail, NotifyError } from "../lib/socialMedia/notify.js";
import { approvalTokenExpiry, generateApprovalToken } from "../lib/socialMedia/token.js";
import { getAuthorizedClient } from "../lib/googleCalendar/oauth.js";
import { driveFolderLink } from "../lib/googleDrive/api.js";
import { ensureVideoSubfolder, uploadStreamToFolder } from "../lib/googleDrive/upload.js";
import { ensureContentItemMonthFolder, provisionClientDriveFolders } from "../lib/googleDrive/onboarding.js";

const PLATFORM_VALUES = ["instagram", "tiktok", "youtube", "facebook"] as const;
const TRANSITION_ACTIONS = [
  "send_script_for_approval",
  "approve_script",
  "reject_script",
  "upload_raw",
  "send_edit_for_approval",
  "approve_edit",
  "reject_edit",
  "schedule",
] as const;

const createBodySchema = {
  type: "object",
  required: ["clientId", "title", "platform"],
  properties: {
    clientId: { type: "integer" },
    title: { type: "string", minLength: 1 },
    platform: { type: "string", enum: [...PLATFORM_VALUES] },
    assignedTo: { type: "integer" },
  },
} as const;

const updateBodySchema = {
  type: "object",
  required: ["title", "platform"],
  properties: {
    title: { type: "string", minLength: 1 },
    platform: { type: "string", enum: [...PLATFORM_VALUES] },
    assignedTo: { type: "integer" },
    scriptContent: { type: "string" },
    editedMediaUrl: { type: "string" },
    shootDate: { type: "string" },
  },
} as const;

const transitionBodySchema = {
  type: "object",
  required: ["action"],
  properties: {
    action: { type: "string", enum: [...TRANSITION_ACTIONS] },
    payload: {
      type: "object",
      properties: {
        rawMediaUrl: { type: "string" },
        scheduledPublishAt: { type: "string" },
        feedback: { type: "string" },
      },
    },
  },
} as const;

async function canAccessSocialMediaModule(userId: number, role: "admin" | "user"): Promise<boolean> {
  return role === "admin" || (await hasSocialMediaAccess(userId));
}

// Modul-hozzáférésen belül: nem-admin csak a rá rakott elemeket látja/kezelheti.
function canAccessItem(item: ContentItemRow, userId: number, role: "admin" | "user"): boolean {
  return role === "admin" || item.assigned_to === userId;
}

export default async function contentItemsRoutes(fastify: FastifyInstance) {
  fastify.get("/content-items", { onRequest: [fastify.authenticate] }, async (request) => {
    const { sub: userId, role } = request.user;
    const access = await canAccessSocialMediaModule(userId, role);
    if (!access) return { items: [], hasAccess: false };
    const items = await listContentItems(role === "admin" ? {} : { assignedTo: userId });
    return { items, hasAccess: true };
  });

  // A "Jóváhagyásra vár" nézethez — minden még függő jóváhagyás, a
  // hozzájuk tartozó tartalom és ügyfél nevével együtt.
  fastify.get("/content-items/approvals/pending", { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { sub: userId, role } = request.user;
    if (!(await canAccessSocialMediaModule(userId, role))) {
      return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
    }
    const approvals = await listPendingApprovals(role === "admin" ? undefined : userId);
    return { approvals };
  });

  fastify.get<{ Params: { id: string } }>("/content-items/:id", { onRequest: [fastify.authenticate] }, async (
    request,
    reply
  ) => {
    const { sub: userId, role } = request.user;
    if (!(await canAccessSocialMediaModule(userId, role))) {
      return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
    }
    const item = await getContentItemById(Number(request.params.id));
    if (!item) return reply.code(404).send({ error: "Content item not found" });
    if (!canAccessItem(item, userId, role)) {
      return reply.code(403).send({ error: "Nincs hozzárendelve hozzád ez a tartalom" });
    }
    return { item };
  });

  fastify.post<{ Body: { clientId: number; title: string; platform: Platform; assignedTo?: number } }>(
    "/content-items",
    { onRequest: [fastify.authenticate], schema: { body: createBodySchema } },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessSocialMediaModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
      }
      const item = await createContentItem(request.body);
      try {
        await ensureContentItemMonthFolder(item.client_id, item.shoot_date);
      } catch (err) {
        request.log.error(err, "Drive month folder provisioning failed on content item create");
      }
      return reply.code(201).send({ item });
    }
  );

  fastify.put<{
    Params: { id: string };
    Body: {
      title: string;
      platform: Platform;
      assignedTo?: number;
      scriptContent?: string;
      editedMediaUrl?: string;
      shootDate?: string;
    };
  }>("/content-items/:id", { onRequest: [fastify.authenticate], schema: { body: updateBodySchema } }, async (
    request,
    reply
  ) => {
    const { sub: userId, role } = request.user;
    if (!(await canAccessSocialMediaModule(userId, role))) {
      return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
    }
    const existing = await getContentItemById(Number(request.params.id));
    if (!existing) return reply.code(404).send({ error: "Content item not found" });
    if (!canAccessItem(existing, userId, role)) {
      return reply.code(403).send({ error: "Nincs hozzárendelve hozzád ez a tartalom" });
    }
    const item = await updateContentItemDetails(existing.id, request.body);
    return { item };
  });

  fastify.delete<{ Params: { id: string } }>("/content-items/:id", { onRequest: [fastify.authenticate] }, async (
    request,
    reply
  ) => {
    if (request.user.role !== "admin") {
      return reply.code(403).send({ error: "Csak admin törölhet tartalmat" });
    }
    const deleted = await deleteContentItem(Number(request.params.id));
    if (!deleted) return reply.code(404).send({ error: "Content item not found" });
    return { ok: true };
  });

  // Az egyetlen végpont minden állapotváltáshoz — a kanban gombjai és a
  // részletes nézet kiemelt gombja is ezt hívja.
  fastify.post<{ Params: { id: string }; Body: { action: TransitionAction; payload?: TransitionPayload } }>(
    "/content-items/:id/transition",
    { onRequest: [fastify.authenticate], schema: { body: transitionBodySchema } },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessSocialMediaModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
      }
      const existing = await getContentItemById(Number(request.params.id));
      if (!existing) return reply.code(404).send({ error: "Content item not found" });
      if (!canAccessItem(existing, userId, role)) {
        return reply.code(403).send({ error: "Nincs hozzárendelve hozzád ez a tartalom" });
      }

      // A saját nevünket használjuk decided_by_name-ként — sosem a kliens
      // által küldött értéket, nehogy valaki más nevében hagyjon jóvá.
      const actor = await getUserById(userId);

      try {
        const item = await transitionContentItem(
          existing.id,
          request.body.action,
          request.body.payload ?? {},
          actor?.name
        );
        return { item };
      } catch (err) {
        if (err instanceof TransitionError || err instanceof NotifyError) {
          return reply.code(400).send({ error: err.message });
        }
        throw err;
      }
    }
  );

  // A "Fájlok feltöltése" gomb végpontja: a kiválasztott fájlokat a Drive-on
  // az ügyfél aznapi hónap-almappájába streameli, majd az upload_raw
  // átmenettel a mappa linkjét menti raw_media_url-ként.
  fastify.post<{ Params: { id: string } }>(
    "/content-items/:id/upload-raw",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessSocialMediaModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
      }
      const existing = await getContentItemById(Number(request.params.id));
      if (!existing) return reply.code(404).send({ error: "Content item not found" });
      if (!canAccessItem(existing, userId, role)) {
        return reply.code(403).send({ error: "Nincs hozzárendelve hozzád ez a tartalom" });
      }

      const oauth = await getAuthorizedClient();
      if (!oauth) {
        return reply.code(400).send({ error: "Nincs beállítva Google-kapcsolat (Beállítások > Google-integráció)" });
      }

      let client = await getClientById(existing.client_id);
      if (!client) return reply.code(404).send({ error: "Client not found" });
      if (!client.drive_folder_id) {
        try {
          await provisionClientDriveFolders(client);
          client = (await getClientById(existing.client_id))!;
        } catch (err) {
          request.log.error(err, "Drive folder onboarding failed during upload");
        }
        if (!client.drive_folder_id) {
          return reply.code(400).send({ error: "Nem sikerült létrehozni az ügyfél Drive-mappáját" });
        }
      }

      const yearMonth = (existing.shoot_date ? new Date(existing.shoot_date) : new Date())
        .toISOString()
        .slice(0, 7);

      try {
        const rawFolderId = await ensureVideoSubfolder(oauth, client.id, client.drive_folder_id, yearMonth, "raw");

        let uploadedCount = 0;
        for await (const part of request.files()) {
          await uploadStreamToFolder(oauth, rawFolderId, part.filename, part.mimetype, part.file);
          uploadedCount++;
        }
        if (uploadedCount === 0) {
          return reply.code(400).send({ error: "Nincs kiválasztott fájl" });
        }

        const item = await transitionContentItem(
          existing.id,
          "upload_raw",
          { rawMediaUrl: driveFolderLink(rawFolderId) }
        );
        return { item };
      } catch (err) {
        if (err instanceof TransitionError) {
          return reply.code(400).send({ error: err.message });
        }
        request.log.error(err, "Drive upload failed");
        return reply.code(502).send({ error: err instanceof Error ? err.message : "Nem sikerült feltölteni a fájlokat" });
      }
    }
  );

  // A "Vágásra vár" nézet feltöltés-gombjának végpontja: a megvágott
  // videó(ka)t a Drive-on az ügyfél aznapi hónap-almappájának "Megvágva"
  // mappájába streameli, majd elmenti a mappa linkjét edited_media_url-ként.
  // Ez NEM állapotváltás — a jóváhagyásra küldés ("Vágás küldése
  // jóváhagyásra") ugyanúgy külön, tudatos lépés marad, mint eddig a kézzel
  // beírt linknél.
  fastify.post<{ Params: { id: string } }>(
    "/content-items/:id/upload-edited",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessSocialMediaModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
      }
      const existing = await getContentItemById(Number(request.params.id));
      if (!existing) return reply.code(404).send({ error: "Content item not found" });
      if (!canAccessItem(existing, userId, role)) {
        return reply.code(403).send({ error: "Nincs hozzárendelve hozzád ez a tartalom" });
      }

      const oauth = await getAuthorizedClient();
      if (!oauth) {
        return reply.code(400).send({ error: "Nincs beállítva Google-kapcsolat (Beállítások > Google-integráció)" });
      }

      let client = await getClientById(existing.client_id);
      if (!client) return reply.code(404).send({ error: "Client not found" });
      if (!client.drive_folder_id) {
        try {
          await provisionClientDriveFolders(client);
          client = (await getClientById(existing.client_id))!;
        } catch (err) {
          request.log.error(err, "Drive folder onboarding failed during upload");
        }
        if (!client.drive_folder_id) {
          return reply.code(400).send({ error: "Nem sikerült létrehozni az ügyfél Drive-mappáját" });
        }
      }

      const yearMonth = (existing.shoot_date ? new Date(existing.shoot_date) : new Date())
        .toISOString()
        .slice(0, 7);

      try {
        const editedFolderId = await ensureVideoSubfolder(oauth, client.id, client.drive_folder_id, yearMonth, "edited");

        let uploadedCount = 0;
        for await (const part of request.files()) {
          await uploadStreamToFolder(oauth, editedFolderId, part.filename, part.mimetype, part.file);
          uploadedCount++;
        }
        if (uploadedCount === 0) {
          return reply.code(400).send({ error: "Nincs kiválasztott fájl" });
        }

        const item = await updateContentItemDetails(existing.id, {
          title: existing.title,
          platform: existing.platform,
          assignedTo: existing.assigned_to ?? undefined,
          editedMediaUrl: driveFolderLink(editedFolderId),
        });
        return { item };
      } catch (err) {
        request.log.error(err, "Drive upload failed");
        return reply.code(502).send({ error: err instanceof Error ? err.message : "Nem sikerült feltölteni a fájlokat" });
      }
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/content-items/:id/approvals",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessSocialMediaModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
      }
      const item = await getContentItemById(Number(request.params.id));
      if (!item) return reply.code(404).send({ error: "Content item not found" });
      if (!canAccessItem(item, userId, role)) {
        return reply.code(403).send({ error: "Nincs hozzárendelve hozzád ez a tartalom" });
      }
      const approvals = await listApprovalsForItem(item.id);
      return { approvals };
    }
  );

  fastify.post<{ Params: { id: string; approvalId: string } }>(
    "/content-items/:id/approvals/:approvalId/remind",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessSocialMediaModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
      }
      const item = await getContentItemById(Number(request.params.id));
      if (!item) return reply.code(404).send({ error: "Content item not found" });
      if (!canAccessItem(item, userId, role)) {
        return reply.code(403).send({ error: "Nincs hozzárendelve hozzád ez a tartalom" });
      }
      const approval = await getApprovalById(Number(request.params.approvalId));
      if (!approval || approval.content_item_id !== item.id) {
        return reply.code(404).send({ error: "Approval not found" });
      }
      if (approval.status !== "pending") {
        return reply.code(400).send({ error: "Ez a jóváhagyás már el lett döntve" });
      }

      // A tárolt token_hash-ból nem lehet visszafejteni a nyers tokent — az
      // emlékeztető ezért egy ÚJ tokent generál (ugyanahhoz a snapshot-hoz
      // és verzióhoz), a régi linket pedig érvényteleníti.
      const { token, hash } = generateApprovalToken();
      await pool.query(`UPDATE content_approvals SET token_hash = $2, token_expires_at = $3 WHERE id = $1`, [
        approval.id,
        hash,
        approvalTokenExpiry(),
      ]);

      try {
        await sendApprovalReminderEmail(item, approval.type as ApprovalType, approval.version, token);
      } catch (err) {
        if (err instanceof NotifyError) {
          return reply.code(400).send({ error: err.message });
        }
        throw err;
      }
      return { ok: true };
    }
  );
}
