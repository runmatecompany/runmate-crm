import type { FastifyInstance } from "fastify";
import {
  confirmContentItemPayment,
  createClipContentItem,
  createContentItem,
  deleteContentItem,
  getContentItemById,
  hasSocialMediaAccess,
  listContentItems,
  updateContentItemDetails,
  updateContentItemStatus,
  IMAGE_POST_STATUSES,
  type ContentItemRow,
  type ContentStatus,
  type ContentType,
  type Platform,
} from "../db/contentItems.js";
import {
  getApprovalById,
  listApprovalsForItem,
  listPendingApprovals,
  type ApprovalType,
} from "../db/contentApprovals.js";
import { listContentItemEvents } from "../db/contentItemEvents.js";
import { getUserById } from "../db/users.js";
import { pool } from "../db/pool.js";
import { getClientById } from "../db/clients.js";
import { getClientAiProfile } from "../db/clientAiProfiles.js";
import { generateScriptDraft, isAiScriptDraftEnabled } from "../lib/aiScriptDraft.js";
import { transitionContentItem, TransitionError, type TransitionAction, type TransitionPayload } from "../lib/socialMedia/transitions.js";
import { sendApprovalReminderEmail, NotifyError } from "../lib/socialMedia/notify.js";
import { approvalTokenExpiry, generateApprovalToken } from "../lib/socialMedia/token.js";
import { getAuthorizedClient } from "../lib/googleCalendar/oauth.js";
import { driveFolderLink } from "../lib/googleDrive/api.js";
import { ensureVideoSubfolder, uploadStreamToFolder } from "../lib/googleDrive/upload.js";
import { ensureContentItemMonthFolder, provisionClientDriveFolders } from "../lib/googleDrive/onboarding.js";

const PLATFORM_VALUES = ["instagram", "tiktok", "youtube", "facebook"] as const;
const CONTENT_TYPE_VALUES = ["video", "image_post"] as const;
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
  required: ["clientId", "title", "contentType", "platform"],
  properties: {
    clientId: { type: "integer" },
    title: { type: "string", minLength: 1 },
    contentType: { type: "string", enum: [...CONTENT_TYPE_VALUES] },
    platform: { type: "string", enum: [...PLATFORM_VALUES] },
    assignedTo: { type: "integer" },
    startAsClip: { type: "boolean" },
  },
} as const;

const setStatusBodySchema = {
  type: "object",
  required: ["status"],
  properties: {
    status: { type: "string", enum: [...IMAGE_POST_STATUSES] },
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

const generateScriptBodySchema = {
  type: "object",
  required: ["topic"],
  properties: {
    topic: { type: "string", minLength: 1 },
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

  fastify.post<{
    Body: {
      clientId: number;
      title: string;
      contentType: ContentType;
      platform: Platform;
      assignedTo?: number;
      startAsClip?: boolean;
    };
  }>("/content-items", { onRequest: [fastify.authenticate], schema: { body: createBodySchema } }, async (
    request,
    reply
  ) => {
    const { sub: userId, role } = request.user;
    if (!(await canAccessSocialMediaModule(userId, role))) {
      return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
    }

    // Clippelés: nincs script/forgatás fázis, egyenesen "Vágásra vár"
    // állapotban indul, a rögzített forrás mappával — a forrást szerver
    // oldalon nézzük ki (nem bízunk a kliens által küldött linkben), és
    // csak akkor engedjük, ha az ügyfélnél tényleg be van kapcsolva a
    // szolgáltatás.
    if (request.body.startAsClip) {
      if (request.body.contentType !== "video") {
        return reply.code(400).send({ error: "Clippelés csak videó típusnál választható" });
      }
      const profile = await getClientAiProfile(request.body.clientId);
      if (!profile?.service_clipping || !profile.clipping_source_folder_url) {
        return reply
          .code(400)
          .send({ error: "Ennél az ügyfélnél nincs beállítva Clippelés szolgáltatás/forrás mappa" });
      }
      const item = await createClipContentItem({
        clientId: request.body.clientId,
        title: request.body.title,
        platform: request.body.platform,
        rawMediaUrl: profile.clipping_source_folder_url,
      });
      return reply.code(201).send({ item });
    }

    const item = await createContentItem(request.body);
    try {
      await ensureContentItemMonthFolder(item.client_id, item.shoot_date);
    } catch (err) {
      request.log.error(err, "Drive month folder provisioning failed on content item create");
    }
    return reply.code(201).send({ item });
  });

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

  // "AI-vázlat generálása" gomb a script-írás szakaszban — csak visszaadja a
  // draftot, nem menti el; a felhasználó a meglévő "Script mentése" gombbal
  // menti, ha jónak találja (esetleg szerkesztve).
  fastify.post<{ Params: { id: string }; Body: { topic: string } }>(
    "/content-items/:id/generate-script",
    { onRequest: [fastify.authenticate], schema: { body: generateScriptBodySchema } },
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
      if (!isAiScriptDraftEnabled()) {
        return reply.code(503).send({ error: "Az AI-vázlat generálása nincs beállítva a szerveren" });
      }

      const client = await getClientById(existing.client_id);
      if (!client) return reply.code(404).send({ error: "Client not found" });
      const profile = await getClientAiProfile(existing.client_id);

      try {
        const script = await generateScriptDraft({
          clientName: client.company_name,
          platform: existing.platform,
          topic: request.body.topic,
          profile,
        });
        return { script };
      } catch (err) {
        request.log.error(err, "AI script draft generation failed");
        return reply.code(502).send({ error: err instanceof Error ? err.message : "Nem sikerült generálni a vázlatot" });
      }
    }
  );

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

  // Nincs még számlázási/fizetési modul — ez az ideiglenes, admin-only
  // jóváhagyás, ami elindíthatóvá teszi a munkát egy Clippelés-kötegből
  // létrejött (payment_confirmed=false) tartalmon.
  fastify.post<{ Params: { id: string } }>(
    "/content-items/:id/confirm-payment",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      if (request.user.role !== "admin") {
        return reply.code(403).send({ error: "Csak admin hagyhatja jóvá a fizetést" });
      }
      const item = await confirmContentItemPayment(Number(request.params.id));
      if (!item) return reply.code(404).send({ error: "Content item not found" });
      return { item };
    }
  );

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
      if (!existing.payment_confirmed) {
        return reply.code(400).send({ error: "A fizetés még nincs jóváhagyva — a munka nem indítható el" });
      }

      // A saját nevünket használjuk decided_by_name-ként — sosem a kliens
      // által küldött értéket, nehogy valaki más nevében hagyjon jóvá.
      const actor = await getUserById(userId);

      try {
        const item = await transitionContentItem(
          existing.id,
          request.body.action,
          request.body.payload ?? {},
          actor?.name,
          actor ? { id: actor.id, name: actor.name } : undefined
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

  // Képes posztoknál nincs email-jóváhagyásos, forgatás/vágás-alapú
  // átmenet-rendszer (lásd lib/socialMedia/transitions.ts, ami videó-
  // specifikus) — egyszerű, közvetlen státuszváltás a 4 fázisú
  // (planning/approval/scheduling/published) körben.
  fastify.post<{ Params: { id: string }; Body: { status: ContentStatus } }>(
    "/content-items/:id/set-status",
    { onRequest: [fastify.authenticate], schema: { body: setStatusBodySchema } },
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
      if (existing.content_type !== "image_post") {
        return reply.code(400).send({ error: "Videónál a normál átmenet-végpontot kell használni" });
      }
      const actor = await getUserById(userId);
      const item = await updateContentItemStatus(
        existing.id,
        request.body.status,
        actor ? { id: actor.id, name: actor.name } : undefined
      );
      return { item };
    }
  );

  // Munkatörténet — melyik kolléga vitte tovább a feladatot melyik
  // fázisból a következőbe. Statisztikához (ki mennyit dolgozott) is ez a
  // forrás.
  fastify.get<{ Params: { id: string } }>(
    "/content-items/:id/activity",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub: userId, role } = request.user;
      if (!(await canAccessSocialMediaModule(userId, role))) {
        return reply.code(403).send({ error: "Nincs hozzáférésed a Social Media modulhoz" });
      }
      const item = await getContentItemById(Number(request.params.id));
      if (!item) return reply.code(404).send({ error: "Content item not found" });
      const events = await listContentItemEvents(item.id);
      return { events };
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
      if (!existing.payment_confirmed) {
        return reply.code(400).send({ error: "A fizetés még nincs jóváhagyva — a munka nem indítható el" });
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
